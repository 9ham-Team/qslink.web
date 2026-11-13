import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';

export async function serveTestVue3() {
  // Refuse a busy fixture port; never reuse another running site.
  const check = net.createServer();
  await new Promise((resolve, reject) => {
    check.once('error', reject);
    check.listen(18787, '127.0.0.1', resolve);
  });
  await new Promise(resolve => check.close(resolve));
  const runtimeRoot = path.resolve('artifacts/runtime-vue3');
  await fs.mkdir(runtimeRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(runtimeRoot, 'runtime-vue3-'));
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const password = crypto.randomBytes(24).toString('hex');
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'pg'), port, user: 'postgres', password,
    authMethod: 'scram-sha-256', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} });
  let child;
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await pg.stop();
    if (!dir.startsWith(runtimeRoot + path.sep)) throw new Error('Unsafe Vue3 fixture cleanup');
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  try {
    await pg.initialise();
    await pg.start();
    child = spawn(process.execPath, ['server/server.js'], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test', QSL_HOST: '127.0.0.1', QSL_PORT: '18787',
        QSL_DATA_DIR: path.join(dir, 'data'), QSL_SEED_DEMO: 'true', QSL_DB_SCHEMA: 'public',
        DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
        QSL_PUBLIC_ORIGIN: 'http://127.0.0.1:18787', QSL_PUBLIC_DIR_VUE3: path.resolve('dist-public-vue3'),
        QSL_REVIEW_WEBHOOK_URL: '', QSL_MAIL_FROM: '',
      },
    });
    let failure = '';
    child.stderr.on('data', data => { failure = (failure + data).slice(-3000); });
    child.once('error', err => { failure = err.message; });
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || failure.includes('EADDRINUSE')) throw new Error('Vue3 fixture startup failed: ' + failure);
      try {
        const res = await fetch('http://127.0.0.1:18787/api/health', { signal: AbortSignal.timeout(1000) });
        if (res.ok) { ready = true; break; }
      } catch { /* not yet ready */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Vue3 fixture startup timed out: ' + failure);
    return { close };
  } catch (err) {
    await close();
    throw err;
  }
}
