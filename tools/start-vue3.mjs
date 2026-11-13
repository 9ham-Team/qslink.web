import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'dist-public-vue3');
if (!fs.existsSync(path.join(publicDir, 'build-vue3/entry-vue3.js'))) {
  throw new Error('Run npm run build:vue3 before npm run start:vue3');
}
const watching = process.argv.includes('--watch');
const child = spawn(process.execPath, [...(watching ? ['--watch'] : []), 'server/server.js'], {
  cwd: root,
  env: { ...process.env, QSL_PUBLIC_DIR_VUE3: publicDir },
  windowsHide: true,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', err => { console.error(err.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
