#!/usr/bin/env node
/**
 * tools/final-shots.mjs — 生成交付用全站截图（docs/screenshots）
 * 用法：node tools/final-shots.mjs [baseUrl] [outDir]
 * 依赖：tools/shot.mjs（CDP 无头截图）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const outDir = path.resolve(process.argv[3] || 'docs/screenshots');
const shotTool = path.resolve(__dirname, 'shot.mjs');
fs.mkdirSync(outDir, { recursive: true });

async function login(identifier, password) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  if (!res.ok) throw new Error('登录失败: ' + identifier + ' -> ' + res.status);
  return (await res.json()).token;
}

function shot(url, name, width, height, waitMs, extraArgs) {
  const file = path.join(outDir, name);
  const args = [shotTool, url, file, String(width), String(height), String(waitMs || 12000)].concat(extraArgs || []);
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120000 });
  if (res.status !== 0) {
    console.error('FAIL ' + name + '\n' + (res.stdout || '') + (res.stderr || ''));
    return false;
  }
  console.log((res.stdout || '').trim());
  return true;
}

(async () => {
  console.log('Base:', base, '→', outDir);
  const bgToken = await login('bg7mom', 'Demo@123456');
  const adminToken = await login('admin', 'Admin@123456');

  const cardList = await (await fetch(base + '/api/cards?sort=popular&limit=48')).json();
  const featured = cardList.items[0];
  const shareInfo = await (
    await fetch(base + '/api/cards/' + featured.id + '/share', { headers: { Authorization: 'Bearer ' + adminToken } })
  ).json();
  const shareUrl = shareInfo.url || base + '/share/' + shareInfo.shareToken;
  console.log('Featured card:', featured.title, '| share:', shareUrl);

  const t = (p) => p + (p.includes('?') ? '&' : '?') + 'devToken=';
  const jobs = [
    ['/', 'home', 1440, 1000, 14000, ['--full', '--reduced']],
    ['/explore', 'explore', 1440, 1000, 14000, ['--full', '--reduced']],
    ['/card/' + featured.id, 'detail', 1440, 1000, 14000, []],
    [new URL(shareUrl).pathname, 'share', 1440, 1000, 14000, []],
    ['/login', 'login', 1440, 1000, 10000, []],
    ['/register', 'register', 1440, 1000, 10000, []],
    [t('/dashboard') + bgToken, 'dashboard', 1440, 1000, 12000, []],
    [t('/dashboard/cards') + bgToken, 'my-cards', 1440, 1000, 12000, []],
    [t('/dashboard/cards/new') + bgToken, 'card-editor', 1440, 1250, 14000, []],
    [t('/dashboard/exchanges') + bgToken, 'exchanges', 1440, 1200, 12000, []],
    [t('/dashboard/profile') + bgToken, 'profile', 1440, 1200, 12000, []],
    [t('/admin') + adminToken, 'admin-overview', 1440, 1000, 12000, []],
    [t('/admin?tab=users') + adminToken, 'admin-users', 1440, 1000, 12000, []],
    [t('/admin?tab=cards') + adminToken, 'admin-cards', 1440, 1000, 12000, []],
    [t('/admin?tab=exchanges') + adminToken, 'admin-exchanges', 1440, 1000, 12000, []],
    ['/', 'home-mobile', 390, 844, 14000, ['--mobile', '--reduced']],
    ['/explore', 'explore-mobile', 390, 844, 14000, ['--mobile', '--full', '--reduced']],
    ['/card/' + featured.id, 'detail-mobile', 390, 844, 14000, ['--mobile']],
    [t('/dashboard') + bgToken, 'dashboard-mobile', 390, 844, 12000, ['--mobile']]
  ];

  let ok = 0;
  for (const job of jobs) {
    const success = shot(base + job[0], job[1] + '.png', job[2], job[3], job[4], job[5]);
    if (success) ok++;
  }
  console.log('\n完成 ' + ok + '/' + jobs.length + ' 张截图 → ' + outDir);
  process.exit(ok === jobs.length ? 0 : 1);
})().catch((err) => {
  console.error('生成失败:', err.message);
  process.exit(1);
});
