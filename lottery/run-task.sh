#!/bin/bash
# =============================================================================
# run-task.sh  ——  Docker 版任务包装脚本（执行 + 日志 + 飞书推送）
# -----------------------------------------------------------------------------
# 用法：./run-task.sh <command> [timeout_seconds]
#   ./run-task.sh check           # 执行 check，不限时
#   ./run-task.sh start 1200      # 执行 start，限时 1200s（20分钟≈26条）
#
# 功能：
#   1. 执行 node main.js <command>（可选 timeout 限时）
#   2. 输出写入日志文件 /app/data/logs/lottery.log
#   3. 自动调用 notify-feishu.js 推送飞书卡片（从 env.js 读 FS_BOT_WEBHOOK）
#
# 与 GitHub Actions 版保持一致：每次执行后都推送飞书通知。
# =============================================================================
set -e

CMD="$1"
TIMEOUT="${2:-0}"
LOG="/app/data/logs/lottery.log"

cd /app

# 确保日志目录存在
mkdir -p "$(dirname "$LOG")"

# 时间戳
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "" >> "$LOG"
echo "[$TIMESTAMP] === $CMD ===" >> "$LOG"

# --- 执行命令 ---
if [ "$TIMEOUT" -gt 0 ] 2>/dev/null; then
    OUTPUT=$(timeout "$TIMEOUT" node main.js "$CMD" 2>&1) || true
    EXIT_CODE=$?
    # timeout 返回 124 = 正常超时停止（不是失败）
    if [ "$EXIT_CODE" -eq 124 ]; then
        echo "[run-task] timeout ${TIMEOUT}s 到达，正常停止" >> "$LOG"
    fi
else
    OUTPUT=$(node main.js "$CMD" 2>&1) || true
    EXIT_CODE=$?
fi

# 写日志
echo "$OUTPUT" >> "$LOG"

# --- 飞书推送 ---
# 设置环境变量，调用 notify-feishu.js
# notify-feishu.js 会自动从 env.js 读取 FS_BOT_WEBHOOK
export NOTIFY_TITLE="动态抽奖"
export NOTIFY_TASK="$CMD"

# 判断状态：0 或 124（timeout）= 成功，其他 = 失败
if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 124 ]; then
    export NOTIFY_STATUS="success"
else
    export NOTIFY_STATUS="failure"
fi

# 传日志输出（尾部 200 行，与 Actions 版一致）
export NOTIFY_OUTPUT=$(echo "$OUTPUT" | tail -200)

# 调用飞书推送（失败不影响主流程）
node /app/notify-feishu.js >/dev/null 2>&1 || true

echo "[$TIMESTAMP] === $CMD 完成 (exit=$EXIT_CODE) ===" >> "$LOG"
