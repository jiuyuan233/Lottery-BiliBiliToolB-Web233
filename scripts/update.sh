#!/bin/bash
# =============================================================================
# 一键更新  ——  保留两个上游的更新渠道
#   * bili_tool_web: 拉官方镜像 (docker compose pull)
#   * lottery:       重新 build (Dockerfile 里 git clone 上游最新)
# =============================================================================
set -e
cd "$(dirname "$0")/.."

echo "=== 拉取 BiliBiliToolPro 官方镜像 ==="
docker compose pull bili_tool_web nginx

echo "=== 重新构建 lottery（克隆 LotteryAutoScript 最新源码）==="
docker compose build --no-cache lottery

echo "=== 重启 ==="
docker compose up -d

echo "✅ 更新完成。日志: docker compose logs -f"
