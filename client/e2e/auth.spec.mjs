import { expect, test } from '@playwright/test';

test('login handles validation, errors, retry, demo fill, and safe next redirects — vue3', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const cards = await (await request.get('/api/cards?limit=1')).json();
  const cardId = cards.items[0].id;
  const validNext = `/card/${cardId}?from=auth#viewer`;

  // Invalid next values must be rejected by QSL.safeNext
  await page.goto('/login?next=' + encodeURIComponent('https://evil.com'));
  await expect(page.locator('[data-vue3="login"] form')).toBeVisible();
  await expect(page.locator('[data-vue3="login"] .f-auth-alt a')).toHaveAttribute('href', '/register');
  const safeNextChecks = await page.evaluate(() => ({
    ext: window.QSL.safeNext('https://evil.com'),
    protoRel: window.QSL.safeNext('//evil.com'),
    backslash: window.QSL.safeNext('/\\evil.com'),
    encodedBackslash: window.QSL.safeNext('/%5cevil.com'),
    doubleBackslash: window.QSL.safeNext('\\\\evil.com'),
    loginSelf: window.QSL.safeNext('/login?next=/'),
    registerSelf: window.QSL.safeNext('/register'),
    valid: window.QSL.safeNext('/card/abc?tab=info#front'),
  }));
  expect(safeNextChecks).toEqual({
    ext: null,
    protoRel: null,
    backslash: null,
    encodedBackslash: null,
    doubleBackslash: null,
    loginSelf: null,
    registerSelf: null,
    valid: '/card/abc?tab=info#front',
  });

  // Valid next is preserved across login <-> register links
  await page.goto('/login?next=' + encodeURIComponent(validNext));
  await expect(page.locator('[data-vue3="login"] .f-auth-alt a')).toHaveAttribute('href', '/register?next=' + encodeURIComponent(validNext));
  await page.locator('[data-vue3="login"] .f-auth-alt a').click();
  await expect(page.locator('[data-vue3="register"] form')).toBeVisible();
  await expect(page.locator('[data-vue3="register"] .f-auth-alt a')).toHaveAttribute('href', '/login?next=' + encodeURIComponent(validNext));
  await page.locator('[data-vue3="register"] .f-auth-alt a').click();
  await expect(page.locator('[data-vue3="login"] form')).toBeVisible();

  // Mock error responses before real login
  let mode = 'invalid';
  let releasePending;
  await page.route('**/api/auth/login', async route => {
    if (mode === 'real') return route.continue();
    if (mode === 'hold') {
      await new Promise(resolve => { releasePending = resolve; });
      return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }) });
    }
    if (mode === 'invalid') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' } }) });
    }
    if (mode === 'banned') {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'BANNED', message: '账号已被禁用' } }) });
    }
    if (mode === 'fields') {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VALIDATION', message: '参数错误', fields: { identifier: '账号格式不正确' } } }) });
    }
    if (mode === 'network') {
      return route.abort('failed');
    }
  });

  // Demo account fill does not auto-submit
  const firstDemo = page.locator('[data-vue3="login"] .f-demo-item').first();
  await firstDemo.click();
  await expect(page.locator('#fLoginIdentifier')).not.toHaveValue('');
  await expect(page).toHaveURL(/\/login/);

  // Duplicate submit prevention + 429
  mode = 'hold';
  await page.locator('[data-vue3="login"] .f-submit').click();
  await expect(page.locator('[data-vue3="login"] .f-submit')).toBeDisabled();
  releasePending();
  await expect(page.locator('[data-vue3="login"] .f-form-alert')).toContainText('请求过于频繁');

  // BANNED, fields, network, and real login retry
  mode = 'banned';
  await page.locator('[data-vue3="login"] .f-submit').click();
  await expect(page.locator('[data-vue3="login"] .f-form-alert')).toContainText('该账号已被禁用');

  mode = 'fields';
  await page.locator('[data-vue3="login"] .f-submit').click();
  await expect(page.locator('[data-vue3="login"] [data-error="identifier"]')).toContainText('账号格式不正确');

  mode = 'network';
  await page.locator('[data-vue3="login"] .f-submit').click();
  await expect(page.locator('[data-vue3="login"] .f-form-alert')).toContainText('无法连接服务器');

  // Password toggle + keyboard Enter submit for real login
  await page.locator('[data-vue3="login"] [data-eye]').click();
  await expect(page.locator('#fLoginPassword')).toHaveAttribute('type', 'text');
  mode = 'real';
  await firstDemo.click();
  await page.locator('#fLoginPassword').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/card/${cardId}\\?from=auth#viewer$`));
  const sessionOk = await page.evaluate(() => !!window.QSL.api.token() && !!window.QSL.state.user);
  expect(sessionOk).toBe(true);

  // Guest guard redirects logged-in user away from /login and /register
  await page.evaluate(() => window.QSL.navigate('/login?next=' + encodeURIComponent('/explore?sort=latest')));
  await expect(page).toHaveURL(/\/explore\?sort=latest$/);
  await page.evaluate(() => window.QSL.navigate('/register'));
  await expect(page).toHaveURL(/\/$/);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors.filter(e => !e.includes('Failed to load resource') && !e.includes('429') && !e.includes('403') && !e.includes('400'))).toEqual([]);
});

