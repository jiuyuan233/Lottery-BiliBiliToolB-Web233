# 🤖 如何让 AI 更新本仓库

三种方式按推荐顺序排列。共同前提：操作者对仓库有写权限，并遵守 [HANDOFF.md](./HANDOFF.md) §5 的铁律（只做明确要求的改动、fast-forward、共享文件两仓库同步）。

## 方式 A：AI 在本地/沙箱里用 git（最常规）

给 AI 一个**最小权限** token（Fine-grained：仅这两个仓库，`Contents: Read and write` + `Workflows: Read and write`）：

```bash
git clone https://<TOKEN>@github.com/jiuyuan233/Lottery-BiliBiliToolB-WebAction.git
cd Lottery-BiliBiliToolB-WebAction
git log --oneline -3        # 先核对远端没被并发改坏
# ... 修改 ...
git add -A && git commit -m "中文提交说明" && git push
```

注意：改 `.github/workflows/*.yml` 需要 token 有 **workflow** 权限，否则 push 会被拒。

## 方式 B：无本地环境时用 GitHub API（已实战验证）

多文件一次提交用 **Git Data API** 四步（单文件也可以用 Contents API 的 PUT）：

```bash
T="Authorization: token <TOKEN>"
R="https://api.github.com/repos/jiuyuan233/<REPO>"

# 0. 记下当前 main 的 commit sha 和它指向的 tree sha
BASE=$(curl -s -H "$T" "$R/git/ref/heads/main" | grep -o '"sha": *"[a-f0-9]*"' | head -1)
BTREE=$(curl -s -H "$T" "$R/git/commits/<BASE>" | grep -A3 '"tree"' | grep -o '[a-f0-9]\{40\}' | head -1)

# 1. 建 blob（内容 base64）
B1=$(curl -s -X POST -H "$T" -H "Content-Type: application/json" \
  -d '{"content":"<base64>","encoding":"base64"}' "$R/git/blobs" | grep -o '[a-f0-9]\{40\}' | head -1)

# 2. 建 tree（base_tree 用 tree sha；列出所有要改/新增的路径）
NTREE=$(curl -s -X POST -H "$T" -H "Content-Type: application/json" \
  -d '{"base_tree":"<BTREE>","tree":[{"path":".github/workflows/lottery.yml","mode":"100644","type":"blob","sha":"<B1>"}]}' \
  "$R/git/trees" | grep -o '"sha": *"[a-f0-9]*"' | head -1)

# 3. 建 commit（parent = 当前 main sha）
NCOMMIT=$(curl -s -X POST -H "$T" -H "Content-Type: application/json" \
  --data-binary @commit-body.json "$R/git/commits" | grep -o '"sha": *"[a-f0-9]*"' | head -1)
# commit-body.json = {"message":"...","tree":"<NTREE>","parents":["<BASE>"]}

# 4. 更新 ref（force:false = 只接受 fast-forward，防覆盖他人提交）
curl -s -X PATCH -H "$T" -H "Content-Type: application/json" \
  -d '{"sha":"<NCOMMIT>","force":false}' "$R/git/refs/heads/main"
```

**前人踩过的坑（务必记住）**：
- **中文 commit message 不能内联在 `curl -d '...'` 里**——Windows 命令行会转 GBK 导致 `Problems parsing JSON`。写入 UTF-8 文件用 `--data-binary @file`
- **blob 是仓库级的**：同一内容在两个仓库要各 POST 一次（sha 相同但不通用，直接复用另一仓库的 sha 会报 `not a valid blob`）
- `base_tree` 要用 **tree sha**，不是 commit sha（commit JSON 里第一个 sha 是它自己）
- `force:false` 保证 fast-forward：如果别人在你操作期间提交了，这步会失败而不是覆盖——这是保护，重读远端再重来
- 行尾保持 LF、UTF-8 无 BOM（workflow 和文档都是）

## 方式 C：让 GitHub Actions 里的 AI 更新仓库

### C1. GitHub Copilot coding agent（零配置，需 Copilot 订阅）

1. 在仓库建一个 issue，写清楚要改什么（越具体越好，可引用本目录其他文档）
2. Issue 右侧 Assignees → 分配给 **Copilot**
3. Copilot 自动开草稿 PR → 人审查后合并

### C2. claude-code-action（需 `ANTHROPIC_API_KEY` Secret）

在 issue / PR 评论里 `@claude <任务描述>` 即可。参考 workflow（放进 `.github/workflows/ai-fix.yml`）：

```yaml
name: AI 协作
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
  pull-requests: write
  issues: write
jobs:
  ai:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### C3. 通用原理

任何"AI in Actions"本质 = 三件套：
1. runner 上有**写权限的 token**（用默认 `GITHUB_TOKEN` 时需在 Settings → Actions → General → Workflow permissions 选 **Read and write permissions**；或用 PAT Secret）
2. AI 的 **API key**（存 Secrets，绝不写进代码）
3. **明确的任务描述**（引用本目录文档，让 AI 知道铁律和两仓库同步约束）

改完必须走 PR 或 fast-forward push，**禁止 force push**；`.github/workflows/` 的改动建议先手动 Run 一次验证再合并。

## 改完之后

按 [HANDOFF.md](./HANDOFF.md) §6 的验证矩阵走一遍：YAML 语法（dispatch 一次）、cron 与 case 一致、开关语义、静默时段、两仓库 blob sha 一致、文档与实际一致。

## 附：更新 Actions Secrets 的实战方法（2026-11-16 验证）

Secret 值（如 `BILI_COOKIE`）不能明文 PUT，必须用仓库公钥做 libsodium sealed box 加密。
无本地 git 环境时，纯 Python 即可完成（需 `pip install pynacl`）：

1. `GET /repos/<owner>/<repo>/actions/secrets/public-key` 拿 `key_id` + `key`（base64）
2. `SealedBox(PublicKey(b64decode(key))).encrypt(secret明文))` → base64 得 `encrypted_value`
3. `PUT /repos/<owner>/<repo>/actions/secrets/BILI_COOKIE`，body `{"encrypted_value": ..., "key_id": ...}`；**201=新建，204=更新**
4. `GET .../actions/secrets` 查 `updated_at` 确认

实测注意：
- 更新 `BILI_COOKIE` 前先用 bilibili nav 接口验证 cookie 有效（`isLogin=true`），**失效的 cookie 不要写入**（11-16 用户曾贴来一份已吊销的，直接写入只会让任务继续失败）；
- 更新后 dispatch 一次 `acount`+`force=true` 实测，日志看「成功登录 UID:xxx」；
- 临时存 cookie 的本地文件用完立即删除。

完整教程（面向人类用户）见 [COOKIE-UPDATE.md](./COOKIE-UPDATE.md)。
