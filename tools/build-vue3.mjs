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
for (const entry of ['/js/pages/space.js', '/js/app.js']) {
  if (original.split('<script src="' + entry + '"></script>').length !== 2)
    throw new Error('Vue3 entry must match exactly once: ' + entry);
}
const html = original
  .replace('<script src="/js/pages/space.js"></script>', '')
  .replace('<script src="/js/app.js"></script>', '<script type="module" src="/build-vue3/entry-vue3.js"></script>');
await build({ configFile: path.join(root, 'client-vue3/vite.config-vue3.mjs') });
await fs.writeFile(path.join(output, 'index.html'), html);
await fs.writeFile(path.join(output, 'migration-vue3.json'), JSON.stringify({ framework: 'vue3', migratedRoutes: ['/space/:uid'], router: 'legacy' }));
console.log('Vue3 build: dist-public-vue3 (space route migrated; legacy shell retained)');
