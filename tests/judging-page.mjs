import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const files = ['js/contest-judging.js', 'js/pages/qsl-design-judging.js', 'js/pages/admin-contest-judging.js', 'js/locales/en.js'];
const [shared, pageSource, adminSource, english] = await Promise.all(files.map(file => fs.readFile(new URL('../public/' + file, import.meta.url), 'utf8')));
const API = '/api/contests/qsl-design-2026-11/judging';
const ADMIN = '/api/admin/contests/qsl-design-2026-11/judging';
const flush = () => new Promise(resolve => setImmediate(resolve));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
class Element {
  constructor(selector = '') { this.selector = selector; this.nodes = new Map(); this.listeners = new Map(); this.disabled = false; this.hidden = false; this.value = ''; this.dataset = {}; this.html = ''; }
  set innerHTML(value) { this.html = value; this.nodes.clear(); }
  get innerHTML() { return this.html; }
  querySelector(selector) {
    if (!this.nodes.has(selector)) {
      const node = new Element(selector);
      if (selector === '[data-score-form]') {
        if (!this.html.includes('data-score-form')) return null;
        node.elements = { score: new Element(), comment: new Element() };
        node.elements.score.value = this.html.match(/name="score"[^>]*value="([^"]*)"/)?.[1] || '';
        node.elements.comment.value = this.html.match(/name="comment"[^>]*>([^<]*)/)?.[1] || '';
      }
      if (selector === '[data-user-search]') node.elements = { q: { value: '' } };
      node.value = this.html.match(new RegExp(selector.replace(/[\[\]]/g, '') + ' value="([^"]*)"'))?.[1] || '';
      this.nodes.set(selector, node);
    }
    return this.nodes.get(selector);
  }
  querySelectorAll(selector) {
    if (selector === 'input, textarea, [data-save]') {
      const form = this.querySelector('[data-score-form]');
      return form ? [form.elements.score, form.elements.comment, this.querySelector('[data-save]')] : [];
    }
    if (selector === '[data-config] input, [data-config] button') return ['[data-deadline]', '[data-save-config]'].map(key => this.querySelector(key));
    if (selector === '[data-download]') return ['scores', 'materials'].map(kind => { const node = this.querySelector('[data-download="' + kind + '"]'); node.dataset.download = kind; return node; });
    return [];
  }
  addEventListener(type, fn, { signal } = {}) { this.listeners.set(type, fn); signal?.addEventListener('abort', () => this.listeners.delete(type), { once: true }); }
  matches(selector) { return this.selector === selector; }
  closest(selector) { return this.matches(selector) ? this : null; }
  hasAttribute(name) { return this.selector.includes(name); }
  remove() {}
  click() {}
}
function setup({ admin = false, language = 'zh-CN' } = {}) {
  const requests = [], binaries = [], revoked = [], created = [], timers = new Map(), intervals = new Map();
  let id = 0, page, clock = Date.parse('2026-11-15T00:00:00Z');
  const document = new Element(), window = new Element(), container = new Element();
  document.body = { appendChild() {} }; document.createElement = () => new Element();
  const QSL = { escapeHtml: escape, router: {}, state: { user: {} }, setUser(value) { this.state.user = value; },
    t: (source, args = {}) => { const value = language === 'en' ? QSL.translations.en[source] : source; assert.ok(value, 'missing translation: ' + source); return value.replace(/\{(\w+)\}/g, (_, key) => args[key] ?? ''); },
    i18n: { error: value => value }, ApiError: class extends Error { constructor(message, opts) { super(message); Object.assign(this, opts); } },
    registerPage(name, definition) { page = definition; }, confirm: async () => true,
    api: { token: () => 'private-token', setToken() {}, admin: { users: params => request('USERS', '', params) },
      get: (url, opts) => request('GET', url, undefined, opts), put: (url, body, opts) => request('PUT', url, body, opts), post: (url, body, opts) => request('POST', url, body, opts) }
  };
  function request(method, url, body, opts) { return new Promise((resolve, reject) => requests.push({ method, url, body, opts, resolve, reject })); }
  class TestURL extends URL {}
  TestURL.createObjectURL = () => { const value = 'blob:private-' + created.length; created.push(value); return value; };
  TestURL.revokeObjectURL = url => revoked.push(url);
  class Clock extends Date { static now() { return clock; } }
  window.QSL = QSL; window.confirm = () => true;
  const context = vm.createContext({ window, document, URL: TestURL, URLSearchParams, AbortController, Date: Clock,
    fetch: (url, opts) => new Promise((resolve, reject) => binaries.push({ url, opts, resolve, reject })),
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    setInterval(fn, ms) { intervals.set(++id, { fn, ms }); return id; }, clearInterval(key) { intervals.delete(key); } });
  vm.runInContext(english + '\n' + shared + '\n' + (admin ? adminSource : pageSource), context);
  const cleanup = admin ? QSL.mountAdminContestJudging(container, () => true) : page.render(container);
  return { QSL, container, document, window, cleanup, requests, binaries, revoked, created, intervals, timers,
    node: selector => container.querySelector(selector),
    detail: () => container.querySelector('[data-detail]'),
    body: () => container.querySelector('[data-judging-admin-body]'),
    tick(ms) { for (const timer of [...intervals.values()]) if (timer.ms === ms) timer.fn(); },
    advance(ms) { clock += ms; },
    take(method, url) { const index = requests.findIndex(item => item.method === method && item.url === url); assert.notEqual(index, -1, method + ' ' + url); return requests.splice(index, 1)[0]; },
    input(value, comment = '') { const form = this.detail().querySelector('[data-score-form]'); form.elements.score.value = value; form.elements.comment.value = comment; container.listeners.get('input')({ target: { closest: () => form } }); },
    save() { const form = this.detail().querySelector('[data-score-form]'); return container.listeners.get('submit')({ target: form, preventDefault() {} }); },
    click(selector) { const button = new Element(selector); button.dataset.download = selector.match(/data-download="([^"]+)"/)?.[1]; return container.listeners.get('click')({ target: { closest: () => button } }); }
  };
}
const judging = { revision: 1, deadline: '2026-11-20T00:00:00Z', frozenAt: '2026-11-14T00:00:00Z', isOpen: true, submittedAt: null, totalWorks: 1, materialVersion: 'v1', slot: 1 };
const item = { id: 'work1', number: 1, title: '<script>title</script>', description: '<img src=x>', frontUrl: API + '/materials/work1/front', backUrl: API + '/materials/work1/back', score: null };
async function loaded(options) { const s = setup(options); s.take('GET', options?.admin ? ADMIN : API).resolve(options?.admin ? { judging: { ...judging, judges: [], canViewResults: false } } : { judging: { ...judging }, items: [{ ...item }] }); await flush(); return s; }

