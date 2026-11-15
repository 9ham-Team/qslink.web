import { test, expect } from '@playwright/test';

test('default SPA and legal entry register no QSL global or compatibility state/router',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('[data-vue3=home]')).toBeVisible();
  const ownership=await page.evaluate(async()=>{
    const manifest=await(await fetch('/asset-manifest.json')).json();
    const {application}=await import(manifest.application);
    const imported=await import(manifest.application);
    return {global:'QSL' in window,testGlobal:'__appTest' in window,stateAlias:'state' in application,routerAlias:'router' in application,modalAlias:'modal' in application,pageRegistry:'pages' in application || 'registerPage' in application,
      sameInstance:application===imported.application,directStore:Object.getOwnPropertyDescriptor(application,'store').value===application.store,
      pinia:application.store.$id,router:application.navigation.instance.currentRoute.value.path};
  });
  expect(ownership).toEqual({global:false,testGlobal:false,stateAlias:false,routerAlias:false,modalAlias:false,pageRegistry:false,sameInstance:true,directStore:true,pinia:'qsl-runtime',router:'/'});
  await page.goto('/legal/terms.html');await expect(page.locator('nav button')).toBeVisible();
  expect(await page.evaluate(()=> 'QSL' in window)).toBe(false);
  expect(errors).toEqual([]);
});

test('Vue sharing renders menu/dialog, generates the existing poster and cleans on route change',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const cards=await(await page.request.get('/api/cards?limit=1')).json();
  const card=cards.items[0];expect(card).toBeTruthy();
  await page.goto('/card/'+card.id);
  await expect(page.locator('[data-vue3=card-detail]')).toBeVisible();
  const button=page.locator('[data-share]');
  if(testInfo.project.name==='mobile') await button.click();
  else await button.hover();
  const content=testInfo.project.name==='mobile'?page.getByRole('dialog',{name:'分享这张卡片',exact:true}):page.locator('.g-card-share__panel.is-open');
  await expect(content).toBeVisible();
  await expect(content.locator('canvas')).toBeVisible();
  await content.getByRole('button',{name:'生成分享图',exact:true}).click();
  const poster=page.getByRole('dialog',{name:'生成分享图',exact:true});
  await expect(poster.locator('img')).toHaveAttribute('src',/^blob:/,{timeout:15000});
  await expect(poster.getByRole('link',{name:'保存分享图',exact:true})).toHaveAttribute('download','QSLink-card.png');
  await page.screenshot({path:testInfo.outputPath('vue-sharing.png')});
  await page.evaluate(async()=>{const manifest=await(await fetch('/asset-manifest.json')).json();return (await import(manifest.application)).application.navigate('/explore');});
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(page.locator('.g-card-share__panel')).toHaveCount(0);
  expect(await page.evaluate(()=> 'QSL' in window)).toBe(false);
  expect(errors).toEqual([]);
});
