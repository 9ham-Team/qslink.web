import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

test('HTML/API bypass caches and every shipped script/style/media has an immutable versioned URL',async({page,request})=>{
  const htmlResponse=await request.get('/');
  expect(htmlResponse.headers()['cache-control']).toBe('no-store');
  expect(htmlResponse.headers()['cloudflare-cdn-cache-control']).toBe('no-store');
  const html=await htmlResponse.text();
  expect(html).not.toMatch(/(?:src|href)="\/(?:js|css|assets)\//);
  const manifestResponse=await request.get('/asset-manifest.json');
  expect(manifestResponse.headers()['cache-control']).toBe('no-store');
  const manifest=await manifestResponse.json();
  expect(manifest.entry).toMatch(/^\/build\/index-[A-Za-z0-9_-]{8,}\.js$/);
  expect(html).toContain(manifest.entry);
  expect(manifest.files.some(file=>/image-upload\.worker-.+\.js$/.test(file.path))).toBe(true);
  for(const file of manifest.files) {
    expect(file.path).toMatch(/^build\/(?:static\/)?[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/);
    const response=await request.get('/'+file.path);
    expect(response.status(),file.path).toBe(200);
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(createHash('sha256').update(await response.body()).digest('hex'),file.path).toBe(file.sha256);
  }
  for(const url of ['/admin?tab=users','/legal/terms.html','/api/config','/api/admin/users','/build/missing-aaaaaaaa.js']) {
    const response=await request.get(url);expect(response.headers()['cache-control'],url).toBe('no-store');
  }
  const rejected=await request.post('/');
  expect(rejected.status()).toBe(405);expect(rejected.headers()['cache-control']).toBe('no-store');
  const legal=await(await request.get('/legal/terms.html')).text();
  expect(legal).not.toMatch(/(?:src|href)="\/(?:js\/|legal\/(?:style\.css|language\.js))/);
  expect(legal).toMatch(/\/build\/static\/language-[a-f0-9]+\.js/);
  const fixed=[],errors=[];
  page.on('request',r=>{if(/^\/(?:js|css|assets)\//.test(new URL(r.url()).pathname))fixed.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('[data-vue3=home]')).toBeVisible();
  await page.goto('/events/qsl-design-2026-11');await expect(page.locator('[data-vue3=qsl-design-contest]')).toBeVisible();
  expect(fixed).toEqual([]);expect(errors).toEqual([]);
});

test('image upload executes a hashed module Worker and keeps local WebP processing',async({page,request})=>{
  await page.goto('/login');
  await expect(page.locator('[data-vue3=login] form')).toBeVisible();
  const config=await(await request.get('/api/config')).json();
  const account=config.demoAccounts.find(item=>item.role==='普通用户');
  const session=await(await request.post('/api/auth/login',{data:{identifier:account.id,password:account.pass}})).json();
  const workers=[],fixed=[],errors=[];
  page.on('worker',worker=>workers.push(worker.url()));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/js/'))fixed.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(s=>{window.QSL.api.setToken(s.token);window.QSL.setUser(s.user);return window.QSL.navigate('/dashboard/cards/new');},session);
  await expect(page.locator('#fEditorForm')).toBeVisible();
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=24;canvas.height=16;canvas.getContext('2d').fillRect(0,0,24,16);return canvas.toDataURL('image/png').split(',')[1];});
  await page.locator('[data-upload-side=front] input[type=file]').setInputFiles({name:'cache-worker.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect(page.locator('[data-upload-side=front]')).toHaveClass(/has-image/);
  await expect(page.locator('[data-upload-side=front] [data-preview-img]')).toHaveAttribute('src',/^data:image\/webp;base64,/);
  expect(workers.some(url=>/\/build\/image-upload\.worker-[A-Za-z0-9_-]+\.js$/.test(url))).toBe(true);
  expect(fixed).toEqual([]);expect(errors).toEqual([]);
});