test('judge validation handles zero, decimals and Unicode comment limits', () => {
  const s = setup(); const valid = s.QSL.contestJudging.validScore;
  for (const value of ['0', '0.0', '9.9', '10', '10.0']) assert.equal(valid(value, ''), true);
  for (const value of ['', '-1', '10.1', '1.25', '1e1', 'NaN']) assert.equal(valid(value, ''), false);
  assert.equal(valid('1', '😀'.repeat(1000)), true); assert.equal(valid('1', '😀'.repeat(1001)), false);
  assert.equal(s.QSL.contestJudging.beijingInput('2026-11-15T00:00:00Z'), '2026-11-15T08:00:00'); s.cleanup();
});
test('judge marks completion using latest revision, edits before deadline, and saving clears marker', async () => {
  const s = await loaded();
  assert.match(s.detail().innerHTML, /&lt;script&gt;/); assert.doesNotMatch(s.detail().innerHTML, /src="\/api|<script>/);
  s.input('0', 'own comment'); const saving = s.save();
  const save = s.take('PUT', API + '/materials/work1/score');
  assert.deepEqual(JSON.parse(JSON.stringify(save.body)), { expectedRevision: 0, score: 0, comment: 'own comment' });
  save.resolve({ score: { value: 0, comment: 'own comment', revision: 1 }, judging: { ...judging, revision: 2 } }); await saving;
  assert.equal(s.node('[data-submit]').disabled, false);
  const submitting = s.click('[data-submit]'); await flush();
  const submit = s.take('POST', API + '/submit'); assert.equal(submit.body.expectedRevision, 2);
  submit.resolve({ judging: { ...judging, revision: 3, submittedAt: '2026-11-15T00:00:00Z', isOpen: true } }); await submitting;
  assert.equal(s.node('[data-submit]').disabled, true, 'an existing optional marker need not be repeated');
  assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, false, 'completion marker never locks scores');
  assert.match(s.node('[data-judging-status]').textContent, /已标记完成（截止前仍可修改）/);
  s.input('9.5', 'updated after completion marker'); const editing = s.save();
  const edit = s.take('PUT', API + '/materials/work1/score');
  assert.deepEqual(JSON.parse(JSON.stringify(edit.body)), { expectedRevision: 1, score: 9.5, comment: 'updated after completion marker' });
  edit.resolve({ score: { value: 9.5, comment: 'updated after completion marker', revision: 2 }, judging: { ...judging, revision: 4, submittedAt: null } }); await editing;
  assert.equal(s.node('[data-submit]').disabled, false, 'saving clears the completion marker and permits marking again');
  assert.doesNotMatch(s.node('[data-judging-status]').textContent, /已标记完成/);
  assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, false); s.cleanup();
});
test('conflict preserves unsaved draft and disables writes until refresh; expiry locks immediately', async () => {
  const s = await loaded(); s.input('8.5', 'draft'); const saving = s.save();
  s.take('PUT', API + '/materials/work1/score').reject(Object.assign(Error('conflict'), { status: 409 })); await saving;
  assert.match(s.node('[data-judging-status]').textContent, /未保存 1/); assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, true);
  assert.match(s.node('[data-judging-error]').textContent, /conflict/);
  s.cleanup();
  const deadline = await loaded(); deadline.advance(10 * 86400000); deadline.tick(1000); assert.equal(deadline.detail().querySelector('[data-score-form]').elements.score.disabled, true); deadline.cleanup();
});
test('the exact deadline locks saved scores with or without a completion marker', async () => {
  for (const submittedAt of [null, '2026-11-15T00:00:00Z']) {
    const s = setup();
    s.take('GET', API).resolve({ judging: { ...judging, submittedAt }, items: [{ ...item, score: { value: 8, comment: 'saved', revision: 1 } }] }); await flush();
    assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, false);
    s.advance(5 * 86400000 - 1); s.tick(1000);
    assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, false, 'still writable one millisecond before deadline');
    s.input('8.5', 'before deadline');
    s.advance(1); s.tick(1000);
    assert.equal(s.detail().querySelector('[data-score-form]').elements.score.disabled, true, 'read-only at the exact deadline');
    assert.equal(s.node('[data-submit]').disabled, true);
    assert.match(s.node('[data-judging-status]').textContent, /只读/);
    await s.save(); await s.click('[data-submit]'); assert.equal(s.requests.length, 0, 'deadline rejects local score or completion writes'); s.cleanup();
  }
});
test('private images use Bearer blob URLs and cleanup aborts/revokes all resources', async () => {
  const s = await loaded(); assert.equal(s.binaries.length, 2);
  for (const request of s.binaries) { assert.equal(request.opts.headers.Authorization, 'Bearer private-token'); assert.equal(request.opts.cache, 'no-store'); assert.doesNotMatch(request.url, /token|private-token/); request.resolve({ ok: true, blob: async () => ({}) }); }
  await flush(); assert.equal(s.created.length, 2); assert.match(s.detail().querySelector('[data-image="front"]').src, /^blob:/);
  s.cleanup(); assert.equal(s.intervals.size, 0); assert.equal(s.timers.size, 0); assert.equal(s.revoked.length, 2); assert.ok(s.binaries.every(request => request.opts.signal.aborted));
});
test('forbidden and pre-start states expose no materials; failed polling cannot retain writes', async () => {
  const s = setup(); s.take('GET', API).reject(Object.assign(Error('forbidden'), { status: 403 })); await flush(); assert.equal(s.binaries.length, 0); assert.equal(s.detail().innerHTML, ''); s.cleanup();
  const waiting = setup(); waiting.take('GET', API).resolve({ judging: { ...judging, frozenAt: null, isOpen: false }, items: [] }); await flush(); assert.equal(waiting.binaries.length, 0); assert.equal(waiting.node('[data-submit]').disabled, true); waiting.cleanup();
  const active = await loaded(); active.tick(30000); active.take('GET', API).reject(Error('network')); await flush(); assert.equal(active.detail().querySelector('[data-score-form]').elements.score.disabled, true); active.cleanup();
});
test('English judging and admin static text are complete; no automatic result/export requests', async () => {
  const s = await loaded({ language: 'en' }); assert.doesNotMatch(s.container.innerHTML + s.detail().innerHTML + s.node('[data-judging-status]').textContent, /\p{Script=Han}/u); s.cleanup();
  const admin = await loaded({ admin: true, language: 'en' }); assert.doesNotMatch(admin.container.innerHTML + admin.body().innerHTML, /\p{Script=Han}/u);
  assert.equal(admin.requests.length, 0); assert.equal(admin.binaries.length, 0); assert.doesNotMatch(admin.body().innerHTML, /data-results-load/); assert.match(admin.body().innerHTML, /data-from value="1"/); assert.match(admin.body().innerHTML, /data-to value="20"/); admin.cleanup(); assert.equal(admin.intervals.size, 0);
});
test('admin result and binary endpoints remain manual and revision-protected', async () => {
  const s = await loaded({ admin: true }); const body = s.body();
  await s.click('[data-download="scores"]'); assert.equal(s.binaries.length, 0);
  body.querySelector('[data-from]').value = '1'; body.querySelector('[data-to]').value = '21'; await s.click('[data-download="materials"]'); assert.equal(s.binaries.length, 0); assert.match(body.querySelector('[data-admin-error]').textContent, /20/);
  body.querySelector('[data-to]').value = '20'; const download = s.click('[data-download="materials"]'); assert.equal(s.binaries.length, 1); assert.equal(s.binaries[0].url, ADMIN + '/materials.zip?from=1&to=20'); s.binaries[0].resolve({ ok: true, blob: async () => ({}) }); await download; s.cleanup(); assert.equal(s.revoked.length, 1);
});
test('admin quiet polling preserves result DOM and range while updating progress', async () => {
  const s = await loaded({ admin: true }); const body = s.body();
  body.querySelector('[data-from]').value = '7'; body.querySelector('[data-to]').value = '13';
  const results = body.querySelector('[data-results]'); results.innerHTML = '<p>previously loaded results</p>';
  s.tick(30000); s.take('GET', ADMIN).resolve({ judging: { ...judging, judges: [{ slot: 1, scoredCount: 1 }], canViewResults: false } }); await flush();
  assert.equal(body.querySelector('[data-results]'), results); assert.match(results.innerHTML, /previously loaded/);
  assert.equal(body.querySelector('[data-from]').value, '7'); assert.equal(body.querySelector('[data-to]').value, '13');
  assert.match(body.querySelector('[data-progress-rows]').innerHTML, /1 \/ 1/); s.cleanup();
});
test('401 and 403 polling clear judge content, abort image requests and discard forbidden drafts', async () => {
  for (const status of [401, 403]) {
    const s = await loaded(); s.input('7.5', 'private draft'); s.tick(30000);
    s.take('GET', API).reject(Object.assign(Error('forbidden'), { status })); await flush();
    assert.equal(s.detail().innerHTML, ''); assert.equal(s.node('[data-works]').innerHTML, '');
    assert.ok(s.binaries.every(request => request.opts.signal.aborted)); assert.equal(s.node('[data-submit]').disabled, true);
    let prevented = false; s.window.listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, false); s.cleanup();
  }
});
test('stale personal draft retains its item revision through background refresh', async () => {
  const s = await loaded(); s.input('7.5', 'draft'); s.tick(30000);
  s.take('GET', API).resolve({ judging: { ...judging, revision: 4 }, items: [{ ...item, score: { value: 6, comment: 'other tab', revision: 3 } }] }); await flush();
  assert.equal(s.detail().querySelector('[data-score-form]').elements.score.value, '7.5');
  const saving = s.save(); const request = s.take('PUT', API + '/materials/work1/score'); assert.equal(request.body.expectedRevision, 0);
  request.reject(Object.assign(Error('conflict'), { status: 409 })); await saving; s.cleanup();
});
test('admin saves Beijing deadline with revision, freezes saved config, and loads results only on demand', async () => {
  const s = setup({ admin: true });
  const judges = Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, userId: 'user' + index, username: 'judge' + index, uid: String(100000001 + index), displayName: 'Judge ' + index, scoredCount: 1 }));
  s.take('GET', ADMIN).resolve({ judging: { ...judging, frozenAt: null, judges, canViewResults: false } }); await flush();
  s.body().querySelector('[data-deadline]').value = '2026-11-22T08:00:00';
  const saving = s.click('[data-save-config]'); const save = s.take('PUT', ADMIN);
  assert.equal(save.body.expectedRevision, 1); assert.equal(save.body.deadline, '2026-11-22T00:00:00.000Z'); assert.equal(save.body.judgeUserIds.length, 5);
  const saved = { ...judging, revision: 2, deadline: '2026-11-22T00:00:00Z', frozenAt: null, judges, canViewResults: false };
  save.resolve({ judging: saved }); await saving;
  s.body().querySelector('[data-deadline]').value = '2026-11-22T08:00:00';
  const starting = s.click('[data-start]'); await flush(); const start = s.take('POST', ADMIN + '/start'); assert.equal(start.body.expectedRevision, 2);
  start.resolve({ judging: { ...saved, revision: 3, frozenAt: '2026-11-15T00:00:00Z' } }); await starting;
  assert.equal(s.requests.length, 0); assert.equal(s.binaries.length, 0);
  s.tick(30000); s.take('GET', ADMIN).resolve({ judging: { ...saved, revision: 3, frozenAt: '2026-11-15T00:00:00Z', canViewResults: true } }); await flush();
  assert.equal(s.requests.length, 0); const results = s.click('[data-results-load]'); const result = s.take('GET', ADMIN + '/results');
  result.resolve({ judges, items: [{ id: 'work1', number: 1, title: '<script>bad</script>', scores: [{ slot: 1, score: 8, comment: '<img src=x>', submittedAt: null }], complete: false, humanScore: null }] }); await results;
  assert.match(s.body().querySelector('[data-results]').innerHTML, /&lt;script&gt;/); assert.match(s.body().querySelector('[data-results]').innerHTML, /&lt;img/);
  assert.match(s.body().querySelector('[data-results]').innerHTML, /未标记完成/); assert.match(s.body().querySelector('[data-results]').innerHTML, /评分未完成/); s.cleanup();
});
test('admin displays a human score from five saved scores without any completion markers', async () => {
  for (const language of ['zh-CN', 'en']) {
    const s = setup({ admin: true, language });
    const judges = Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, submittedAt: null }));
    s.take('GET', ADMIN).resolve({ judging: { ...judging, judges, canViewResults: true } }); await flush();
    const loading = s.click('[data-results-load]');
    s.take('GET', ADMIN + '/results').resolve({ judges, items: [{ ...item, scores: judges.map(judge => ({ slot: judge.slot, score: 8, comment: '', submittedAt: null })), complete: true, humanScore: 40 }] }); await loading;
    const result = s.body().querySelector('[data-results]').innerHTML;
    assert.match(result, /<td>40<\/td>/);
    assert.match(result, language === 'en' ? /Not marked complete/ : /未标记完成/);
    assert.doesNotMatch(result, /最终提交|final submission|submitted and locked|Scoring incomplete|评分未完成/i);
    assert.doesNotMatch(language === 'en' ? result : '', /\p{Script=Han}/u); s.cleanup();
  }
});

