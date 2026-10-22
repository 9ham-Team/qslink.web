#!/usr/bin/env node
/**
 * tests/card3d-shot.mjs — 3D 卡片「厚度/侧面角度」截图（零依赖，Node >= 18）。
 *
 * 打开卡片详情页，用 CDP 鼠标拖拽旋转 3D 卡片到斜侧角度并截图（可看到卡片厚度/边缘），
 * 再双击翻面截第二张（背面 + 厚度）。用于人工验收 3D 厚度是否自然。
 *
 * 用法：
 *   node tests/card3d-shot.mjs                       # 8787 上取第一张公共卡
 *   node tests/card3d-shot.mjs --card=c_xxx          # 指定卡片 id
 *   node tests/card3d-shot.mjs --base=http://... --out=qa-shots
 *
 * 输出：qa-shots/card3d-angle-desktop.png、qa-shots/card3d-back-desktop.png
 * 退出码：0 成功；1/2 失败。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const argValue = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const BASE = (argValue('base') || process.env.QSL_SHOT_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const OUT_DIR = path.resolve(ROOT, argValue('out') || 'qa-shots');
const CARD_ID = argValue('card');
const WIDTH = 1440;
const HEIGHT = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(pathname, { token } = {}) {
  const res = await fetch(BASE + pathname, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function resolveCardId() {
  if (CARD_ID) return CARD_ID;
  const res = await fetchJson('/api/cards?limit=1');
  if (res.status !== 200 || !res.json || !res.json.items || !res.json.items.length) {
    throw new Error(`无法从 ${BASE}/api/cards 取得公共卡片，请用 --card=<id> 指定`);
  }
  return res.json.items[0].id;
}

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')));
    });
    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP 错误'));
        else resolve(msg.result);
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
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 20000);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result ? res.result.value : undefined;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cardId = await resolveCardId();
  const detail = await fetchJson(`/api/cards/${cardId}`);
  if (detail.status !== 200) throw new Error(`卡片 ${cardId} 不可公开访问: HTTP ${detail.status}`);
  const card = detail.json.card;
  console.log(`3D 厚度截图: card=${cardId} "${card.title}" ratio=${card.ratio.w}:${card.ratio.h}`);

  const browser = BROWSER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) throw new Error('未找到 Edge / Chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qsl-card3d-'));
  const child = spawn(
    browser,
    ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--mute-audio', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const killTree = () => {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ignore */ }
  };
  const cleanup = () => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  const hardTimeout = setTimeout(() => {
    console.error('3D 截图超时（120s）');
    killTree();
    cleanup();
    process.exit(1);
  }, 120000);
  hardTimeout.unref();

  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = 0;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && !port) {
      if (fs.existsSync(portFile)) {
        try {
          port = parseInt(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0], 10) || 0;
        } catch { /* retry */ }
      }
      if (!port) await sleep(120);
    }
    if (!port) throw new Error('等待 DevTools 端口超时');
    let target = null;
    const listDeadline = Date.now() + 10000;
    while (Date.now() < listDeadline && !target) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch { /* retry */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('未找到可调试页面');

    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
    });

    await cdp.send('Page.navigate', { url: `${BASE}/card/${encodeURIComponent(cardId)}` });
    // 等详情页渲染 + 3D 查看器出现
    const started = Date.now();
    let box = null;
    while (Date.now() - started < 15000) {
      try {
        box = await cdp.evaluate(`(() => {
          const els = Array.from(document.querySelectorAll('[class*="card3d"], .g-detail__viewer-stage, [data-card3d]'));
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width > 120 && r.height > 120) return { x: r.x, y: r.y, w: r.width, h: r.height };
          }
          return null;
        })()`);
        if (box) break;
      } catch { /* ignore */ }
      await sleep(250);
    }
    if (!box) throw new Error('未找到 3D 卡片查看器元素（可能页面未渲染/选择器变化）');
    await sleep(900); // 等入场动效/空闲自转稳定

    const cx = Math.round(box.x + box.w / 2);
    const cy = Math.round(box.y + box.h / 2);
    const dispatch = (type, x, y, extra = {}) =>
      cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });

    // 拖拽旋转到斜侧角度（露出卡片厚度）
    await dispatch('mousePressed', cx, cy, { buttons: 1 });
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      await dispatch('mouseMoved', Math.round(cx + (i * 150) / steps), Math.round(cy - (i * 40) / steps), { buttons: 1 });
      await sleep(30);
    }
    await dispatch('mouseReleased', cx + 150, cy - 40, { buttons: 0 });
    await sleep(700); // 等惯性停下
    const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const angleFile = path.join(OUT_DIR, 'card3d-angle-desktop.png');
    fs.writeFileSync(angleFile, Buffer.from(shot1.data, 'base64'));
    console.log(`OK ${angleFile} (${(fs.statSync(angleFile).size / 1024).toFixed(0)} KB)`);

    // 双击翻面 → 背面 + 厚度
    await dispatch('mousePressed', cx, cy);
    await dispatch('mouseReleased', cx, cy);
    await dispatch('mousePressed', cx, cy, { clickCount: 2 });
    await dispatch('mouseReleased', cx, cy, { clickCount: 2 });
    await sleep(1200); // 等翻面动画
    // 翻面后再轻拖一点，带侧角
    await dispatch('mousePressed', cx, cy);
    for (let i = 1; i <= 4; i += 1) {
      await dispatch('mouseMoved', cx - (i * 60) / 4, cy + (i * 20) / 4, { buttons: 1 });
      await sleep(30);
    }
    await dispatch('mouseReleased', cx - 60, cy + 20);
    await sleep(700);
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const backFile = path.join(OUT_DIR, 'card3d-back-desktop.png');
    fs.writeFileSync(backFile, Buffer.from(shot2.data, 'base64'));
    console.log(`OK ${backFile} (${(fs.statSync(backFile).size / 1024).toFixed(0)} KB)`);

    process.exitCode = 0;
  } catch (err) {
    console.error('3D 截图失败:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    clearTimeout(hardTimeout);
    if (cdp) cdp.close();
    killTree();
    cleanup();
  }
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
