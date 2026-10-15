# Lottery-BiliBiliToolB-Web233

> **B 站一站式自动化**：把 [LotteryAutoScript](https://github.com/shanmiteko/LotteryAutoScript)（动态抽奖）与 [BiliBiliToolPro](https://github.com/RayWangQvQ/BiliBiliToolPro)（日常任务 + Web 面板）合并为一个 **Docker Compose** 服务。
>
> **扫一次码，两边共用**：在 BiliBiliToolPro 面板扫码登录，cookie 自动同步给抽奖服务；两边 cookie 一起刷新。Build 后 `docker compose up -d`，扫码即用。

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

## 🚀 快速开始（Debian x86）

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
| 08:30 | `check` | 起床检查中奖 |
| 12:10 | `start` | 午休刷动态，参与抽奖 |
| 19:30 | `start` | 晚饭后活跃高峰，再参与一波 |
| 22:00 | `check` | 睡前检查中奖 |
| 周日 23:00 | `clear` | 周末清理临时关注/动态 |

**0:00–7:59 不执行任何任务**（睡眠期）。各操作间隔也调大（转发 45s、检索 5s 等），降低风控概率。详见 `lottery/my_config.example.js` 注释。

> BiliBiliToolPro 的日常任务计划可在面板「计划」页自行调整，建议同样排布在白天时段。

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
}
```

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
├── docker-compose.yml          # 四服务编排
├── .env.example                # 环境变量模板
├── nginx/default.conf          # 统一入口：/ 进面板，/lottery/ 进抽奖
├── lottery/                    # 抽奖服务（自建镜像）
│   ├── Dockerfile              #   build 时 clone LotteryAutoScript 上游
│   ├── entrypoint.sh           #   软链接配置 + cron + 状态页
│   ├── status-server.js        #   极简 Express 状态页（胶水层，不侵入上游）
│   ├── crontab-lottery         #   类人类作息定时
│   ├── env.example.js          #   账号+推送配置模板（优化注释）
│   └── my_config.example.js    #   抽奖行为配置模板（类人类作息）
├── sync/                       # cookie 同步胶水层
│   ├── Dockerfile
│   ├── sync_cookie.py          #   SQLite→env.js，自动探测表结构
│   └── supervisord.conf
├── scripts/setup.sh            # 一键初始化
├── scripts/update.sh           # 一键更新
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
