#!/bin/bash
# =============================================================================
# 一键初始化  ——  首次部署执行
# =============================================================================
set -e
cd "$(dirname "$0")/.."

echo "=== 1) 检查 .env ==="
[ -f .env ] || { cp .env.example .env; echo "已从模板创建 .env，请按需修改后重新运行"; }

echo "=== 2) 准备 lottery 配置（类人类作息模板）==="
mkdir -p lottery/data/logs
[ -f lottery/data/env.js ]       || cp lottery/env.example.js       lottery/data/env.js
[ -f lottery/data/my_config.js ] || cp lottery/my_config.example.js lottery/data/my_config.js

echo "=== 3) 准备 bili_tool_web 数据目录 ==="
mkdir -p bili_tool_web/config bili_tool_web/Logs

echo "=== 4) 构建并启动 ==="
docker compose build lottery cookie-sync
docker compose up -d

echo ""
echo "✅ 启动完成！"
echo "   面板地址: http://<服务器IP>:$(grep -oP 'WEB_PORT=\K\d+' .env 2>/dev/null || echo 22330)"
echo "   抽奖状态: http://<服务器IP>:$(grep -oP 'WEB_PORT=\K\d+' .env 2>/dev/null || echo 22330)/lottery/"
echo ""
echo "   下一步：打开面板 → 用 admin / BiliTool@2233 登录 → 改密 → 扫码登录 B 站账号"
echo "   扫码后 cookie-sync 会自动把 cookie 同步给抽奖服务，无需再扫第二次。"
