import { expect, test } from './fixtures.mjs';

async function checkNoOverflow(page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
}

async function makePngBuffer(page, width = 120, height = 80) {
  const b64 = await page.evaluate(({ w, h }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0eaf8f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 10, w - 20, h - 20);
    return c.toDataURL('image/png').split(',')[1];
  }, { w: width, h: height });
  return Buffer.from(b64, 'base64');
}

async function loginAs(page, request, role = '普通用户') {
  const config = await (await request.get('/api/config')).json();
  const account = config.demoAccounts.find(item => item.role === role);
  const res = await request.post('/api/auth/login', {
    data: { identifier: account.id, password: account.pass },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

test('my-cards guards guests, filters status, updates stock, deletes cards, and passes mobile/desktop checks — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 1. Guest redirect
  await page.goto('/dashboard/cards');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fcards/);

  // 2. Login & navigate to my-cards
  const session = await loginAs(page, request, '普通用户');
  const chunks = [];
  page.on('request', req => { if (req.url().includes('/build/')) chunks.push(req.url()); });

  await page.evaluate(s => {
    window.__appTest.api.setToken(s.token);
    window.__appTest.setUser(s.user);
    window.__appTest.navigate('/dashboard/cards?status=pending');
  }, session);

  await expect(page.locator('[data-vue3="my-cards"] .f-cards-toolbar')).toBeVisible();
  expect(chunks.some(url => /MyCards/.test(url))).toBe(true);
  await expect(page.locator('[data-filter="pending"]')).toHaveClass(/is-active/);
  await page.locator('[data-vue3="my-cards"]').evaluate(element => {
    element.dataset.queryIdentity = 'same-my-cards';
  });

  // Same pathname, query-only deep links must update the local filter without remounting.
  await page.evaluate(() => window.__appTest.navigate('/dashboard/cards?status=approved'));
  await expect(page.locator('[data-filter="approved"]')).toHaveClass(/is-active/);
  await page.evaluate(() => window.__appTest.navigate('/dashboard/cards?status=pending'));
  await expect(page.locator('[data-filter="pending"]')).toHaveClass(/is-active/);
  await page.goBack();
  await expect(page.locator('[data-filter="approved"]')).toHaveClass(/is-active/);
  await page.goForward();
  await expect(page.locator('[data-filter="pending"]')).toHaveClass(/is-active/);

  // Rapid navigation must converge on the last query while keeping the same page instance.
  await page.evaluate(() => {
    void window.__appTest.navigate('/dashboard/cards?status=rejected');
    void window.__appTest.navigate('/dashboard/cards?status=approved');
  });
  await expect(page.locator('[data-filter="approved"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-vue3="my-cards"]')).toHaveAttribute('data-query-identity', 'same-my-cards');
  await checkNoOverflow(page);

  // Clearing the query resets the same page to "all".
  await page.locator('[data-filter="all"]').click();
  await expect(page).toHaveURL(/\/dashboard\/cards$/);
  await expect(page.locator('[data-filter="all"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-vue3="my-cards"]')).toHaveAttribute('data-query-identity', 'same-my-cards');
  await expect(page.locator('.f-card-cell').first()).toBeVisible();

  // 3. Create a synthetic card via API so we can test stock & delete on real backend without touching other demo cards
  const pngBuf = await makePngBuffer(page, 160, 100);
  const frontDataUrl = 'data:image/png;base64,' + pngBuf.toString('base64');
  const createRes = await request.post('/api/cards', {
    headers: { Authorization: 'Bearer ' + session.token },
    data: {
      acceptTerms: true,
      termsVersion: '2026-10-25',
      acceptContentLicense: true,
      title: 'E2E 临时测试卡',
      callSign: 'BG4E2E',
      notes: '测试库存与删除',
      ratio: { w: 3, h: 2 },
      frontImage: frontDataUrl,
      stock: 5,
    },
  });
  expect(createRes.ok()).toBe(true);
  const created = await createRes.json();
  const createdId = created.card.id;

  // Reload my-cards to see the newly created card
  await page.reload();
  const targetCell = page.locator(`.f-card-cell[data-card-id="${createdId}"]`);
  await expect(targetCell).toBeVisible();

  // 4. Stock modal: invalid -> 0 -> blank (null)
  await targetCell.locator('[data-act="stock"]').click();
  const stockModal = page.locator('[data-vue3="dialog"]');
  await expect(stockModal).toBeVisible();
  await stockModal.locator('[data-stock]').fill('-1');
  await stockModal.locator('[data-stock-save]').click();
  await expect(stockModal.locator('[data-stock-error]')).toBeVisible();

  await stockModal.locator('[data-stock]').fill('0');
  await stockModal.locator('[data-stock-save]').click();
  await expect(stockModal).toBeHidden();
  await expect(targetCell.locator('.qsl-tile-info .hint')).toContainText('暂无库存');

  // 5. Delete: cancel first, then confirm
  await targetCell.locator('[data-act="delete"]').click();
  await expect(page.locator('[data-vue3="dialog"]')).toBeVisible();
  await page.locator('[data-vue3="dialog"] .btn-ghost').click();
  await expect(targetCell).toBeVisible();

  await targetCell.locator('[data-act="delete"]').click();
  await page.locator('[data-confirm-delete]').click();
  await expect(targetCell).toHaveCount(0);

  // 6. Mobile 375px check
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('[data-vue3="my-cards"] .f-cards-toolbar')).toBeVisible();
  await checkNoOverflow(page);

  expect(errors).toEqual([]);
});

