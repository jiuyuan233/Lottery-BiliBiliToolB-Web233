# ⏰ 定时策略：双通道触发 + 防重复锁 + 飞书静默时段

> 2026-11-16 重构：GitHub 内置 schedule 的延迟实测太大（见下文数据），改为**外部 cron-job.org 准点触发为主、GitHub 内置提前起跑兜底**的双通道架构，并用**时段防重复锁**保证同一时段只执行一次。

## 架构总览

```
目标时段（README 时间表，北京时间）
   │
   ├─ 主通道：cron-job.org → POST workflow_dispatch（带 slot 标识）→ 准点起跑
   │           外部触发走 API 直达，不排队，实测分钟级准点
   │
   ├─ 兜底通道：GitHub 内置 schedule（提前 45 分钟起跑）
   │           谁先抢到时段锁谁执行，晚到的一方自动跳过
   │
   └─ 防重复锁：refs/heads/locks/<slot>-<日期>（原子创建，先到 422=已被抢）
              → 同一时段绝无重复运行；被跳过的运行不推飞书，不发任何消息
```

## 为什么这么改：GitHub schedule 延迟实测（WebAction，2026-11-13 ~ 11-16）

| 时段档 | 计划起跑（北京） | 实际开跑（北京） | 延迟 |
|---|---|---|---|
| 早间档（08:03/08:33） | 08:03 | 08:02 ~ 09:53 | 0~90 分钟，偶发整段丢失（11-16 早间两档直接没触发） |
| 午间档（动态抽奖） | 11:43 | 13:59 | 2 小时 16分 |
| 午间档（日常任务） | 11:37 | 15:11 | 3 小时 34 分 |
| 晚间档（19:03/19:33/21:33/22:33） | 19:03 ~ 22:33 | 01:14 ~ 04:50（次日凌晨） | **4 ~ 7 小时**（3 天内至少 8 次拖到凌晨） |

结论：
- 提前 30~45 分钟只能对冲早间档的常规延迟；**午/晚档的数小时级延迟无法靠提前量解决**；
- 延迟把任务拖进凌晨，正是「凌晨收到消息」的根源（静默时段只是把消息压掉，任务本身仍在凌晨跑）；
- 因此改为外部准点触发为主，GitHub 内置降级为兜底。

## 时段表（北京时间）

目标时段 = README 要求的类人类作息时间（不变）；主通道在目标时段准点触发；兜底通道提前 45 分钟起跑（对冲常规延迟、错峰避整点）。

```
时间轴（北京时间，均为目标时段）：
  0────7────8────10───12────14───19────21───22───23────24
  │睡眠期│起床 │上午 │午休 │下午 │晚饭 │睡前 │ —— │清理 │ 睡眠期│
  │不执行│check│start│start│天选 │start│check│    │clear│ 不执行 │
```

（0:00–7:00 睡眠期不安排任何任务）

### 动态抽奖（lottery.yml）

| slot 标识 | cron-job.org（主通道） | 兜底 cron（UTC） | 兜底起跑（北京） | 目标时段 | 命令 |
|---|---|---|---|---|---|
| `lot-check-am` | 08:33 | `48 23 * * *` | 07:48 | 08:33 | check（起床检查中奖） |
| `lot-start-am` | 10:33 | `48 1 * * *` | 09:48 | 10:33 | start（上午，20 分钟≈26 条） |
| `lot-start-noon` | 12:13 | `28 3 * * *` | 11:28 | 12:13 | start（午休） |
| `lot-start-pm` | 19:33 | `48 10 * * *` | 18:48 | 19:33 | start（晚饭后） |
| `lot-check-pm` | 22:03 | `18 13 * * *` | 21:18 | 22:03 | check（睡前检查中奖） |
| `lot-clear-sun` | 周日 23:03 | `18 14 * * 0` | 周日 22:18 | 周日 23:03 | clear（每周清理动态/关注） |

### B站日常任务（bilitool.yml）

