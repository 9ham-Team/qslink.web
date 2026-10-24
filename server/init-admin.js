'use strict';

const fs = require('fs/promises');
const readline = require('readline');
const { readConfig, assertProductionData } = require('./lib/config');
const { acquireDataLock } = require('./lib/data-lock');
const { Database, createId } = require('./lib/db');
const { validateRegister, randomAvatarColor } = require('./lib/validate');
const auth = require('./lib/auth');

async function readInput() {
  if (!process.stdin.isTTY) {
    let raw = '';
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 16384) throw new Error('管理员输入过大');
    }
    return JSON.parse(raw);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const ask = prompt => new Promise(resolve => rl.question(prompt, resolve));
    const username = await ask('管理员用户名: ');
    const email = await ask('管理员邮箱: ');
    // Hide password input without putting it in command arguments or history.
    const output = rl._writeToOutput;
    process.stdout.write('管理员密码（至少 12 位，含字母数字）: ');
    rl._writeToOutput = () => {};
    let password;
    try { password = await ask(''); } finally { rl._writeToOutput = output; process.stdout.write('\n'); }
    return { username, email, password };
  } finally { rl.close(); }
}

async function main() {
  const config = readConfig();
  if (config.demo) throw new Error('管理员初始化不能启用演示模式');
  const release = await acquireDataLock(config.dataDir);
  try {
    const db = new Database(config.dbFile);
    await db.load();
    assertProductionData(db, { requireAdmin: false });
    if (db.data.users.some(user => user.role === 'admin')) throw new Error('管理员已存在；请通过后台管理，不会覆盖已有账号');
    const payload = validateRegister(await readInput());
    if (payload.password.length < 12) throw new Error('管理员密码至少 12 位');
    if (['Admin@123456', 'Demo@123456'].includes(payload.password)) throw new Error('禁止使用演示密码');
    if (db.data.users.some(user => user.username.toLowerCase() === payload.username.toLowerCase() || user.email.toLowerCase() === payload.email)) {
      throw new Error('用户名或邮箱已存在，不会自动提升已有用户权限');
    }
    const now = new Date().toISOString();
    db.insert('users', { ...payload, id: createId('u'), passwordHash: auth.hashPassword(payload.password),
      role: 'admin', status: 'active', bio: '', address: null, avatarColor: randomAvatarColor(), createdAt: now, updatedAt: now });
    delete db.data.users[db.data.users.length - 1].password;
    await db.save();
    await fs.mkdir(config.uploadsDir, { recursive: true, mode: 0o700 });
    console.log('管理员初始化完成；未创建演示账号或卡片。');
  } finally { await release(); }
}

if (require.main === module) main().catch(err => { console.error('[admin:init]', err.message); process.exitCode = 1; });
module.exports = { main };
