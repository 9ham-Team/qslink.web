import { test, expect } from '@playwright/test';

test('keeps authenticated like feedback, guest state and English filters — vue3', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const session = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();
  await page.goto('/explore');
  await expect(page.locator('[data-vue3="explore"] .qsl-tile').first()).toBeVisible();
  await page.evaluate(session => { window.QSL.api.setToken(session.token); window.QSL.setUser(session.user); }, session);
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  const button = page.locator('.qsl-like').first();
  if ((await button.getAttribute('class')).includes('is-liked')) {
    await button.click();
    await expect(button).not.toHaveClass(/is-liked/);
  }
  await button.click();
  await expect(button).toHaveClass(/is-liked/);
  await expect(button).toHaveClass(/fx-heartbeat/);
  await expect(page.locator('.fx-confetti-layer').last()).toBeVisible();
  await page.evaluate(() => { window.QSL.api.setToken(null); window.QSL.setUser(null); });
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.qsl-like').first()).not.toHaveClass(/is-liked/);
  await page.goto('/explore?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('searchbox', { name: 'Search cards by callsign' })).toBeVisible();
  await page.getByRole('button', { name: 'Oldest', exact: true }).click();
  await expect(page).toHaveURL(/sort=oldest/);
});

test('loads a 25-card collection through all pages without duplicates — vue3', async ({ page, request }, testInfo) => {
  const original = await (await request.get('/api/cards?limit=1')).json();
  const items = Array.from({ length: 25 }, (_, i) => ({ ...original.items[0], id: 'fixture-' + i, title: 'Vue3 card ' + i }));
  const pages = [];
  await page.route('**/api/cards?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const current = Number(query.get('page') || 1);
    pages.push(current);
    await route.fulfill({ json: { items: items.slice((current - 1) * 12, current * 12), total: 25, page: current, pages: 3, limit: 12 } });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('/explore');
  await expect(page.locator('[data-vue3="explore"] .qsl-tile')).toHaveCount(12);
  await expect(page.locator('.g-explore__count')).toContainText('25');
  await expect(page.locator('.qsl-tile img').first()).toHaveJSProperty('complete', true);
  await expect(page.locator('#app')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('explore-vue3.png') });
  await expect(page.getByRole('button', { name: '加载更多', exact: true })).toHaveCount(0);
  await page.locator('[data-infinite-vue3]').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.qsl-tile').count()).toBeGreaterThan(12);
  if (await page.locator('.qsl-tile').count() < 25) await page.locator('[data-infinite-vue3]').scrollIntoViewIfNeeded();
  await expect(page.locator('.qsl-tile')).toHaveCount(25);
  await expect(page.locator('.g-explore__end')).toBeVisible();
  expect(pages).toEqual([1, 2, 3]);
  const ids = await page.locator('.qsl-tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.cardId));
  expect(new Set(ids).size).toBe(25);
  expect(errors).toEqual([]);
});

test('retries a failed append on the same page and keeps the displayed collection — vue3', async ({ page, request }) => {
  const original = await (await request.get('/api/cards?limit=1')).json();
  const items = Array.from({ length: 13 }, (_, i) => ({ ...original.items[0], id: 'retry-' + i }));
  let attempts = 0;
  const pages = [];
  await page.route('**/api/cards?*', async route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page') || 1);
    pages.push(current);
    if (current === 2 && ++attempts === 1) {
      await route.fulfill({ status: 503, json: { error: { message: 'retry fixture', code: 'TEST_RETRY' } } });
    } else await route.fulfill({ json: { items: items.slice((current - 1) * 12, current * 12), total: 13, page: current, pages: 2 } });
  });
  await page.goto('/explore');
  await expect(page.locator('.qsl-tile')).toHaveCount(12);
  await page.locator('[data-infinite-vue3]').scrollIntoViewIfNeeded();
  await expect(page.locator('.g-error-panel')).toBeVisible();
  await expect(page.locator('.qsl-tile')).toHaveCount(12);
  await page.waitForTimeout(400);
  expect(pages).toEqual([1, 2]); // A visible sentinel must not retry a failed page by itself.
  await page.locator('.g-error-panel').getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('.qsl-tile')).toHaveCount(13);
  expect(pages).toEqual([1, 2, 2]);
});

test('preserves query/hash, search, sort and legacy/detail navigation — vue3', async ({ page, request }, testInfo) => {
  const original = await (await request.get('/api/cards?limit=1')).json();
  const card = original.items[0];
  const callSign = card.callSign || card.owner.callSign;
  const requests = [];
  page.on('request', req => { if (req.url().includes('/api/cards?')) requests.push(new URL(req.url()).searchParams); });
  await page.goto('/explore?sort=oldest&preserve=1#cards');
  await expect(page.locator('[data-vue3="explore"] .qsl-tile').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '最早', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('按呼号搜索卡片').fill(callSign);
  await expect.poll(() => new URL(page.url()).searchParams.get('callSign')).toBe(callSign);
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: '最热', exact: true }).click();
  await expect(page).toHaveURL(/sort=popular/);
  expect(new URL(page.url()).searchParams.get('preserve')).toBe('1');
  expect(new URL(page.url()).hash).toBe('#cards');
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  expect(requests.at(-1).get('sort')).toBe('popular');
  expect(requests.at(-1).get('callSign')).toBe(callSign);
  const tile = page.locator('.qsl-tile').first();
  if (testInfo.project.name === 'desktop-vue3') {
    await tile.hover({ position: { x: 25, y: 30 } });
    await expect(tile).toHaveClass(/fx-tilt-active/);
  }
  const href = await tile.locator('.qsl-tile-media').getAttribute('href');
  await tile.locator('.qsl-tile-media').click();
  await expect(page).toHaveURL(new RegExp(href + '$'));
  await expect(page.locator('[data-vue3="explore"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel('按呼号搜索卡片')).toHaveValue(callSign);
  await expect(page.getByRole('button', { name: '最热', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(uid => window.QSL.navigate('/space/' + uid), card.owner.uid);
  await expect(page.locator('[data-vue3="space"] h1')).toBeVisible();
  await page.locator('.g-crumbs a[href="/explore"]').click();
  await expect(page.locator('[data-vue3="explore"] h1')).toBeVisible();
});

test('drops delayed search results and cancels debounce on leaving — vue3', async ({ page, request }) => {
  const original = await (await request.get('/api/cards?limit=1')).json();
  const callSign = original.items[0].callSign || original.items[0].owner.callSign;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/cards?*', async route => {
    if (new URL(route.request().url()).searchParams.get('callSign') === 'SLOW') {
      await gate;
      await route.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } }).catch(() => {});
    } else await route.continue();
  });
  await page.goto('/explore');
  await expect(page.locator('.qsl-tile').first()).toBeVisible();
  const slow = page.waitForRequest(req => req.url().includes('callSign=SLOW'));
  await page.getByLabel('按呼号搜索卡片').fill('SLOW');
  await slow;
  await page.getByLabel('按呼号搜索卡片').fill(callSign);
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  release();
  await expect(page.locator('.qsl-tile').first()).toBeVisible();
  const requests = [];
  page.on('request', req => { if (req.url().includes('callSign=CANCELLED')) requests.push(req.url()); });
  await page.getByLabel('按呼号搜索卡片').fill('CANCELLED');
  await page.evaluate(() => window.QSL.navigate('/login'));
  await expect(page.locator('[data-vue3="explore"]')).toHaveCount(0);
  // Keep a full debounce interval after navigation to detect leaked timers.
  await page.waitForTimeout(450);
  expect(requests).toEqual([]);
});
