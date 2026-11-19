import { test, expect } from './fixtures.mjs';

test('the built sticky header keeps its frosted backdrop while scrolling', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const header = page.locator('#site-header');
  await expect(header).toHaveCSS('backdrop-filter', 'blur(18px) saturate(1.5)');
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await expect(header).toHaveClass(/is-scrolled/);
  await expect(header).toHaveCSS('backdrop-filter', 'blur(18px) saturate(1.5)');
});

test('English header uses one row when space permits and a menu when it cannot fit', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.setViewportSize({ width: 2248, height: 1100 });
  await page.goto('/events/qsl-design-2026-11');
  await page.locator('#site-header [data-language]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } })).json();
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
  }, login);
  const header = page.locator('#site-header');
  const nav = header.locator('.nav-links');
  const toggle = header.locator('.nav-toggle');
  const readLayout = () => page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width };
    };
    return {
      brand: rect('#site-header .brand'), nav: rect('#site-header .nav-links'),
      actions: rect('#site-header .nav-actions'), row: rect('.nav-main-row'),
      panel: rect('#nav-contest-desktop'),
      needed: parseFloat(document.querySelector('#site-header').style.getPropertyValue('--nav-required-width')),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  await expect(nav).toBeVisible();
  await expect(toggle).toBeHidden();
  await expect.poll(async () => (await readLayout()).row.height).toBeLessThan(90);
  await expect.poll(async () => {
    const layout = await readLayout();
    return Math.abs(layout.row.width - layout.needed);
  }).toBeLessThan(1);
  let layout = await readLayout();
  expect(layout.brand.right).toBeLessThanOrEqual(layout.nav.left);
  expect(layout.nav.right).toBeLessThanOrEqual(layout.actions.left);
  expect(layout.panel.top).toBeGreaterThanOrEqual(layout.row.bottom);
  expect(layout.overflow).toBe(false);
  expect(layout.row.width).toBeGreaterThan(1240);
  await page.screenshot({ path: testInfo.outputPath('english-wide-header.png') });

  // Check both directions around the measured threshold, above the phone breakpoint.
  const fits = Math.ceil(layout.needed + 44);
  for (const width of [fits - 12, fits + 12, fits - 12]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < fits) {
      await expect(toggle).toBeVisible();
      await expect(nav).toBeHidden();
    } else {
      await expect(toggle).toBeHidden();
      await expect(nav).toBeVisible();
      await expect.poll(async () => (await readLayout()).row.height).toBeLessThan(90);
    }
    expect((await readLayout()).overflow).toBe(false);
  }
  await toggle.click();
  await expect(page.locator('#nav-mobile')).toBeVisible();
  await expect(page.locator('#nav-mobile a[href="/events/qsl-design-2026-11/registration"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-mobile')).toBeHidden();
  await toggle.click();
  await page.setViewportSize({ width: 2248, height: 1100 });
  await expect(toggle).toBeHidden();
  await expect(header).not.toHaveClass(/is-menu-open/);
  await page.locator('#site-header [data-language]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(nav).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#site-header [data-language]').click();
  await toggle.click();
  await expect(page.locator('#nav-mobile')).toBeVisible();
  expect((await readLayout()).overflow).toBe(false);
  await page.locator('#nav-mobile a[href="/explore"]').click();
  await expect(page.locator('#nav-mobile')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: fits - 12, height: 1000 });
  await toggle.click();
  await expect(page.locator('#nav-mobile')).toHaveCSS('transform', 'none');
  expect(errors).toEqual([]);
});

