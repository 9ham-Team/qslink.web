import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'dist-public');
if (!fs.existsSync(path.join(publicDir, 'build/entry.js'))) {
  throw new Error('Run npm run build before npm run start');
}
const watching = process.argv.includes('--watch');
process.env.QSL_PUBLIC_DIR = publicDir;
if (watching) {
  const child = spawn(process.execPath, ['--watch', 'server/server.js'], {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.on('error', err => { console.error(err.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  // Run in this process so services and isolated test fixtures own shutdown.
  const { start } = await import('../server/server.js');
  try { await start(); }
  catch (err) { console.error('[server] 启动失败：', err.message); process.exitCode = 1; }
}
