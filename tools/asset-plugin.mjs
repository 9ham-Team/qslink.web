import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Fingerprint literal public media URLs in SFCs and shared scripts, including
// dynamically bound src strings that Vite's HTML asset scanner cannot discover.
export function publicAssetsPlugin(source) {
  const urls = new Map(), resources = [];
  const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0,20);
  async function add(file, original) {
    const bytes = await fs.readFile(file);
    const ext = path.extname(file), stem = path.basename(file,ext).replace(/[^a-zA-Z0-9_.-]/g,'_');
    const name = 'build/static/' + stem + '-' + hash(bytes) + ext;
    urls.set(original,'/' + name); resources.push({type:'asset',fileName:name,source:bytes});
  }
  const rewrite = text => text.replace(/\/assets\/[A-Za-z0-9_./-]+/g, url => urls.get(url) || url);
  return {
    name:'qslink-public-assets',
    async buildStart() {
      urls.clear(); resources.length = 0;
      async function walk(dir) {
        for (const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
          const file=path.join(dir,item.name);
          if(item.isDirectory()) await walk(file);
          else if(item.isFile()) await add(file,'/' + path.relative(source,file).split(path.sep).join('/'));
        }
      }
      await walk(path.join(source,'assets'));
      for(const relative of ['js/i18n.js','legal/language.js','legal/style.css']) await add(path.join(source,relative),'/' + relative);
      for(const resource of resources) this.emitFile(resource);
    },
    transform(code,id) {
      if(id.includes('node_modules') || !/\.(?:vue|[cm]?[jt]s)(?:\?|$)/.test(id)) return;
      const next=rewrite(code);
      if(next!==code) return {code:next,map:null};
    },
    async closeBundle() {
      const output=path.resolve(source,'../dist-public');
      for(const item of await fs.readdir(path.join(source,'legal'))) {
        if(!item.endsWith('.html')) continue;
        let html=await fs.readFile(path.join(source,'legal',item),'utf8');
        for(const [original,url] of urls) html=html.replaceAll(original,url);
        await fs.writeFile(path.join(output,'legal',item),html);
      }
    },
  };
}
