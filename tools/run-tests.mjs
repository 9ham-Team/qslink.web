import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

let embedded, dir;
try {
  let url = process.env.QSL_TEST_DATABASE_URL;
  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const socket = net.createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qslink-pg-'));
    const password = crypto.randomBytes(24).toString('hex');
    embedded = new EmbeddedPostgres({
      databaseDir: dir,
      port,
      user: 'postgres',
      password,
      authMethod: 'scram-sha-256',
      persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => {},
    });
    await embedded.initialise();
    await embedded.start();
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  }
  const suite = process.argv[2] || 'smoke';
  const args =
    suite === 'smoke'
      ? ['tests/smoke.mjs', ...process.argv.slice(3)]
      : ['--test', 'tests/production.mjs'];
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, QSL_TEST_DATABASE_URL: url },
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
} catch (err) {
  console.error('[test] PostgreSQL 测试环境启动失败：', err.message);
  process.exitCode = 1;
} finally {
  if (embedded) await embedded.stop().catch(() => { process.exitCode = 1; });
  if (dir)
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
}
