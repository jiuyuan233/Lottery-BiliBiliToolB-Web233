/* =============================================================================
 * lottery 状态页  ——  极简 Express 服务（胶水层，不侵入上游源码）
 * -----------------------------------------------------------------------------
 * 端口 3000，供 nginx /lottery/ 反代。提供：
 *   GET  /            HTML 状态页（cookie 状态 + 最近日志 + 手动触发按钮）
 *   GET  /api/status  JSON 状态（cookie 是否就绪、日志尾部、最近运行时间）
 *   POST /api/run     手动触发一次任务 {cmd: "start"|"check"|"clear"|"login"}
 * ========================================================================== */
const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_DIR = '/app/data';
const LOG_FILE = path.join(DATA_DIR, 'logs', 'lottery.log');
const ENV_FILE = path.join(DATA_DIR, 'env.js');

app.use(express.json());

// 读取日志尾部（最后 N 行）
function tail(file, n = 200) {
  try {
    if (!fs.existsSync(file)) return '';
    const txt = fs.readFileSync(file, 'utf8');
    const lines = txt.split('\n');
    return lines.slice(-n).join('\n');
  } catch (e) { return '[读取日志失败] ' + e.message; }
}

// 判断 cookie 是否就绪（env.js 里 COOKIE 非空，或多账号模式有账号）
function cookieReady() {
  try {
    if (!fs.existsSync(ENV_FILE)) return { ready: false, reason: 'env.js 不存在（尚未扫码或同步）' };
    const txt = fs.readFileSync(ENV_FILE, 'utf8');
    // 单账号
    const single = /COOKIE:\s*['"]([^'"]+)['"]/.exec(txt);
    if (single && single[1] && single[1].includes('SESSDATA')) return { ready: true, mode: 'single' };
    // 多账号
    if (/ENABLE_MULTIPLE_ACCOUNT:\s*true/.test(txt) && /COOKIE:\s*['"][^'"]*SESSDATA/.test(txt)) {
      return { ready: true, mode: 'multiple' };
    }
    return { ready: false, reason: 'COOKIE 为空，请先在面板扫码登录' };
  } catch (e) { return { ready: false, reason: e.message }; }
}

// 状态 JSON
app.get('/api/status', (req, res) => {
  res.json({
    service: 'lottery-status',
    cookie: cookieReady(),
    logTail: tail(LOG_FILE, 200),
    logMtime: (() => { try { return fs.statSync(LOG_FILE).mtime; } catch { return null; } })(),
    time: new Date().toISOString()
  });
});

// 手动触发任务
app.post('/api/run', (req, res) => {
  const allowed = ['start', 'check', 'clear', 'login', 'acount', 'update'];
  const cmd = req.body && req.body.cmd;
  if (!allowed.includes(cmd)) return res.status(400).json({ err: '非法命令: ' + cmd });
  const stamp = new Date().toISOString();
  const line = `\n[manual ${stamp}] node main.js ${cmd}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  execFile('node', ['main.js', cmd], { cwd: '/app', timeout: 1000 * 60 * 30 }, (err, stdout, stderr) => {
    const out = (stdout || '') + (stderr || '');
    try { fs.appendFileSync(LOG_FILE, out + '\n'); } catch {}
    res.json({ cmd, ok: !err, err: err ? err.message : null, output: out.slice(-4000) });
  });
});

// HTML 状态页
app.get('/', (req, res) => {
  const s = cookieReady();
  const log = tail(LOG_FILE, 300).replace(/</g, '&lt;');
  res.type('html').send(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>动态抽奖 · 状态</title>
<style>
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;background:#0f1419;color:#c9d1d9}
  .wrap{max-width:900px;margin:0 auto;padding:24px}
  h1{font-size:20px;font-weight:600}
  .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin:16px 0}
  .ok{color:#3fb950}.bad{color:#f85149}
  button{background:#238636;color:#fff;border:0;border-radius:6px;padding:8px 16px;margin:4px 4px;cursor:pointer;font-size:14px}
  button:hover{background:#2ea043}
  pre{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;overflow:auto;max-height:420px;font-size:12px;line-height:1.5}
  a{color:#58a6ff}
</style></head><body><div class="wrap">
<h1>🎰 动态抽奖 · LotteryAutoScript 状态</h1>
<div class="card">
  <div>Cookie 状态：
    <b class="${s.ready ? 'ok' : 'bad'}">${s.ready ? '✓ 已就绪 (' + (s.mode || '') + ')' : '✗ 未就绪'}</b>
  </div>
  ${s.reason ? `<div class="bad">${s.reason}</div>` : ''}
  ${!s.ready ? '<div>请先到 <a href="/">BiliBiliTool 面板</a> 扫码登录，cookie-sync 会自动同步过来。</div>' : ''}
</div>
<div class="card">
  <b>手动触发</b>（立即执行一次，结果写入日志）<br>
  <button onclick="run('start')">参与抽奖 start</button>
  <button onclick="run('check')">检查中奖 check</button>
  <button onclick="run('clear')">清理动态 clear</button>
  <button onclick="run('login')">扫码登录 login</button>
  <span id="tip"></span>
</div>
<div class="card">
  <b>最近日志</b>（自动定时任务 + 手动触发，类人类作息：08:33/10:33/12:13/19:33/22:03）<br>
  <pre id="log">${log || '(暂无日志)'}</pre>
</div>
<script>
function run(cmd){
  document.getElementById('tip').textContent='执行中...';
  fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd})})
    .then(r=>r.json()).then(d=>{document.getElementById('tip').textContent=d.ok?'✓ 已触发':'✗ 失败';setTimeout(refresh,1500);})
    .catch(e=>document.getElementById('tip').textContent='✗ '+e);
}
function refresh(){fetch('/api/status').then(r=>r.json()).then(d=>{document.getElementById('log').textContent=d.logTail||'(暂无日志)';});}
setInterval(refresh,10000);
</script>
</div></body></html>`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`[status] 监听 http://0.0.0.0:${PORT}`));
