import { spawn } from 'node:child_process';
import { serveTestVue3 } from './serve-test-vue3.mjs';

// The parent owns fixture teardown even on Windows, where Playwright's
// webServer tree termination cannot run the server's graceful signal handler.
const fixture = await serveTestVue3();
try {
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test',
    '--config', 'client-vue3/playwright.config-vue3.mjs', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  process.exitCode = await new Promise(resolve => {
    child.once('error', err => { console.error(err.message); resolve(1); });
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  await fixture.close();
}
