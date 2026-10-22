#!/usr/bin/env node
/**
 * tools/shot.mjs — 用本机 Edge / Chrome 无头模式给页面截图（CDP 真机视口）
 *
 * 用法：
 *   node tools/shot.mjs <url> <out.png> [width=1440] [height=1000] [waitMs=8000] [flags]
 * 参数：
 *   width/height  CSS 视口尺寸（移动端请直接给 390x844，会自动开启 mobile 模拟）
 *   waitMs        加载后等待 SPA 渲染/请求完成的最长毫秒数（默认 8000）
 * 可选 flags：
 *   --full        捕获完整页面高度（长截图）
 *   --mobile      强制移动端模拟（宽度 ≤ 480 时默认开启）
 *   --wait=1200   额外稳定等待毫秒数（动画/字体），默认 700
 * 示例：
 *   node tools/shot.mjs http://127.0.0.1:8787/ docs/screenshots/home.png 1440 2200 12000 --full
 *   node tools/shot.mjs http://127.0.0.1:8787/ qa-shots/home-mobile.png 390 844
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = new Set();
let extraWait = 700;
for (const arg of argv) {
  if (arg === '--full') flags.add('full');
  else if (arg === '--mobile') flags.add('mobile');
  else if (arg === '--reduced') flags.add('reduced');
  else if (arg.startsWith('--wait=')) extraWait = parseInt(arg.slice(7), 10) || 700;
}
const positional = argv.filter((a) => !a.startsWith('--'));
if (positional.length < 2) {
  console.error('用法: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [--full] [--mobile] [--wait=ms]');
  process.exit(1);
}
const url = positional[0];
const out = path.resolve(positional[1]);
const width = Math.max(200, parseInt(positional[2] || '1440', 10));
const height = Math.max(200, parseInt(positional[3] || '1000', 10));
const waitBudget = Math.max(800, parseInt(positional[4] || '8000', 10));
const mobile = flags.has('mobile') || width <= 480;
const fullPage = flags.has('full');

const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('未找到 Edge / Chrome，可执行文件不存在');
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-shot-'));
const portFile = path.join(profile, 'DevToolsActivePort');
const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-search-engine-choice-screen',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 硬超时保护：避免浏览器进程异常导致脚本悬挂
const hardTimeout = setTimeout(() => {
  console.error('截图失败: 执行超时（90s）');
  killTree();
  cleanup();
  process.exit(1);
}, 90000);
hardTimeout.unref();


function killTree() {
  try { child.kill('SIGKILL'); } catch { /* ignore */ }
  try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
}
function cleanup() {
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function waitForDevTools(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      const port = parseInt(content[0], 10);
      if (port) return port;
    }
    await sleep(120);
  }
  throw new Error('等待 DevTools 端口超时');
}

async function getPageTarget(port) {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('未找到可调试页面');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error('WebSocket 连接失败')));
    });
    this.ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP 错误'));
        else resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.events.get(msg.method);
        if (handlers) handlers.forEach((fn) => fn(msg.params));
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, 30000);
    });
  }
  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        const arr = this.events.get(method) || [];
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        resolve(params);
      };
      const arr = this.events.get(method) || [];
      arr.push(handler);
      this.events.set(method, arr);
    });
  }
  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function main() {
  const port = await waitForDevTools(20000);
  const target = await getPageTarget(port);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
  if (mobile) {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  try {
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: flags.has('reduced') ? 'reduce' : 'no-preference' }]
    });
  } catch { /* ignore */ }

  const loadFired = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loadFired, sleep(15000)]);

  // 等待 SPA 完成渲染：无骨架屏 / 无加载块，且 #app 有内容（最多 waitBudget）
  const started = Date.now();
  let rendered = false;
  while (Date.now() - started < waitBudget) {
    try {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const app = document.querySelector('#app');
          const skeletons = document.querySelectorAll('.skeleton, .loading-block, .boot-splash').length;
          const modals = document.querySelectorAll('.modal-overlay.is-show').length;
          const text = (document.body && document.body.innerText || '').trim().length;
          return {
            ready: document.readyState,
            app: app ? app.children.length : -1,
            skeletons, modals, text
          };
        })()`,
        returnByValue: true
      });
      const v = res && res.result && res.result.value;
      if (v && v.ready === 'complete' && v.skeletons === 0 && (v.app > 0 || v.app === -1) && v.text > 0) {
        rendered = true;
        break;
      }
    } catch { /* ignore */ }
    await sleep(220);
  }
  await sleep(extraWait + (rendered ? 0 : 400));

  let shotParams;
  if (fullPage) {
    // 长截图前先滚动整页：触发滚动进场动效（data-reveal）与图片懒加载，避免长图中出现空白区块
    try {
      const metrics0 = await cdp.send('Page.getLayoutMetrics');
      const content0 = metrics0.cssContentSize || metrics0.contentSize || { height };
      const totalHeight = Math.min(content0.height || height, 18000);
      const step = Math.max(300, Math.round(height * 0.72));
      for (let y = 0; y < totalHeight; y += step) {
        await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, ' + y + ')' });
        await sleep(130);
      }
      await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, ' + (totalHeight - height) + ')' });
      await sleep(220);
      await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
      await sleep(650);
    } catch (err) { /* 滚动触发失败不影响截图 */ }
    const metrics = await cdp.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize || metrics.contentSize || { width, height };
    const clipWidth = Math.ceil(Math.max(width, content.width || width));
    const clipHeight = Math.ceil(Math.min(content.height || height, 18000));
    shotParams = {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: clipWidth, height: clipHeight, scale: 1 }
    };
  } else {
    shotParams = { format: 'png', captureBeyondViewport: false };
  }

  const result = await cdp.send('Page.captureScreenshot', shotParams);
  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(out, buffer);
  cdp.close();
  killTree();
  cleanup();
  console.log(`OK ${out} (${width}x${height}${mobile ? ' mobile' : ''}${fullPage ? ' full' : ''}, ${(buffer.length / 1024).toFixed(0)} KB, rendered=${rendered})`);
}

main().catch((err) => {
  console.error('截图失败:', err.message);
  killTree();
  cleanup();
  process.exit(1);
});
