import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-public');
const source = path.join(root, 'public');
// Only a fixed generated directory is cleared; never write into public/.
await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true, filter(file) {
  const relative=path.relative(source,file).split(path.sep).join('/');
  return !/^(?:js|css|assets)(?:\/|$)/.test(relative) && !/^legal\/.*\.(?:js|css)$/.test(relative);
} });
await build({ configFile: path.join(root, 'client/vite.config.mjs') });
const { createHash } = await import('node:crypto');
const files=[];
async function collect(dir) {
  for(const item of await fs.readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory()) await collect(file);
    else {
      const bytes=await fs.readFile(file);
      files.push({path:path.relative(output,file).split(path.sep).join('/'),sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
await collect(path.join(output,'build'));
files.sort((a,b)=>a.path.localeCompare(b.path));
await fs.writeFile(path.join(output,'asset-manifest.json'),JSON.stringify({version:1,entry:(await fs.readFile(path.join(output,'index.html'),'utf8')).match(/<script[^>]+src="([^"]+)"/)[1],files}));
await fs.writeFile(path.join(output, 'migration.json'), JSON.stringify({
  framework: 'vue3',
  shell: 'vue3',
  migratedRoutes: ['/', '/space/:uid', '/explore', '/card/:id', '/s/:token', '/share/:token', '/login', '/register', '/dashboard', '/dashboard/profile', '/dashboard/cards', '/dashboard/cards/new', '/dashboard/cards/:id/edit', '/dashboard/exchanges', '/dashboard/logbook', '/events/qsl-design-2026-11', '/events/qsl-design-2026-11/alternate', '/events/qsl-design-2026-11/registration', '/events/qsl-design-2026-11/works', '/events/qsl-design-2026-11/works/:id', '/events/qsl-design-2026-11/judging', '/admin'],
  router: { owner: 'vue-router', version: 4, history: 'createWebHistory' },
  state: { owner: 'pinia', scope: ['user', 'config', 'booted', 'loading', 'error'] },
  compatibility: { router: 'QSL.router / QSL.navigate', legacyPageHost: null },
}));
console.log('Vue3 build: Vue Router and Pinia own the SPA; all SPA pages use Vue components');
