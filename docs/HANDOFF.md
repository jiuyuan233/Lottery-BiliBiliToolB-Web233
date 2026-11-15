# 🤝 AI 交接文档（HANDOFF）

> 写给下一个接手本项目的 AI / 维护者。读完本文 + [DEVELOPMENT.md](./DEVELOPMENT.md)（仅 Web233 有），你应能安全接手全部维护工作。
> 最后交接：2026-11-15。

## 1. 项目一句话

B 站自动化**胶水层**：[LotteryAutoScript](https://github.com/shanmiteko/LotteryAutoScript)（动态抽奖，Node.js）+ [BiliBiliToolPro](https://github.com/RayWangQvQ/BiliBiliToolPro)（日常任务，C#/.NET），双模式运行（GitHub Actions / Docker Compose）。本仓库只维护配置模板、cookie 桥接、定时编排、飞书通知，**不复制上游源码**——每次运行 `git clone --depth 1` 拉上游最新。

## 2. 两仓库部署现状（重要）

| 仓库 | 可见性 | 角色 | Cookie | `ACTIONS_ENABLED` |
|---|---|---|---|---|
| `Lottery-BiliBiliToolB-WebAction` | 私有 | **用户自用（生产）** | Secrets 已配（BILI_COOKIE、FS_WEBHOOK、FS_APP_ID、FS_APP_SECRET） | `true`（定时在跑） |
| `Lottery-BiliBiliToolB-Web233` | 公开 | 模板/分享 | **故意不配**（公开仓库不存密钥） | `false`（定时关闭） |

- 两仓库共享文件必须保持一致（清单见 DEVELOPMENT.md §11.6），改一处同步另一处，blob sha 应相同
- 定时任务总开关：仓库变量 `ACTIONS_ENABLED`，见 [ACTIONS-SWITCH.md](./ACTIONS-SWITCH.md)
- 所有 cron 统一**提前 30 分钟起跑**（目标时段不变，对冲 GitHub schedule 延迟）；飞书**静默时段 23:00–07:00（北京）**，见 [ACTIONS-SCHEDULE.md](./ACTIONS-SCHEDULE.md)

## 3. 2026-11-15 交接会话已完成

1. 排查"动态抽奖失败邮件轰炸"：根因是 Web233 无 cookie（设计如此），而 lottery.yml 没有 bilitool.yml 那样的容错
2. 新增 `ACTIONS_ENABLED` 总开关（两个 workflow 的 job 级 `if` + 文档），Web233 定时静默跳过、不再发失败邮件
3. 所有 cron 提前 30 分钟 + 飞书静默时段（decide 步骤的 case 映射已同步更新——cron 与 case 必须一致）
4. 审查全部 md 文档并修正过时内容（README 时间表、DEVELOPMENT.md 的 cron 表/crontab 引用/文件清单等）
5. 在 WebAction 实际触发两个 workflow 冒烟测试通过（结果见 §6）

## 4. 已知问题与待办

1. **用户 token 安全**：用户曾把全权限 PAT 粘贴进对话，已多次提醒撤销。需要 token 时让用户生成**最小权限**（`contents:write` + `workflow`，仅这两个仓库）新 token，勿复用旧的。
2. **Web233 永远不配 cookie**：公开仓库不存密钥是设计约束（DEVELOPMENT.md §1），别"顺手"给它配上。
3. **Docker 版未实机验证**：只能静态核对 compose/脚本/文档一致性。用户若有服务器，跑 `bash scripts/setup.sh` 走一遍并按 README 快速开始验证。
4. **cookie 有效期约 30 天**：到期后 WebAction 的 `BILI_COOKIE` 需更新（Secrets 粘贴新值即可）。
5. **上游结构变更风险**：`inject-cookie.js`（正则替换）与 `sync_cookie.py`（自动探测表结构）对上游变更有一定抗性，但上游若大改 `env.js` 结构需同步适配。
6. **schedule 丢时段**：GitHub 偶发整段丢定时（历史实测），表现为某天某时段没跑——手动补跑即可，非本仓库 bug。

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

## 6. 2026-11-15 冒烟测试记录（WebAction）

| workflow | 输入 | 结果 |
|---|---|---|
| 动态抽奖 | cmd=check | ✅ 运行成功（决定命令/checkout/克隆上游/注入 cookie/执行/通知全链路正常） |
| B站日常任务 | tasks=Daily | ✅ 运行成功（.NET 构建 + Daily 任务链路正常） |

## 7. 关键文件速查

| 要改什么 | 去哪改 | 详见 |
|---|---|---|
| 定时时间表 | `lottery.yml`/`bilitool.yml` 的 cron **和** case（两处同步！） | DEVELOPMENT.md §11.1 |
| 转发量 | `timeout` 值（Actions + Docker 两处） | DEVELOPMENT.md §11.2 |
| 抽奖行为 | `lottery/my_config.example.js` | DEVELOPMENT.md §5.6 |
| cookie 注入逻辑 | `lottery/inject-cookie.js`（Actions）/ `sync/sync_cookie.py`（Docker） | DEVELOPMENT.md §5.4 / §6.6 |
| 飞书卡片 | `lottery/notify-feishu.js`（TASK_TEMPLATES） | DEVELOPMENT.md §10 |
| 总开关 | 仓库变量 `ACTIONS_ENABLED` | ACTIONS-SWITCH.md |
| 静默时段 | workflow 通知步骤的 HOUR 判断 | ACTIONS-SCHEDULE.md |