test('card-editor handles WebP conversion, Unicode limits, edit stock isolation, ownership, unsaved guard, and English/reduced-motion — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 1. Guest redirect
  await page.goto('/dashboard/cards/new');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fcards%2Fnew/);

  const session = await loginAs(page, request, '普通用户');
  const adminSession = await loginAs(page, request, '管理员');

  await page.evaluate(s => {
    window.__appTest.api.setToken(s.token);
    window.__appTest.setUser(s.user);
    window.__appTest.navigate('/dashboard/cards/new');
  }, session);

  await expect(page.locator('[data-vue3="card-editor"] #fEditorForm')).toBeVisible();
  await checkNoOverflow(page);

  // 2. Upload synthetic PNG -> converted to WebP in browser
  const pngBuf = await makePngBuffer(page, 240, 160);
  await page.locator('[data-upload-side="front"] input[type="file"]').setInputFiles({
    name: 'front-test.png',
    mimeType: 'image/png',
    buffer: pngBuf,
  });
  await expect(page.locator('[data-upload-side="front"]')).toHaveClass(/has-image/);
  const frontPreviewSrc = await page.locator('[data-upload-side="front"] [data-preview-img]').getAttribute('src');
  expect(frontPreviewSrc).toMatch(/^data:image\/webp;base64,/);

  // Invalid file type rejected and keeps valid front image
  await page.locator('[data-upload-side="front"] input[type="file"]').setInputFiles({
    name: 'bad.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not-an-image'),
  });
  await expect(page.locator('[data-upload-side="front"] [data-preview-img]')).toHaveAttribute('src', /^data:image\/webp;base64,/);

  // 3. Unicode 60-emoji title & callSign uppercase
  const emojiTitle = '📻'.repeat(60);
  await page.locator('#fCardTitle').fill(emojiTitle);
  await expect(page.locator('[data-counter="title"]')).toContainText('60 / 60');
  await page.locator('#fCardCallSign').fill('bg4test');
  await expect(page.locator('#fCardCallSign')).toHaveValue('BG4TEST');
  await page.locator('#fCardStock').fill('3');

  // 3b. Contest auto-entry modal: save draft description
  await page.locator('[data-contest-optin]').click();
  const contestModal = page.locator('[data-vue3="dialog"]');
  await expect(contestModal).toBeVisible();
  await contestModal.locator('[data-contest-text]').fill('我的参赛设计说明');
  await contestModal.locator('[data-contest-save]').click();
  await expect(contestModal).toBeHidden();
  await expect(page.locator('[data-contest-preview]')).toContainText('我的参赛设计说明');

  // 4. Unsaved guard on browser Back (popstate)
  await expect(page.locator('[data-unsaved]')).toBeVisible();
  await page.goBack();
  const leaveDialog = page.locator('[data-vue3="dialog"]');
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.locator('.btn-ghost').click();
  await expect(leaveDialog).toBeHidden();
  await expect(page.locator('#fCardTitle')).toHaveValue(emojiTitle);

  // 5. Submit create card -> verify payload has converted WebP and navigates to /dashboard/cards
  let capturedCreatePayload = null;
  page.on('request', req => {
    if (req.url().endsWith('/api/cards') && req.method() === 'POST') {
      capturedCreatePayload = JSON.parse(req.postData() || '{}');
    }
  });

  await page.locator('[name="contentConsent"]').check();
  const createRespPromise = page.waitForResponse(r => r.url().endsWith('/api/cards') && r.request().method() === 'POST');
  await page.locator('.f-editor-actions [data-submit]').click();
  const createResp = await createRespPromise;
  expect(createResp.status()).toBe(201);
  const createdBody = await createResp.json();
  const createdId = createdBody.card.id;

  expect(capturedCreatePayload.frontImage).toMatch(/^data:image\/webp;base64,/);
  expect(capturedCreatePayload.acceptTerms).toBe(true);
  expect(capturedCreatePayload.termsVersion).toBe('2026-10-25');
  expect(capturedCreatePayload.acceptContentLicense).toBe(true);
  expect(capturedCreatePayload.stock).toBe(3);
  expect(capturedCreatePayload.contestOptIn).toBe(true);
  expect(capturedCreatePayload.contestDescription).toBe('我的参赛设计说明');

  await expect(page).toHaveURL(/\/dashboard\/cards$/);

  // 6. Edit mode: verify stock dialog isolation & PUT omits stock
  await page.evaluate(id => { window.__appTest.navigate(`/dashboard/cards/${id}/edit`); }, createdId);
  await expect(page.locator('[data-vue3="card-editor"] #fCardStock')).toBeEnabled();
  await page.locator('#fCardTitle').fill('编辑后的新标题');
  await expect(page.locator('[data-unsaved]')).toBeVisible();

  await page.locator('#fCardStock').click();
  const stockModal = page.locator('[data-vue3="dialog"]');
  await stockModal.locator('[data-stock]').fill('8');
  await stockModal.locator('[data-stock-save]').click();
  await expect(stockModal).toBeHidden();
  await expect(page.locator('#fCardTitle')).toHaveValue('编辑后的新标题');
  await expect(page.locator('[data-unsaved]')).toBeVisible();

  let capturedUpdatePayload = null;
  page.on('request', req => {
    if (req.url().endsWith(`/api/cards/${createdId}`) && req.method() === 'PUT') {
      capturedUpdatePayload = JSON.parse(req.postData() || '{}');
    }
  });
  await page.locator('[name="contentConsent"]').check();
  const updateRespPromise = page.waitForResponse(r => r.url().endsWith(`/api/cards/${createdId}`) && r.request().method() === 'PUT');
  await page.locator('.f-editor-actions [data-submit]').click();
  expect((await updateRespPromise).status()).toBe(200);
  expect('stock' in capturedUpdatePayload).toBe(false);
  await expect(page).toHaveURL(/\/dashboard\/cards$/);

  // 7. Admin cannot edit another user's card
  await page.evaluate(({ s, id }) => {
    window.__appTest.api.setToken(s.token);
    window.__appTest.setUser(s.user);
    window.__appTest.navigate(`/dashboard/cards/${id}/edit`);
  }, { s: adminSession, id: createdId });
  await expect(page.locator('[data-vue3="card-editor"]')).toContainText('只能编辑自己的卡片');

  // 8. Non-existent card shows 404 error panel with back link
  expect(errors).toEqual([]);
  await page.evaluate(() => { window.__appTest.navigate('/dashboard/cards/nonexistent-id-404/edit'); });
  await expect(page.locator('[data-vue3="card-editor"] .empty-state')).toBeVisible();
  expect(errors.every(e => e.includes('404 (Not Found)'))).toBe(true);
  errors.length = 0;

  // 9. English + reduced-motion + 375px mobile viewport
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/dashboard/cards/new?lang=en');
  await expect(page.locator('[data-vue3="card-editor"] .page-title')).toContainText('Upload a new card');
  await checkNoOverflow(page);

  // Clean up synthetic card
  await request.delete(`/api/cards/${createdId}`, { headers: { Authorization: 'Bearer ' + session.token } });
  expect(errors).toEqual([]);
});