| slot 标识 | cron-job.org（主通道） | 兜底 cron（UTC） | 兜底起跑（北京） | 目标时段 | 任务 |
|---|---|---|---|---|---|
| `bil-daily-am` | 09:03 | `18 0 * * *` | 08:18 | 09:03 | Daily,VipBigPoint,Manga,Silver2Coin,VipPrivilege |
| `bil-lot-noon` | 12:07 | `22 3 * * *` | 11:22 | 12:07 | LiveLottery |
| `bil-lot-pm` | 19:03 | `18 10 * * *` | 18:18 | 19:03 | LiveLottery,LiveFansMedal |

> ⚠️ 修改任一时段时，必须同步三处：① workflow 的 `schedule` cron；② decide 步骤里的 `case` 匹配（cron 字符串与 case 必须完全一致，否则落到默认分支）；③ 本表。两仓库同步。

## 防重复锁原理

- 每次运行在执行任务前，用 `POST /git/refs` 原子创建 `refs/heads/locks/<slot>-<YYYYMMDD>`；
- **201 = 抢到锁** → 执行本时段任务；**422 = 已被更早的触发抢到**（外部或兜底已跑过本时段）→ 后续步骤
  全部跳过、不发飞书、run 显示绿色（skipped 步骤属正常）；
- 原子性由 GitHub API 保证，即使两通道同一秒到达也只有一个能创建成功——**0 重复运行**；
- 锁 7 天后由下一次成功抢锁的运行自动清理（过期锁 GC），不积攒；
- 手动 Run workflow 不填 slot 时不参与锁（随时可做临时测试，不影响定时任务）；勾选 `force=true` 可越过开关与锁（全量测试用）。

## 飞书推送策略：安静模式 + 深夜静默时段

### 安静模式（NOTIFY_QUIET，2026-11-16 起默认开启）

**只有三类情况才推送飞书**，其余一律静默（只记 Actions / 容器日志，不打扰用户）：

| 情况 | 卡片样式 | 触发条件（自动检测） |
|---|---|---|
| 🎉 中奖 | 深红 carmine，顶部奖品详情 | 日志命中中奖关键词（恭喜中奖 / 天选奖励等） |
| ⚠️ 疑似 cookie 过期 | 警示标题 + 更新指引横幅 | 日志命中「账号未登录 / 登录过期 / cookie 失效 / -101」等 |
| ❌ 执行失败 | 红色 | workflow 执行步骤 outcome = failure |

- 常规成功运行（每日 3 次转发抽奖成功、签到成功等）**不推送**——这是本仓库的默认行为；
- 实现位于 `lottery/notify-feishu.js`：环境变量 `NOTIFY_QUIET`（`true`/`1` 开启），内部用 `detectWin()` / `detectAuthFailure()` / 状态判断三类放行；两个业务 workflow 的「飞书通知」步骤已默认设 `NOTIFY_QUIET: 'true'`，Docker 版 `run-task.sh` 设 `NOTIFY_QUIET=1`；
- 「飞书推送测试」workflow **不设** `NOTIFY_QUIET`，不受安静模式影响，随时可验证推送链路；
- 想恢复全量推送：把 workflow「飞书通知」步骤 env 里的 `NOTIFY_QUIET: 'true'` 行删掉即可。

### 深夜静默时段：23:00–07:00（北京时间，保留不变）

兜底通道极端延迟把任务拖进深夜时仍可能晚跑，为保证不被打扰：

- 北京时间 23:00–07:00 完成的任务不推送飞书（即使命中上述三类情况也不推），只在 Actions 运行日志里记录结果；
- 白天完成的照上述安静模式规则推送；被防重复锁跳过的运行不推送；
- 「飞书推送测试」workflow 不受静默时段限制。

## cron-job.org 配置教程（主通道，推荐）

