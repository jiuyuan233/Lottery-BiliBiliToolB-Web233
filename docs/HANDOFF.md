# 🤝 AI 交接文档（HANDOFF）

> 写给下一个接手本项目的 AI / 维护者。读完本文 + [DEVELOPMENT.md](https://github.com/jiuyuan233/Lottery-BiliBiliToolB-Web233/blob/main/docs/DEVELOPMENT.md)（仅 Web233 有，故用跨仓链接）+ [COOKIE-UPDATE.md](./COOKIE-UPDATE.md)，你应能安全接手全部维护工作。
> 最后交接：2026-11-16（第三次会话：飞书推送降噪·安静模式）。

## 1. 项目一句话

B 站自动化**胶水层**：[LotteryAutoScript](https://github.com/shanmiteko/LotteryAutoScript)（动态抽奖，Node.js）+ [BiliBiliToolPro](https://github.com/RayWangQvQ/BiliBiliToolPro)（日常任务，C#/.NET），双模式运行（GitHub Actions / Docker Compose）。本仓库只维护配置模板、cookie 桥接、定时编排、飞书通知，**不复制上游源码**——每次运行 `git clone --depth 1` 拉上游最新。

## 2. 两仓库部署现状（重要）

| 仓库 | 可见性 | 角色 | Cookie | `ACTIONS_ENABLED` | 外部定时（cron-job.org） |
|---|---|---|---|---|---|
| `Lottery-BiliBiliToolB-WebAction` | 私有 | **用户自用（生产）** | Secrets 已配（BILI_COOKIE 于 11-16 更新并实测登录 OK、FS_WEBHOOK、FS_APP_ID、FS_APP_SECRET） | `true`（双通道在跑） | 9 个时段任务（标题 bili-* 前缀） |
| `Lottery-BiliBiliToolB-Web233` | 公开 | 模板/分享 | **故意不配**（公开仓库不存密钥） | `false`（定时关闭） | 无（fork 用户自行配置） |

- 两仓库共享文件必须保持一致（清单见 DEVELOPMENT.md §11.6），改一处同步另一处，blob sha 应相同
- 定时任务总开关：仓库变量 `ACTIONS_ENABLED`，见 [ACTIONS-SWITCH.md](./ACTIONS-SWITCH.md)
- 定时为**双通道**：cron-job.org 外部准点触发为主 + GitHub 内置 schedule 提前 45 分钟兜底，时段**防重复锁先到先得**（同一时段绝不重复，见 [ACTIONS-SCHEDULE.md](./ACTIONS-SCHEDULE.md)）；飞书**静默时段 23:00–07:00（北京）**

## 3. 历次交接会话记录

### 2026-11-16（第三次会话）：飞书推送降噪（安静模式）

1. **用户需求**：除 中奖/cookie过期/其他异常 外不推送飞书 → `notify-feishu.js` 新增安静模式（`NOTIFY_QUIET=true/1`）：三类放行（`detectWin` 中奖 / `detectAuthFailure` 疑似cookie过期 / status=failure），其余常规成功 `exit 0` 只记日志；疑似cookie过期卡片标题带「⚠️ 疑似Cookie过期」+ 正文「按 docs/COOKIE-UPDATE.md 更新」指引
2. **默认开启位置**：lottery.yml / bilitool.yml「飞书通知」步骤 env `NOTIFY_QUIET: 'true'`；Docker 版 run-task.sh `export NOTIFY_QUIET=1`；feishu-test.yml **不设**（测试入口全量推送不受影响）
3. **detectAuthFailure 模式**：账号未登录 / 登录(已)过期失效 / Cookie有效性检测失败 / (SESSDATA|Cookie){0,30}(过期|失效|无效|错误) / -101——「成功登录 UID:xxx」等常规成功日志不误报（专门验证过）
4. **验证**：本地 6 用例全过（安静跳过/中奖放行/cookie放行/失败放行/未设全量/成功登录不误报）+ HTTPS 拦截钩子验证三类卡片内容 + 真机 acount 成功运行日志「🔕 安静模式…跳过推送」且未发飞书
5. **文档同步**：ACTIONS-SCHEDULE.md（推送策略：安静模式+静默时段两小节）、两 README 推送描述、DEVELOPMENT.md §10.6、COOKIE-UPDATE.md、本文件与 AI-UPDATES.md

### 2026-11-15（上一次）

1. 排查“动态抽奖失败邮件轰炸”：根因是 Web233 无 cookie（设计如此），而 lottery.yml 没有 bilitool.yml 那样的容错
2. 新增 `ACTIONS_ENABLED` 总开关（两个 workflow 的 job 级 `if` + 文档），Web233 定时静默跳过、不再发失败邮件
3. 所有 cron 提前 30 分钟 + 飞书静默时段（decide 步骤的 case 映射已同步更新——cron 与 case 必须一致）
4. 审查全部 md 文档并修正过时内容（README 时间表、DEVELOPMENT.md 的 cron 表/crontab 引用/文件清单等）
5. 在 WebAction 实际触发两个 workflow 冒烟测试通过（结果见 §6）

### 2026-11-16（第二次会话）：cookie 更新 + 全量验证 + 交接收尾

1. **cookie 过期处理**：用户旧 cookie 已失效（B 站 nav 接口返回 `isLogin=false`，服务端吊销——注意：用户第一份贴来的 cookie 就是这样，不是使用方法问题）；新 cookie 已加密写入 `BILI_COOKIE`，实测 Actions 里 `[帐号1 Cookie有效性检测] [成功登录 UID:411883458]` ✓。新增面向人类的 [COOKIE-UPDATE.md](./COOKIE-UPDATE.md)（判断过期→取新 cookie 避坑→三种更新方式→验证），后续 cookie 到期直接走该文档。
2. **全量功能验证**（结果见 §6 验证矩阵）：YAML 语法、cron↔case 一致性、force=true 路径、飞书推送实测、锁 GC 均验证通过；发现并修复真实 bug：`notify-feishu.js` 不读 `NOTIFY_MESSAGE` 环境变量导致「飞书推送测试」的 message 输入无效（修复：命令行参数优先，其次 NOTIFY_MESSAGE）。
3. **cron-job.org API 限流实测**：建任务连续 PUT 会返 500，间隔拉到 75~120 秒后恢复；当日高频调用后 GET /jobs 会 429（次日恢复）。**任务执行不受影响**，只影响管理类 API。已写入 ACTIONS-SCHEDULE.md。
4. **文档全量审查**：通读两仓全部 12 个 md，修正两份 README 对比表里过时的「定时方式：GitHub cron」表述（改为双通道描述），文件清单补 COOKIE-UPDATE.md。

### 2026-11-16（第一次会话）：双通道定时重构

1. 调取 WebAction Actions 运行历史实测 GitHub schedule 延迟：早间档 0~90 分钟、午间档 2~3.5 小时、晚间档 4~7 小时（连续 3 天至少 8 次拖到次日凌晨），另有整段丢失——确认“凌晨消息”根因
2. 重构两 workflow：双通道触发（cron-job.org 外部 dispatch 为主 + 内置 schedule 提前 45 分钟兜底）、时段防重复锁（refs/heads/locks/<slot>-<日期>，先到先得、后到自动跳过且不推送）、总开关同时拦截外部触发（force=true 可越过）
3. cron-job.org 创建 9 个时段任务（仅 WebAction，bili-* 前缀，通知全关）准点 POST workflow_dispatch
4. 文档同步：ACTIONS-SCHEDULE.md 重写（时段表 + 锁原理 + cron-job.org 教程）、ACTIONS-SWITCH.md（外部触发受控）、两仓库 README、DEVELOPMENT.md（Web233）
5. 端到端验证通过（锁抢占/跳过、公开仓开关默认关、外部链路）

## 4. 已知问题与待办

1. **用户 token 安全**：用户多次把全权限 PAT 粘贴进对话（2026-11-16 又一次），该 PAT 本次已用于仓库推送与 cron-job.org 任务配置（存储于 cron-job.org 的 Authorization Header）。已再次提醒：尽快撤销并换成**最小权限** token（仅这两个仓库，`contents:write` + `workflow`），换后同步更新 cron-job.org 任务 Header。
2. **Web233 永远不配 cookie**：公开仓库不存密钥是设计约束（DEVELOPMENT.md §1），别"顺手"给它配上。
3. **Docker 版未实机验证**：只能静态核对 compose/脚本/文档一致性。用户若有服务器，跑 `bash scripts/setup.sh` 走一遍并按 README 快速开始验证。
4. **cookie 有效期约 30 天**：到期后 WebAction 的 `BILI_COOKIE` 需更新（Secrets 粘贴新值即可）。
5. **上游结构变更风险**：`inject-cookie.js`（正则替换）与 `sync_cookie.py`（自动探测表结构）对上游变更有一定抗性，但上游若大改 `env.js` 结构需同步适配。
6. **schedule 丢时段**：GitHub 偶发整段丢定时（历史实测，如 11-16 早间两档未触发）——现在由 cron-job.org 外部准点触发兜住；两通道都失效才需要手动补跑，非本仓库 bug。

## 5. 如何更新本仓库（AI 必读）

**铁律**（用户明确要求过）：
- 只做用户明确要求的改动，不做"顺手优化"
- 动手前先核对 main 当前 commit sha 是否与预期一致（防止其他 AI/会话并发改坏）
- 提交一律 **fast-forward**（非 force），commit message 用中文、风格对齐现有历史
- 共享文件改后两仓库同步，blob sha 必须相同
- 任何密钥只进 Secrets，不进代码和文档

**三条路径**（细节与踩坑记录见 [AI-UPDATES.md](./AI-UPDATES.md)）：
- **A. 本地 git**：clone → 改 → commit → push（最常规）
- **B. GitHub API**：Git Data API 四步（blob → tree → commit → ref fast-forward），无需本地环境，已实战验证
- **C. Actions 里的 AI**：Copilot coding agent（零配置）或 claude-code-action（需 API key）

## 6. 功能验证矩阵（2026-11-16 两轮会话实测汇总）

| # | 功能 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | workflow YAML 语法 | PyYAML 解析两仓 6 个 yml | ✅ 全部合法 |
| 2 | cron ↔ case 映射 | 静态检查 9 个 cron 均有对应 case | ✅ 全命中 |
| 3 | 总开关=关 | 向 Web233 发 dispatch → job skipped、无任务执行 | ✅ |
| 4 | 总开关=开 | WebAction dispatch → 正常执行 | ✅ |
| 5 | force=true 越过开关与锁 | dispatch acount+force → 日志「强制/手动运行…不参与防重复锁」 | ✅ |
| 6 | 外部触发准点性 | 计划 17:13:00 → 实际 17:13:08 创建运行 | ✅ 误差约 8 秒 |
| 7 | 防重复锁抢占/跳过 | 同 slot 双触发：先到完整执行，后到全部 skipped 且不推送 | ✅ |
| 8 | 锁 GC | locks 分支不残留（过期锁自动清理） | ✅ |
| 9 | cookie 加密更新链路 | PyNaCl sealed box → PUT Secret（201/204）→ updated_at 变化 | ✅ |
| 10 | cookie 登录实测 | acount run 日志「成功登录 UID:411883458」 | ✅ |
| 11 | 飞书推送 | feishu-test run 日志「[feishu] ✅ 推送成功」 | ✅ |
| 12 | 静默时段逻辑 | workflow 通知步骤 HOUR 判断（代码审查） | ✅（23:00–07:00 跳过） |
| 13 | Docker 版定时表 | crontab-lottery 与 README/DEVELOPMENT 表逐行对照 | ✅（未实机跑） |
| 14 | notify webhook 回退 | 代码审查：FS_WEBHOOK env 优先 → env.js FS_BOT_WEBHOOK 回退 | ✅ |
| 15 | 安静模式：常规成功不推送 | 本地 6 用例 + 真机 acount 成功 run 日志「🔕 安静模式…跳过推送」且无飞书消息 | ✅ |
| 16 | 安静模式：三类放行 | 本地用例（中奖/cookie异常/失败）均发起推送；HTTPS 拦截验证卡片含中奖卡/警示卡/失败卡关键内容 | ✅ |
| 17 | feishu-test 不受安静模式影响 | 该 workflow 不设 NOTIFY_QUIET，默认全量（同日早前已实测推送成功） | ✅ |
| 18 | Docker run-task 安静模式 | `export NOTIFY_QUIET=1` 与 Actions 版规则一致（代码审查，未实机跑） | ✅ |

> 2026-11-15 的冒烟记录（lottery check / bilitool Daily 全链路）同样有效，见历史提交。

## 7. 关键文件速查

| 要改什么 | 去哪改 | 详见 |
|---|---|---|
| 定时时间表 | `lottery.yml`/`bilitool.yml` 的 cron **和** case（两处同步！） | DEVELOPMENT.md §11.1 |
| 防重复锁 / 时段对照表 | workflow 的「防重复锁」步骤 + ACTIONS-SCHEDULE.md 表 | ACTIONS-SCHEDULE.md |
| 外部定时任务 | cron-job.org 账号（WebAction 的 9 个 bili-* 任务） | ACTIONS-SCHEDULE.md §cron-job.org |
| 转发量 | `timeout` 值（Actions + Docker 两处） | DEVELOPMENT.md §11.2 |
| 抽奖行为 | `lottery/my_config.example.js` | DEVELOPMENT.md §5.6 |
| cookie 注入逻辑 | `lottery/inject-cookie.js`（Actions）/ `sync/sync_cookie.py`（Docker） | DEVELOPMENT.md §5.4 / §6.6 |
| 飞书卡片 | `lottery/notify-feishu.js`（TASK_TEMPLATES） | DEVELOPMENT.md §10 |
| 推送过滤（安静模式） | workflow「飞书通知」步骤 env 的 NOTIFY_QUIET / run-task.sh | ACTIONS-SCHEDULE.md §推送策略、DEVELOPMENT.md §10.6 |
| 总开关 | 仓库变量 `ACTIONS_ENABLED` | ACTIONS-SWITCH.md |
| 静默时段 | workflow 通知步骤的 HOUR 判断 | ACTIONS-SCHEDULE.md |
| cookie 过期更新 | `BILI_COOKIE` Secret | COOKIE-UPDATE.md（含 AI 代更新标准流程） |
