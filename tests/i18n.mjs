import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const catalog = await fs.readFile(new URL('../public/js/locales/en.js', import.meta.url), 'utf8');
const runtime = await fs.readFile(new URL('../public/js/i18n.js', import.meta.url), 'utf8');
function load(href = 'https://example.test/', saved, blocked = false, browser = {}) {
  const storage = new Map(saved ? [['qsl_language', saved]] : []);
  const events = {}, windowEvents = {};
  const context = {
    URL, console, navigator: browser,
    location: { href, replace(value) { this.next = value; } },
    history: { replaceState(...args) { this.replaced = args[2]; } },
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
    },
    document: { documentElement: {}, addEventListener(name, fn) { events[name] = fn; } },
    window: { confirm: () => true, addEventListener(name, fn) { windowEvents[name] = fn; } }
  };
  vm.createContext(context);
  vm.runInContext(catalog + runtime, context);
  return { ...context, vmContext: context, storage, events, windowEvents, QSL: context.window.QSL };
}

test('language defaults, persistence, URL precedence and fallback', () => {
  assert.equal(load().QSL.t('首页'), '首页');
  const en = load(undefined, 'en');
  assert.equal(en.document.documentElement.lang, 'en');
  assert.equal(en.QSL.t('首页'), 'Home');
  assert.equal(en.QSL.t('自定义用户内容'), '自定义用户内容');
  const cn = load('https://example.test/explore?sort=latest&lang=zh-CN#cards', 'en');
  assert.equal(cn.QSL.i18n.language, 'zh-CN');
  assert.equal(cn.storage.get('qsl_language'), 'zh-CN');
  assert.equal(cn.history.replaced, '/explore?sort=latest#cards');
  assert.equal(load('https://example.test/?lang=invalid', 'en').QSL.i18n.language, 'en');
});

test('browser preferences select the first supported language without saving it', () => {
  for (const [browser, expected] of [
    [{ languages: ['en-US', 'zh-CN'] }, 'en'],
    [{ languages: ['zh-TW', 'en-US'] }, 'zh-CN'],
    [{ languages: ['zh-Hant-HK'] }, 'zh-CN'],
    [{ languages: ['fr-FR', 'en-GB', 'zh'] }, 'en'],
    [{ languages: [], language: 'en-AU' }, 'en'],
    [{ language: 'EN-us' }, 'en'],
    [{ languages: ['fr-FR', 'de-DE'] }, 'zh-CN'],
    [{}, 'zh-CN']
  ]) {
    const page = load(undefined, undefined, false, browser);
    assert.equal(page.QSL.i18n.language, expected, JSON.stringify(browser));
    assert.equal(page.storage.get('qsl_language'), undefined);
  }
  const englishLegal = load('https://example.test/legal/privacy.en.html', undefined, false, { language: 'en' });
  assert.equal(englishLegal.storage.get('qsl_language'), undefined);
});

test('saved manual choices override browser preferences, including saved Chinese', () => {
  assert.equal(load(undefined, 'zh-CN', false, { languages: ['en-US'] }).QSL.i18n.language, 'zh-CN');
  assert.equal(load(undefined, 'en', false, { languages: ['zh-CN'] }).QSL.i18n.language, 'en');
  assert.equal(load(undefined, 'invalid', false, { language: 'en-US' }).QSL.i18n.language, 'en');
  assert.equal(load(undefined, undefined, true, { language: 'en-US' }).QSL.i18n.language, 'en');
  const explicit = load('https://example.test/?lang=zh-CN', 'en', false, { language: 'en-US' });
  assert.equal(explicit.QSL.i18n.language, 'zh-CN');
  assert.equal(explicit.storage.get('qsl_language'), 'zh-CN');
});

test('switch preserves the current route and only commits preference after navigation', () => {
  const page = load('https://example.test/explore?q=SSB&sort=popular#cards');
  page.events.input({ target: { closest: () => ({}) } });
  page.QSL.i18n.switchLanguage();
  const next = new URL(page.location.next);
  assert.equal(next.pathname, '/explore');
  assert.equal(next.searchParams.get('q'), 'SSB');
  assert.equal(next.searchParams.get('sort'), 'popular');
  assert.equal(next.searchParams.get('lang'), 'en');
  assert.equal(next.hash, '#cards');
  assert.equal(page.storage.get('qsl_language'), undefined);
  const canceled = load();
  canceled.window.confirm = () => false;
  canceled.events.input({ target: { closest: () => ({}) } });
  canceled.QSL.i18n.switchLanguage();
  assert.equal(canceled.location.next, undefined);
  assert.equal(canceled.storage.get('qsl_language'), undefined);
});

test('disabled browser storage retains URL language and does not prevent switching', () => {
  const page = load('https://example.test/?lang=en', undefined, true);
  assert.equal(page.QSL.t('首页'), 'Home');
  assert.equal(page.history.replaced, undefined);
  page.QSL.i18n.switchLanguage();
  assert.equal(new URL(page.location.next).searchParams.get('lang'), 'zh-CN');
});

test('English legal links select English and numeric API errors preserve their limits', () => {
  const { QSL } = load('https://example.test/legal/privacy.en.html', 'zh-CN');
  assert.equal(QSL.i18n.language, 'en');
  assert.match(QSL.i18n.error('密码不能超过 128 位'), /128/);
  assert.ok(!/\p{Script=Han}/u.test(QSL.i18n.error('昵称需为 1-40 个字符')));
  assert.ok(!/\p{Script=Han}/u.test(QSL.i18n.error('拒绝原因不能超过 500 个字符')));
  assert.match(QSL.i18n.error('宽高比需为 { w, h }，取 1-20 的整数'), /\b1\b.*\b20\b/);
  assert.equal(QSL.i18n.error('unknown error'), 'unknown error');
});

test('dates, compact counts and relative time use English grammar', async () => {
  const page = load(undefined, 'en');
  vm.runInContext(await fs.readFile(new URL('../public/js/core.js', import.meta.url), 'utf8'), page.vmContext);
  assert.equal(page.QSL.formatNumber(10000), '10K');
  assert.equal(page.QSL.timeAgo(new Date(Date.now() - 60000).toISOString()), '1 minute ago');
  assert.ok(!/\p{Script=Han}/u.test(page.QSL.formatDate('2026-01-01T00:00:00Z')));
});

test('all static UI translation calls have English entries', async () => {
  const { QSL } = load(undefined, 'en');
  const root = new URL('../public/js/', import.meta.url);
  const files = await fs.readdir(root, { recursive: true });
  const missing = [];
  for (const file of files.filter(file => file.endsWith('.js') && !file.startsWith('locales'))) {
    const source = await fs.readFile(new URL(file.replaceAll('\\', '/'), root), 'utf8');
    for (const match of source.matchAll(/\bt\(((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))\)/g)) {
      const key = vm.runInNewContext(match[1]);
      if (!Object.hasOwn(QSL.translations.en, key)) missing.push({ file, key });
    }
  }
  assert.deepEqual(missing, []);
});
