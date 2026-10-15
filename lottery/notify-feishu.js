/**
 * =============================================================================
 * notify-feishu.js — 飞书自定义机器人推送脚本
 * =============================================================================
 * 
 * 用法：
 *   node notify-feishu.js                          # 从环境变量读取信息，发卡片通知
 *   node notify-feishu.js "自定义消息内容"          # 发简单文本消息
 * 
 * 环境变量：
 *   FS_WEBHOOK     — 飞书自定义机器人 webhook URL（必须，未设置则跳过）
 *   NOTIFY_TITLE   — 通知标题（默认 "B站任务通知"）
 *   NOTIFY_TASK    — 任务名称（如 "start"、"Daily,LiveLottery"）
 *   NOTIFY_STATUS  — 执行状态（"success" / "failure" / "cancelled"）
 *   NOTIFY_MESSAGE — 附加消息内容（可选）
 *   GITHUB_REPOSITORY — 仓库名（Actions 自动注入）
 *   GITHUB_RUN_ID     — 运行 ID（Actions 自动注入）
 * 
 * 飞书自定义机器人文档：https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 * =============================================================================
 */

const https = require('https');

// --- 读取配置 ---
const webhook = process.env.FS_WEBHOOK;
const title   = process.env.NOTIFY_TITLE   || 'B站任务通知';
const task    = process.env.NOTIFY_TASK    || '';
const status  = process.env.NOTIFY_STATUS  || '';
const message = process.argv[2] || process.env.NOTIFY_MESSAGE || '';
const repo    = process.env.GITHUB_REPOSITORY || '';
const runId   = process.env.GITHUB_RUN_ID     || '';

// 未配置 webhook 则跳过
if (!webhook) {
    console.log('[feishu] 未配置 FS_WEBHOOK，跳过推送');
    process.exit(0);
}

// --- 状态映射 ---
const statusMap = {
    success:   { emoji: '✅', label: '成功', color: 'green'  },
    failure:   { emoji: '❌', label: '失败', color: 'red'    },
    cancelled: { emoji: '⏹️', label: '已取消', color: 'grey'  },
};
const st = statusMap[status] || { emoji: '📋', label: status || '完成', color: 'blue' };

// --- 当前时间（北京时间）---
const now = new Date();
const bjTime = new Date(now.getTime() + 8 * 3600 * 1000);
const timeStr = bjTime.toISOString().replace('T', ' ').substring(0, 19) + ' (UTC+8)';

// --- 构造消息 ---
let payload;

if (process.argv[2]) {
    // 简单文本消息（命令行传参）
    payload = {
        msg_type: 'text',
        content: { text: process.argv[2] }
    };
} else {
    // 卡片消息（带标题、状态、详情）
    const elements = [];
    
    // 状态行
    let content = `${st.emoji} **状态：${st.label}**`;
    
    // 任务行
    if (task) {
        content += `\n🎯 **任务：** ${task}`;
    }
    
    // 时间行
    content += `\n🕐 **时间：** ${timeStr}`;
    
    // 仓库行
    if (repo) {
        content += `\n📦 **仓库：** ${repo}`;
    }
    
    // 附加消息
    if (message) {
        content += `\n\n📝 **消息：**\n${message}`;
    }
    
    elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: content }
    });
    
    // Actions 链接
    if (repo && runId) {
        elements.push({
            tag: 'action',
            actions: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '查看运行日志' },
                url: `https://github.com/${repo}/actions/runs/${runId}`,
                type: 'primary'
            }]
        });
    }
    
    payload = {
        msg_type: 'interactive',
        card: {
            config: { wide_screen_mode: true },
            header: {
                title: { tag: 'plain_text', content: `${title} ${st.emoji}` },
                template: st.color
            },
            elements: elements
        }
    };
}

// --- 发送请求 ---
const data = JSON.stringify(payload);
const parsed = new URL(webhook);

const options = {
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const result = JSON.parse(body);
                if (result.code === 0 || result.StatusCode === 0) {
                    console.log('[feishu] ✅ 推送成功');
                } else {
                    console.log('[feishu] ⚠️ 推送返回非零:', body);
                }
            } catch {
                console.log('[feishu] ⚠️ 推送返回:', body);
            }
        } else {
            console.log(`[feishu] ❌ HTTP ${res.statusCode}: ${body}`);
        }
    });
});

req.on('error', (e) => {
    console.log('[feishu] ❌ 请求错误:', e.message);
});

req.write(data);
req.end();
