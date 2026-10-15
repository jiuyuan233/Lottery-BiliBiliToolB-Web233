/**
 * =============================================================================
 * notify-feishu.js — 飞书自定义机器人推送脚本（任务模板版）
 * =============================================================================
 * 
 * 每个任务有专属汇报模板，自动从日志中提取关键指标，生成飞书卡片消息。
 * 
 * 用法：
 *   node notify-feishu.js                          # 卡片通知（从环境变量读取信息）
 *   node notify-feishu.js "自定义消息"              # 简单文本消息
 * 
 * 环境变量：
 *   FS_WEBHOOK     — 飞书 webhook URL（必须，未设置则跳过）
 *   NOTIFY_TITLE   — 通知大类（"动态抽奖" / "B站日常任务"）
 *   NOTIFY_TASK    — 任务名（如 "start"、"Daily,LiveLottery"）
 *   NOTIFY_STATUS  — 执行状态（"success" / "failure"）
 *   NOTIFY_OUTPUT  — 任务输出日志（用于解析关键指标）
 *   GITHUB_REPOSITORY / GITHUB_RUN_ID — Actions 自动注入
 * =============================================================================
 */

const https = require('https');

// --- 读取配置 ---
const webhook = process.env.FS_WEBHOOK;
const title   = process.env.NOTIFY_TITLE   || 'B站任务通知';
const task    = process.env.NOTIFY_TASK    || '';
const status  = process.env.NOTIFY_STATUS  || '';
const output  = process.env.NOTIFY_OUTPUT  || '';
const repo    = process.env.GITHUB_REPOSITORY || '';
const runId   = process.env.GITHUB_RUN_ID     || '';

if (!webhook) {
    console.log('[feishu] 未配置 FS_WEBHOOK，跳过推送');
    process.exit(0);
}

// =============================================================================
// 任务模板定义 — 每个任务的图标、标题、关键指标及正则提取规则
// =============================================================================
const TASK_TEMPLATES = {
    // --- 动态抽奖 ---
    'start': {
        icon: '🎯',
        name: '参与抽奖',
        metrics: [
            { label: '检索动态', patterns: [/检索[^\d]*(\d+)[^\d]*条/, /搜索[^\d]*(\d+)/, /动态[^\d]*(\d+)/] },
            { label: '参与转发', patterns: [/转发[^\d]*(\d+)[^\d]*条/, /已转发[^\d]*(\d+)/, /转发\s*(\d+)/] },
            { label: '自动评论', patterns: [/评论[^\d]*(\d+)[^\d]*条/, /已评论[^\d]*(\d+)/, /评论\s*(\d+)/] },
            { label: '点赞',     patterns: [/点赞[^\d]*(\d+)/, /已点赞[^\d]*(\d+)/] },
            { label: '跳过',     patterns: [/跳过[^\d]*(\d+)/, /忽略[^\d]*(\d+)/] },
        ]
    },
    'check': {
        icon: '🎁',
        name: '检查中奖',
        metrics: [
            { label: '检查抽奖', patterns: [/检查[^\d]*(\d+)[^\d]*个/, /检查[^\d]*(\d+)/, /检测[^\d]*(\d+)/] },
            { label: '🎉 中奖',  patterns: [/中奖[^\d]*(\d+)[^\d]*个/, /中奖[^\d]*(\d+)/, /恭喜[^\d]*(\d+)/] },
            { label: '未中奖',   patterns: [/未中奖[^\d]*(\d+)/, /未中[^\d]*(\d+)/] },
        ]
    },
    'clear': {
        icon: '🧹',
        name: '清理动态',
        metrics: [
            { label: '清理转发', patterns: [/清理[^\d]*(\d+)[^\d]*条/, /删除[^\d]*(\d+)/, /清除[^\d]*(\d+)/] },
            { label: '取消关注', patterns: [/取消[^\d]*(\d+)[^\d]*个/, /取关[^\d]*(\d+)/, /取消关注[^\d]*(\d+)/] },
        ]
    },
    'login': {
        icon: '🔑',
        name: '登录',
        metrics: []
    },
    'acount': {
        icon: '👤',
        name: '账号信息',
        metrics: []
    },

    // --- B站日常任务 ---
    'Daily': {
        icon: '📋',
        name: '每日任务',
        metrics: [
            { label: '获得经验', patterns: [/经验[^\d]*\+(\d+)/, /获得[^\d]*(\d+)[^\d]*经验/, /经验\s*\+(\d+)/] },
            { label: '投币',     patterns: [/投币[^\d]*(\d+)/, /硬币[^\d]*\+(\d+)/] },
            { label: '观看视频', patterns: [/观看[^\d]*(\d+)/, /Watch[^\d]*(\d+)/i] },
        ]
    },
    'VipBigPoint': {
        icon: '💎',
        name: 'VIP大积分',
        metrics: [
            { label: '获得积分', patterns: [/积分[^\d]*\+(\d+)/, /获得[^\d]*(\d+)[^\d]*积分/, /积分\s*\+(\d+)/] },
            { label: '当前积分', patterns: [/当前积分[^\d]*(\d+)/, /总积分[^\d]*(\d+)/] },
        ]
    },
    'LiveLottery': {
        icon: '🎰',
        name: '直播天选抽奖',
        metrics: [
            { label: '参与天选', patterns: [/参与[^\d]*(\d+)/, /天选[^\d]*(\d+)/, /抽奖[^\d]*(\d+)/] },
            { label: '🎉 中奖',  patterns: [/中奖[^\d]*(\d+)/, /天选奖励[^\d]*(\d+)/] },
            { label: '跳过',     patterns: [/跳过[^\d]*(\d+)/, /忽略[^\d]*(\d+)/] },
        ]
    },
    'LiveFansMedal': {
        icon: '🎖️',
        name: '粉丝勋章',
        metrics: [
            { label: '亲密度',   patterns: [/亲密度[^\d]*\+(\d+)/, /亲密[^\d]*\+(\d+)/, /亲密度[^\d]*(\d+)/] },
            { label: '勋章升级', patterns: [/升级[^\d]*(\d+)/, /升级\s*(\d+)/] },
        ]
    },
    'Manga': {
        icon: '📖',
        name: '漫画签到',
        metrics: [
            { label: '签到经验', patterns: [/签到[^\d]*(\d+)/, /经验[^\d]*\+(\d+)/] },
            { label: '领券',     patterns: [/领券[^\d]*(\d+)/, /券[^\d]*(\d+)/] },
        ]
    },
    'Silver2Coin': {
        icon: '🪙',
        name: '银换硬币',
        metrics: [
            { label: '获得硬币', patterns: [/硬币[^\d]*\+(\d+)/, /获得[^\d]*(\d+)[^\d]*硬币/, /硬币\s*\+(\d+)/] },
            { label: '消耗银瓜子', patterns: [/银瓜子[^\d]*(\d+)/, /消耗[^\d]*(\d+)/] },
        ]
    },
    'VipPrivilege': {
        icon: '👑',
        name: 'VIP权益领取',
        metrics: [
            { label: 'B币礼包', patterns: [/B币[^\d]*(\d+)/, /b币[^\d]*(\d+)/i, /B币\s*\+(\d+)/] },
            { label: '权益领取', patterns: [/权益[^\d]*(\d+)/, /领取[^\d]*(\d+)/] },
        ]
    },
};

