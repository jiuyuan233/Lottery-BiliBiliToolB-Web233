#!/usr/bin/env python3
# =============================================================================
# sync_cookie.py  ——  cookie 同步胶水层
# -----------------------------------------------------------------------------
# 把 BiliBiliToolPro 面板扫码得到的 cookie，自动同步给 LotteryAutoScript。
#   源：  /bili_config/BiliBiliTool.db   (SQLite，面板账号库)
#   目的：/lottery_data/env.js           (LotteryAutoScript 账号配置)
#
# 工作流程（每 SYNC_INTERVAL 秒一轮）：
#   1. 打开 SQLite，自动探测存 cookie 的表/列（不依赖固定表名，抗上游变更）
#   2. 解析每条 cookie 为  DedeUserID=..;SESSDATA=..;bili_jct=..;buvid3=..
#   3. 单账号 → 写 account_parm.COOKIE；多账号 → 开多账号模式填 multiple_account_parm
#   4. 保留 env.js 里已有的推送/AI 配置，只更新 cookie 相关字段
#
# 这样「在面板扫一次码」即可同时驱动两个服务，且两边 cookie 一起刷新。
# =============================================================================
import os, re, sqlite3, json, time, datetime, sys

DB_PATH   = "/bili_config/BiliBiliTool.db"
DATA_DIR  = "/lottery_data"
ENV_PATH  = os.path.join(DATA_DIR, "env.js")
EXAMPLE   = os.path.join(DATA_DIR, "env.example.js")
INTERVAL  = int(os.environ.get("SYNC_INTERVAL", "300"))

# 我们关心的 B 站 cookie 关键字段
KEYS = ["DedeUserID", "SESSDATA", "bili_jct", "buvid3"]

def log(msg):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {msg}", flush=True)

# ----------------------------------------------------------------------------
# 1) 从任意字符串/JSON 中提取 cookie 关键字段，拼成标准 cookie 串
# ----------------------------------------------------------------------------
def parse_cookie(raw):
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        try: raw = raw.decode("utf-8", "ignore")
        except: return None
    if not isinstance(raw, str):
        raw = str(raw)

    raw = raw.strip()
    if not raw:
        return None

    kv = {}

    # 情况 A：JSON 对象（BiliBiliToolPro 可能存结构化 cookie）
    if raw.startswith("{"):
        try:
            obj = json.loads(raw)
            # 递归扁平化找目标 key
            def walk(o):
                if isinstance(o, dict):
                    for k, v in o.items():
                        if k in KEYS and v: kv[k] = str(v)
                        elif isinstance(v, (dict, list)): walk(v)
                elif isinstance(o, list):
                    for it in o: walk(it)
            walk(obj)
        except Exception:
            pass

    # 情况 B：纯 cookie 串  k=v; k=v  或  k=v&k=v
    for k in KEYS:
        if k in kv: continue
        m = re.search(rf"{re.escape(k)}\s*[=:]\s*([^;&,\s\"'}}]+)", raw)
        if m: kv[k] = m.group(1)

    # 必须至少有 SESSDATA 才算有效
    if "SESSDATA" not in kv or not kv["SESSDATA"]:
        return None

    # 拼成标准顺序
    parts = [f"{k}={kv[k]}" for k in KEYS if k in kv and kv[k]]
    return "; ".join(parts)

