'use strict';

const fs = require('fs/promises');

// Single-writer JSON storage: the server and offline admin tool share this lock.
// Never automatically remove a lock after a crash; an operator must verify it.
async function acquireDataLock(dataDir) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = require('path').join(dataDir, 'db.json.lock');
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (err) {
    if (err.code === 'EEXIST') throw new Error('数据目录已锁定：请停止使用该目录的服务；异常退出后确认无进程使用，再移除 db.json.lock');
    throw err;
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); }
  finally { await handle.close(); }
  return async () => { await fs.unlink(file); };
}

module.exports = { acquireDataLock };