test('register handles email code flow, race conditions, validation, English, reduced motion, and unmount abort — vue3', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/register?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-vue3="register"] form')).toBeVisible();
  await expect(page.locator('[data-vue3="register"] input[name="legalConsent"]')).not.toBeChecked();

  let sendCount = 0;
  let releaseFirstSend;
  await page.route('**/api/auth/email-code', async route => {
    sendCount++;
    if (sendCount === 1) {
      await new Promise(resolve => { releaseFirstSend = resolve; });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, expiresIn: 1800, retryAfter: 60 }) });
    }
    if (sendCount === 2) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'MAIL_UNAVAILABLE', message: '邮件服务暂不可用，请稍后再试' } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, expiresIn: 1800, retryAfter: 60 }) });
  });

  await page.locator('#fRegEmail').fill('first@example.com');
  await expect(page.locator('[data-vue3="register"] .f-reg-code-reveal')).toHaveClass(/is-open/);
  await page.locator('[data-vue3="register"] .f-reg-code-send').click();

  // Switch email while first request is in flight
  await page.locator('#fRegEmail').fill('second@example.com');
  releaseFirstSend?.();
  await expect(page.locator('#fRegCodeStatus')).toHaveText('');

  // 503 MAIL_UNAVAILABLE must not show success
  await page.locator('[data-vue3="register"] .f-reg-code-send').click();
  await expect(page.locator('[data-vue3="register"] [data-error="emailCode"]')).toBeVisible();
  await expect(page.locator('#fRegCodeStatus')).toHaveText('');

  // Third send succeeds and starts 60s cooldown
  await page.locator('[data-vue3="register"] .f-reg-code-send').click();
  await expect(page.locator('[data-vue3="register"] .f-reg-code-send')).toBeDisabled();
  await expect(page.locator('[data-vue3="register"] .f-reg-code-send')).toContainText('s');

  // Leading zero preserved and callsign uppercased
  await page.locator('#fRegEmailCode').fill('004219');
  await expect(page.locator('#fRegEmailCode')).toHaveValue('004219');
  await page.locator('#fRegCallSign').fill('bh4test');
  await expect(page.locator('#fRegCallSign')).toHaveValue('BH4TEST');

  // Unmount during in-flight register must not write token/user or navigate
  let releaseRegister;
  let capturedPayload = null;
  await page.route('**/api/auth/register', async route => {
    capturedPayload = route.request().postDataJSON();
    await new Promise(resolve => { releaseRegister = resolve; });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: 'late-reg-tok', user: { id: 'u99', uid: '10099', username: 'ham_test' } }) });
  });

  await page.locator('#fRegUsername').fill('ham_test');
  await page.locator('#fRegPassword').fill('Pass1234');
  await page.locator('#fRegConfirm').fill('Pass1234');
  await page.locator('[data-vue3="register"] input[name="legalConsent"]').check();
  await page.locator('[data-vue3="register"] .f-submit').click();

  expect(capturedPayload).toEqual({
    acceptTerms: true,
    termsVersion: '2026-10-25',
    username: 'ham_test',
    email: 'second@example.com',
    emailCode: '004219',
    password: 'Pass1234',
    callSign: 'BH4TEST',
  });
  expect(capturedPayload.confirmPassword).toBeUndefined();

  await page.evaluate(() => window.QSL.navigate('/'));
  await expect(page.locator('[data-vue3="home"]')).toBeVisible();
  releaseRegister?.();
  await page.waitForTimeout(50);
  const leaked = await page.evaluate(() => ({ token: window.QSL.api.token(), user: window.QSL.state.user }));
  expect(leaked).toEqual({ token: null, user: null });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors.filter(e => !e.includes('Failed to load resource') && !e.includes('503'))).toEqual([]);
});

test('unicode code-point inputs are not truncated by maxlength and fetchMe failure rolls back token — vue3', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const emojiPassword = '😀'.repeat(100) + 'Abcdef123456'; // 112 Unicode chars, 212 UTF-16 units
  const emojiDisplayName = '📡'.repeat(30); // 30 Unicode chars, 60 UTF-16 units

  // 1. Login: emoji password is not truncated and fetchMe failure rolls back temporary token
  await page.goto('/login');
  let capturedLoginBody = null;
  await page.route('**/api/auth/login', async route => {
    capturedLoginBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tok-only-temp' }) });
  });
  await page.route('**/api/auth/me', route => route.abort('failed'));

  await page.locator('#fLoginIdentifier').fill('bh4emoji');
  await page.locator('#fLoginPassword').fill(emojiPassword);
  await expect(page.locator('#fLoginPassword')).toHaveValue(emojiPassword);
  await page.locator('[data-vue3="login"] .f-submit').click();

  expect(capturedLoginBody.password).toBe(emojiPassword);
  await expect(page.locator('[data-vue3="login"] .f-form-alert')).toContainText('无法连接服务器');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => ({ token: window.QSL.api.token(), user: window.QSL.state.user }))).toEqual({ token: null, user: null });

  // 2. Register: emoji password, confirmPassword, and 30-char displayName are not truncated
  await page.goto('/register');
  let capturedRegBody = null;
  await page.route('**/api/auth/register', async route => {
    capturedRegBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: 'reg-emoji-tok', user: { id: 'u88', uid: '10088', username: 'emoji_ham' } }) });
  });

  await page.locator('#fRegUsername').fill('emoji_ham');
  await page.locator('#fRegEmail').fill('emoji@example.com');
  await page.locator('#fRegEmailCode').fill('001234');
  await page.locator('#fRegDisplayName').fill(emojiDisplayName);
  await page.locator('#fRegPassword').fill(emojiPassword);
  await page.locator('#fRegConfirm').fill(emojiPassword);
  await page.locator('[data-vue3="register"] input[name="legalConsent"]').check();
  await page.locator('[data-vue3="register"] .f-submit').click();

  expect(capturedRegBody.password).toBe(emojiPassword);
  expect(capturedRegBody.displayName).toBe(emojiDisplayName);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
});
