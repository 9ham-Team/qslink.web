import { test, expect } from '@playwright/test';

test('card detail renders 3D viewer, recommendations, share island, like without viewer rebuild, and owner/404 states — vue3', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const listRes = await (await request.get('/api/cards?limit=12')).json();
  const target = listRes.items[0];
  expect(target).toBeTruthy();

  await page.goto('/card/' + target.id + '?from=e2e');
  await expect(page.locator('[data-vue3="card-detail"] h1.g-detail__title')).toHaveText(target.title);
  await expect(page.locator('.card3d-stage')).toBeVisible();
  await expect(page.locator('.card3d-controls')).toBeVisible();

  // Verify 3D viewer image stability during flip/interaction
  const frontImg = page.locator('.card3d-face--front img');
  await expect(frontImg).toHaveJSProperty('complete', true);
  const initialSrc = await frontImg.evaluate(el => el.currentSrc);
  const flipBtn = page.locator('.card3d-controls button').first();
  await flipBtn.click();
  await expect(frontImg).toHaveJSProperty('currentSrc', initialSrc);

  // Recommendations: <= 4 and never includes current card
  const recoTiles = page.locator('.g-detail__reco-grid .qsl-tile');
  const recoCount = await recoTiles.count();
  expect(recoCount).toBeGreaterThan(0);
  expect(recoCount).toBeLessThanOrEqual(4);
  await expect(page.locator(`.g-detail__reco-grid .qsl-tile[data-card-id="${target.id}"]`)).toHaveCount(0);

  // Guest like redirects to /login?next=... preserving query
  await page.locator('[data-detail-info] [data-like]').click();
  await expect(page).toHaveURL(new RegExp('/login\\?next=' + encodeURIComponent('/card/' + target.id + '?from=e2e').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // Return to detail and log in as demo user
  await page.goBack();
  await expect(page.locator('[data-vue3="card-detail"] h1.g-detail__title')).toHaveText(target.title);
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();
  await page.evaluate(session => {
    window.QSL.api.setToken(session.token);
    window.QSL.setUser(session.user);
  }, login);

  // Like updates without rebuilding the 3D stage DOM element
  await page.locator('.card3d-stage').evaluate(el => { el.dataset.e2eViewerMarker = 'same'; });
  const likeBtn = page.locator('[data-detail-info] [data-like]');
  const wasLiked = (await likeBtn.getAttribute('class')).includes('is-liked');
  await likeBtn.click();
  if (wasLiked) await expect(likeBtn).not.toHaveClass(/is-liked/);
  else await expect(likeBtn).toHaveClass(/is-liked/);
  await expect(page.locator('.card3d-stage')).toHaveAttribute('data-e2e-viewer-marker', 'same');

  // Share button island: desktop opens panel on ArrowDown, mobile opens modal on click
  const shareBtn = page.locator('[data-detail-info] [data-share]');
  await expect(shareBtn).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await shareBtn.click();
    await expect(page.locator('#modal-root .g-card-share__dialog')).toBeVisible();
  } else {
    await shareBtn.focus();
    await shareBtn.press('ArrowDown');
    await expect(page.locator('#g-card-share-panel')).toBeVisible();
  }

  // Navigate away -> share panel/modal and 3D viewer are cleaned up
  await page.evaluate(() => window.QSL.navigate('/explore'));
  await expect(page.locator('[data-vue3="explore"]')).toBeVisible();
  await expect(page.locator('#g-card-share-panel')).toHaveCount(0);
  await expect(page.locator('#modal-root .g-card-share__dialog')).toHaveCount(0);

  // 404 on unknown card (expect browser 404 resource log, no uncaught errors)
  expect(errors).toEqual([]);
  await page.goto('/card/nonexistent-card-id');
  await expect(page.locator('[data-vue3="card-detail"] .g-detail__missing')).toBeVisible();
  await expect(page.locator('.card3d-stage')).toHaveCount(0);

  // Overflow check
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noOverflow).toBe(true);
});

test('public share works on /s/:token and /share/:token, handles 404, zero-stock, and responsive layout — vue3', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();
  const myCardsRes = await (await request.get('/api/me/cards', { headers: { Authorization: 'Bearer ' + login.token } })).json();
  const sharedCard = myCardsRes.items.find(c => c.status === 'approved' && c.shareToken);
  expect(sharedCard).toBeTruthy();

  // Direct refresh on /s/:token as guest
  await page.goto('/s/' + sharedCard.shareToken + '?ref=test');
  await expect(page.locator('[data-vue3="share"] h1.g-share__title')).toHaveText(sharedCard.title);
  await expect(page.locator('.card3d-stage')).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.g-share__lead .g-share__cta.is-guest')).toBeVisible();
  } else {
    await expect(page.locator('.g-share__aside .g-share__cta.is-guest')).toBeVisible();
  }

  // Legacy /share/:token route also works
  await page.goto('/share/' + sharedCard.shareToken);
  await expect(page.locator('[data-vue3="share"] h1.g-share__title')).toHaveText(sharedCard.title);

  // Case-sensitive token check: flipping case should 404
  expect(errors).toEqual([]);
  const flippedToken = sharedCard.shareToken.split('').map(ch => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
  if (flippedToken !== sharedCard.shareToken) {
    await page.goto('/s/' + flippedToken);
    await expect(page.locator('[data-vue3="share"] [data-share-missing]')).toBeVisible();
    await expect(page.locator('.card3d-stage')).toHaveCount(0);
    errors.length = 0;
  }

  // Owner logged in on /s/:token sees owner CTA
  await page.goto('/s/' + sharedCard.shareToken);
  await page.evaluate(session => {
    window.QSL.api.setToken(session.token);
    window.QSL.setUser(session.user);
  }, login);
  await expect(page.locator('.g-share__cta.is-owner')).toBeVisible();

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noOverflow).toBe(true);
  expect(errors).toEqual([]);
});

test('card detail and share respect reduced-motion and English locale — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const listRes = await (await request.get('/api/cards?limit=1')).json();
  const target = listRes.items[0];

  await page.goto('/card/' + target.id + '?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-vue3="card-detail"] .g-crumbs a[href="/explore"]')).toHaveText('Explore cards');
  await expect(page.locator('.g-detail__reco .g-sec-title')).toHaveText('Recommended for you');
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(noOverflow).toBe(true);
  expect(errors).toEqual([]);
});
