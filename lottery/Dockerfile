# =============================================================================
# LotteryAutoScript 容器镜像
# 上游：https://github.com/shanmiteko/LotteryAutoScript  (Node.js, GPL-3.0)
# -----------------------------------------------------------------------------
# 构建策略：在镜像构建阶段 git clone 上游源码并 npm install。
#   * 保留更新渠道：重新 `docker compose build lottery` 即拉取上游最新代码。
#   * 不侵入上游源码：状态页/status-server.js 是外挂的胶水层，不改动上游任何文件。
# 运行时：cron 按类人类作息定时跑 start/check，Express 状态页常驻 3000 端口。
# =============================================================================
FROM node:18-slim

WORKDIR /app

# 安装构建期与运行期系统依赖：git(克隆上游) cron(定时) ca-certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends git cron ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# 克隆上游 LotteryAutoScript 源码并安装依赖
# --depth 1 只拉最新提交，减小体积
RUN git clone --depth 1 https://github.com/shanmiteko/LotteryAutoScript.git . \
    && npm install --omit=dev

# 外挂胶水层：极简 Express 状态页（运行日志 + 手动触发 + cookie 状态）
COPY status-server.js ./status-server.js
RUN npm install express --no-save

# 类人类作息定时任务（早中晚活跃时段，避开 0-7 点睡眠期）
COPY crontab-lottery /etc/cron.d/lottery
RUN chmod 0644 /etc/cron.d/lottery \
    && crontab /etc/cron.d/lottery

# 入口脚本：软链接配置 + 启动 cron + 前台跑状态页
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

# tini 作为 1 号进程，正确回收子进程信号
ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