外部定时用 [cron-job.org](https://cron-job.org)（免费账号即可），通过它的 API 准点触发
GitHub workflow_dispatch。**不需要改仓库任何代码**，纯账号侧配置。

### 方式一：网页手动配置（直观）

1. 注册并登录 [cron-job.org](https://cron-job.org)，进入控制台 → **Create Cronjob**；
2. 按下表填写每个时段（共 9 个任务，逐个创建）：
   - **URL**：`https://api.github.com/<用户名>/<你的仓库>/actions/workflows/lottery.yml/dispatches`（日常任务把
     lottery.yml 换成 bilitool.yml）
   - **Method**：POST，**Content-Type**：application/json
   - **Headers**：`Authorization: Bearer <你的 GitHub PAT>`（需含 repo + workflow 权限）
   - **Body**：见下表「inputs」
   - **Schedule**：时区选 Asia/Shanghai，按目标时段填（如每天 08:33；清理任务选周日）
   - **Notifications**：全部关闭（避免 cron-job.org 自己发邮件打扰）
3. 总开关开启后，到点即准点触发（外部触发不走 GitHub schedule 队列）。

### 方式二：API 批量创建（适合 9 个任务一次建好）

```bash
# cron-job.org 控制台 Settings → 生成 API key
curl -X PUT https://api.cron-job.org/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CRONJOB_API_KEY>" \
  -d '{"job":{"title":"bili-lot-check-am 08:33","enabled":true,"saveResponses":true,
    "url":"https://api.github.com/repos/<用户名>/<仓库>/actions/workflows/lottery.yml/dispatches",
    "requestMethod":1,
    "extendedData":{"headers":{"Authorization":"Bearer <你的 GitHub PAT>","Accept":"application/vnd.github+json","Content-Type":"application/json"},
    "body":"{\"ref\":\"main\",\"inputs\":{\"cmd\":\"check\",\"slot\":\"lot-check-am\"}}"},
    "schedule":{"timezone":"Asia/Shanghai","expiresAt":0,"hours":[8],"minutes":[33],"mdays":[-1],"months":[-1],"wdays":[-1]},
    "notification":{"onFailure":false,"onSuccess":false,"onDisable":false,"onSslCertExpiry":false,"mode":0}}}'
```

> 🐢 **API 限流实测经验（2026-11-16）**：连续 PUT 创建任务会被返 500，**间隔拉到 75~120 秒后恢复**；当日高频调用（建任务+查询）后 `GET /jobs` 会 429（次日恢复）。这些只影响**管理类 API**，定时任务的实际执行完全不受影响。批量建 9 个任务请预留约 15 分钟。

各时段的 `inputs` 与 `hours`/`minutes` 对照（按上方时段表）：

| slot | inputs body 内 | 触发时刻 |
|---|---|---|
| lot-check-am | `{"cmd":"check","slot":"lot-check-am"}` | 08:33 |
| lot-start-am | `{"cmd":"start","slot":"lot-start-am"}` | 10:33 |
| lot-start-noon | `{"cmd":"start","slot":"lot-start-noon"}` | 12:13 |
| lot-start-pm | `{"cmd":"start","slot":"lot-start-pm"}` | 19:33 |
| lot-check-pm | `{"cmd":"check","slot":"lot-check-pm"}` | 22:03 |
| lot-clear-sun | `{"cmd":"clear","slot":"lot-clear-sun"}` | 周日 23:03（wdays:[0]） |
| bil-daily-am | `{"tasks":"Daily,VipBigPoint,Manga,Silver2Coin,VipPrivilege","slot":"bil-daily-am"}` | 09:03 |
| bil-lot-noon | `{"tasks":"LiveLottery","slot":"bil-lot-noon"}` | 12:07 |
| bil-lot-pm | `{"tasks":"LiveLottery,LiveFansMedal","slot":"bil-lot-pm"}` | 19:03 |

### 安全提醒

- GitHub PAT 只存在 cron-job.org 的任务配置里，**绝不提交进仓库**；
- 建议 PAT 用最小权限（仅目标仓库，`contents:write` + `workflow`），泄露面最小；
- PAT 撤销/换号后记得同步更新 cron-job.org 任务里的 Header。

## 已知限制

- GitHub schedule 的**数小时级极端延迟**仍会让兑底通道晚跑（晚到会因锁自动跳过、不重复；
  仅当主通道也失效时才会真跑，属罕见兑底场景）——准点性由主通道保证；
- 公开仓库 60 天无提交时 GitHub 会自动停用内置 schedule（外部 workflow_dispatch 不受此限制，外部定时触发本身也能保持 workflow 活跃）；
- cron-job.org 免费账号限制（11-16 实测）：**创建任务需 75~120 秒间隔**（连发返 500）；当日 API 高频调用会 429（含 GET /jobs，次日恢复）——只影响管理 API，**任务执行不受影响**；
- 被锁跳过/静默时段压掉的推送不补发，结果以 Actions 日志为准。
