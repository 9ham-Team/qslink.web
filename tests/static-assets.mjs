import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {prepareStaticAssets,archiveLegacy,isVersionedAsset}=require('../server/lib/static-assets');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'qslink-assets-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const publicDir=path.join(root,'site'),dataDir=path.join(root,'data');
  await fs.mkdir(path.join(publicDir,'build'),{recursive:true});return {root,publicDir,dataDir};
}
async function manifest(publicDir,name,body) {
  await fs.writeFile(path.join(publicDir,'build',name),body);
  await fs.writeFile(path.join(publicDir,'asset-manifest.json'),JSON.stringify({version:1,files:[{path:'build/'+name,sha256:createHash('sha256').update(body).digest('hex')}]}));
}
test('static assets retain old lazy chunks after release replacement without changing old bytes',async t=>{
  const f=await fixture(t);
  await manifest(f.publicDir,'lazy-aaaaaaaa.js','old lazy module');
  await prepareStaticAssets(f);
  await fs.unlink(path.join(f.publicDir,'build/lazy-aaaaaaaa.js'));
  await manifest(f.publicDir,'lazy-bbbbbbbb.js','new lazy module');
  const assets=await prepareStaticAssets(f);
  assert.equal(await fs.readFile(assets.get('build/lazy-aaaaaaaa.js'),'utf8'),'old lazy module');
  assert.equal(await fs.readFile(assets.get('build/lazy-bbbbbbbb.js'),'utf8'),'new lazy module');
});
test('static asset manifest rejects traversal, bad digests and mutable filenames',async t=>{
  const f=await fixture(t);
  for(const name of ['../private.js','build/../../private.js','build/entry.js','build/index.html','build/foo-aaaaaaaa.html'])
    assert.equal(isVersionedAsset(name),false);
  await manifest(f.publicDir,'entry-aaaaaaaa.js','safe');
  await fs.writeFile(path.join(f.publicDir,'build/entry-aaaaaaaa.js'),'tampered');
  await assert.rejects(prepareStaticAssets(f),/checksum mismatch/);
  await fs.writeFile(path.join(f.publicDir,'asset-manifest.json'),JSON.stringify({version:1,files:[{path:'../private.js',sha256:'a'.repeat(64)}]}));
  await assert.rejects(prepareStaticAssets(f),/manifest entry/);
});
test('immutable filename collision fails instead of overwriting a cached release',async t=>{
  const f=await fixture(t);await manifest(f.publicDir,'entry-aaaaaaaa.js','first');
  const assets=await prepareStaticAssets(f);
  await manifest(f.publicDir,'entry-aaaaaaaa.js','second');
  await assert.rejects(prepareStaticAssets(f),/collision/);
  assert.equal(await fs.readFile(assets.get('build/entry-aaaaaaaa.js'),'utf8'),'first');
});
test('first-upgrade archive retains hashed old chunks and excludes entry.js',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.publicDir,'build/entry.js'),'mutable');
  await fs.writeFile(path.join(f.publicDir,'build/Page-oldhash1.js'),'old page');
  assert.equal(await archiveLegacy(path.join(f.publicDir,'build'),f.dataDir),1);
  assert.equal(await fs.readFile(path.join(f.dataDir,'static-assets/build/Page-oldhash1.js'),'utf8'),'old page');
  await assert.rejects(fs.access(path.join(f.dataDir,'static-assets/build/entry.js')));
});
test('source symlink directories cannot expose files outside the build',async t=>{
  const f=await fixture(t),outside=path.join(f.root,'outside');
  await fs.mkdir(outside);await fs.writeFile(path.join(outside,'entry-aaaaaaaa.js'),'outside');
  await fs.rmdir(path.join(f.publicDir,'build'));
  try {await fs.symlink(outside,path.join(f.publicDir,'build'),process.platform==='win32'?'junction':'dir');}
  catch(err){if(['EPERM','EACCES'].includes(err.code)){t.skip('Host does not permit symlink creation');return;}throw err;}
  await fs.writeFile(path.join(f.publicDir,'asset-manifest.json'),JSON.stringify({version:1,files:[{path:'build/entry-aaaaaaaa.js',sha256:createHash('sha256').update('outside').digest('hex')}]}));
  await assert.rejects(prepareStaticAssets(f),/Unsafe static/);
});
