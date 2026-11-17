'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const IMMUTABLE = 'public, max-age=31536000, immutable';
const VERSIONED = /^build\/(?:static\/)?[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,64}\.(?:js|css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|avif)$/;
function isVersionedAsset(value) {
  return typeof value === 'string' && !value.includes('..') && VERSIONED.test(value);
}
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function directory(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe static asset directory');
}
async function regular(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe static asset file');
}
async function publish(cache, relative, bytes) {
  if (!isVersionedAsset(relative)) throw new Error('Invalid versioned asset path');
  await directory(cache);
  const parts = relative.split('/');
  let dir = cache;
  for (const part of parts.slice(0,-1)) { dir = path.join(dir,part); await directory(dir); }
  const destination = path.join(cache,...parts);
  const temp = path.join(dir,'.tmp-' + crypto.randomUUID());
  await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});
  try {
    try { await fs.link(temp,destination); }
    catch(err) { if(err.code !== 'EEXIST') throw err; }
    await regular(destination);
    if(digest(await fs.readFile(destination)) !== digest(bytes)) throw new Error('Immutable static asset collision: ' + relative);
  } finally { await fs.unlink(temp); }
  return destination;
}
async function cachedFiles(cache) {
  const result = new Map();
  const root=path.join(cache,'build');
  try { await fs.lstat(root); } catch(err) { if(err.code==='ENOENT')return result; throw err; }
  async function walk(dir) {
    const stat=await fs.lstat(dir);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe static asset directory');
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if(entry.isSymbolicLink()) throw new Error('Unsafe static asset symlink');
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) await walk(file);
      else if(entry.isFile()) {
        const relative=path.relative(cache,file).split(path.sep).join('/');
        if(isVersionedAsset(relative)) result.set(relative,file);
      }
    }
  }
  await walk(root);
  return result;
}
async function readSource(root, relative) {
  let dir=root;
  const rootStat=await fs.lstat(root);
  if(!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe static source');
  const parts=relative.split('/');
  for(const part of parts.slice(0,-1)) {
    dir=path.join(dir,part);
    const stat=await fs.lstat(dir);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe static source directory');
  }
  const file=path.join(root,...parts);await regular(file);
  return fs.readFile(file);
}
async function prepareStaticAssets(config) {
  const manifestFile=path.join(config.publicDir,'asset-manifest.json');
  let raw;
  try { await regular(manifestFile); raw=await fs.readFile(manifestFile,'utf8'); }
  catch(err) { if(err.code==='ENOENT') return new Map(); throw err; }
  const manifest=JSON.parse(raw), cache=path.join(config.dataDir,'static-assets');
  if(manifest.version!==1 || !Array.isArray(manifest.files) || manifest.files.length===0) throw new Error('Invalid static asset manifest');
  const seen=new Set();
  for(const item of manifest.files) {
    if(!isVersionedAsset(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256) || seen.has(item.path)) throw new Error('Invalid static asset manifest entry');
    seen.add(item.path);
    const bytes=await readSource(config.publicDir,item.path);
    if(digest(bytes)!==item.sha256) throw new Error('Static asset checksum mismatch: '+item.path);
    await publish(cache,item.path,bytes);
  }
  return cachedFiles(cache);
}
// First upgrade: retain the old image's hashed chunks too, but never copy a
// mutable entry.js under a supposedly immutable URL.
async function archiveLegacy(buildDir,dataDir) {
  const cache=path.join(dataDir,'static-assets');
  let count=0;
  async function walk(dir) {
    const stat=await fs.lstat(dir);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe legacy asset directory');
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if(entry.isSymbolicLink()) throw new Error('Unsafe legacy asset symlink');
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) await walk(file);
      else if(entry.isFile()) {
        const relative='build/'+path.relative(buildDir,file).split(path.sep).join('/');
        if(isVersionedAsset(relative)) { await publish(cache,relative,await fs.readFile(file)); count++; }
      }
    }
  }
  await walk(buildDir); return count;
}
module.exports={prepareStaticAssets,archiveLegacy,isVersionedAsset,IMMUTABLE};
if(require.main===module) {
  const [source,dataDir]=process.argv.slice(2);
  if(!source || !dataDir || !path.isAbsolute(source) || !path.isAbsolute(dataDir)) throw new Error('Expected absolute build and data directories');
  archiveLegacy(source,dataDir).then(count=>console.log('Preserved '+count+' versioned assets')).catch(err=>{console.error(err.message);process.exitCode=1;});
}
