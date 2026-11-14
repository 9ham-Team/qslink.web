import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-public-vue3');
const source = path.join(root, 'public');
// Only a fixed generated directory is cleared; never write into public/.
await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true });
const original = await fs.readFile(path.join(source, 'index.html'), 'utf8');
const migratedScripts = ['space', 'explore', 'qsl-design-contest', 'qsl-design-registration', 'qsl-design-works', 'qsl-design-work-detail', 'qsl-design-judging'].map(name => '/js/pages/' + name + '.js');
for (const entry of [...migratedScripts, '/js/app.js']) {
  if (original.split('<script src="' + entry + '"></script>').length !== 2)
    throw new Error('Vue3 entry must match exactly once: ' + entry);
}
const html = migratedScripts.reduce((html, entry) => html.replace('<script src="' + entry + '"></script>', ''), original)
  .replace('<script src="/js/app.js"></script>', '<script type="module" src="/build-vue3/entry-vue3.js"></script>');
await build({ configFile: path.join(root, 'client-vue3/vite.config-vue3.mjs') });
await fs.writeFile(path.join(output, 'index.html'), html);
await fs.writeFile(path.join(output, 'migration-vue3.json'), JSON.stringify({ framework: 'vue3', migratedRoutes: ['/space/:uid', '/explore', '/events/qsl-design-2026-11', '/events/qsl-design-2026-11/alternate', '/events/qsl-design-2026-11/registration', '/events/qsl-design-2026-11/works', '/events/qsl-design-2026-11/works/:id', '/events/qsl-design-2026-11/judging'], router: 'legacy' }));
console.log('Vue3 build: space, explore and contest pages migrated; legacy shell retained');