test('admin can edit started judging; polling preserves drafts and stale revisions block saving', async () => {
  const s = setup({ admin: true });
  const judges = Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, userId: 'user' + index, username: 'judge' + index }));
  s.take('GET', ADMIN).resolve({ judging: { ...judging, judges, canViewResults: false } }); await flush();
  assert.equal(s.body().querySelector('[data-save-config]').disabled, false);
  assert.equal(s.body().querySelector('[data-start]').disabled, true);
  const draft = '2026-11-22T08:00:00';
  s.body().querySelector('[data-deadline]').value = draft;
  s.tick(30000); s.take('GET', ADMIN).resolve({ judging: { ...judging, judges, canViewResults: false } }); await flush();
  assert.equal(s.body().querySelector('[data-deadline]').value, draft);
  const saving = s.click('[data-save-config]'); await flush();
  const update = s.take('PUT', ADMIN);
  assert.equal(update.body.expectedRevision, 1);
  assert.equal(update.body.deadline, '2026-11-22T00:00:00.000Z');
  const saved = { ...judging, judges, revision: 2, deadline: update.body.deadline, canViewResults: false };
  update.resolve({ judging: saved }); await saving;
  s.tick(30000); s.take('GET', ADMIN).resolve({ judging: { ...saved, revision: 3 } }); await flush();
  assert.equal(s.body().querySelector('[data-save-config]').disabled, true);
  assert.equal(s.body().querySelector('[data-results]').innerHTML, '');
  s.cleanup();
});
test('all literal judging backend error messages have English translations', async () => {
  const server = await fs.readFile(new URL('../server/lib/contest-judging.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {} }); vm.runInContext(english, context); const catalog = context.window.QSL.translations.en;
  for (const line of server.split('\n').filter(line => /throw (?:badRequest|conflict|forbidden|notFound|payloadTooLarge)/.test(line))) {
    for (const match of line.matchAll(/'([^']*[\p{Script=Han}][^']*)'/gu)) assert.ok(catalog[match[1]], 'missing backend error translation: ' + match[1]);
  }
});
test('private resource helper refuses cross-origin or public image addresses', async () => {
  const s = setup(); const scope = s.QSL.contestJudging.scope();
  for (const url of ['https://evil.test/a', '//evil.test/a', '/uploads/a.jpg', API + '/../outside']) await assert.rejects(scope.binary(url));
  assert.equal(s.binaries.length, 0); scope.cleanup(); s.cleanup();
});
