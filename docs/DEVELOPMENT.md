# 开发文档 — Lottery-BiliBiliToolB 从底层逻辑讲起

> 本文档面向**接手开发或维护**的工程师，从最底层的依赖关系、数据流、核心逻辑开始，
> 逐文件讲解实现原理。读完本文档，你应能独立修改任意配置、排查任意故障、扩展任意功能。

---

## 目录

1. [项目定位与仓库关系](#1-项目定位与仓库关系)
2. [上游依赖](#2-上游依赖)
3. [整体架构](#3-整体架构)
4. [核心设计决策](#4-核心设计决策)
5. [GitHub Actions 版文件详解](#5-github-actions-版文件详解)
6. [Docker Compose 版额外文件详解](#6-docker-compose-版额外文件详解)
7. [数据流：cookie 如何流动](#7-数据流cookie-如何流动)
8. [定时策略：类人类作息](#8-定时策略类人类作息)
9. [抽奖策略：三大策略](#9-抽奖策略三大策略)
10. [飞书推送系统](#10-飞书推送系统)
11. [扩展与修改指南](#11-扩展与修改指南)

---

## 1. 项目定位与仓库关系

本项目把两个独立的 B 站自动化开源项目合并为统一方案，核心价值是**胶水层**：
不复制上游源码，只提供配置模板、cookie 桥接、定时编排和通知推送。

```
┌─────────────────────────────────────────────────────┐
│           本项目（胶水层，GPL-3.0）                    │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  WebAction      │    │  Web233                   │ │
│  │  (私有·自用)     │    │  (公开·模板)              │ │
│  │                  │    │                           │ │
│  │  GitHub Actions  │    │  Docker Compose           │ │
│  │  仅 Actions 版   │    │  + Actions 版（双模式）    │ │
│  │  cookie 存 Secrets│   │  cookie 面板扫码/同步      │ │
│  └─────────────────┘    └──────────────────────────┘ │
│                                                       │
│  共享文件：my_config.example.js / env.example.js      │
│           inject-cookie.js / notify-feishu.js         │
│           lottery.yml / bilitool.yml / feishu-test.yml │
└─────────────────────────────────────────────────────┘
          │                           │
          ▼                           ▼
  ┌───────────────┐         ┌──────────────────┐
  │ LotteryAuto   │         │ BiliBiliToolPro   │
  │ Script        │         │                   │
  │ (Node.js)     │         │ (C#/.NET)         │
  │ 动态抽奖       │         │ 日常任务+Web面板   │
  └───────────────┘         └──────────────────┘
```

| 仓库 | 可见性 | 用途 | 运行方式 |
|------|--------|------|---------|
| `Lottery-BiliBiliToolB-WebAction` | 私有 | 用户自用 | 纯 GitHub Actions |
| `Lottery-BiliBiliToolB-Web233` | 公开 | 模板/分享 | Docker Compose + GitHub Actions |

**关键约束**：Web233 是公开仓库，**绝不存任何用户密钥**（无 Secrets）。WebAction 是私有仓库，存 cookie 和飞书 webhook。

---

## 2. 上游依赖

### 2.1 LotteryAutoScript（动态抽奖）

- **仓库**：`https://github.com/shanmiteko/LotteryAutoScript`
- **语言**：Node.js
- **协议**：GPL-3.0
- **功能**：监控用户转发/话题/专栏 → 自动点赞+评论+转发参与抽奖 → 检查中奖 → 清理动态
- **配置文件**：
  - `env.js` — 账号 cookie + 推送渠道
  - `my_config.js` — 抽奖行为参数（转发间隔、关键词、AI 评论等）
- **命令**：`node main.js start|check|clear|login|acount`
- **更新方式**：每次运行 `git clone --depth 1` 拉最新源码

### 2.2 BiliBiliToolPro（日常任务 + Web 面板）

- **仓库**：`https://github.com/RayWangQvQ/BiliBiliToolPro`
- **语言**：C#/.NET 10
- **协议**：GPL-3.0
- **功能**：每日经验任务、VIP 大积分、直播天选抽奖、粉丝勋章、漫画签到、银换硬币等
- **配置方式**：`Ray_` 前缀环境变量（.NET 强类型配置系统）
- **Web 面板**：Blazor Server，端口 8080，扫码登录，cookie 存 SQLite
- **更新方式**：
  - Docker 版：拉官方镜像 `ghcr.io/raywangqvq/bili_tool_web:latest`
  - Actions 版：`git clone --depth 1` + `dotnet run`

---

## 3. 整体架构

### 3.1 GitHub Actions 版（WebAction + Web233 共用）

```
GitHub Actions 定时触发 (cron UTC)
  │
  ├─ actions/checkout@v4        检出本仓库（配置模板 + 脚本）
  ├─ git clone 上游              每次拉最新源码（保留更新渠道）
  ├─ inject-cookie.js            从 Secrets 读 cookie → 写 env.js
  ├─ cp my_config.example.js     拷贝抽奖行为配置
  ├─ npm install / dotnet setup  安装依赖
  ├─ 执行命令                     timeout 1200 node main.js start
  └─ notify-feishu.js            解析日志 → 飞书卡片推送
```

### 3.2 Docker Compose 版（仅 Web233）

```
浏览器 http://服务器:22330
    │
  nginx (统一入口)
    ├─ /          → bili_tool_web:8080  (Blazor 面板，扫码登录)
    └─ /lottery/  → lottery:3000        (Express 状态页)
    
bili_tool_web (C#/.NET)
    │ 扫码后 cookie 存 SQLite
    ▼
cookie-sync (Python，每5分钟)
    │ 读 SQLite → 写 env.js
    ▼
lottery (Node.js)
    │ cron 定时跑 start/check/clear
    │ Express 状态页常驻 3000 端口
    ▼
  日志 → /app/data/logs/lottery.log
```

四个容器：

| 容器 | 镜像 | 职责 |
|------|------|------|
| `bili_tool_web` | 官方 `ghcr.io/raywangqvq/bili_tool_web` | Web 面板、扫码、日常任务、cookie 刷新 |
| `lottery` | 自建（build 时 clone 上游） | 动态抽奖、中奖检测、状态页 |
| `cookie-sync` | 自建（Python） | SQLite→env.js cookie 桥接 |
| `nginx` | `nginx:alpine` | 统一入口 |

---

## 4. 核心设计决策

### 决策1：不复制上游源码

**问题**：上游持续更新，复制源码会导致版本锁定、合并冲突。
**方案**：每次运行时 `git clone --depth 1` 拉最新源码，本仓库只维护配置模板和胶水脚本。
**代价**：每次运行多花 ~10s 克隆时间（可接受）。
**收益**：零合并冲突，上游更新自动生效。

### 决策2：cookie 桥接而非共享存储

**问题**：两个上游用不同的 cookie 存储格式（Node.js 读 `env.js`，C# 读 SQLite/环境变量）。
**方案**：
- Actions 版：`inject-cookie.js` 从 GitHub Secrets 读 cookie，正则替换写入 `env.js`
- Docker 版：`sync_cookie.py` 从 SQLite 读 cookie，正则替换写入 `env.js`
**关键**：只改 cookie 字段，保留 `env.js` 里的推送/AI 等其他配置不动。

### 决策3：类人类作息定时

**问题**：24h 挂机容易被 B 站风控识别为脚本。
**方案**：只在早中晚活跃时段运行，避开 0:00–7:00 睡眠期，所有 cron 错峰避整点。
**详见**：[第8节](#8-定时策略类人类作息)。

### 决策4：timeout 限制转发量

**问题**：LotteryAutoScript 没有内置"每次最多转发N条"的配置项。
**方案**：用 `timeout 1200`（20分钟）限制 `start` 命令运行时长。20分钟 × 45s/条 ≈ 26 条。
**实现**：`timeout 1200 node main.js start` — 到时间自动 SIGTERM 终止。

### 决策5：飞书推送用 webhook 而非应用

**问题**：飞书应用推送需要 APP_ID/APP_SECRET，配置复杂。
**方案**：用自定义机器人 webhook，只需一个 `FS_WEBHOOK` URL。
**实现**：`notify-feishu.js` 直接 POST JSON 到 webhook URL，无需鉴权。

---

## 5. GitHub Actions 版文件详解

### 5.1 `lottery.yml` — 动态抽奖 workflow

**触发方式**：`schedule`（6 个 cron）+ `workflow_dispatch`（手动选命令）

**执行流程**（逐 step 讲解）：

```
Step 1: 决定命令
  ├─ 手动触发 → 用 inputs.cmd
  └─ 定时触发 → case github.event.schedule 匹配 cron → 映射到 start/check/clear

Step 2: 检查 cookie
  └─ 读 secrets.BILI_COOKIE，为空则 ::error 并退出

Step 3: actions/checkout@v4
  └─ 检出本仓库代码（配置模板 + inject-cookie.js + notify-feishu.js）

Step 4: actions/setup-node@v4
  └─ 安装 Node.js 18

Step 5: git clone 上游
  └─ git clone --depth 1 https://github.com/shanmiteko/LotteryAutoScript.git lottery-src

Step 6: 注入 cookie 与配置
  ├─ cp lottery/my_config.example.js lottery-src/my_config.js
  └─ node lottery/inject-cookie.js  ← 读 env vars → 写 lottery-src/env.js

Step 7: npm install --omit=dev
  └─ 在 lottery-src 目录安装上游依赖

Step 8: 执行命令
  ├─ start → timeout 1200 node main.js start  (20分钟≈26条后自动停)
  └─ 其他 → node main.js $CMD
  └─ continue-on-error: true  (失败不阻塞后续飞书通知)

Step 9: 飞书通知 (if: always())
  ├─ 读 /tmp/task-output.log 尾部 200 行
  └─ node lottery/notify-feishu.js  ← 解析日志 → 飞书卡片
```

**cron 时间表**（UTC，北京时间 = UTC + 8）：

| cron (UTC) | 北京时间 | 命令 | 说明 |
|------------|---------|------|------|
| `33 0 * * *` | 08:33 | check | 起床检查中奖 |
| `33 2 * * *` | 10:33 | start | 上午参与抽奖 |
| `13 4 * * *` | 12:13 | start | 午休参与抽奖 |
| `33 11 * * *` | 19:33 | start | 晚饭后参与抽奖 |
| `3 14 * * *` | 22:03 | check | 睡前检查中奖 |
| `3 15 * * 0` | 周日 23:03 | clear | 周末清理 |

**关键设计**：
- `continue-on-error: true` — 执行失败不阻塞飞书通知
- `timeout 1200` — start 命令限时 20 分钟
- `if: always()` — 无论成功失败都推送飞书

### 5.2 `bilitool.yml` — B站日常任务 workflow

**触发方式**：`schedule`（3 个 cron）+ `workflow_dispatch`

**与 lottery.yml 的区别**：
- 克隆的是 `BiliBiliToolPro`（C#/.NET）
- 安装 .NET 10 SDK（`actions/setup-dotnet@v4`）
- cookie 通过 `Ray_BiliBiliCookies__1` 环境变量注入（.NET 配置系统）
- 任务通过 `Ray_RunTasks` 环境变量指定
- `continue-on-error: true` 在 job 级别 — .NET 构建失败不阻塞抽奖 workflow

**cron 时间表**：

| cron (UTC) | 北京时间 | 任务 |
|------------|---------|------|
| `3 1 * * *` | 09:03 | Daily,VipBigPoint,Manga,Silver2Coin,VipPrivilege |
| `7 4 * * *` | 12:07 | LiveLottery |
| `3 11 * * *` | 19:03 | LiveLottery,LiveFansMedal |

**Ray_ 环境变量映射**（.NET 强类型配置）：
- `Ray_RunTasks` → 执行哪些任务
- `Ray_BiliBiliCookies__1` → 第一个账号 cookie
- `Ray_BiliBiliCookies__2` → 第二个账号 cookie
- `Ray_Security__IntervalSecondsBetweenRequestApi` → API 请求间隔 20s
- `Ray_Serilog__WriteTo__3__Args__botToken` → Telegram Bot Token

### 5.3 `feishu-test.yml` — 飞书推送测试

手动触发，发一条测试消息验证 `FS_WEBHOOK` 配置是否正确。支持自定义消息内容、标题、模拟状态。

### 5.4 `inject-cookie.js` — cookie 注入脚本

**输入**：环境变量 `BILI_COOKIE` / `BILI_COOKIE_2` / `BILI_COOKIE_3`
**输出**：`lottery-src/env.js`（写入到克隆的上游源码目录）

**核心逻辑**：

```javascript
// 1. 收集所有 BILI_COOKIE 环境变量
for (const k of Object.keys(process.env)) {
    const m = /^BILI_COOKIE(_(\d+))?$/.exec(k);
    if (m && v.includes('SESSDATA')) {
        cookies.push({ idx, v });  // 必须含 SESSDATA 才算有效
    }
}

// 2. 单账号 → 正则替换 account_parm.COOKIE
if (cookies.length === 1) {
    txt = txt.replace(/(account_parm:\s*\{[\s\S]*?COOKIE:\s*)['"][^'"]*['"]/,
        (m, p1) => p1 + JSON.stringify(ck));
    txt = txt.replace(/ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)/,
        'ENABLE_MULTIPLE_ACCOUNT: false');
}

// 3. 多账号 → 构造 multiple_account_parm 数组
else {
    // 生成每个账号的配置块（COOKIE/NOTE/NUMBER/WAIT/UA...）
    // 替换 multiple_account_parm 数组
    // 设 ENABLE_MULTIPLE_ACCOUNT: true
    // 单账号 COOKIE 也写第一个（兼容上游单账号逻辑）
}
```

**关键正则**：
- `/(account_parm:\s*\{[\s\S]*?COOKIE:\s*)['"][^'"]*['"]/` — 匹配 `account_parm` 里的 `COOKIE` 字段
- `/ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)/` — 切换单/多账号模式

### 5.5 `notify-feishu.js` — 飞书推送脚本

**输入**：环境变量 `FS_WEBHOOK` / `NOTIFY_TITLE` / `NOTIFY_TASK` / `NOTIFY_STATUS` / `NOTIFY_OUTPUT`
**输出**：POST 飞书卡片消息到 webhook URL

**核心逻辑**：

```
1. 读环境变量，无 FS_WEBHOOK 则跳过
2. 根据 NOTIFY_TASK 匹配 TASK_TEMPLATES（每个任务有专属模板）
3. 从 NOTIFY_OUTPUT 日志中正则提取关键指标
4. detectWin() — 检测中奖关键词
5. 构造飞书卡片 JSON：
   - header: 标题 + 颜色（成功绿/失败红/中奖深红）
   - elements: 状态行 + 时间 + 仓库 + 各任务指标 + 日志摘要 + Actions 日志按钮
6. https.request POST 到 webhook
```

**任务模板系统**（`TASK_TEMPLATES`）：

```javascript
'start': {
    icon: '🎯',
    name: '参与抽奖',
    metrics: [
        { label: '检索动态', patterns: [/检索[^\d]*(\d+)[^\d]*条/, ...] },
        { label: '参与转发', patterns: [/转发[^\d]*(\d+)[^\d]*条/, ...] },
        ...
    ]
}
```

每个任务有：
- `icon` — 飞书卡片里的 emoji
- `name` — 中文名
- `metrics` — 关键指标及正则提取规则

**中奖检测**：

```javascript
function detectWin(log) {
    const winKeywords = [/恭喜.*?中奖/, /中奖.*?\d+/, /🎉.*?中奖/, ...];
    return winKeywords.some(p => p.test(log));
}
```

中奖时：
- 标题改为 `🎉🎉🎉 中奖通知！`
- 颜色改为 `carmine`（深红色，最醒目）
- 在卡片顶部加中奖详情

### 5.6 `my_config.example.js` — 抽奖行为配置

这是 LotteryAutoScript 的核心配置，控制抽奖行为的所有参数。

**关键配置项**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `model` | `'11'` | 转发模式：官方+非官方都转 |
| `chatmodel` | `'11'` | 评论模式：官方+非官方都评 |
| `wait` | `45000` | 转发间隔 45s（上游默认 30s） |
| `search_wait` | `5000` | 检索间隔 5s（上游默认 2s） |
| `create_dy` | `true` | 开启随机动态（避免黑号） |
| `create_dy_type` | `-1` | 混合模式（推荐视频+自定义） |
| `create_dy_mode` | `[[7,8],[1,2]]` | 每转7-8条发1-2条随机动态 |
| `sneaktower` | `true` | 偷塔模式（临近开奖才参与） |
| `minfollower` | `1000` | UP主最低粉丝数 |
| `clear_max_day` | `30` | 清理30天前的动态 |

**配置层级**：
```
default_config  →  全局默认
config_1        →  账号1覆盖（开启 AI 判断 + DeepSeek）
config_2/3      →  后续账号（从文件提取抽奖信息）
```

### 5.7 `env.example.js` — 账号与推送配置

**结构**：

```javascript
{
    account_parm: {
        COOKIE: '',           // ← cookie-sync/inject-cookie 自动写入
        NOTE: '',
        NUMBER: 1,
        CLEAR: true,
        ACCOUNT_UA: '...',    // 模拟真实浏览器 UA
        ENABLE_MULTIPLE_ACCOUNT: false,
        LOTTERY_LOG_LEVEL: 3, // Info
    },
    multiple_account_parm: [  // ← 多账号时自动填充
        { COOKIE: '', NOTE: '', NUMBER: 1, WAIT: 90000, ... }
    ],
    push_parm: {
        TG_BOT_TOKEN: '',     // Telegram
        DD_BOT_TOKEN: '',     // 钉钉
        FS_BOT_WEBHOOK: '',   // 飞书
        SMTP_HOST: '',        // 邮件
        ...
    },
    ai_parm: { AI_API_KEY: '' }
}
```

**关键**：`COOKIE` 字段由 `inject-cookie.js`（Actions 版）或 `sync_cookie.py`（Docker 版）自动维护，用户只配推送渠道。

---

## 6. Docker Compose 版额外文件详解

### 6.1 `docker-compose.yml` — 四服务编排

```yaml
services:
  bili_tool_web:   # 官方镜像，Web 面板
    image: ghcr.io/raywangqvq/bili_tool_web:${BILITOOL_TAG:-latest}
    volumes:
      - ./bili_tool_web/config:/app/config  # SQLite 账号库（共享给 cookie-sync）
      - ./bili_tool_web/Logs:/app/Logs

  lottery:         # 自建镜像，动态抽奖
    build: ./lottery
    volumes:
      - ./lottery/data:/app/data  # env.js/my_config.js/日志（与 cookie-sync 共享）

  cookie-sync:     # 自建镜像，cookie 桥接
    build: ./sync
    environment:
      SYNC_INTERVAL: ${SYNC_INTERVAL:-300}  # 5分钟
    volumes:
      - ./bili_tool_web/config:/bili_config:ro  # 只读账号库
      - ./lottery/data:/lottery_data            # 写入 env.js

  nginx:           # 统一入口
    image: nginx:alpine
    ports: ["${WEB_PORT:-22330}:80"]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
```

**数据共享路径**：
- `./bili_tool_web/config/BiliBiliTool.db` — 面板扫码后 cookie 存这里
- `./lottery/data/env.js` — cookie-sync 写入，lottery 读取
- `./lottery/data/logs/lottery.log` — lottery 写入，status-server 读取

### 6.2 `lottery/Dockerfile` — 抽奖容器镜像

```dockerfile
FROM node:18-slim

# 时区修复：安装 tzdata + 设置 Asia/Shanghai
ENV TZ=Asia/Shanghai
RUN apt-get update && apt-get install -y git cron ca-certificates tini tzdata \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 克隆上游源码 + 安装依赖
RUN git clone --depth 1 https://github.com/shanmiteko/LotteryAutoScript.git . \
    && npm install --omit=dev

# 外挂状态页（胶水层，不侵入上游）
COPY status-server.js ./status-server.js
RUN npm install express --no-save

# cron 定时任务
COPY crontab-lottery /etc/cron.d/lottery
RUN crontab /etc/cron.d/lottery

# 入口：cron 后台 + 状态页前台
ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
```

**时区修复的原因**：`node:18-slim` 默认不含 `tzdata`，`TZ` 环境变量不生效，cron 用 UTC 时区，导致 crontab 里的北京时间被当作 UTC 执行（差 8 小时）。

### 6.3 `lottery/crontab-lottery` — cron 定时

```cron
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SHELL=/bin/sh

33 8 * * *  cd /app && node main.js check  >> /app/data/logs/lottery.log 2>&1
33 10 * * * cd /app && timeout 1200 node main.js start >> ... 2>&1
13 12 * * * cd /app && timeout 1200 node main.js start >> ... 2>&1
33 19 * * * cd /app && timeout 1200 node main.js start >> ... 2>&1
3 22 * * *  cd /app && node main.js check  >> ... 2>&1
3 23 * * 0  cd /app && node main.js clear  >> ... 2>&1
```

**与 Actions 版的区别**：Docker 容器内时区已设为 `Asia/Shanghai`，所以 cron 直接用北京时间。Actions 版 cron 用 UTC（已自动换算）。

### 6.4 `lottery/entrypoint.sh` — 容器入口

```bash
# 1. 软链接配置文件（cookie-sync 持续更新 env.js）
[ -f "$DATA_DIR/env.js" ]       && ln -sf "$DATA_DIR/env.js"       /app/env.js
[ -f "$DATA_DIR/my_config.js" ] && ln -sf "$DATA_DIR/my_config.js" /app/my_config.js

# 2. 后台启动 cron
cron

# 3. 前台启动状态页
exec node status-server.js
```

**软链接的原因**：上游代码读 `./env.js`，但配置文件在 `./data/env.js`（volume 挂载），软链接桥接两者。

### 6.5 `lottery/status-server.js` — Express 状态页

**端口**：3000

**路由**：
- `GET /` — HTML 状态页（cookie 状态 + 手动触发按钮 + 日志尾部）
- `GET /api/status` — JSON 状态
- `POST /api/run` — 手动触发任务

**cookie 就绪检测**：

```javascript
function cookieReady() {
    const txt = fs.readFileSync(ENV_FILE, 'utf8');
    // 单账号：检查 COOKIE 字段含 SESSDATA
    const single = /COOKIE:\s*['"]([^'"]+)['"]/.exec(txt);
    if (single && single[1].includes('SESSDATA')) return { ready: true, mode: 'single' };
    // 多账号：检查 ENABLE_MULTIPLE_ACCOUNT: true
    if (/ENABLE_MULTIPLE_ACCOUNT:\s*true/.test(txt)) return { ready: true, mode: 'multiple' };
    return { ready: false, reason: 'COOKIE 为空' };
}
```

**手动触发**：

```javascript
app.post('/api/run', (req, res) => {
    const cmd = req.body.cmd;  // start/check/clear/login/acount
    execFile('node', ['main.js', cmd], { cwd: '/app', timeout: 30*60*1000 }, ...);
});
```

### 6.6 `sync/sync_cookie.py` — cookie 同步脚本

**运行环境**：Python 3.12 容器，每 `SYNC_INTERVAL` 秒执行一轮

**工作流程**：

```
每 5 分钟一轮：
  1. 打开 SQLite（只读模式）：sqlite3.connect("file:DB?mode=ro", uri=True)
  2. 自动探测存 cookie 的表/列（不依赖固定表名，抗上游变更）
  3. 遍历所有表 → 找列名含 "cookie" 的列 → 提取值
  4. parse_cookie() 解析每条 cookie → 提取 SESSDATA/DedeUserID/bili_jct/buvid3
  5. 单账号 → 写 account_parm.COOKIE
     多账号 → 构造 multiple_account_parm 数组 + ENABLE_MULTIPLE_ACCOUNT: true
  6. 只更新 cookie 字段，保留推送/AI 配置不动
  7. cookie 未变化则跳过（sig 对比）
```

**自动探测表结构**（抗上游变更）：

```python
for tbl in tables:
    cols = [r[1] for r in cur.execute(f"PRAGMA table_info({tbl})").fetchall()]
    cookie_cols = [c for c in cols if "cookie" in c.lower()]
    # 也找 CookieStr / Content / Value 等可能整条存 cookie 的列
```

**parse_cookie 支持两种格式**：
- JSON 对象（BiliBiliToolPro 可能存结构化 cookie）→ 递归扁平化提取
- 纯 cookie 串（`k=v; k=v` 或 `k=v&k=v`）→ 正则提取

### 6.7 `sync/Dockerfile` + `supervisord.conf`

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y sqlite3
COPY sync_cookie.py ./sync_cookie.py
RUN pip install supervisor
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
```

supervisord 管理 `sync_cookie.py` 的定时循环，`autorestart=true` 保证崩溃自动重启。

### 6.8 `nginx/default.conf` — 统一入口

```nginx
location /lottery/ {
    proxy_pass http://lottery_status/;  # 抽奖状态页
}

location / {
    proxy_pass http://bili_tool_web;     # Blazor 面板
    proxy_set_header Upgrade $http_upgrade;  # Blazor 长连接
    proxy_set_header Connection "upgrade";
}
```

### 6.9 `scripts/setup.sh` — 一键初始化

```bash
cp .env.example .env                    # 创建环境变量
cp lottery/env.example.js lottery/data/env.js       # 创建配置
cp lottery/my_config.example.js lottery/data/my_config.js
docker compose build lottery cookie-sync  # 构建镜像
docker compose up -d                      # 启动
```

### 6.10 `scripts/update.sh` — 一键更新

```bash
docker compose pull bili_tool_web nginx  # 拉官方镜像
docker compose build --no-cache lottery  # 重新 build（clone 上游最新）
docker compose up -d                      # 重启
```

---

## 7. 数据流：cookie 如何流动

### 7.1 GitHub Actions 版

```
用户在 GitHub Secrets 配置 BILI_COOKIE
  │
  ▼ (workflow 触发)
lottery.yml 的 env: BILI_COOKIE: ${{ secrets.BILI_COOKIE }}
  │
  ▼
inject-cookie.js 读 process.env.BILI_COOKIE
  │
  ▼ 正则替换
lottery-src/env.js 的 account_parm.COOKIE = "SESSDATA=...; DedeUserID=..."
  │
  ▼
node main.js start  ← 上游读 env.js 获取 cookie
```

### 7.2 Docker Compose 版

```
用户在面板扫码登录
  │
  ▼
bili_tool_web 写入 BiliBiliTool.db (SQLite)
  │
  ▼ (cookie-sync 每 5 分钟)
sync_cookie.py 读 SQLite → parse_cookie()
  │
  ▼ 正则替换
lottery/data/env.js 的 account_parm.COOKIE = "..."
  │
  ▼ (cron 触发)
node main.js start  ← 通过软链接读 env.js
```

**关键**：两个上游的 cookie 存储格式不同，胶水层做格式转换。cookie 只在胶水层流转，不经过外部服务。

---

## 8. 定时策略：类人类作息

### 8.1 设计原理

模拟一个「白天活跃、夜里睡觉」的真实用户行为节奏：

```
时间轴（北京时间）：
  0────7────8────12───13───19───22───23
  │睡眠期│起床│午休│    │晚饭│睡前│清理│
  │不执行│check│start│    │start│check│clear│
```

### 8.2 错峰设计

所有 cron 都避开整点（用 33/13/03/07 分），原因：
- 整点是 GitHub Actions schedule 的高峰期，延迟更严重
- 错峰减少排队，提高准时性

### 8.3 间隔设计

| 时段 | 间隔 | 说明 |
|------|------|------|
| 三次 start | >1小时 | 10:33→12:13（1h40m）→19:33（7h20m） |
| check 与 start | >2小时 | 08:33→10:33（2h） |
| 睡眠期 | 8小时 | 22:03→次日08:33 |

### 8.4 timeout 限制

`start` 命令用 `timeout 1200`（20分钟）限制运行时长：
- 转发间隔 45s/条
- 20分钟 ÷ 45s ≈ 26 条
- 到时间自动 SIGTERM 终止，避免短时间大量转发

### 8.5 Actions vs Docker cron

| | GitHub Actions | Docker cron |
|---|---|---|
| 时区 | UTC（需换算） | Asia/Shanghai（Dockerfile 设了 tzdata） |
| cron 格式 | `'33 2 * * *'`（UTC 02:33=北京10:33） | `33 10 * * *`（直接北京时间） |
| 延迟 | 可能延迟几分钟到几小时 | 秒级精确 |

---

## 9. 抽奖策略：三大策略

### 策略①：都转

```javascript
model: '11',      // 转发：官方+非官方都转
chatmodel: '11',  // 评论：官方+非官方都评
```

**原理**：LotteryAutoScript 的 `model` 是两位字符串：
- `model[0]` 控制官方抽奖（'1'=转，'0'=不转）
- `model[1]` 控制非官方抽奖（'1'=转，'0'=不转）
- `'11'` = 都转，最大化中奖机会

### 策略②：避免黑号

```javascript
create_dy: true,           // 开启随机动态
create_dy_type: -1,        // 混合模式（推荐视频+自定义）
create_dy_mode: [[7, 8], [1, 2]],  // 每转7-8条发1-2条随机动态
```

**原理**：纯抽奖行为（只转发抽奖动态）容易被 B 站风控识别为脚本黑号。
穿插随机动态（看推荐视频/点赞/评论/转发/三连）模拟真人行为。

**`create_dy_mode` 格式**：
- `[[转发数候选], [随机动态数候选]]`
- `[[7,8],[1,2]]` = 每转发 7 或 8 条抽奖后，发 1 或 2 条随机动态
- 每次从中随机取一个，增加行为随机性

### 策略③：控制转发量

```bash
timeout 1200 node main.js start  # 20分钟≈26条
```

**原理**：LotteryAutoScript 没有内置"每次最多转发N条"的配置项，用 `timeout` 命令限制运行时长。
20分钟 × 45s/条 ≈ 26 条，上午/中午/晚上各跑一次，每天约 78 条。

---

## 10. 飞书推送系统

### 10.1 消息格式

飞书自定义机器人支持两种消息类型：
- `text` — 纯文本（`notify-feishu.js "自定义消息"`）
- `interactive` — 卡片消息（默认，从环境变量构造）

### 10.2 卡片结构

```json
{
  "msg_type": "interactive",
  "card": {
    "config": { "wide_screen_mode": true },
    "header": {
      "title": { "tag": "plain_text", "content": "动态抽奖 — 🎯 参与抽奖 ✅" },
      "template": "green"  // green/red/grey/carmine
    },
    "elements": [
      { "tag": "div", "text": { "tag": "lark_md", "content": "..." } },
      { "tag": "action", "actions": [{ "tag": "button", "url": "..." }] }
    ]
  }
}
```

### 10.3 颜色映射

| 状态 | 颜色 | emoji |
|------|------|-------|
| success | green | ✅ |
| failure | red | ❌ |
| cancelled | grey | ⏹️ |
| 中奖 | carmine（深红） | 🎉 |

### 10.4 指标提取

每个任务模板定义了 `metrics` 数组，每个指标有多个正则候选：

```javascript
{ label: '参与转发', patterns: [/转发[^\d]*(\d+)[^\d]*条/, /已转发[^\d]*(\d+)/, /转发\s*(\d+)/] }
```

从日志中依次尝试每个正则，第一个匹配到的取捕获组值。未匹配则显示 `—`。

### 10.5 中奖检测

```javascript
const winKeywords = [
    /恭喜.*?中奖/, /中奖.*?\d+/, /🎉.*?中奖/,
    /恭喜.*?获得/, /获得.*?奖品/, /天选.*?奖励/,
];
```

中奖时：
1. 标题改为 `🎉🎉🎉 中奖通知！`
2. 颜色改为 `carmine`
3. 在卡片顶部加中奖详情（从日志提取奖品名称）
4. 中奖详情最多 5 条

---

## 11. 扩展与修改指南

### 11.1 修改抽奖时间表

**Actions 版**（`lottery.yml`）：
```yaml
schedule:
  - cron: '33 2 * * *'  # 改这里（UTC 时间 = 北京时间 - 8）
```
同时修改 `case` 语句里的 cron 匹配：
```yaml
"33 2 * * *")  CMD=start;;
```

**Docker 版**（`crontab-lottery`）：
```cron
33 10 * * * cd /app && timeout 1200 node main.js start >> ... 2>&1
```
直接改北京时间（容器时区已设为 Asia/Shanghai）。

### 11.2 修改转发量

改 `timeout` 值：
- `timeout 600` = 10分钟 ≈ 13条
- `timeout 1200` = 20分钟 ≈ 26条（当前）
- `timeout 1800` = 30分钟 ≈ 40条

同时更新 `lottery.yml` 和 `crontab-lottery`。

### 11.3 修改随机动态频率

`my_config.example.js`：
```javascript
create_dy_mode: [[7, 8], [1, 2]],
//              ↑↑↑↑↑    ↑↑↑↑
//              转发数    随机动态数
// 改为 [[3, 4], [1, 2]] = 每转3-4条就发1-2条随机动态（更频繁）
```

### 11.4 增加通知渠道

`notify-feishu.js` 目前只支持飞书。增加其他渠道：
1. 新建 `notify-xxx.js`
2. 在 workflow 的通知 step 里调用
3. 或在 `notify-feishu.js` 里加多渠道分发

### 11.5 增加任务模板

`notify-feishu.js` 的 `TASK_TEMPLATES`：
```javascript
'NewTask': {
    icon: '🆕',
    name: '新任务',
    metrics: [
        { label: '关键指标', patterns: [/正则(\d+)/] },
    ]
}
```

### 11.6 同步两个仓库

WebAction 和 Web233 共享的文件必须保持一致：
- `lottery/my_config.example.js`
- `lottery/env.example.js`
- `lottery/inject-cookie.js`
- `lottery/notify-feishu.js`
- `.github/workflows/lottery.yml`
- `.github/workflows/bilitool.yml`
- `.github/workflows/feishu-test.yml`

修改任一文件后，需同步到另一个仓库并推送。

### 11.7 排查 schedule 不触发

1. 确认 workflow 文件在默认分支（main/master）
2. 确认 Actions 已启用（仓库 Actions 页）
3. schedule 可能延迟几分钟到几小时（GitHub 限制）
4. 频繁修改 workflow 会重置 schedule 注册，需 12-24h 稳定
5. 公开仓库 60 天无活动 workflow 会被自动禁用

### 11.8 排查 cookie 过期

- B 站 cookie 有效期约 30 天
- Actions 报错 `SESSDATA` 相关 → cookie 过期
- 重新获取 cookie → 更新 GitHub Secrets（Actions 版）/ 面板重新扫码（Docker 版）

---

## 附录：文件清单

### WebAction（私有，10 个文件）

| 文件 | 行数 | 职责 |
|------|------|------|
| `.github/workflows/lottery.yml` | 124 | 动态抽奖 workflow |
| `.github/workflows/bilitool.yml` | 101 | 日常任务 workflow |
| `.github/workflows/feishu-test.yml` | 44 | 飞书推送测试 |
| `lottery/my_config.example.js` | 262 | 抽奖行为配置 |
| `lottery/env.example.js` | 121 | 账号与推送配置 |
| `lottery/inject-cookie.js` | 68 | cookie 注入脚本 |
| `lottery/notify-feishu.js` | 361 | 飞书推送脚本 |
| `README.md` | — | 项目文档 |
| `LICENSE` | — | GPL-3.0 |
| `.gitignore` | — | Git 忽略 |

### Web233（公开，25 个文件）

在 WebAction 基础上增加：

| 文件 | 行数 | 职责 |
|------|------|------|
| `docker-compose.yml` | 103 | 四服务编排 |
| `.env.example` | 18 | 环境变量模板 |
| `lottery/Dockerfile` | 43 | 抽奖容器镜像 |
| `lottery/crontab-lottery` | 38 | cron 定时 |
| `lottery/entrypoint.sh` | 27 | 容器入口 |
| `lottery/status-server.js` | 125 | Express 状态页 |
| `sync/Dockerfile` | 21 | cookie-sync 镜像 |
| `sync/sync_cookie.py` | 215 | cookie 同步脚本 |
| `sync/supervisord.conf` | 14 | 进程管理 |
| `nginx/default.conf` | 55 | nginx 配置 |
| `scripts/setup.sh` | 29 | 一键初始化 |
| `scripts/update.sh` | 19 | 一键更新 |
| `docs/UPGRADE-BLAZOR.md` | 46 | Blazor 升级指南 |
| `docs/DEVELOPMENT.md` | — | 本文档 |
