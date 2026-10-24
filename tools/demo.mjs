import { spawn } from 'node:child_process';
// Do not override NODE_ENV: production must reject demo mode.
const child = spawn(process.execPath, ['server/server.js'], {
  env: { ...process.env, QSL_SEED_DEMO: 'true' }, stdio: 'inherit', windowsHide: true,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
