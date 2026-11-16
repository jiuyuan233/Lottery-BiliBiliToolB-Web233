# 🍪 Cookie 更新指南（Actions 版必读）

> B 站 cookie **约 30 天过期一次**，过期后所有 Actions 任务会失败（红色飞书卡片 + Actions 邮件）。
> 本文讲清楚：**怎么判断过期 → 怎么取一份有效的新 cookie → 三种更新方式 → 更新后如何验证**。
> 照着做，全程约 3 分钟。
>
> Docker Compose 版（Web233）**不需要本文**：面板扫码后 cookie 自动刷新、自动同步，没有 30 天问题。

---

## 1. 怎么判断 cookie 过期了

任一出现即为过期：

| 现象 | 在哪看 |
|---|---|
| 飞书推送红色卡片，提示登录失效 / 未登录 | 飞书群 |
| Actions 运行日志出现 `[帐号1 Cookie有效性检测] [账号未登录]` 或 `SESSDATA` 相关报错 | 仓库 Actions 页 → 点开失败运行 → 「执行 start」步骤 |
| GitHub 给你发 workflow 失败邮件 | 邮箱 |

> 💡 被防重复锁跳过的运行（显示 skipped 步骤）**不是**过期，那是正常的防重复机制。

## 2. 取一份有效的新 cookie（关键步骤）

### 正确姿势

