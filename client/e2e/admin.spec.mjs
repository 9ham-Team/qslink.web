import { expect, test } from './fixtures.mjs';

async function sessions(request) {
  const config = await (await request.get('/api/config')).json();
  const result = [];
  for (const account of config.demoAccounts) {
    const response = await request.post('/api/auth/login', { data:{identifier:account.id,password:account.pass} });
    expect(response.ok()).toBe(true); result.push(await response.json());
  }
  return {admin:result.find(s=>s.user.role==='admin'),member:result.find(s=>s.user.role==='user')};
}
async function enter(page, session, path='/admin') {
  await page.evaluate(({session,path})=>{ window.__appTest.api.setToken(session.token);window.__appTest.setUser(session.user);return window.__appTest.navigate(path); },{session,path});
  await expect(page.locator('[data-vue3="admin"]')).toBeVisible();
}
async function noOverflow(page) {
  const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,
    overflowing:[...document.querySelectorAll('[data-vue3="admin"] *')].filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width}))}));
  expect(metrics.scroll,JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.client);
}
test('admin Vue modules, permission boundaries, query history, shell round-trip and layouts', async ({page,request},testInfo)=>{
  const errors=[], legacy=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('request',req=>{if(/\/js\/pages\/admin(?:-contest-judging)?\.js/.test(req.url()))legacy.push(req.url());});
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  const {admin,member}=await sessions(request);
  await page.evaluate(s=>{window.__appTest.api.setToken(s.token);window.__appTest.setUser(s.user);return window.__appTest.navigate('/admin');},member);
  await expect(page.locator('.route-forbidden')).toBeVisible();
  expect((await request.get('/api/admin/users',{headers:{Authorization:'Bearer '+member.token}})).status()).toBe(403);
  await enter(page,admin);
  await expect(page.locator('.a-stats .stat-card').first()).toBeVisible();
  await noOverflow(page);
  await page.waitForFunction(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches || [...document.querySelectorAll('.a-stat .stat-value')].every(node => node.classList.contains('fx-count-done')));
  await page.screenshot({path:testInfo.outputPath('admin-overview.png'),fullPage:true});
  for(const tab of ['users','cards','exchanges','announcements','contest']) {
    await page.locator('[data-tab="'+tab+'"]').click();
    await expect(page).toHaveURL(new RegExp('tab='+tab));
    await expect(page.locator('[data-tab="'+tab+'"]')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#a-panel [role="status"] .skeleton')).toHaveCount(0);
    await noOverflow(page);
  }
  await expect(page.getByRole('heading',{name:'人工评审管理',exact:true})).toBeVisible();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#a-panel > .a-tab-body')).opacity === '1');
  await page.screenshot({path:testInfo.outputPath('admin-contest.png'),fullPage:true});
  await page.evaluate(()=>window.__appTest.navigate('/admin?tab=users'));
  await expect(page.locator('#a-panel table')).toBeVisible();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#a-panel > .a-tab-body')).opacity === '1');
  await page.screenshot({path:testInfo.outputPath('admin-users.png'),fullPage:true});
  await page.evaluate(()=>window.__appTest.navigate('/admin?tab=cards'));
  await page.goBack(); await expect(page.locator('[data-tab=users]')).toHaveAttribute('aria-selected','true');
  await page.goForward(); await expect(page.locator('[data-tab=cards]')).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>window.__appTest.navigate('/'));
  await expect(page.locator('[data-vue3=home]')).toBeVisible();
  await page.evaluate(()=>window.__appTest.navigate('/admin?tab=users'));
  await expect(page.locator('[data-vue3=admin]')).toHaveCount(1);
  await page.goto('/admin?tab=users&lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('[data-vue3=admin] h1')).toHaveText('Admin dashboard');
  await page.emulateMedia({reducedMotion:'reduce'});await noOverflow(page);
  expect(legacy).toEqual([]);expect(errors).toEqual([]);
});
test('real admin card approval, Unicode editing, self account restrictions and cancellation', async ({page,request},testInfo)=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/'); const {admin,member}=await sessions(request);
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;canvas.getContext('2d').fillRect(0,0,120,80);return canvas.toDataURL('image/png');});
  const title='Admin QA '+testInfo.project.name+' '+Date.now();
  const created=await request.post('/api/cards',{headers:{Authorization:'Bearer '+member.token},data:{title,callSign:'BG1QA',frontImage:image,backImage:image,ratio:{w:3,h:2},stock:3,acceptTerms:true,acceptContentLicense:true,termsVersion:'2026-10-25'}});
  expect(created.ok()).toBe(true); const {card}=await created.json();
  try {
    await enter(page,admin,'/admin?tab=cards');
    const search=page.locator('#a-panel input[type=search]');
    await search.fill(title);await search.press('Enter');
    const row=page.locator('.a-cardrow').filter({hasText:title});
    await expect(row).toHaveCount(1);
    await row.getByRole('button',{name:'通过审核',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toContainText('已通过');
    await row.getByRole('button',{name:'编辑',exact:true}).click();
    await page.getByRole('dialog').locator('[name=notes]').fill('😀'.repeat(150));
    await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const detail=await (await request.get('/api/cards/'+card.id,{headers:{Authorization:'Bearer '+member.token}})).json();
    expect(detail.card.notes).toBe('😀'.repeat(150));expect(detail.card.stock).toBe(3);
    await row.getByRole('button',{name:'删除',exact:true}).click();
    await page.keyboard.press('Escape');await expect(row).toHaveCount(1);
    await row.getByRole('button',{name:'查看卡片',exact:true}).click();
    await expect(page.getByRole('dialog').locator('.card3d')).toBeVisible();
    await page.keyboard.press('Escape');await noOverflow(page);
    await page.locator('[data-tab=users]').click();
    await page.locator('#a-panel input[type=search]').fill(admin.user.username);
    await page.locator('#a-panel input[type=search]').press('Enter');
    const self=page.locator('#a-panel tbody tr').filter({hasText:'@'+admin.user.username});
    await expect(self).toHaveCount(1);
    await expect(self.getByRole('button',{name:'删除',exact:true})).toBeDisabled();
    await self.getByRole('button',{name:'编辑',exact:true}).click();
    await expect(page.getByRole('dialog').locator('[name=role]')).toBeDisabled();
    await expect(page.getByRole('dialog').locator('[name=status]')).toBeDisabled();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  } finally {await request.delete('/api/admin/cards/'+card.id,{headers:{Authorization:'Bearer '+admin.token}});}
});
test('announcement writes and voting conflicts remain isolated from session switching',async({page,request},testInfo)=>{
  await page.goto('/');const {admin,member}=await sessions(request);
  await enter(page,admin,'/admin?tab=announcements');
  await page.getByRole('button',{name:'新建公告',exact:true}).click();
  const title='Admin announcement '+testInfo.project.name+' '+Date.now();
  await page.getByRole('dialog').locator('[name=title]').fill(title);
  await page.getByRole('dialog').locator('[name=body]').fill('<img src=x onerror=alert(1)> plain text');
  await page.getByRole('dialog').getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const announcement=page.locator('.a-announcement-item').filter({hasText:title});
  await expect(announcement).toBeVisible();await expect(announcement.locator('img')).toHaveCount(0);
  await announcement.getByRole('button',{name:'发布',exact:true}).click();
  await expect(announcement).toContainText('已发布');
  await announcement.getByRole('button',{name:'撤下',exact:true}).click();
  await expect(announcement).toContainText('草稿 / 已撤下');
  const endpoint='**/api/admin/contests/qsl-design-2026-11/voting';
  await page.route(endpoint,route=>route.request().method()==='GET' ? route.fulfill({json:{voting:{revision:2,startsAt:null,endsAt:null}}}) : route.fulfill({status:409,json:{error:{message:'投票配置已更新',code:'REVISION_CONFLICT'}}}));
  await page.locator('[data-tab=contest]').click();
  await page.locator('[name=startsAt]').fill('2099-11-20T16:00');
  await page.locator('[name=endsAt]').fill('2099-11-21T16:00');
  await page.getByRole('button',{name:'保存投票时间',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存投票时间',exact:true})).toBeDisabled();
  await expect(page.locator('[name=startsAt]')).toHaveValue(/2099-11-20T16:00/);
  await page.evaluate(s=>{window.__appTest.api.setToken(s.token);window.__appTest.setUser(s.user);},member);
  await expect(page.locator('[data-vue3=admin]')).toHaveCount(0);
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(page.locator('.route-forbidden')).toBeVisible();
  await noOverflow(page);
});




test('real contest description review, five-judge configuration, start and protected exports',async({page,request},testInfo)=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');const {admin,member}=await sessions(request);
  const headers={Authorization:'Bearer '+admin.token}, ownHeaders={Authorization:'Bearer '+member.token};
  const event='/api/contests/qsl-design-2026-11', management='/api/admin/contests/qsl-design-2026-11';
  let entry=(await(await request.get(event+'/entry',{headers:ownHeaders})).json()).entry;
  if(!entry) {
    const mine=await(await request.get('/api/me/cards',{headers:ownHeaders})).json();
    const card=mine.items.find(card=>card.status==='approved');expect(card).toBeTruthy();
    const created=await request.put(event+'/entry',{headers:ownHeaders,data:{works:[{cardId:card.id,description:'Admin UI material '+testInfo.project.name}],contactEmail:member.user.email}});
    expect(created.ok()).toBe(true);entry=(await created.json()).entry;
  }
  const judges=(await(await request.get('/api/admin/users?role=user&status=active&limit=20',{headers})).json()).items.slice(0,5);
  expect(judges).toHaveLength(5);
  await enter(page,admin,'/admin?tab=contest');
  const section=page.locator('.a-contest-section').filter({has:page.getByRole('heading',{name:'作品说明审核',exact:true})});
  await section.locator('select').selectOption('all');
  const row=section.locator('.a-cardrow').filter({hasText:entry.cards[0].title}).first();
  await row.getByRole('button',{name:'查看报名 / 审核',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'比赛报名详情',exact:true});
  await dialog.getByRole('button',{name:'通过作品说明',exact:true}).click();await expect(dialog).toHaveCount(0);
  const judging=page.locator('.a-judging-admin');
  while(await judging.locator('.a-judging-selected li').count()) await judging.locator('.a-judging-selected li button').last().click();
  const deadline=new Date(Date.now()+9*3600000).toISOString().slice(0,19);
  await judging.locator('[data-deadline]').fill(deadline);
  for(const judge of judges) {
    await judging.locator('input[name=q]').fill(judge.uid);
    await judging.getByRole('button',{name:'搜索用户',exact:true}).click();
    await judging.getByRole('button',{name:new RegExp('UID '+judge.uid)}).click();
  }
  const saved=page.waitForResponse(res=>res.request().method()==='PUT' && res.url().endsWith('/judging'));
  await judging.getByRole('button',{name:'保存评审配置',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'确认调整评审配置',exact:true});
  if(await confirm.count()) await confirm.getByRole('button',{name:'确认',exact:true}).click();
  expect((await saved).ok()).toBe(true);
  await expect(judging.locator('.a-judging-table tbody tr')).toHaveCount(5);
  const state=(await(await request.get(management+'/judging',{headers})).json()).judging;
  if(!state.frozenAt) {
    await judging.getByRole('button',{name:'开始并固定评审',exact:true}).click();
    const started=page.waitForResponse(res=>res.request().method()==='POST' && res.url().endsWith('/judging/start'));
    await page.getByRole('dialog',{name:'开始并固定评审',exact:true}).getByRole('button',{name:'确认',exact:true}).click();
    expect((await started).ok()).toBe(true);
  }
  await expect(judging.getByRole('button',{name:'下载人工评分 XLSX',exact:true})).toBeDisabled();
  const allZip = '**/judging/materials.zip';
  const exportAll = judging.getByRole('button', {name:'一键导出全部材料 ZIP', exact:true});
  let failExport;
  const allowResponse = new Promise(resolve => { failExport = resolve; });
  await page.route(allZip, async route => {
    await allowResponse;
    await route.fulfill({status:200, contentType:'text/html', body:'<html>Unexpected response</html>'});
  });
  await exportAll.click();
  try {
    await expect(judging.getByRole('status').filter({hasText:'正在准备下载…'})).toBeVisible();
    await expect(exportAll).toBeHidden();
  } finally {
    failExport();
  }
  await expect(judging.getByRole('alert').filter({hasText:'服务器没有返回下载文件，请稍后重试。'})).toBeVisible();
  await page.unroute(allZip);
  await page.route(allZip, route => route.fulfill({
    status:409,
    json:{error:{code:'MATERIALS_EXPORT_PENDING',fields:{number:27,reason:'冻结图片解码失败'}}},
  }));
  await exportAll.click();
  await expect(judging.getByRole('alert').filter({hasText:'作品 #27 同步失败（冻结图片解码失败）'})).toBeVisible();
  await page.unroute(allZip);
  const fullPromise = page.waitForEvent('download');
  await exportAll.click();
  const fullZip = await fullPromise;
  expect(fullZip.suggestedFilename()).toMatch(/materials-all\.zip$/);
  expect(await fullZip.failure()).toBeNull();
  const manual = judging.getByRole('link', {name:'手动下载文件'});
  const manualPromise = page.waitForEvent('download');
  await manual.click();
  expect(await (await manualPromise).failure()).toBeNull();
  const zipPromise=page.waitForEvent('download');
  await judging.getByRole('button',{name:'下载此范围材料 ZIP',exact:true}).click();
  const zip=await zipPromise;expect(zip.suggestedFilename()).toMatch(/materials-1-20\.zip$/);expect(await zip.failure()).toBeNull();
  const skip = judging.getByRole('checkbox', {name:'跳过失败作品'});
  await expect(skip).not.toBeChecked();
  await skip.check();
  await page.route('**/judging/materials.zip?from=1&to=20&skipFailed=1', async route => {
    const response = await route.fetch();
    await route.fulfill({response, headers:{...response.headers(), 'x-qsl-export-skipped':'1;19'}});
  });
  const partialPromise = page.waitForEvent('download');
  await judging.getByRole('button',{name:'下载此范围材料 ZIP',exact:true}).click();
  const partial = await partialPromise;
  expect(partial.suggestedFilename()).toMatch(/materials-1-20-partial\.zip$/);
  expect(await partial.failure()).toBeNull();
  await expect(judging.getByRole('status').filter({hasText:'已跳过 1 件作品（#19）'})).toBeVisible();
  const votesPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载当前投票 XLSX',exact:true}).click();
  const votes=await votesPromise;expect(votes.suggestedFilename()).toMatch(/votes\.xlsx$/);expect(await votes.failure()).toBeNull();
  await noOverflow(page);expect(errors).toEqual([]);
});
