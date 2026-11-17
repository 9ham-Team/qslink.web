import { expect, test } from './fixtures.mjs';

async function checkNoOverflow(page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
}

test('dashboard guards guests, renders real overview, handles approve/reject flows, and routes cleanly — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 1. Guest redirect
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

  // 2. Log in with synthetic demo user and admin to verify role gating
  const config = await (await request.get('/api/config')).json();
  const regular = config.demoAccounts.find(item => item.role === '普通用户');
  const admin = config.demoAccounts.find(item => item.role === '管理员');
  const regularLogin = await (await request.post('/api/auth/login', { data: { identifier: regular.id, password: regular.pass } })).json();
  const adminLogin = await (await request.post('/api/auth/login', { data: { identifier: admin.id, password: admin.pass } })).json();

  const chunks = [];
  page.on('request', req => { if (req.url().includes('/build/')) chunks.push(req.url()); });

  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/dashboard');
  }, regularLogin);

  await expect(page.locator('[data-vue3="dashboard"] .f-dash-hero')).toBeVisible();
  expect(chunks.some(url => /Dashboard/.test(url))).toBe(true);
  await expect(page.locator('[data-vue3="dashboard"] .f-stat')).toHaveCount(4);
  await expect(page.locator('[data-vue3="dashboard"] a[href="/admin"]')).toHaveCount(0);
  await checkNoOverflow(page);

  // Switch to admin -> admin link appears
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
  }, adminLogin);
  await expect(page.locator('[data-vue3="dashboard"] a[href="/admin"]')).toBeVisible();

  // 3. Mocked approve/reject flow with pending incoming item, no-cards confirmation, OUT_OF_STOCK, and reject
  let mode = 'pending';
  await page.route('**/api/me/overview', async route => {
    if (mode === 'after-reject') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: regularLogin.user,
          canJudgeContest: true,
          stats: { cards: 3, approvedCards: 2, pendingCards: 1, likesReceived: 9, incomingPending: 0, outgoingPending: 1, completedExchanges: 2 },
          recentIncoming: [],
          recentCards: [
            {
              id: 'card-pending-1',
              title: '待审卡片测试',
              status: 'pending',
              stock: 2,
              liked: false,
              likeCount: 0,
              ratio: { w: 3, h: 2 },
              owner: regularLogin.user,
            },
          ],
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: regularLogin.user,
        canJudgeContest: true,
        stats: { cards: 3, approvedCards: 2, pendingCards: 1, likesReceived: 9, incomingPending: 1, outgoingPending: 1, completedExchanges: 2 },
        recentIncoming: [
          {
            id: 'ex-mock-1',
            status: 'pending',
            direction: 'incoming',
            createdAt: new Date().toISOString(),
            message: '很高兴通联',
            card: { id: 'card-pending-1', title: '我的主卡', ratio: { w: 3, h: 2 } },
            fromUser: { id: 'u9', uid: '10009', username: 'bg9test', displayName: 'BG9TEST', callSign: 'BG9TEST', joinedAt: new Date().toISOString(), stats: { cards: 0, likesReceived: 0 } },
          },
        ],
        recentCards: [
          {
            id: 'card-pending-1',
            title: '待审卡片测试',
            status: 'pending',
            stock: 2,
            liked: false,
            likeCount: 0,
            ratio: { w: 3, h: 2 },
            owner: regularLogin.user,
          },
        ],
      }),
    });
  });

  await page.route('**/api/exchanges/ex-mock-1/applicant-cards*', async route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pages: 1, hasUploadedCards: false }),
    });
  });

  await page.route('**/api/exchanges/ex-mock-1/approve', async route => {
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'OUT_OF_STOCK', message: '该卡片库存不足，请补充库存后再同意' } }),
    });
  });

  await page.route('**/api/exchanges/ex-mock-1/reject', async route => {
    mode = 'after-reject';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exchange: { id: 'ex-mock-1', status: 'rejected' } }),
    });
  });

  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/dashboard');
  }, regularLogin);

  // Judge workspace visible when canJudgeContest === true for regular user
  await expect(page.locator('[data-vue3="dashboard"] a[href="/events/qsl-design-2026-11/judging"]')).toBeVisible();
  await expect(page.locator('[data-vue3="dashboard"] .qsl-tile-status .badge')).toHaveText('审核中');
  await expect(page.locator('[data-vue3="dashboard"] .f-req')).toHaveCount(1);

  // Approve -> no-cards secondary confirmation -> OUT_OF_STOCK error -> cancel
  await page.locator('[data-vue3="dashboard"] [data-act="approve"]').click();
  const dialogs = page.locator('.modal-overlay');
  await expect(dialogs).toHaveCount(1);
  await dialogs.nth(0).getByRole('button', { name: '确认交换' }).click();
  await expect(dialogs).toHaveCount(2);
  await dialogs.nth(1).getByRole('button', { name: '确认交换' }).click();
  await expect(dialogs.nth(0).locator('[data-choice-error]')).toContainText('库存不足');
  await dialogs.nth(0).getByRole('button', { name: '取消' }).click();
  await expect(dialogs).toHaveCount(0);

  // Reject flow -> refreshes overview
  await page.locator('[data-vue3="dashboard"] [data-act="reject"]').click();
  await page.locator('[data-reject-reason]').fill('暂时不换卡');
  await page.locator('.modal-actions .btn-danger').click();
  await expect(page.locator('[data-vue3="dashboard"] .f-req')).toHaveCount(0);

  // Route round-trip to profile & English + reduced-motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-vue3="dashboard"] .f-dash-hero')).toBeVisible();
  await checkNoOverflow(page);

  // Ignore expected 409 console error from intentional OUT_OF_STOCK mock
  expect(errors.filter(msg => !/409 \(Conflict\)/.test(msg))).toEqual([]);
});