test('card-editor leave guard preserves browser history, forward stack, multi-step navigation, and history.state — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const session = await loginAs(page, request, '普通用户');

  // 1. Clean page: / -> /explore (with custom history.state) -> /dashboard/cards/new -> Back -> Forward
  await page.goto('/');
  await page.evaluate(s => {
    window.__appTest.api.setToken(s.token);
    window.__appTest.setUser(s.user);
    window.__appTest.navigate('/explore');
  }, session);
  await expect(page.locator('[data-vue3="explore"]')).toBeVisible();
  await page.evaluate(() => {
    history.replaceState({ ...(history.state || {}), exploreMarker: 'keep-me' }, '', location.href);
    window.__appTest.navigate('/dashboard/cards/new');
  });
  await expect(page.locator('[data-vue3="card-editor"] #fCardTitle')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator('[data-vue3="explore"]')).toBeVisible();
  const exploredState = await page.evaluate(() => history.state);
  expect(exploredState.exploreMarker).toBe('keep-me');
  expect(exploredState.current).toBe('/explore');
  expect(typeof exploredState.position).toBe('number');
  expect('back' in exploredState).toBe(true);
  expect('forward' in exploredState).toBe(true);

  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard\/cards\/new$/);
  await expect(page.locator('[data-vue3="card-editor"] #fCardTitle')).toBeVisible();

  // 2. Dirty editor: Back -> Cancel keeps draft & URL -> Back -> Confirm returns to /explore with state preserved -> Forward still works
  await page.locator('#fCardTitle').fill('保留历史草稿');
  await page.evaluate(() => {
    history.replaceState({ ...(history.state || {}), editorMarker: 'editor-state' }, '', location.href);
  });

  await page.goBack();
  const leaveDialog = page.locator('[data-vue3="dialog"]');
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.locator('.btn-ghost').click();
  await expect(leaveDialog).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard\/cards\/new$/);
  await expect(page.locator('#fCardTitle')).toHaveValue('保留历史草稿');
  expect(await page.evaluate(() => history.state && history.state.editorMarker)).toBe('editor-state');

  await page.goBack();
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.locator('[data-leave-confirm]').click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator('[data-vue3="explore"]')).toBeVisible();
  expect(await page.evaluate(() => history.state && history.state.exploreMarker)).toBe('keep-me');

  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard\/cards\/new$/);
  await expect(page.locator('[data-vue3="card-editor"] #fCardTitle')).toBeVisible();

  // 3. Multi-step history.go(-2) to / -> Cancel stays on editor -> Confirm jumps 2 steps back to /
  await page.locator('#fCardTitle').fill('多步历史测试');
  await page.evaluate(() => { history.go(-2); });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.locator('.btn-ghost').click();
  await expect(leaveDialog).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard\/cards\/new$/);
  await expect(page.locator('#fCardTitle')).toHaveValue('多步历史测试');

  await page.evaluate(() => { history.go(-2); });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.locator('[data-leave-confirm]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-vue3="home"]')).toBeVisible();

  expect(errors).toEqual([]);
});
