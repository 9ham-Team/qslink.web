import { test, expect } from '@playwright/test';

async function fixture(page, request) {
  const listing = await (await request.get('/api/cards?limit=1')).json();
  const template = listing.items[0];
  const detail = await (await request.get('/api/cards/' + template.id)).json();
  const items = Array.from({ length: 48 }, (_, i) => ({ ...template, id: 'browse-' + i, title: 'Browse card ' + i, callSign: 'BG7MEM' }));
  const calls = [];
  let withdrawn;
  await page.route('**/api/cards?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const current = Number(query.get('page') || 1);
    const limit = Number(query.get('limit') || 12);
    const available = items.filter(item => item.id !== withdrawn);
    if (limit === 12) calls.push(current);
    await route.fulfill({ json: { items: available.slice((current - 1) * limit, current * limit), total: available.length, page: current, pages: Math.ceil(available.length / limit) } });
  });
  await page.route('**/api/cards/browse-*', route => route.fulfill({ json: { ...detail, card: { ...detail.card, id: new URL(route.request().url()).pathname.split('/').at(-1) } } }));
  return { calls, withdraw: id => { withdrawn = id; } };
}

async function openDeepCard(page) {
  await page.goto('/explore?callSign=BG7MEM&sort=popular');
  await expect(page.locator('.qsl-tile')).toHaveCount(12);
  await page.locator('[data-infinite-vue3]').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.qsl-tile').count()).toBeGreaterThan(12);
  const card = page.locator('[data-card-id="browse-13"] .qsl-tile-media');
  await card.scrollIntoViewIfNeeded();
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  await card.focus();
  const before = { y: await page.evaluate(() => scrollY), count: await page.locator('.qsl-tile').count() };
  expect(before.y).toBeGreaterThan(400);
  await card.click();
  await expect(page).toHaveURL(/\/card\/browse-13$/);
  await expect(page.locator('.g-crumbs a[href="/explore"]')).toBeVisible();
  return before;
}

async function expectRestored(page, before) {
  await expect(page.locator('[data-vue3="explore"] .qsl-tile')).toHaveCount(before.count);
  await expect(page.locator('.g-explore__grid')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#app')).toHaveCSS('opacity', '1');
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - before.y)).toBeLessThan(8);
  await expect(page.getByLabel('按呼号搜索卡片')).toHaveValue('BG7MEM');
  await expect(page.getByRole('button', { name: '最热', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test('restores loaded pages and scroll on Back/Forward and detail breadcrumb — vue3', async ({ page, request }, testInfo) => {
  const { calls } = await fixture(page, request);
  const before = await openDeepCard(page);
  const beforeReturn = calls.length;
  await page.goBack();
  await expectRestored(page, before);
  expect(calls.slice(beforeReturn)).toEqual(Array.from({ length: before.count / 12 }, (_, i) => i + 1));
  await page.goForward();
  await expect(page.locator('.g-crumbs a[href="/explore"]')).toBeVisible();
  await page.locator('.g-crumbs a[href="/explore"]').click();
  await expectRestored(page, before);
  await page.screenshot({ path: testInfo.outputPath('restored-gallery-vue3.png') });
  // A fresh, independent visit to the same filtered URL starts a new collection.
  await page.evaluate(() => window.QSL.navigate('/'));
  await expect(page.locator('[data-vue3="explore"]')).toHaveCount(0);
  await page.evaluate(() => window.QSL.navigate('/explore?callSign=BG7MEM&sort=popular'));
  await expect(page.locator('.qsl-tile')).toHaveCount(12);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(100);
});

test('revalidates a remembered gallery and removes withdrawn cards — vue3', async ({ page, request }) => {
  const { withdraw } = await fixture(page, request);
  const before = await openDeepCard(page);
  withdraw('browse-13');
  await page.goBack();
  await expectRestored(page, before);
  await expect(page.locator('[data-card-id="browse-13"]')).toHaveCount(0);
});

test('account changes invalidate saved collections while away — vue3', async ({ page, request }) => {
  await fixture(page, request);
  await openDeepCard(page);
  await page.evaluate(() => window.QSL.setUser(null));
  await page.goBack();
  await expect(page.locator('[data-vue3="explore"] .qsl-tile')).toHaveCount(12);
});
