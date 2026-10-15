# =============================================================================
# cookie-sync 胶水层镜像
# -----------------------------------------------------------------------------
# 职责：定时从 BiliBiliToolPro 的 SQLite 账号库导出 cookie，写入 lottery 的 env.js
# 这样「在面板扫一次码」即可同时驱动两个服务，且两边 cookie 一起刷新。
# =============================================================================
FROM python:3.12-slim

WORKDIR /app

# sqlite3 命令行工具（python 自带 sqlite3 模块，但保留命令行备查）
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY sync_cookie.py ./sync_cookie.py
COPY supervisord.conf /etc/supervisor/conf.d/sync.conf

# 安装 supervisor 管理定时循环
RUN pip install --no-cache-dir supervisor

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