test('desktop & mobile shell navigation, contest sub-nav, footer, language switch, and #fx-layer round-trip — vue3', async ({ page, request }) => {
  const errors = [];
  const legacyShellRequests = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', req => { if (req.url().endsWith('/js/app.js')) legacyShellRequests.push(req.url()); });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.waitForSelector('#site-header[data-vue3="header"]');
  await page.waitForSelector('#site-footer[data-vue3="footer"]');
  await page.waitForSelector('#fx-layer[data-vue3="fx"] .fx-particles', { state: 'attached' });
  expect(legacyShellRequests).toEqual([]);

  // Check zero horizontal overflow on desktop
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(desktopOverflow).toBe(true);

  // Contest sub-nav toggle + Escape
  const desktopContestBtn = page.locator('#site-header .nav-links .nav-contest-toggle');
  await desktopContestBtn.click();
  await expect(page.locator('#site-header')).toHaveClass(/is-contest-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-header')).not.toHaveClass(/is-contest-open/);

  // Deep link to contest works preserves active state
  await page.goto('/events/qsl-design-2026-11/works');
  await expect(desktopContestBtn).toHaveClass(/is-active/);
  await expect(page.locator('#site-header')).toHaveClass(/is-contest-open/);
  await expect(page.locator('#nav-contest-desktop a[href="/events/qsl-design-2026-11/works"]')).toHaveAttribute('aria-current', 'page');

  // Footer build info & legal links
  await expect(page.locator('#site-footer a[href="/legal/privacy.html"]')).toBeVisible();
  await expect(page.locator('#site-footer a[href="/legal/terms.html"]')).toBeVisible();
  await expect(page.locator('#site-footer')).toContainText(/Build|开发版/);

  // Language switch to English and back
  await page.locator('#site-header [data-language]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#site-header .nav-links a[href="/explore"]')).toContainText('Explore');
  await page.locator('#site-header [data-language]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  // Login as regular user & test user dropdown
  const config = await (await request.get('/api/config')).json();
  const userAcc = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: userAcc.id, password: userAcc.pass } })).json();
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
  }, login);
  await expect(page.locator('#site-header .nav-avatar-btn')).toBeVisible();
  await page.locator('#site-header .nav-avatar-btn').click();
  await expect(page.locator('#nav-user')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-user')).not.toHaveClass(/is-open/);

  // Mobile viewport menu & overflow check
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#site-header .nav-toggle').click();
  await expect(page.locator('#nav-mobile')).toHaveClass(/is-open/);
  await expect(page.locator('#site-header')).toHaveClass(/is-menu-open/);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(true);
  await page.locator('#nav-mobile a[href="/explore"]').click();
  await expect(page.locator('#nav-mobile')).not.toHaveClass(/is-open/);
  await expect(page.locator('#site-header')).not.toHaveClass(/is-menu-open/);

  // Route round-trip preserves single #fx-layer instance
  await page.evaluate(() => window.__appTest.navigate('/'));
  await page.waitForSelector('#app [data-vue3="home"]');
  await expect(page.locator('#fx-layer')).toHaveCount(1);
  await expect(page.locator('#fx-layer .fx-particles')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('toast pauses HomeAnnouncements, modal/confirm work synchronously, and /admin remains compatible — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.waitForSelector('#app [data-vue3="home"]');

  // Toast appears in #toast-root and HomeAnnouncements observes it
  await page.evaluate(() => {
    window.__testCloseToast = window.__appTest.toast('<b>安全文本</b>提示', 'success', 4000);
  });
  const toastEl = page.locator('#toast-root .toast.qsl-notification.toast-success');
  await expect(toastEl).toBeVisible();
  await expect(toastEl).toContainText('<b>安全文本</b>提示');
  await expect(toastEl.locator('b')).toHaveCount(0);
  await page.evaluate(() => window.__testCloseToast());
  await expect(toastEl).toHaveCount(0);

  // The component dialog service shares the same topmost Escape stack.
  await page.evaluate(() => { window.__outerConfirm = window.__appTest.confirm({ title:'外层确认',message:'outer' }); });
  await expect(page.locator('#modal-root .modal-overlay')).toHaveCount(1);
  const confirmPromise = page.evaluate(() => window.__appTest.confirm({ title:'二次确认',message:'确认吗？' }));
  await expect(page.locator('#modal-root .modal-overlay')).toHaveCount(2);
  await page.keyboard.press('Escape');expect(await confirmPromise).toBe(false);
  await expect(page.locator('#modal-root .modal-overlay')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-root .modal-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);

  // Navigate to /admin and verify native admin renders with shell + modal compatibility
  const config = await (await request.get('/api/config')).json();
  const adminAcc = config.demoAccounts.find(item => item.role === '管理员');
  const adminLogin = await (await request.post('/api/auth/login', { data: { identifier: adminAcc.id, password: adminAcc.pass } })).json();
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/admin');
  }, adminLogin);
  await expect(page.locator('#app')).not.toHaveAttribute('data-vue3', /.+/);
  await expect(page.locator('#app h1, #app h2').first()).toBeVisible();
  await expect(page.locator('#nav-user a[href="/admin"]')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});
