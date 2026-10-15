#!/bin/sh
# =============================================================================
# lottery 容器入口
# -----------------------------------------------------------------------------
# 职责：
#   1. 把 cookie-sync 写入的 /app/data/env.js、my_config.js 软链接到上游期望的
#      工作目录位置（上游读 ./env.js、./my_config.js）。
#   2. 后台启动 cron（类人类作息定时跑抽奖/检查）。
#   3. 前台启动 Express 状态页（端口 3000，供 nginx /lottery/ 反代）。
# =============================================================================
set -e

DATA_DIR=/app/data
LOG_DIR="$DATA_DIR/logs"
mkdir -p "$LOG_DIR"

# --- 1) 软链接配置文件（cookie-sync 持续更新 env.js 里的 cookie）---
[ -f "$DATA_DIR/env.js" ]         && ln -sf "$DATA_DIR/env.js"         /app/env.js
[ -f "$DATA_DIR/my_config.js" ]   && ln -sf "$DATA_DIR/my_config.js"   /app/my_config.js

# --- 2) 后台启动 cron（类人类作息）---
echo "[entrypoint] 启动 cron（类人类作息定时任务）..."
cron

# --- 3) 前台启动状态页 ---
echo "[entrypoint] 启动状态页 http://0.0.0.0:3000"
exec node status-server.js
