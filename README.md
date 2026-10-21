# Lottery-BiliBiliToolB-Web233

> **B 站一站式自动化**：把 [LotteryAutoScript](https://github.com/shanmiteko/LotteryAutoScript)（动态抽奖）与 [BiliBiliToolPro](https://github.com/RayWangQvQ/BiliBiliToolPro)（日常任务 + Web 面板）合并为统一方案。
>
> **两种运行方式，按需选择：**
>
> | 方式 | 适合人群 | 特点 |
> |------|---------|------|
> | **Docker Compose**（默认） | 有服务器/NAS | Web 管理面板、扫码登录、cookie 自动同步、实时状态页 |
> | **GitHub Actions**（无需服务器） | 不想维护服务器 | 零运维、cookie 存 Secrets、定时自动跑、每月约 100–200 分钟额度 |
>
> 两种方式**扫一次码，两边共用**，均采用**类人类作息**定时，保留两个上游 GPL-3.0 更新渠道。

---

## ✨ 功能一览

| 来源 | 功能 |
|------|------|
| **BiliBiliToolPro**（C#/.NET Web 面板） | 扫码登录 + cookie 自动刷新、每日经验任务、直播间抽奖、VIP 积分/权益、粉丝勋章、漫画签到、银瓜子换硬币、B 币充电、批量取关、多账号管理、定时计划、执行日志、Telegram/钉钉/企微等通知 |
| **LotteryAutoScript**（Node.js） | 监控用户转发/话题/专栏、自动点赞+AI 评论+乱序转发+@好友+带话题、直播预约抽奖、中奖检测（已读 @/私信）、清理动态关注、AI 判断过滤过期抽奖 |
| **本仓库胶水层** | cookie 自动同步（SQLite→env.js）、nginx 统一入口、抽奖状态页、类人类作息定时、一键更新 |

---

## 🏗️ 架构

```
                浏览器 http://服务器:22330
                        │
                     ┌──┴──┐
                     │ nginx│  统一入口
                     └──┬──┘
              /─────────┴─────────\
             /                     \
   /  → bili_tool_web:8080      /lottery/  → lottery:3000
   (BiliBiliTool 面板              (抽奖状态页 + 手动触发)
    扫码登录/日常任务)                    │
            │                            │ cron 类人类作息
            ▼                            ▼
   config/BiliBiliTool.db          node main.js start/check/clear
   (cookie 存这里)                        │
            │                            ▼
            └──── cookie-sync ────→  lottery/data/env.js
                 (每5分钟同步cookie)    (cookie 自动喂入)
```

四个服务（`docker-compose.yml`）：

| 服务 | 镜像 | 作用 |
|------|------|------|
| `bili_tool_web` | `ghcr.io/raywangqvq/bili_tool_web`（官方） | Web 面板、扫码登录、日常任务、cookie 自动刷新 |
| `lottery` | 本仓库自建（build 时 clone 上游） | 动态抽奖、中奖检测、状态页 |
| `cookie-sync` | 本仓库自建 | 把面板 cookie 同步给抽奖服务 |
| `nginx` | `nginx:alpine` | 统一入口 |

---

## 🚀 快速开始（Docker Compose 版）

### 1. 安装 Docker（如未安装）
```bash
apt-get update && apt-get install -y docker.io docker-compose-plugin curl
```

### 2. 克隆本仓库并初始化
```bash
git clone https://github.com/jiuyuan233/Lottery-BiliBiliToolB-Web233.git
cd Lottery-BiliBiliToolB-Web233
bash scripts/setup.sh
```
`setup.sh` 会：创建 `.env`、拷贝类人类作息配置模板、构建抽奖与同步镜像、启动全部服务。

### 3. 扫码登录（只扫一次）
- 浏览器打开 `http://<服务器IP>:22330`
- 用初始账号 **admin / BiliTool@2233** 登录，**首次请立即在 Admin 页改密**
- 在「登录」任务里 **扫码登录 B 站账号**
- 扫码后 `cookie-sync` 会在 5 分钟内自动把 cookie 同步给抽奖服务，**无需再扫第二次**

### 4. 查看抽奖状态
- `http://<服务器IP>:22330/lottery/` —— 抽奖状态页（cookie 状态、运行日志、手动触发按钮）

### 5. 完成
抽奖服务按**类人类作息**自动运行（见下文）。如需多账号，在面板里再扫一次码即可，同步脚本会自动识别多账号并切换多账号模式。

---

## ⏰ 类人类作息定时

抽奖服务不 24h 挂机，而是模拟「白天活跃、夜里睡觉」的真实用户节奏（`lottery/crontab-lottery`）：

| 时间 | 动作 | 说明 |
|------|------|------|
| 08:33 | `check` | 起床检查中奖（错峰避整点） |
| 10:33 | `start` | 上午参与抽奖（timeout 20分钟≈26条） |
| 12:13 | `start` | 午休刷动态，参与抽奖（timeout 20分钟≈26条） |
| 19:33 | `start` | 晚饭后活跃高峰，再参与一波（timeout 20分钟≈26条） |
| 22:03 | `check` | 睡前检查中奖（错峰） |
| 周日 23:03 | `clear` | 周末清理临时关注/动态（错峰） |

**0:00–7:59 不执行任何任务**（睡眠期）。各操作间隔也调大（转发 45s、检索 5s 等），降低风控概率。详见 `lottery/my_config.example.js` 注释。

> BiliBiliToolPro 的日常任务计划可在面板「计划」页自行调整，建议同样排布在白天时段。

### 🎯 抽奖策略（已在 `lottery/my_config.example.js` 中配好）

- **① 都转**：`model: '11'`（官方+非官方抽奖都参与），`chatmodel: '11'`（都评论），最大化中奖机会。
- **② 避免黑号**：`create_dy: true`，每转发 7~8 个抽奖后，发 1~2 条随机动态（看推荐视频 / 点赞 / 评论 / 转发 / 三连），向 B 站证明是活人，降低被风控判为脚本黑号的风险。
- **③ 控制转发量**：每次运行 timeout 20分钟（≈转发26条），上午/中午/晚上各一次，发够26条休息1小时以上，避免短时间大量转发。

---

## ⚙️ 配置

| 文件 | 说明 |
|------|------|
| `.env` | 端口、镜像标签、同步间隔（从 `.env.example` 拷贝） |
| `lottery/data/env.js` | 抽奖账号 + 推送渠道。**COOKIE 由同步脚本自动维护**，你只配推送（TG/钉钉/邮件等） |
| `lottery/data/my_config.js` | 抽奖行为：监视 uid/tag/专栏、关键词、AI 评论、清理策略等，类人类作息已调好 |
| `bili_tool_web/config/BiliBiliTool.db` | 面板账号库（扫码后自动生成） |

推送配置示例（编辑 `lottery/data/env.js` 的 `push_parm`）：
```js
push_parm: {
    TG_BOT_TOKEN: '123456:ABC-DEF',   // Telegram
    TG_USER_ID: '987654321',
    // 或钉钉：
    // DD_BOT_TOKEN: 'xxx', DD_BOT_SECRET: 'SECxxx',
    // 或飞书（推荐，Docker 版自动推送抽奖结果卡片）：
    // FS_BOT_WEBHOOK: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx',
}
```

### 📨 飞书推送（Docker 版，与 Actions 版一致）

Docker 版每次 cron 定时执行和状态页手动触发后，自动推送飞书卡片通知（与 Actions 版功能完全一致）：

1. 在飞书群聊中添加**自定义机器人**（群设置 → 群机器人 → 添加机器人 → 自定义机器人）
2. 复制 webhook URL
3. 编辑 `lottery/data/env.js`，在 `push_parm` 里填入 `FS_BOT_WEBHOOK`
4. 下次 cron 执行或状态页手动触发时，自动推送飞书卡片

推送效果（与 Actions 版完全一致）：
- ✅ 成功时绿色卡片，❌ 失败时红色卡片，🎉 中奖时深红色醒目卡片
- 包含任务名称、执行状态、北京时间、关键指标（检索/转发/评论/点赞数）
- 中奖时自动提取奖品详情，放在卡片最顶部

---

## 🔄 更新（保留两个上游更新渠道）

```bash
bash scripts/update.sh
```
- **BiliBiliToolPro**：拉官方镜像 `ghcr.io/raywangqvq/bili_tool_web:latest`
- **LotteryAutoScript**：重新 build（Dockerfile 内 `git clone` 上游最新源码）

也可用 Watchtower 让面板镜像自动更新。两个上游的更新渠道均完整保留。

---

## 📂 目录结构

```
Lottery-BiliBiliToolB-Web233/
├── docker-compose.yml          # 四服务编排（Docker Compose 版）
├── .env.example                # 环境变量模板
├── .github/workflows/
│   ├── lottery.yml             #   动态抽奖 workflow（GitHub Actions 版）
│   └── bilitool.yml            #   B站日常任务 workflow（GitHub Actions 版）
├── nginx/default.conf          # 统一入口：/ 进面板，/lottery/ 进抽奖
├── lottery/                    # 抽奖服务
│   ├── Dockerfile              #   build 时 clone LotteryAutoScript 上游（Docker 版）
│   ├── entrypoint.sh           #   软链接配置 + cron + 状态页（Docker 版）
│   ├── status-server.js        #   极简 Express 状态页（胶水层，不侵入上游）
│   ├── crontab-lottery         #   类人类作息定时（Docker 版 cron）
│   ├── env.example.js          #   账号+推送配置模板（两种方式共用）
│   ├── my_config.example.js    #   抽奖行为配置模板（类人类作息，两种方式共用）
│   └── inject-cookie.js        #   从 Secrets 注入 cookie（GitHub Actions 版）
├── sync/                       # cookie 同步胶水层（Docker 版）
│   ├── Dockerfile
│   ├── sync_cookie.py          #   SQLite→env.js，自动探测表结构
│   └── supervisord.conf
├── scripts/setup.sh            # 一键初始化（Docker 版）
├── scripts/update.sh           # 一键更新（Docker 版）
├── docs/UPGRADE-BLAZOR.md      # 可选：把抽奖页真嵌进 Blazor 面板
└── bili_tool_web/              # 面板数据（运行时生成，勿提交）
```

---

## 🛠️ 常用命令

```bash
docker compose up -d            # 启动
docker compose logs -f          # 看日志
docker compose logs -f lottery  # 只看抽奖
docker compose restart lottery  # 重启抽奖
docker compose down             # 停止
docker exec -it lottery sh      # 进抽奖容器
docker exec -it bili_tool_web /bin/bash  # 进面板容器
```

---

## 🚀 GitHub Actions 启动方式（无需服务器）

> 不想维护服务器？本仓库内置 GitHub Actions workflow，Fork 后配个 Secret 就能跑，**零运维**。

### 与 Docker Compose 版的对比

| 特性 | Docker Compose 版 | GitHub Actions 版 |
|------|-------------------|-------------------|
| 运行环境 | 自有服务器 / NAS | GitHub Actions（免费） |
| 是否需要服务器 | ✅ 需要 | ❌ 不需要 |
| Web 管理面板 | ✅ 有（Blazor 面板，端口 22330） | ❌ 无 |
| Cookie 管理 | Web 面板扫码 / 自动同步 | GitHub Secrets（手动更新） |
| 定时方式 | 系统 cron | GitHub cron |
| 实时状态查看 | Web 面板实时 | Actions 运行日志 |
| 适合人群 | 有服务器、想要 Web 面板 | 不想维护服务器 |

### 快速开始（Actions 版）

#### 1. Fork 本仓库

点击右上角 **Fork** 按钮，将本仓库 Fork 到你的 GitHub 账号。

> ⚠️ **建议将 Fork 后的仓库设为私有** — Actions 运行日志可能包含账号相关信息。Settings → General → Danger Zone → Change visibility → Private。

#### 2. 获取 B 站 cookie

1. 浏览器登录 [B 站](https://www.bilibili.com)，按 `F12` → `Network` 标签
2. 刷新页面，找任意请求 → `Headers` → 复制 `Cookie` 字段完整值
3. 确认包含 `SESSDATA=xxxx` 字段

#### 3. 配置 GitHub Secrets

进入 **Settings → Secrets and variables → Actions → New repository secret**：

| Secret 名称 | 必填 | 说明 |
|-------------|------|------|
| `BILI_COOKIE` | ✅ | 主账号 cookie（含 SESSDATA） |
| `BILI_COOKIE_2` | ❌ | 第二个账号 cookie（多账号） |
| `BILI_COOKIE_3` | ❌ | 第三个账号 cookie（多账号） |
| `FS_WEBHOOK` | ❌ | 飞书自定义机器人 webhook URL（可选通知） |
| `TG_BOT_TOKEN` | ❌ | Telegram Bot Token（可选通知） |
| `TG_CHAT_ID` | ❌ | Telegram Chat ID（可选通知） |
| `PUSHPLUS_TOKEN` | ❌ | PushPlus Token（可选通知） |

#### 4. 启用 Actions

进入 **Actions** 标签 → 如提示则点击 **"I understand my workflows, go ahead and enable them"**。两个 workflow 会按类人类作息自动定时运行。

#### 5. 手动测试（可选）

**Actions → 动态抽奖 → Run workflow** → 选命令 → 运行。或 **Actions → B站日常任务 → Run workflow** → 输入任务列表 → 运行。

#### 6. 飞书推送（可选）

任务执行完后自动推送结果到飞书群：

1. 在飞书群聊中添加**自定义机器人**（群设置 → 群机器人 → 添加机器人 → 自定义机器人）
2. 复制 webhook URL，存到仓库 Secrets：名称 `FS_WEBHOOK`
3. 测试推送：**Actions → 飞书推送测试 → Run workflow** → 发一条测试消息

推送效果（卡片消息）：
- ✅ 成功时绿色卡片，❌ 失败时红色卡片
- 包含任务名称、执行状态、北京时间、Actions 日志链接

### Actions 版类人类作息时间表

所有时间为**北京时间**（cron 用 UTC，已自动换算）。

**动态抽奖**（`.github/workflows/lottery.yml`）：

| 北京时间 | 动作 | 说明 |
|---------|------|------|
| 08:33 | `check` | 起床检查中奖（错峰避整点） |
| 10:33 | `start` | 上午参与抽奖（timeout 20分钟≈26条） |
| 12:13 | `start` | 午休参与抽奖（timeout 20分钟≈26条） |
| 19:33 | `start` | 晚饭后参与抽奖（timeout 20分钟≈26条） |
| 22:03 | `check` | 睡前检查中奖（错峰） |
| 周日 23:03 | `clear` | 每周清理动态/关注（错峰） |

**B 站日常任务**（`.github/workflows/bilitool.yml`）：

| 北京时间 | 任务 | 说明 |
|---------|------|------|
| 09:00 | `Daily,VipBigPoint,Manga,Silver2Coin,VipPrivilege` | 每日任务+VIP大积分+漫画+银换硬币+VIP权益 |
| 12:00 | `LiveLottery` | 直播间天选抽奖 |
| 19:00 | `LiveLottery,LiveFansMedal` | 直播间天选抽奖+粉丝勋章 |

> 🌙 **0:00–7:00 为睡眠期，不安排任何任务。**

### Actions 版运行原理

```
GitHub Actions 触发
  ├─ actions/checkout@v4          # 检出本仓库（配置模板 + inject-cookie.js）
  ├─ git clone 上游仓库            # 每次拉最新代码（保留更新渠道）
  ├─ 注入 cookie（从 Secrets）     # inject-cookie.js 写入 env.js
  └─ 执行命令                      # node main.js / dotnet run
```

本项目**不复制上游源码**，每次运行 `git clone --depth 1` 拉取上游最新代码，上游更新后下次运行自动生效。

### Actions 版注意事项

- **免费额度**：私有仓库每月 2000 分钟，本项目约消耗 100–200 分钟/月；公开仓库无限制
- **Cookie 有效期**：约 30 天，过期后需重新获取并更新 Secrets
- **cron 延迟**：GitHub scheduled workflow 可能延迟几分钟，不保证准时
- **保持活跃**：公开仓库 60 天无活动 workflow 会被自动禁用，偶尔手动 Run 一次即可

---

## 📜 开源声明与致谢

本项目是以下两个 **GPL-3.0** 开源项目的集成与胶水层，本身同样以 **GPL-3.0** 协议开源。所有核心功能与源码版权归上游作者所有，本仓库仅提供 Docker 编排、cookie 同步、状态页等集成代码。

### 上游项目

| 项目 | 仓库 | 协议 | 作用 |
|------|------|------|------|
| **LotteryAutoScript** | https://github.com/shanmiteko/LotteryAutoScript | GPL-3.0 | B 站动态抽奖助手（Node.js） |
| **BiliBiliToolPro** | https://github.com/RayWangQvQ/BiliBiliToolPro | GPL-3.0 | B 站自动任务工具 + Web 面板（C#/.NET） |

感谢两位上游作者 @shanmiteko 与 @RayWangQvQ 的工作。本项目保留两个上游的全部更新渠道：
- BiliBiliToolPro 通过官方镜像 `ghcr.io/raywangqvq/bili_tool_web` 更新
- LotteryAutoScript 通过构建时 `git clone` 上游更新

完整 GPL-3.0 协议文本见 [LICENSE](./LICENSE) 与 https://www.gnu.org/licenses/gpl-3.0.txt

### 引用
- [SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [JunzhouLiu/BILIBILI-HELPER](https://github.com/JunzhouLiu/BILIBILI-HELPER)

---

## ⚠️ 免责声明

本项目仅用于**学习与测试**，不对任何因使用本工具产生的后果负责。使用前请：
1. 阅读并遵守 [B 站用户协议](https://www.bilibili.com/)；
2. 评估账号风险，合理设置频率（本仓库默认类人类作息已偏保守）；
3. **切勿**在 issue、公开配置中泄露 cookie、token、密码等敏感信息；
4. 测试完成后请自行删除，请勿滥用。

运行测试满意后请及时清理，理性使用，尊重平台规则。