# ----------------------------------------------------------------------------
# 2) 自动探测 SQLite 里存 cookie 的表/列，返回 cookie 字符串列表
# ----------------------------------------------------------------------------
def fetch_cookies(db_path):
    cookies = []
    if not os.path.exists(db_path):
        log(f"DB 不存在: {db_path}（面板尚未扫码？等待...）")
        return cookies
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        tables = [r[0] for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        log(f"DB 表: {tables}")

        for tbl in tables:
            if tbl.startswith("sqlite_") or tbl.startswith("__"):
                continue
            try:
                cols = [r[1] for r in cur.execute(f"PRAGMA table_info({tbl})").fetchall()]
            except Exception:
                continue
            # 找列名含 cookie 的列（不区分大小写）
            cookie_cols = [c for c in cols if "cookie" in c.lower()]
            # 也找可能整条存 cookie 的列（CookieStr / Content / Value）
            for c in cols:
                if c.lower() in ("cookiestr", "content", "value", "str") and c not in cookie_cols:
                    cookie_cols.append(c)
            if not cookie_cols:
                continue

            for col in cookie_cols:
                try:
                    rows = cur.execute(f"SELECT {col} FROM {tbl}").fetchall()
                except Exception:
                    continue
                for r in rows:
                    val = r[0]
                    if not val: continue
                    ck = parse_cookie(val)
                    if ck and ck not in cookies:
                        cookies.append(ck)
        con.close()
    except Exception as e:
        log(f"读取 DB 失败: {e}")
    return cookies

# ----------------------------------------------------------------------------
# 3) 把 cookie 列表回写到 env.js（保留推送等已有配置）
# ----------------------------------------------------------------------------
def ensure_env_exists():
    """若 env.js 不存在，从 env.example.js 复制一份初始模板"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(ENV_PATH):
        src = EXAMPLE if os.path.exists(EXAMPLE) else None
        if src:
            with open(src, "r", encoding="utf-8") as f:
                content = f.read()
            with open(ENV_PATH, "w", encoding="utf-8") as f:
                f.write(content)
            log(f"已从模板创建 {ENV_PATH}")
        else:
            log(f"警告: {ENV_PATH} 与模板都不存在，将创建空壳")
            with open(ENV_PATH, "w", encoding="utf-8") as f:
                f.write("module.exports = Object.freeze({ account_parm:{COOKIE:''}, multiple_account_parm:[], push_parm:{} });\n")

def update_env(cookies):
    ensure_env_exists()
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        txt = f.read()

    if len(cookies) == 1:
        # 单账号模式
        ck = cookies[0]
        txt = re.sub(r"(account_parm:\s*\{[^}]*?COOKIE:\s*)['\"][^'\"]*['\"]",
                     lambda m: m.group(1) + json.dumps(ck),
                     txt, count=1, flags=re.DOTALL)
        txt = re.sub(r"ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)",
                     "ENABLE_MULTIPLE_ACCOUNT: false", txt)
        log(f"同步单账号 cookie: {ck[:30]}...")

    elif len(cookies) > 1:
        # 多账号模式：构造 multiple_account_parm 数组
        items = []
        for i, ck in enumerate(cookies, 1):
            items.append(
                "        {\n"
                f"            COOKIE: {json.dumps(ck)},\n"
                f"            NOTE: 'account{i}',\n"
                f"            NUMBER: {i},\n"
                "            CLEAR: true,\n"
                "            WAIT: 90 * 1000,\n"
                "            ACCOUNT_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',\n"
                "            PROXY_HOST: '', PROXY_PORT: '', PROXY_USER: '', PROXY_PASS: '',\n"
                "        }"
            )
        arr_body = ",\n".join(items)
        new_block = f"    multiple_account_parm: [\n{arr_body}\n    ],"
        # 替换 multiple_account_parm 数组（贪婪匹配到第一个 ],）
        txt = re.sub(r"multiple_account_parm:\s*\[.*?\n    \],",
                     new_block, txt, count=1, flags=re.DOTALL)
        txt = re.sub(r"ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)",
                     "ENABLE_MULTIPLE_ACCOUNT: true", txt)
        # 单账号 COOKIE 也写第一个，兼容上游单账号逻辑
        txt = re.sub(r"(account_parm:\s*\{[^}]*?COOKIE:\s*)['\"][^'\"]*['\"]",
                     lambda m: m.group(1) + json.dumps(cookies[0]),
                     txt, count=1, flags=re.DOTALL)
        log(f"同步多账号 cookie: {len(cookies)} 个账号")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write(txt)

# ----------------------------------------------------------------------------
# 主循环
# ----------------------------------------------------------------------------
def main():
    log(f"cookie-sync 启动，间隔 {INTERVAL}s，DB={DB_PATH}")
    last_sig = None
    while True:
        try:
            cookies = fetch_cookies(DB_PATH)
            sig = tuple(cookies)
            if sig != last_sig:
                if cookies:
                    update_env(cookies)
                else:
                    log("未发现可用 cookie（请在面板扫码登录）")
                last_sig = sig
            else:
                log(f"cookie 未变化，当前 {len(cookies)} 个账号")
        except Exception as e:
            log(f"同步异常: {e}")
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
