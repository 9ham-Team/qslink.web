import { test, expect } from '@playwright/test';
const eventPath = '/events/qsl-design-2026-11';
const eventApi = '/api/contests/qsl-design-2026-11';
async function sessions(request) {
  const config = await (await request.get('/api/config')).json();
  const logins = await Promise.all(config.demoAccounts.map(async account => {
    const response = await request.post('/api/auth/login', { data: { identifier: account.id, password: account.pass } });
    expect(response.ok()).toBe(true); return { ...await response.json(), account };
  }));
  return { admin: logins.find(item => item.user.role === 'admin'), users: logins.filter(item => item.user.role === 'user') };
}
async function authenticate(page, session, path) {
  await page.goto('/');
  await page.evaluate(({ session, path }) => { window.QSL.api.setToken(session.token); window.QSL.setUser(session.user); window.QSL.navigate(path); }, { session, path });
}
async function approve(request, admin, entry) {
  if (entry.status === 'approved') return entry;
  const response = await request.put('/api/admin/contests/qsl-design-2026-11/entries/' + entry.id + '/review', {
    headers: { Authorization: 'Bearer ' + admin.token }, data: { status: 'approved', expectedRevision: entry.revision },
  });
  expect(response.ok()).toBe(true); return (await response.json()).entry;
}

test('Vue contest layouts preserve rules, news and prize progress in both languages — vue3', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const path of [eventPath, eventPath + '/alternate']) {
    await page.goto(path);
    await expect(page.locator('[data-vue3="qsl-design-contest"] h1')).toBeVisible();
    await expect(page.locator('.f-contest-prizes')).toBeVisible();
    await expect(page.locator('progress')).toBeVisible();
    await expect(page.locator('.f-contest-score-weights')).toBeVisible();
    expect(await page.locator('#contest-news-title').evaluate(node => !!(node.compareDocumentPosition(document.querySelector('.f-contest-prizes')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.goto(eventPath + '?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-vue3="qsl-design-contest"] h1')).toContainText('QSLink');
  await page.locator('#rules').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('contest-rules-vue3.png') });
  expect(errors).toEqual([]);
  await page.goto(eventPath + '#rules');
  await expect(page.locator('progress')).toBeVisible();
  await expect.poll(() => page.locator('#rules').evaluate(node => Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))))
    .toBeLessThan(30);
});

test('real registration, moderation, public work details and non-optimistic voting — vue3', async ({ page, request }, testInfo) => {
  const { admin, users } = await sessions(request);
  const user = users[testInfo.project.name === 'desktop-vue3' ? 0 : 1];
  await authenticate(page, user, eventPath + '/registration');
  const root = page.locator('[data-vue3="qsl-design-registration"]');
  if (await root.getByRole('button', { name: '修改报名信息', exact: true }).count()) await root.getByRole('button', { name: '修改报名信息', exact: true }).click();
  await root.getByRole('button', { name: '选择参赛卡片', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择参赛卡片', exact: true });
  await picker.locator('input[type=checkbox]').first().check();
  await picker.getByRole('button', { name: '确认', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '确认参赛卡片', exact: true });
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  await root.getByRole('button', { name: /^编辑作品说明：/ }).click();
  const editor = page.getByRole('dialog', { name: '作品说明', exact: true });
  await editor.locator('textarea').fill('Vue3 browser verified design description');
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
  await root.locator('input[name=contactEmail]').fill(user.user.email);
  const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(eventApi + '/entry'));
  await root.locator('button[type=submit]').click();
  const savedResponse = await saved; expect(savedResponse.ok()).toBe(true);
  const entry = await approve(request, admin, (await savedResponse.json()).entry);
  await expect(root).toContainText('作品说明审核中');
  const settings = await (await request.get('/api/admin/contests/qsl-design-2026-11/voting', { headers: { Authorization: 'Bearer ' + admin.token } })).json();
  const set = await request.put('/api/admin/contests/qsl-design-2026-11/voting', { headers: { Authorization: 'Bearer ' + admin.token },
    data: { startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), expectedRevision: settings.voting.revision } });
  expect(set.ok()).toBe(true);
  const work = entry.works[0];
  await page.evaluate(path => window.QSL.navigate(path), eventPath + '/works');
  await expect(page.locator('[data-work-id="' + work.id + '"]')).toBeVisible();
  await expect(page.locator('[data-vue3="qsl-design-works"] .qsl-like')).toHaveCount(0);
  await page.locator('[data-work-id="' + work.id + '"] .qsl-tile-media').click();
  await expect(page.locator('[data-vue3="qsl-design-work-detail"] .card3d')).toBeVisible();
  const vote = page.getByRole('button', { name: '为这件作品投票', exact: true });
  await vote.click();
  const dialog = page.getByRole('dialog', { name: '确认投票', exact: true });
  const voted = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/vote'));
  await dialog.getByRole('button', { name: '确认投票', exact: true }).click();
  expect((await voted).ok()).toBe(true);
  await expect(page.getByRole('button', { name: '已投票', exact: true })).toBeDisabled();
  await expect(page.locator('.g-contest-detail__voting strong')).toHaveText('1 票');
  await page.getByRole('button', { name: '分享作品', exact: true }).click();
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '分享参赛作品', exact: true }) })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('contest-work-vue3.png') });
});

