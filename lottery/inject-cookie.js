/* =============================================================================
 * inject-cookie.js  ——  把 GitHub Secrets 里的 cookie 注入 LotteryAutoScript 的 env.js
 * -----------------------------------------------------------------------------
 * 运行环境：GitHub Actions 的 ubuntu runner，node 18
 * 输入：环境变量 BILI_COOKIE / BILI_COOKIE_2 / BILI_COOKIE_3 ...
 * 模板：lottery/env.example.js（类人类作息配置）
 * 输出：lottery-src/env.js（写入到克隆下来的上游源码目录，供 node main.js 读取）
 *
 * 单账号 → 写 account_parm.COOKIE
 * 多账号 → 开 ENABLE_MULTIPLE_ACCOUNT，填 multiple_account_parm 数组
 * ========================================================================== */
const fs = require('fs');

const TEMPLATE = 'lottery/env.example.js';
const OUTPUT   = 'lottery-src/env.js';

// 收集所有 BILI_COOKIE / BILI_COOKIE_2 / ...
const cookies = [];
for (const k of Object.keys(process.env)) {
    const m = /^BILI_COOKIE(_(\d+))?$/.exec(k);
    if (m) {
        const v = process.env[k];
        if (v && v.includes('SESSDATA')) {
            const idx = m[2] ? parseInt(m[2], 10) : 1;
            cookies.push({ idx, v });
        }
    }
}
cookies.sort((a, b) => a.idx - b.idx);

if (cookies.length === 0) {
    console.error('[inject] 未发现有效 cookie（含 SESSDATA），请检查 Secrets');
    process.exit(1);
}

let txt = fs.readFileSync(TEMPLATE, 'utf8');

if (cookies.length === 1) {
    // 单账号
    const ck = cookies[0].v;
    txt = txt.replace(/(account_parm:\s*\{[\s\S]*?COOKIE:\s*)['"][^'"]*['"]/,
        (m, p1) => p1 + JSON.stringify(ck));
    txt = txt.replace(/ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)/, 'ENABLE_MULTIPLE_ACCOUNT: false');
    console.log(`[inject] 单账号 cookie 已注入（长度 ${ck.length}）`);
} else {
    // 多账号
    const items = cookies.map((c, i) => (
        '        {\n' +
        `            COOKIE: ${JSON.stringify(c.v)},\n` +
        `            NOTE: 'account${i + 1}',\n` +
        `            NUMBER: ${i + 1},\n` +
        '            CLEAR: true,\n' +
        '            WAIT: 90 * 1000,\n' +
        "            ACCOUNT_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',\n" +
        "            PROXY_HOST: '', PROXY_PORT: '', PROXY_USER: '', PROXY_PASS: '',\n" +
        '        }'
    ));
    const block = `    multiple_account_parm: [\n${items.join(',\n')}\n    ],`;
    txt = txt.replace(/multiple_account_parm:\s*\[[\s\S]*?\n    \],/, block);
    txt = txt.replace(/ENABLE_MULTIPLE_ACCOUNT:\s*(true|false)/, 'ENABLE_MULTIPLE_ACCOUNT: true');
    // 单账号 COOKIE 也写第一个，兼容上游单账号逻辑
    txt = txt.replace(/(account_parm:\s*\{[\s\S]*?COOKIE:\s*)['"][^'"]*['"]/,
        (m, p1) => p1 + JSON.stringify(cookies[0].v));
    console.log(`[inject] 多账号 cookie 已注入（${cookies.length} 个）`);
}

fs.writeFileSync(OUTPUT, txt, 'utf8');
console.log(`[inject] 已写入 ${OUTPUT}`);
