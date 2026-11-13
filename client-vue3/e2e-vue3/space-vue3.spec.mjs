import { test, expect } from '@playwright/test';

test('public space survives sorting, sharing, legacy navigation and history — vue3', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const cards = await (await request.get('/api/cards?limit=48')).json();
  const uid = cards.items[0].owner.uid;
  await page.goto('/space/' + uid);
  await expect(page.locator('[data-vue3="space"] h1')).toBeVisible();
  await expect(page.locator('.qsl-tile').first()).toBeVisible();
  await expect(page.locator('.qsl-tile img').first()).toHaveJSProperty('complete', true);
  await page.getByRole('button', { name: '大图', exact: true }).click();
  await expect(page.locator('.g-space__grid')).toHaveAttribute('data-view', 'large');
  const sorted = page.waitForResponse(res => res.url().includes('/api/public/spaces/') && res.url().includes('sort=popular'));
  await page.getByLabel('卡片排序').selectOption('popular');
  await sorted;
  await expect(page.locator('.g-space__grid')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: '分享主页', exact: true }).click();
  await expect(page.locator('#modal-root [data-space-url]')).toHaveValue(new RegExp('/space/' + uid + '$'));
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root [data-space-url]')).toHaveCount(0);
  const firstHref = await page.locator('.qsl-tile-media').first().getAttribute('href');
  await page.locator('.qsl-tile-media').first().click();
  await expect(page).toHaveURL(new RegExp(firstHref + '$'));
  await expect(page.locator('[data-vue3="space"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('[data-vue3="space"] h1')).toBeVisible();
  await expect(page.locator('.g-space__grid')).toHaveAttribute('data-view', 'large');
  await expect(page.getByLabel('卡片排序')).toHaveValue('latest');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#app')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('space-vue3.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('legacy routes avoid the Vue chunk, account changes refresh likes, and English works — vue3', async ({ page, request }) => {
  const chunks = [];
  page.on('request', req => { if (req.url().includes('/build-vue3/space-entry-')) chunks.push(req.url()); });
  await page.goto('/explore');
  await expect(page.locator('.qsl-tile').first()).toBeVisible();
  expect(chunks).toEqual([]);
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();
  await page.evaluate(session => {
    window.QSL.api.setToken(session.token);
    window.QSL.setUser(session.user);
    window.QSL.navigate('/space/' + session.user.uid);
  }, login);
  await expect(page.getByRole('link', { name: '编辑资料', exact: true })).toBeVisible();
  const like = page.locator('.qsl-like').first();
  const wasLiked = (await like.getAttribute('class')).includes('is-liked');
  await like.click();
  if (wasLiked) await expect(like).not.toHaveClass(/is-liked/);
  else await expect(like).toHaveClass(/is-liked/);
  await page.evaluate(() => { window.QSL.api.setToken(null); window.QSL.setUser(null); });
  await expect(page.getByRole('link', { name: '编辑资料', exact: true })).toHaveCount(0);
  await expect(page.locator('.g-space__grid')).not.toHaveAttribute('aria-busy', 'true');
  await page.goto('/space/' + login.user.uid + '?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-vue3="space"] h1')).toBeVisible();
  await expect(page.locator('.g-space__actions button')).toHaveText('Share profile');
});

test('a delayed response cannot write into another route and missing users show 404 — vue3', async ({ page, request }) => {
  const cards = await (await request.get('/api/cards?limit=1')).json();
  const uid = cards.items[0].owner.uid;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/public/spaces/' + uid + '*', async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  await page.goto('/space/' + uid);
  await expect(page.locator('[data-vue3="space"]')).toHaveCount(1);
  await page.evaluate(() => window.QSL.navigate('/explore'));
  release();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator('[data-vue3="space"]')).toHaveCount(0);
  await page.goto('/space/invalid');
  await expect(page.locator('[data-vue3="space"] h1')).toHaveText('这个主页暂时无法访问');
});