test('real judge permissions, private blob images, saved zero scores and completion remain separate — vue3', async ({ page, request }, testInfo) => {
  const { admin, users } = await sessions(request);
  const adminHeaders = { Authorization: 'Bearer ' + admin.token };
  // Populate at least one approved work even when this test is run on its own.
  const entrant = users[testInfo.project.name === 'desktop-vue3' ? 0 : 1];
  const ownHeaders = { Authorization: 'Bearer ' + entrant.token };
  let entry = (await (await request.get(eventApi + '/entry', { headers: ownHeaders })).json()).entry;
  if (!entry) {
    const mine = await (await request.get('/api/me/cards', { headers: ownHeaders })).json();
    const card = mine.items.find(card => card.status === 'approved');
    entry = (await (await request.put(eventApi + '/entry', { headers: ownHeaders, data: { works: [{ cardId: card.id, description: 'Judge fixture' }], contactEmail: entrant.user.email } })).json()).entry;
  }
  await approve(request, admin, entry);
  let state = (await (await request.get('/api/admin/contests/qsl-design-2026-11/judging', { headers: adminHeaders })).json()).judging;
  const judges = users.slice(2, 7);
  const configured = await request.put('/api/admin/contests/qsl-design-2026-11/judging', { headers: adminHeaders,
    data: { expectedRevision: state.revision, deadline: new Date(Date.now() + 3600000).toISOString(), judgeUserIds: judges.map(judge => judge.user.id) } });
  expect(configured.ok()).toBe(true); state = (await configured.json()).judging;
  if (!state.frozenAt) { const started = await request.post('/api/admin/contests/qsl-design-2026-11/judging/start', { headers: adminHeaders, data: { expectedRevision: state.revision } }); expect(started.ok()).toBe(true); }
  expect((await request.get(eventApi + '/judging', { headers: ownHeaders })).status()).toBe(403);
  const judge = judges[0]; const paths = [];
  page.on('request', req => { if (req.url().includes('/judging')) paths.push(req.url()); });
  await authenticate(page, judge, eventPath + '/judging');
  const root = page.locator('[data-vue3="qsl-design-judging"]');
  await expect(root.locator('.f-judging-work').first()).toBeVisible();
  await expect(root.locator('img').first()).toHaveAttribute('src', /^blob:/);
  const count = await root.locator('.f-judging-work').count();
  for (let i = 0; i < count; i++) {
    await root.locator('.f-judging-work').nth(i).click();
    await root.locator('input[name=score]').fill(i === 0 ? '0' : '8.5');
    await root.locator('textarea[name=comment]').fill('Browser score check');
    const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/score'));
    await root.getByRole('button', { name: '保存此作品评分', exact: true }).click(); expect((await saved).ok()).toBe(true);
  }
  await root.getByRole('button', { name: '标记评分完成', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '标记评分完成', exact: true });
  const done = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/judging/submit'));
  await confirmation.getByRole('button', { name: '确认标记完成', exact: true }).click(); expect((await done).ok()).toBe(true);
  await expect(root.locator('input[name=score]')).toBeEnabled();
  await root.locator('input[name=score]').fill('7');
  await root.getByRole('button', { name: '保存此作品评分', exact: true }).click();
  await expect(root.getByRole('button', { name: '标记评分完成', exact: true })).toBeEnabled();
  expect(paths.every(path => !path.includes('/api/admin/') && !path.includes('token=') && !path.includes('/results'))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('contest-judging-vue3.png') });
  await page.route('**/api/contests/qsl-design-2026-11/judging', route => route.fulfill({ status: 403, json: { error: { message: 'permission revoked' } } }));
  await root.getByRole('button', { name: '刷新评审数据', exact: true }).click();
  await expect(root.locator('input[name=score]')).toHaveCount(0);
  await expect(root.locator('img')).toHaveCount(0);
});