// =============================================================================
// 从日志中提取指标
// =============================================================================
function extractMetric(patterns, log) {
    for (const p of patterns) {
        const match = log.match(p);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// =============================================================================
// 状态映射
// =============================================================================
const STATUS_MAP = {
    success:   { emoji: '✅', label: '成功', color: 'green'  },
    failure:   { emoji: '❌', label: '失败', color: 'red'    },
    cancelled: { emoji: '⏹️', label: '已取消', color: 'grey'  },
};
const st = STATUS_MAP[status] || { emoji: '📋', label: status || '完成', color: 'blue' };

// 北京时间
const now = new Date();
const bjTime = new Date(now.getTime() + 8 * 3600 * 1000);
const timeStr = bjTime.toISOString().replace('T', ' ').substring(0, 19) + ' (UTC+8)';

// =============================================================================
// 构造消息
// =============================================================================
let payload;

if (process.argv[2]) {
    // 简单文本消息
    payload = { msg_type: 'text', content: { text: process.argv[2] } };
} else {
    // --- 卡片消息 ---
    const subTasks = task.split(',').map(t => t.trim()).filter(Boolean);
    const elements = [];

    // 状态行
    let headerText = title;
    if (subTasks.length === 1) {
        const tmpl = TASK_TEMPLATES[subTasks[0]];
        if (tmpl) headerText = `${title} — ${tmpl.icon} ${tmpl.name}`;
    } else {
        headerText = `${title}（${subTasks.length} 个任务）`;
    }

    // 内容
    let content = `${st.emoji} **状态：${st.label}**`;
    content += `\n🕐 **时间：** ${timeStr}`;
    if (repo) content += `\n📦 **仓库：** ${repo}`;

    // 每个子任务的汇报
    for (const subTask of subTasks) {
        const tmpl = TASK_TEMPLATES[subTask];
        if (tmpl) {
            content += `\n\n── **${tmpl.icon} ${tmpl.name}** ──`;

            if (tmpl.metrics.length > 0) {
                const metricLines = [];
                for (const m of tmpl.metrics) {
                    const val = extractMetric(m.patterns, output);
                    if (val) {
                        metricLines.push(`  ${m.label}：**${val}**`);
                    } else {
                        metricLines.push(`  ${m.label}：—`);
                    }
                }
                content += '\n' + metricLines.join('\n');
            } else {
                content += '\n  （详见日志）';
            }
        } else {
            content += `\n\n── **${subTask}** ──`;
            content += '\n  （详见日志）';
        }
    }

    // 日志摘要（最后 5 行）
    if (output) {
        const lines = output.split('\n').filter(l => l.trim());
        const lastLines = lines.slice(-5);
        if (lastLines.length > 0) {
            content += '\n\n📝 **日志摘要：**';
            content += '\n```\n' + lastLines.join('\n') + '\n```';
        }
    }

    elements.push({ tag: 'div', text: { tag: 'lark_md', content: content } });

    // Actions 日志按钮
    if (repo && runId) {
        elements.push({
            tag: 'action',
            actions: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '📋 查看完整运行日志' },
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
                title: { tag: 'plain_text', content: `${headerText} ${st.emoji}` },
                template: st.color
            },
            elements: elements
        }
    };
}

// =============================================================================
// 发送请求
// =============================================================================
const data = JSON.stringify(payload);
const parsed = new URL(webhook);

const req = https.request({
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const result = JSON.parse(body);
                if (result.code === 0 || result.StatusCode === 0) {
                    console.log('[feishu] ✅ 推送成功');
                } else {
                    console.log('[feishu] ⚠️ 推送返回:', body);
                }
            } catch {
                console.log('[feishu] ⚠️ 推送返回:', body);
            }
        } else {
            console.log(`[feishu] ❌ HTTP ${res.statusCode}: ${body}`);
        }
    });
});

req.on('error', (e) => console.log('[feishu] ❌ 请求错误:', e.message));
req.write(data);
req.end();
