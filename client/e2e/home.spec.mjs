import { test, expect } from '@playwright/test';

test('home renders hero 3D, stats, showcase, FAQ, anchors, and English mode without errors or overflow — vue3', async ({ page, request }, testInfo) => {
  const errors = [];
  const cardRequests = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', req => {
    if (req.url().includes('/api/cards?')) cardRequests.push(req.url());
  });

  const statsData = await (await request.get('/api/stats')).json();
  await page.goto('/');
  const home = page.locator('[data-vue3="home"]');
  await expect(home.locator('.g-hero__title')).toBeVisible();
  await expect(home.locator('.card3d')).toBeVisible();
  await expect(home.locator('.qsl-tile').first()).toBeVisible();
  await expect(home.locator('.qsl-tile img').first()).toHaveJSProperty('complete', true);
  await expect(page.locator('#app')).toHaveCSS('opacity', '1');

  expect(cardRequests.some(url => url.includes('sort=popular') && url.includes('limit=48'))).toBe(true);
  await expect(home.locator('.g-stat').nth(1).locator('dd span')).toHaveText(String(statsData.userCount));

  // Dragging Hero 3D card must not re-request /uploads/ images
  const stage = home.locator('.g-hero__stage-mount');
  const stageBox = await stage.boundingBox();
  const uploadRequests = [];
  page.on('request', req => { if (req.url().includes('/uploads/')) uploadRequests.push(req.url()); });
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width / 2 + 80, stageBox.y + stageBox.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  expect(uploadRequests).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });

  // FAQ toggle
  const secondFaq = home.locator('.g-faq__item').nth(1);
  await expect(secondFaq).toHaveAttribute('data-expanded', 'false');
  await secondFaq.locator('summary').click();
  await expect(secondFaq).toHaveAttribute('data-expanded', 'true');

  // Direct anchor & cross-page anchor
  await page.goto('/#faq');
  await expect(page.locator('[data-vue3="home"] #faq')).toBeVisible();
  await expect.poll(() => page.locator('#faq').evaluate(node => Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)))).toBeLessThan(40);

  await page.evaluate(() => window.QSL.navigate('/explore'));
  await expect(page.locator('[data-vue3="explore"]')).toBeVisible();
  await page.evaluate(() => window.QSL.navigate('/#join'));
  await expect(page.locator('[data-vue3="home"] #join')).toBeVisible();
  await expect.poll(() => page.locator('#join').evaluate(node => Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)))).toBeLessThan(40);

  // English mode & reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.g-announcement-entry button')).toContainText('Announcements · View all');
  await expect(page.locator('[data-vue3="home"] .g-hero__actions .btn-primary')).toContainText('Start exchanging');

  expect(errors).toEqual([]);
});

test('home handles empty library, cards failure retry, and stats failure gracefully — vue3', async ({ page }) => {
  await page.route('**/api/stats', route => route.fulfill({ status: 503, json: { error: { message: 'stats unavailable' } } }));
  let attempt = 0;
  await page.route('**/api/cards?*', async route => {
    attempt++;
    if (attempt === 1) {
      await route.fulfill({ status: 503, json: { error: { message: 'cards temporary error' } } });
    } else {
      await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 48, pages: 0 } });
    }
  });

  await page.goto('/');
  const home = page.locator('[data-vue3="home"]');
  await expect(home.locator('.g-error-panel')).toBeVisible();
  await expect(home.locator('.g-stat').nth(1).locator('dd span')).toHaveText('—');

  await home.locator('.g-error-panel [data-retry]').click();
  await expect(home.locator('.empty-state')).toBeVisible();
  await expect(home.locator('.g-stat').nth(0).locator('dd span')).toHaveText('0');
  await expect(home.locator('.card3d')).toBeVisible();
});

test('announcements notice, toast occlusion, Escape isolation, board pagination and dismiss work — vue3', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const session = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();

  let boardPage2Attempts = 0;
  let dismissed = false;
  await page.route('**/api/announcements**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST' && url.pathname.endsWith('/dismiss')) {
      dismissed = true;
      await route.fulfill({ json: { dismissed: true } });
      return;
    }
    if (url.searchParams.get('reminder') === '1') {
      await route.fulfill({
        json: {
          items: dismissed ? [] : [{
            id: 'ann-1',
            title: '<b>Safe Title</b>',
            body: 'First line\n<script>xss</script>',
            displaySeconds: 20,
            publishedAt: '2026-11-14T10:00:00.000Z',
          }],
          total: dismissed ? 0 : 1,
          page: 1,
          limit: 1,
          pages: 1,
        },
      });
      return;
    }
    const p = Number(url.searchParams.get('page') || 1);
    if (p === 2 && ++boardPage2Attempts === 1) {
      await route.fulfill({ status: 503, json: { error: { message: 'board page 2 fail' } } });
      return;
    }
    await route.fulfill({
      json: {
        items: [{
          id: 'board-' + p,
          title: 'Board Page ' + p,
          body: 'Body ' + p,
          publishedAt: '2026-11-14T10:00:00.000Z',
        }],
        total: 10,
        page: p,
        limit: 8,
        pages: 2,
      },
    });
  });

  await page.goto('/');
  const notice = page.locator('[data-vue3="announcement-notice"]');
  await expect(notice).toBeVisible();
  await expect(notice.locator('h2')).toHaveText('<b>Safe Title</b>');
  await expect(notice.locator('h2 b')).toHaveCount(0);

  // Toast occlusion pauses and hides notice, then restores it
  await page.evaluate(() => window.QSL.toast('Blocking toast', 'info', 600));
  await expect(notice).toHaveClass(/is-paused/);
  await expect(notice).not.toHaveClass(/is-paused/, { timeout: 3000 });

  // Guest button shows "登录后不再提醒"
  await expect(notice.getByRole('button', { name: '登录后不再提醒', exact: true })).toBeVisible();

  // Open board modal via entry button; Escape closes modal first, NOT floating notice
  await page.locator('.g-announcement-entry button').click();
  const dialog = page.getByRole('dialog', { name: '公告板', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Board Page 1');

  // Page 2 fails -> keeps Page 1, then retries successfully
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(dialog).toContainText('Board Page 1');
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(dialog).toContainText('Board Page 2');

  // Escape closes dialog while notice remains visible, then second Escape closes notice
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(notice).toBeVisible();

  // Log in and dismiss announcement
  await page.evaluate(s => { window.QSL.api.setToken(s.token); window.QSL.setUser(s.user); }, session);
  await expect(notice.getByRole('button', { name: '不再提醒', exact: true })).toBeVisible();
  await notice.getByRole('button', { name: '不再提醒', exact: true }).click();
  await expect(notice).toHaveCount(0);
  expect(dismissed).toBe(true);
});

