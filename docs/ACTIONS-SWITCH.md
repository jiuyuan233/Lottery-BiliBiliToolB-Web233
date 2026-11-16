# ⚡ Actions 总开关（ACTIONS_ENABLED）

一个仓库变量控制本仓库全部**定时与外部触发**（动态抽奖 / B站日常任务）是否自动执行。
多个部署仓库跑的是同一套代码，只靠这个变量的取值区分开/关。

## 开关位置

**Settings → Secrets and variables → Actions → Variables 标签** → 变量 `ACTIONS_ENABLED`

## 取值与行为（2026-11-16 起，外部触发同样受控）

| ACTIONS_ENABLED | schedule 定时触发 | workflow_dispatch（含 cron-job.org 外部触发） |
|---|---|---|
| `true` | ✅ 正常执行 | ✅ 正常执行 |
| `false` 或未设置 | ⏭️ 整个 job 跳过（run 绿色，无失败邮件） | ⏭️ 同样跳过（`force=true` 除外） |

- 开关同时拦**定时触发**与**外部触发**（cron-job.org 的 workflow_dispatch）——公开仓库即使被外部定时误触发也不会跑任务；
- 手动 Run workflow 想临时测试时，勾选 **force** 输入（`force=true`）可越过开关与防重复锁；
- 「飞书推送测试」workflow 是纯手动测试入口，不受开关限制；
- 定时 run 被跳过时，Actions 页面显示该次 run 绿色、job 标记为 skipped，属正常现象。

## 修改步骤

1. 仓库页 → Settings → Secrets and variables → Actions
2. 切到 **Variables** 标签 → New repository variable（已存在则直接编辑）
3. Name：`ACTIONS_ENABLED`，Value：`true`（开）/ `false`（关）
4. 保存即生效：下一次定时或外部触发即按新值执行，无需改代码、无需重启；外部定时（cron-job.org）配置见 [ACTIONS-SCHEDULE.md](./ACTIONS-SCHEDULE.md)

## 为什么需要它

同一套代码部署到多个仓库时，通常只有主力仓库需要真正跑定时任务：

- 关闭方仓库若未配 cookie，定时任务会反复失败并触发 GitHub 失败通知邮件；
- 多个仓库同时开启，同一 B 站账号会在两处重复执行任务（重复转发动态、重复签到），增加风控风险；
- 公开模板仓库默认关闭，即使有人向它发送外部定时触发也不会跑任务。因此约定：**主力仓库设 `true`，其余副本设 `false` 或不设。**