1. 电脑浏览器打开 [bilibili.com](https://www.bilibili.com)，**确认右上角头像处是已登录状态**（能看到你的昵称，而不是「登录」按钮）
2. 按 `F12` 打开开发者工具 → 切到 **Network（网络）** 标签
3. **刷新页面**（F5），左侧会出现一堆请求
4. 点击**任意一个** `api.bilibili.com` 或 `www.bilibili.com` 的请求
5. 右侧找 **Request Headers（请求标头）** → 拉到底，找到 `Cookie:` 那一行
6. **右键 → Copy value（复制值）**，得到一整串以 `buvid3=...` 开头、分号分隔的长文本
7. 检查这串里**必须包含**以下三个字段（缺一不可）：
   - `SESSDATA=xxx`（登录凭证，最关键）
   - `bili_jct=xxx`（CSRF token，评论/转发等写操作需要）
   - `DedeUserID=123456`（你的 UID 数字）

### 三个最常见的坑（务必避开）

| 坑 | 后果 |
|---|---|
| ❌ **先退出登录、后复制 cookie**：退出登录瞬间旧 SESSDATA 就被服务端吊销 | cookie 字段看起来齐全，但服务端已判定「未登录」 |
| ❌ 从「Application → Cookies」面板逐条拼 | 容易漏字段、漏分号，且 httpOnly 字段复制不全 |
| ❌ 复制自很久没用的浏览器窗口/隐身窗口 | 会话早已过期 |

> ⚠️ **重要**：cookie 粘贴给任何人/任何工具前，先自行验证有效性（方法见第 4 节的 30 秒验证）。**判定失效就重取一份，别硬塞**——塞进去也是白塞，任务照样失败。

## 3. 更新到 GitHub Secrets（三种方式任选）

Secret 名称固定为 `BILI_COOKIE`（多账号再加 `BILI_COOKIE_2` / `BILI_COOKIE_3`）。

### 方式一：网页手动粘贴（推荐，最简单）

1. 打开私有仓库 → **Settings → Secrets and variables → Actions**
2. 找到 `BILI_COOKIE` → 点铅笔图标 **Update secret**
   （没有的话点 **New repository secret** 新建）
3. Name 填 `BILI_COOKIE`，Secret 框粘贴第 2 节复制的完整 cookie 串 → **Update secret**
4. 完成后按第 4 节验证

> 注意：Secret 更新后**旧值无法查看**（GitHub 设计如此），只显示「上次更新时间」——这是正常的。

### 方式二：命令行 / API（适合脚本化）

需要 Python 3 + PyNaCl（`pip install pynacl`）和一个有 repo 权限的 PAT：

```python
# update_secret.py — 加密写入 BILI_COOKIE（摘要版，完整可运行版见下）
import json, base64, urllib.request
from nacl.public import PublicKey, SealedBox

TOKEN = "ghp_xxx"                    # GitHub PAT
REPO  = "jiuyuan233/Lottery-BiliBiliToolB-WebAction"
COOKIE = open("cookie.txt").read().strip()

hdr = {"Authorization": "Bearer " + TOKEN,
       "Accept": "application/vnd.github+json", "User-Agent": "cookie-updater"}

def api(method, url, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read() or b"{}")

# 1. 取仓库公钥
_, key = api("GET", f"https://api.github.com/repos/{REPO}/actions/secrets/public-key")
# 2. 用公钥密封 cookie（GitHub 要求 libsodium sealed box 算法）
enc = base64.b64encode(SealedBox(PublicKey(base64.b64decode(key["key"])))
                       .encrypt(COOKIE.encode())).decode()
# 3. 写入 Secret（201=新建成功，204=更新成功）
st, _ = api("PUT", f"https://api.github.com/repos/{REPO}/actions/secrets/BILI_COOKIE",
            {"encrypted_value": enc, "key_id": key["key_id"]})
print("PUT BILI_COOKIE ->", st)
```

### 方式三：让 AI 代更新（本项目维护模式）

直接把新 cookie 串发给维护本仓库的 AI（附上 PAT），它会自动完成：
验证 isLogin → 加密写入 → 触发 `acount` 实测 → 回报日志里的「成功登录 UID:xxx」。
AI 侧的标准流程与踩坑记录见 [HANDOFF.md](./HANDOFF.md)。

## 4. 更新后验证（30 秒确认 + 3 分钟实测）

### 第一步：本地快速验证 cookie 本身有效（30 秒）

浏览器或任何工具访问（**别用带 cookie 的请求以外的方式泄露**）：

```
https://api.bilibili.com/x/web-interface/nav
```

请求头带上 `Cookie: <你的cookie串>`，返回 JSON 里看这两个字段：

- `"code": 0` 且 `"isLogin": true` → cookie 有效 ✓
- `"code": -101` 或 `"isLogin": false` → **已失效，回第 2 节重取**

### 第二步：实测 Actions 全链路（3 分钟）

1. 仓库 **Actions → 动态抽奖 → Run workflow**
   - `cmd` 选 **`acount`**（只查账号信息，无任何写操作，安全）
   - `force` 勾选（越过开关与防重复锁，测试专用）
   - 运行
2. 等待完成（约 1~3 分钟），展开「执行 acount」步骤日志，看到这行即成功：

   ```
   [帐号1 Cookie有效性检测] [成功登录 UID:411883458]
   ```

3. 之后等下一个定时时段（见 [ACTIONS-SCHEDULE.md](./ACTIONS-SCHEDULE.md) 时段表）正常跑即可。

## 5. 常见问题

**Q：更新后飞书还收到红色失败卡片？**
A：多半是 cookie 在「复制之后、更新之前」又被吊销（比如你在浏览器里点了退出登录），或粘贴时被截断。按第 4 节第一步重新验证。

**Q：`acount` 显示成功，但 `start` 仍报错？**
A：检查 cookie 里是否有 `bili_jct`（写操作需要）；个别接口风控严，等下一个时段再观察一次。

**Q：多账号怎么更新？**
A：每个账号一份完整 cookie，分别存 `BILI_COOKIE`、`BILI_COOKIE_2`、`BILI_COOKIE_3`。删除某账号就把对应 Secret 删掉，其余不动。

**Q：为什么公开仓库（Web233）不配 cookie？**
A：公开仓库的 Secrets 对所有有读权限的人可见性风险高，且它是模板仓库，设计上就不跑真实任务（`ACTIONS_ENABLED=false`）。**永远不要给公开仓库配 cookie。**

**Q：cookie 该存多久一换？**
A：不主动换也行——B 站会话有效就一直是它。等失败通知出现再按本文更新即可。日常无需惦记。

---

相关文档：[ACTIONS-SWITCH.md](./ACTIONS-SWITCH.md)（总开关）｜ [ACTIONS-SCHEDULE.md](./ACTIONS-SCHEDULE.md)（定时时段）｜ [HANDOFF.md](./HANDOFF.md)（维护者交接）
