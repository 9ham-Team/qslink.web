import { expect, test } from './fixtures.mjs';

const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

async function checkNoOverflow(page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
}

async function sessions(request) {
  const config = await (await request.get('/api/config')).json();
  const logins = await Promise.all(config.demoAccounts.map(async account => {
    const response = await request.post('/api/auth/login', {
      data: { identifier: account.id, password: account.pass },
    });
    expect(response.ok()).toBe(true);
    return { ...await response.json(), account };
  }));
  return {
    admin: logins.find(item => item.user.role === 'admin'),
    users: logins.filter(item => item.user.role === 'user'),
  };
}

async function makePngDataUrl(page, width = 120, height = 80) {
  return page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0eaf8f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 10, w - 20, h - 20);
    return c.toDataURL('image/png');
  }, { w: width, h: height });
}

async function createAndApproveCard(request, page, ownerToken, adminToken, { title, stock }) {
  const pngDataUrl = await makePngDataUrl(page);
  const createRes = await request.post('/api/cards', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      title,
      callSign: 'BG1E2E',
      notes: 'E2E test card',
      frontImage: pngDataUrl,
      backImage: pngDataUrl,
      stock,
      ratio: { w: 3, h: 2 },
      tags: ['E2E'],
      acceptTerms: true,
      termsVersion: '2026-10-25',
      acceptContentLicense: true,
    },
  });
  if (!createRes.ok()) {
    throw new Error(`create card failed (${createRes.status()}): ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const cardId = created.card.id;

  const approveRes = await request.put(`/api/admin/cards/${cardId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { status: 'approved' },
  });
  if (!approveRes.ok()) {
    throw new Error(`approve card failed (${approveRes.status()}): ${await approveRes.text()}`);
  }
  const detailRes = await request.get(`/api/cards/${cardId}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(detailRes.ok()).toBe(true);
  const detailData = await detailRes.json();
  return {
    cardId,
    shareToken: detailData.card.shortToken || detailData.card.shareToken,
  };
}

test('query-only exchanges navigation syncs box/status, history and rapid navigation without reloading — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const { users } = await sessions(request);
  const session = users[0];
  const listRequests = [];
  page.on('request', req => {
    if (new URL(req.url()).pathname === '/api/me/exchanges') listRequests.push(req.url());
  });

  await page.goto('/');
  await page.evaluate(s => {
    window.__appTest.api.setToken(s.token);
    window.__appTest.setUser(s.user);
    window.__appTest.navigate('/dashboard/exchanges?box=incoming&status=pending');
  }, session);
  await expect(page.locator('[data-box="incoming"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="pending"]')).toHaveClass(/is-active/);
  await page.locator('.f-exchanges').evaluate(element => {
    element.dataset.queryIdentity = 'same-exchanges';
  });

  await page.evaluate(() => window.__appTest.navigate('/dashboard/exchanges?box=outgoing&status=approved'));
  await expect(page.locator('[data-box="outgoing"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="approved"]')).toHaveClass(/is-active/);

  await page.evaluate(() => window.__appTest.navigate('/dashboard/exchanges?box=incoming&status=completed'));
  await page.goBack();
  await expect(page.locator('[data-box="outgoing"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="approved"]')).toHaveClass(/is-active/);
  await page.goForward();
  await expect(page.locator('[data-box="incoming"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="completed"]')).toHaveClass(/is-active/);

  await page.evaluate(() => {
    void window.__appTest.navigate('/dashboard/exchanges?box=outgoing&status=pending');
    void window.__appTest.navigate('/dashboard/exchanges?box=incoming&status=all');
  });
  await expect(page.locator('[data-box="incoming"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="all"]')).toHaveClass(/is-active/);

  await page.evaluate(() => window.__appTest.navigate('/dashboard/exchanges'));
  await expect(page).toHaveURL(/\/dashboard\/exchanges$/);
  await expect(page.locator('[data-box="incoming"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-ex-filters [data-status="all"]')).toHaveClass(/is-active/);
  await expect(page.locator('.f-exchanges')).toHaveAttribute('data-query-identity', 'same-exchanges');
  expect(listRequests).toHaveLength(1);
  await checkNoOverflow(page);
  expect(errors).toEqual([]);
});

test('exchange request modal, exchanges management, and logbook flows work end-to-end — vue3', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Intentional negative-path tests trigger HTTP 400 (fake.tq8), 429 (LoTW mock), and 409 (OUT_OF_STOCK).
    if (/Failed to load resource: the server responded with a status of (400|409|429)\b/.test(text)) return;
    errors.push(text);
  });

  // 1. Guest access guards
  await page.goto('/dashboard/exchanges');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fexchanges/);
  await page.goto('/dashboard/logbook');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Flogbook/);

  // 2. Setup seeded accounts & real approved card with stock=1
  const { admin, users } = await sessions(request);
  const owner = admin;
  const requester1 = users[0];
  const requester2 = users[1] || admin;

  const suffix = `${testInfo.project.name.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
  const { cardId, shareToken } = await createAndApproveCard(request, page, owner.token, admin.token, {
    title: `E2E Limited Card ${suffix}`,
    stock: 1,
  });

  const originalReq1CallSign = requester1.user.callSign || '';

  // Clear requester1 callSign first to verify missing-callsign lock
  const clearCallRes = await request.put('/api/me/profile', {
    headers: { Authorization: `Bearer ${requester1.token}` },
    data: { callSign: '' },
  });
  expect(clearCallRes.ok()).toBe(true);
  const clearedProfile = await clearCallRes.json();
  requester1.user = clearedProfile.user;

  // 3. Logbook: missing callsign lock -> update callsign -> reactive unlock -> ADIF import -> invalid TQ8 -> LoTW mock
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/dashboard/logbook');
  }, requester1);

  await expect(page.locator('section[data-vue3="logbook"]')).toBeVisible();
  await expect(page.locator('section[data-vue3="logbook"] form[data-file-import] button[type="submit"]')).toBeDisabled();

  // Update requester1 callsign on same account -> unlock reactively without page reload
  const reqCall = `BG2${suffix.slice(-3).toUpperCase()}`;
  const targetCall1 = `BG1${suffix.slice(-3).toUpperCase()}`;
  const targetCall2 = `JA1${suffix.slice(-3).toUpperCase()}`;
  const profileUpdateRes = await request.put('/api/me/profile', {
    headers: { Authorization: `Bearer ${requester1.token}` },
    data: { callSign: reqCall },
  });
  expect(profileUpdateRes.ok()).toBe(true);
  const updatedProfile = await profileUpdateRes.json();
  requester1.user = updatedProfile.user;
  await page.evaluate(user => {
    window.__appTest.setUser(user);
  }, updatedProfile.user);

  await expect(page.locator('section[data-vue3="logbook"] form[data-file-import] button[type="submit"]')).toBeEnabled();

  // Import valid UTF-8 ADIF via file input
  const adifContent = [
    '<ADIF_VER:5>3.1.4<EOH>',
    `<CALL:${targetCall1.length}>${targetCall1}<STATION_CALLSIGN:${reqCall.length}>${reqCall}<QSO_DATE:8>20260801<TIME_ON:4>1234<BAND:3>20m<MODE:3>FT8<RST_SENT:3>-10<RST_RCVD:3>-12<EOR>`,
    `<CALL:${targetCall2.length}>${targetCall2}<STATION_CALLSIGN:${reqCall.length}>${reqCall}<QSO_DATE:8>20260802<TIME_ON:4>0506<BAND:3>40m<MODE:2>CW<RST_SENT:3>599<RST_RCVD:3>579<EOR>`,
  ].join('\n');

  await page.locator('section[data-vue3="logbook"] form[data-file-import] input[name="file"]').setInputFiles({
    name: 'sample.adi',
    mimeType: 'text/plain',
    buffer: Buffer.from(adifContent, 'utf8'),
  });
  await page.locator('section[data-vue3="logbook"] form[data-file-import] button[type="submit"]').click();
  await expect(page.locator('section[data-vue3="logbook"] [data-result]')).toContainText('新增 2 条');
  await expect(page.locator('section[data-vue3="logbook"] table.table')).toContainText('2026-08-01 12:34:00');
  await expect(page.locator('section[data-vue3="logbook"] table.table')).toContainText(targetCall1);

  // Re-import same ADIF -> duplicates count
  await page.locator('section[data-vue3="logbook"] form[data-file-import] button[type="submit"]').click();
  await expect(page.locator('section[data-vue3="logbook"] [data-result]')).toContainText('重复 2 条');

  // Renamed ADIF as .tq8 -> rejected by backend
  await page.locator('section[data-vue3="logbook"] form[data-file-import] input[name="file"]').setInputFiles({
    name: 'fake.tq8',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(adifContent, 'utf8'),
  });
  await page.locator('section[data-vue3="logbook"] form[data-file-import] button[type="submit"]').click();
  await expect(page.locator('section[data-vue3="logbook"] [data-result]')).toBeVisible();
  await expect(page.locator('section[data-vue3="logbook"] [data-result]')).not.toContainText('导入完成');

  // Search logbook by callsign
  await page.locator('section[data-vue3="logbook"] form[data-search] input[name="q"]').fill(targetCall2);
  await page.locator('section[data-vue3="logbook"] form[data-search] button[type="submit"]').click();
  await expect(page.locator('section[data-vue3="logbook"] table.table')).toContainText(targetCall2);
  await expect(page.locator('section[data-vue3="logbook"] table.table')).not.toContainText(targetCall1);

  // Mock external LoTW endpoint (429 rate limit) -> preserves session & clears password
  await page.route('**/api/me/logbook/lotw', async route => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'RATE_LIMITED', error: '操作过于频繁，请 1 分钟后再试' }),
    });
  });
  await page.locator('section[data-vue3="logbook"] form[data-lotw] input[name="username"]').fill(reqCall);
  await page.locator('section[data-vue3="logbook"] form[data-lotw] input[name="password"]').fill('temp-secret-not-saved');
  await page.locator('section[data-vue3="logbook"] form[data-lotw] button[type="submit"]').click();
  await expect(page.locator('section[data-vue3="logbook"] [data-result]')).toContainText('频繁');
  await expect(page.locator('section[data-vue3="logbook"] form[data-lotw] input[name="password"]')).toHaveValue('');
  expect(await page.evaluate(() => Boolean(window.__appTest.api.token && window.__appTest.store.user))).toBe(true);
  await page.unroute('**/api/me/logbook/lotw');

  // 4. Exchange Request Modal from Share page & Card Detail page
  await page.evaluate(url => window.__appTest.navigate(url), `/share/${shareToken}`);
  await expect(page.locator('[data-vue3="share"] h1.g-share__title')).toBeVisible();
  await page.locator('[data-vue3="share"] .g-share__cta .btn-primary').filter({ visible: true }).first().click();
  await expect(page.locator('[data-xreq-form]')).toBeVisible();

  // Duplicate open while already open does not create a second modal
  await page.evaluate(id => window.__appTest.exchangeRequest.open({ id, title: 'Dup', owner: {} }), cardId);
  await expect(page.locator('[data-xreq-form]')).toHaveCount(1);

  // Close via route navigation
  await page.evaluate(id => window.__appTest.navigate(`/card/${id}`), cardId);
  await expect(page.locator('[data-xreq-form]')).toHaveCount(0);
  await expect(page.locator('.g-detail[data-vue3="card-detail"]')).toBeVisible();

  // Open on Card Detail, validate, select contact log, submit
  await page.locator('[data-vue3="card-detail"] [data-apply]').click();
  await expect(page.locator('[data-xreq-form]')).toBeVisible();

  await page.locator('[data-xreq-form] input[name="name"]').fill('');
  await page.locator('[data-vue3="dialog"] .modal .btn-primary').click();
  await expect(page.locator('[data-xreq-form] [data-error="name"]')).not.toBeEmpty();

  await page.locator('[data-xreq-form] input[name="name"]').fill('李四');
  await page.locator('[data-xreq-form] input[name="city"]').fill('南京市');
  await page.locator('[data-xreq-form] input[name="line1"]').fill('南京市鼓楼区中山北路 1 号');
  await page.locator('[data-xreq-form] textarea[name="message"]').fill(`73 de ${reqCall}`);

  // Select one contact log from list
  await page.locator('[data-log-options] input[type="checkbox"]').first().check();
  await expect(page.locator('[data-log-selected-count]')).toContainText('1');

  await page.locator('[data-vue3="dialog"] .modal .btn-primary').click();
  await expect(page).toHaveURL(/\/dashboard\/exchanges\?box=outgoing/);
  const createdCardItem = page.locator('.f-exchanges[data-vue3="exchanges"] article.f-ex', { hasText: `E2E Limited Card ${suffix}` });
  await expect(createdCardItem).toHaveCount(1);
  await expect(createdCardItem.locator('.f-ex-submitted-logs')).toHaveCount(1);
  // Pending outgoing exchange must NOT expose address
  await expect(createdCardItem.locator('.f-addr')).toHaveCount(0);

  // Create second pending exchange from requester2 via API so we can test OUT_OF_STOCK on stock=1
  const req2ExRes = await request.post(`/api/cards/${cardId}/exchanges`, {
    headers: { Authorization: `Bearer ${requester2.token}` },
    data: {
      message: 'Second request',
      contactName: '王五',
      address: { name: '王五', country: '中国', province: '浙江省', city: '杭州市', line1: '西湖区西湖路 2 号' },
    },
  });
  expect(req2ExRes.ok()).toBe(true);

  // 5. Switch to Owner -> /dashboard/exchanges incoming -> Approve -> OUT_OF_STOCK -> Complete
  await page.evaluate(session => {
    window.__appTest.api.setToken(session.token);
    window.__appTest.setUser(session.user);
    window.__appTest.navigate('/dashboard/exchanges?box=incoming&status=pending');
  }, owner);

  const pendingCards = page.locator('.f-exchanges[data-vue3="exchanges"] article.f-ex', { hasText: `E2E Limited Card ${suffix}` });
  await expect(pendingCards).toHaveCount(2);

  // Approve first pending exchange
  await pendingCards.first().locator('[data-ex-act="approve"]').click();
  const dialogs = page.locator('[data-vue3="dialog"] .modal');
  await expect(dialogs.first()).toBeVisible();
  await expect(dialogs.first().locator('.btn-primary')).toBeEnabled();
  await dialogs.first().locator('.btn-primary').click();

  // If applicant has no uploaded cards, handle nested secondary confirmation & Escape isolation
  if ((await dialogs.count()) === 2) {
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(1);
    await dialogs.first().locator('.btn-primary').click();
    await expect(dialogs).toHaveCount(2);
    await dialogs.nth(1).locator('.btn-primary').click();
  }

  // Approved -> remaining pending count for this card becomes 1
  await expect(pendingCards).toHaveCount(1);

  // Try approving second pending exchange -> OUT_OF_STOCK error and item remains pending
  await pendingCards.first().locator('[data-ex-act="approve"]').click();
  await expect(dialogs.first()).toBeVisible();
  await expect(dialogs.first().locator('.btn-primary')).toBeEnabled();
  await dialogs.first().locator('.btn-primary').click();
  if ((await dialogs.count()) === 2) {
    await dialogs.nth(1).locator('.btn-primary').click();
  }
  await expect(dialogs.first().locator('[data-choice-error]')).toContainText('库存');
  await dialogs.first().locator('.modal-x').click();

  // Reject the second pending exchange
  await pendingCards.first().locator('[data-ex-act="reject"]').click();
  await page.locator('[data-reject-reason]').fill('库存已发完');
  await page.locator('[data-vue3="dialog"] .modal .btn-danger').click();
  await expect(pendingCards).toHaveCount(0);

  // Switch status chip to approved -> address visible + copyable -> mark complete
  await page.locator('.f-exchanges[data-vue3="exchanges"] [data-status="approved"]').click();
  await expect(page).toHaveURL(/status=approved/);
  const approvedCardItem = page.locator('.f-exchanges[data-vue3="exchanges"] article.f-ex', { hasText: `E2E Limited Card ${suffix}` });
  await expect(approvedCardItem.locator('.f-addr').first()).toBeVisible();
  await approvedCardItem.locator('[data-ex-act="copy-address"]').first().click();
  await approvedCardItem.locator('[data-ex-act="complete"]').click();
  await page.locator('[data-vue3="dialog"] .modal .btn-primary').click();

  await page.locator('.f-exchanges[data-vue3="exchanges"] [data-status="completed"]').click();
  await expect(page.locator('.f-exchanges[data-vue3="exchanges"] article.f-ex', { hasText: `E2E Limited Card ${suffix}` })).toHaveCount(1);

  // 6. Mobile viewport + reduced motion + English i18n check
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/exchanges?lang=en');
  await expect(page.locator('.f-exchanges[data-vue3="exchanges"]')).toBeVisible();
  await checkNoOverflow(page);

  await page.goto('/dashboard/logbook?lang=en');
  await expect(page.locator('section[data-vue3="logbook"]')).toBeVisible();
  await checkNoOverflow(page);

  await request.put('/api/me/profile', {
    headers: { Authorization: `Bearer ${requester1.token}` },
    data: { callSign: originalReq1CallSign },
  });

  expect(errors).toEqual([]);
});