test('profile parses addresses locally, handles emoji Unicode limits, independent saves, password errors, and logout cleanup — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // Guest redirect
  await page.goto('/dashboard/profile');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile/);

  const config = await (await request.get('/api/config')).json();
  const regular = config.demoAccounts.find(item => item.role === '普通用户');
  const login = await (await request.post('/api/auth/login', { data: { identifier: regular.id, password: regular.pass } })).json();

  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/dashboard/profile');
  }, login);

  await expect(page.locator('[data-vue3="profile"] #fProfileForm')).toBeVisible();
  await checkNoOverflow(page);

  // Local address parser: no network requests, fills only empty fields
  const networkCalls = [];
  page.on('request', req => { if (req.url().includes('/api/')) networkCalls.push(req.url()); });

  await page.locator('#fAddrName').fill('已有姓名');
  await page.locator('#fAddrPhone').fill('');
  await page.locator('#fAddrProvince').fill('');
  await page.locator('#fAddrCity').fill('深圳市 南山区');
  await page.locator('#fAddrPostalCode').fill('');
  await page.locator('#fAddrLine1').fill('');
  await page.locator('#fAddressPaste').fill('新姓名 13800138000 广东省深圳市南山区科技南十二路18号 518000');
  await page.locator('[data-parse-address]').click();
  expect(networkCalls).toEqual([]);
  await expect(page.locator('#fAddrName')).toHaveValue('已有姓名');
  await expect(page.locator('#fAddrPhone')).toHaveValue('13800138000');
  await expect(page.locator('#fAddrDistrict')).toHaveValue('');
  await expect(page.locator('#fAddrLine1')).toHaveValue('科技南十二路18号');

  // Real browser emoji input (30 Unicode chars = 60 UTF-16 code units) is NOT truncated
  const thirtyEmoji = '📻'.repeat(30);
  await page.locator('#fProfileDisplayName').fill(thirtyEmoji);
  await expect(page.locator('#fProfileDisplayName')).toHaveValue(thirtyEmoji);
  await expect(page.locator('[data-summary-name]')).toHaveText(thirtyEmoji);

  // Save profile via real backend PUT /api/me/profile, then restore original displayName
  await page.locator('[data-save="profile"]').click();
  await expect(page.locator('#fProfileDisplayName')).toHaveValue(thirtyEmoji);
  await page.locator('#fProfileDisplayName').fill(login.user.displayName || login.user.username);
  await page.locator('[data-save="profile"]').click();

  // Password form: wrong current password shows field error and preserves input
  await page.locator('#fPwdCurrent').fill('WrongPass123');
  await page.locator('#fPwdNew').fill('ValidPass123');
  await page.locator('#fPwdConfirm').fill('ValidPass123');
  await page.locator('[data-save="password"]').click();
  await expect(page.locator('[data-error="currentPassword"]')).toBeVisible();
  await expect(page.locator('#fPwdCurrent')).toHaveValue('WrongPass123');

  // Logout immediately clears private state and redirects to login
  await page.evaluate(() => {
    window.__appTest.api.setToken(null);
    window.__appTest.setUser(null);
  });
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile/);
  await expect(page.locator('[data-vue3="profile"]')).toHaveCount(0);

  // Ignore expected 401 console error from intentional wrong-password test
  expect(errors.filter(msg => !/401 \(Unauthorized\)/.test(msg))).toEqual([]);
});
