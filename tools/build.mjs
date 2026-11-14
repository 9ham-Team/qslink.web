import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-public');
const source = path.join(root, 'public');
// Only a fixed generated directory is cleared; never write into public/.
await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true });
const original = await fs.readFile(path.join(source, 'index.html'), 'utf8');
const migratedScripts = ['home', 'space', 'explore', 'card-detail', 'share', 'login', 'register', 'dashboard', 'profile', 'my-cards', 'card-editor', 'exchanges', 'logbook', 'qsl-design-contest', 'qsl-design-registration', 'qsl-design-works', 'qsl-design-work-detail', 'qsl-design-judging'].map(name => '/js/pages/' + name + '.js');
for (const entry of [...migratedScripts, '/js/app.js']) {
  if (original.split('<script src="' + entry + '"></script>').length !== 2)
    throw new Error('Vue3 entry must match exactly once: ' + entry);
}
const html = migratedScripts.reduce((html, entry) => html.replace('<script src="' + entry + '"></script>', ''), original)
  .replace('<script src="/js/app.js"></script>', '<script type="module" src="/build/entry.js"></script>');
await build({ configFile: path.join(root, 'client/vite.config.mjs') });
await fs.writeFile(path.join(output, 'index.html'), html);
await fs.writeFile(path.join(output, 'migration.json'), JSON.stringify({
  framework: 'vue3',
  shell: 'vue3',
  migratedRoutes: ['/', '/space/:uid', '/explore', '/card/:id', '/s/:token', '/share/:token', '/login', '/register', '/dashboard', '/dashboard/profile', '/dashboard/cards', '/dashboard/cards/new', '/dashboard/cards/:id/edit', '/dashboard/exchanges', '/dashboard/logbook', '/events/qsl-design-2026-11', '/events/qsl-design-2026-11/alternate', '/events/qsl-design-2026-11/registration', '/events/qsl-design-2026-11/works', '/events/qsl-design-2026-11/works/:id', '/events/qsl-design-2026-11/judging', '/admin'],
  router: { owner: 'vue-router', version: 4, history: 'createWebHistory' },
  state: { owner: 'pinia', scope: ['user', 'config', 'booted', 'loading', 'error'] },
  compatibility: { router: 'QSL.router / QSL.navigate', legacyPageHost: '/admin' },
}));
console.log('Vue3 build: Vue Router and Pinia own the SPA; /admin uses the legacy page host');