test('home animations: count-up, scroll reveal, magnetic hover, reduced-motion & 375px mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.route('**/api/cards?*', async route => {
    await route.fulfill({
      json: {
        items: [
          {
            id: 'anim-card-1',
            title: 'Anim Hero',
            frontImage: '/assets/placeholder-card.svg',
            backImage: '/assets/placeholder-card.svg',
            stock: 1,
            liked: false,
            likeCount: 15,
            ratio: { w: 3, h: 2 },
            owner: { uid: '000000001', username: 'bg7mom', callSign: 'BG7MOM' },
          },
          {
            id: 'anim-card-2',
            title: 'Anim Showcase',
            frontImage: '/assets/placeholder-card.svg',
            backImage: '/assets/placeholder-card.svg',
            stock: 1,
            liked: false,
            likeCount: 7,
            ratio: { w: 3, h: 2 },
            owner: { uid: '000000002', username: 'ba1abc', callSign: 'BA1ABC' },
          },
        ],
        total: 42,
      },
    });
  });

  // Unknown /api/stats stays "—"
  await page.route('**/api/stats', async route => {
    await route.fulfill({ status: 500, json: { error: { message: 'stats down' } } });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const stats = page.locator('.g-hero__stats .g-stat dd span');
  await expect(stats.nth(0)).toHaveText('42', { timeout: 3000 });
  await expect(stats.nth(1)).toHaveText('—');
  await expect(stats.nth(2)).toHaveText('22', { timeout: 3000 });

  // Scroll down to reveal FAQ and Join sections, then verify post-reveal class release
  await page.locator('#join').scrollIntoViewIfNeeded();
  const joinPanel = page.locator('.g-join__panel');
  await expect(joinPanel).toHaveClass(/is-revealed/, { timeout: 3000 });
  await expect(joinPanel).not.toHaveClass(/fx-will-reveal/, { timeout: 3000 });
  await expect.poll(() => joinPanel.evaluate(el => getComputedStyle(el).opacity)).toBe('1');

  // Magnetic hover on desktop fine pointer; disabled on coarse/touch pointer
  const heroCta = page.locator('.g-hero__actions .btn-primary');
  await heroCta.scrollIntoViewIfNeeded();
  const box = await heroCta.boundingBox();
  expect(box).toBeTruthy();
  const hasFinePointer = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8);
  if (hasFinePointer) {
    await expect(heroCta).toHaveClass(/fx-mag-active/);
    const translateDuringHover = await heroCta.evaluate(el => el.style.translate);
    expect(translateDuringHover).not.toBe('');
    await page.mouse.move(0, 0);
    await expect(heroCta).not.toHaveClass(/fx-mag-active/);
    expect(await heroCta.evaluate(el => el.style.translate)).toBe('');
  } else {
    await expect(heroCta).not.toHaveClass(/fx-mag-active/);
    expect(await heroCta.evaluate(el => el.style.translate)).toBe('');
  }

  const overflowDesktop = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowDesktop).toBe(false);

  // Reduced motion: stats and sections visible immediately without .fx-will-reveal hiding
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(stats.nth(0)).toHaveText('42');
  await expect(stats.nth(2)).toHaveText('22');
  expect(await page.locator('.fx-will-reveal').count()).toBe(0);
  await expect.poll(() => page.locator('.g-join__panel').evaluate(el => getComputedStyle(el).opacity)).toBe('1');

  // 375px mobile viewport: no horizontal overflow and touch does not trigger magnetic translate
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(stats.nth(0)).toHaveText('42', { timeout: 3000 });
  await heroCta.dispatchEvent('pointermove', { clientX: 100, clientY: 100, pointerType: 'touch' });
  expect(await heroCta.evaluate(el => el.style.translate)).toBe('');
  const overflowMobile = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowMobile).toBe(false);
  expect(errors).toEqual([]);
});
