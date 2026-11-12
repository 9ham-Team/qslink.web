import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../public/js/pages/qsl-design-contest.js', import.meta.url), 'utf8');
const catalog = await fs.readFile(new URL('../public/js/locales/en.js', import.meta.url), 'utf8');
const runtime = await fs.readFile(new URL('../public/js/i18n.js', import.meta.url), 'utf8');
const path = '/events/qsl-design-2026-11';
const contestUrl = '/api/contests/qsl-design-2026-11';
const newsUrl = page => '/api/announcements?eventKey=qsl-design-2026-11&page=' + page + '&limit=6';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp);/g, ' ').replace(/\s+/g, ' ').trim();
const flush = () => new Promise(resolve => setImmediate(resolve));

// Deliberately stub only DOM hooks used by the page, not its CSS hierarchy.
class ElementStub {
  innerHTML = '';
  attributes = new Map();
  hidden = false;
  disabled = false;
  listeners = new Map();
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  insertAdjacentHTML(position, html) {
    assert.equal(position, 'beforeend');
    this.innerHTML += html;
  }
  addEventListener(type, handler, { signal } = {}) {
    this.listeners.set(type, handler);
    signal?.addEventListener('abort', () => this.listeners.delete(type), { once: true });
  }
}

function load(route = path, language = 'zh-CN') {
  const container = new ElementStub();
  const nodes = new Map();
  container.querySelector = selector => {
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);
    assert.ok(attribute, 'unexpected selector: ' + selector);
    const marker = attribute[1] + (attribute[2] ? '="' + attribute[2] + '"' : '');
    if (!container.innerHTML.includes(marker)) return null;
    if (!nodes.has(selector)) nodes.set(selector, new ElementStub());
    return nodes.get(selector);
  };
  const requests = [], frames = new Map(), toasts = [];
  let nextFrame = 0, scrolls = 0, page;
  const QSL = {
    escapeHtml: escape,
    icon: () => '',
    registerPage(name, definition) { assert.equal(name, 'qsl-design-contest'); page = definition; },
    api: { get(url) {
      return new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
    } },
    loading(element) { element.innerHTML = '<p>Loading</p>'; },
    setBusy(element, busy) { element.disabled = busy; },
    toast(...args) { toasts.push(args); },
    formatDateTime: value => value,
    scrollToHash() { scrolls++; },
  };
  const context = vm.createContext({
    window: { QSL }, URL, AbortController,
    location: { href: 'https://example.test' + route },
    localStorage: { getItem: () => language },
    document: { documentElement: {}, addEventListener() {} },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInContext(catalog + '\n' + runtime + '\n' + source, context);
  assert.equal(typeof page?.render, 'function');
  const cleanup = page.render(container, { path: route, params: {}, query: new URLSearchParams() });
  assert.equal(typeof cleanup, 'function');
  function request(url) {
    const index = requests.findIndex(item => item.url === url);
    assert.notEqual(index, -1, 'missing API request: ' + url);
    return requests.splice(index, 1)[0];
  }
  return {
    container, requests, frames, toasts, cleanup, request,
    progress: container.querySelector('[data-prize-progress]'),
    news: container.querySelector('[data-news]'),
    more: container.querySelector('[data-action="news"]'),
    click(action) {
      const handler = container.listeners.get('click');
      handler?.({ target: { closest: () => ({ dataset: { action }, disabled: false }) } });
    },
    runFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    get scrolls() { return scrolls; },
  };
}

for (const route of [path, path + '/alternate']) {
  for (const language of ['zh-CN', 'en']) {
    test(`contest render exposes scoring, prizes and dynamic hooks: ${route} (${language})`, async t => {
      const page = load(route, language);
      t.after(page.cleanup);
      const html = page.container.innerHTML;
      const text = plain(html);
      assert.ok(page.progress, 'prize progress hook survives rendering');
      assert.ok(page.news, 'news hook survives rendering');
      assert.ok(html.indexOf('data-news') < html.indexOf('data-prize-progress'), 'news content stays above the prize section');
      assert.match(text, /30\s*\+\s*50\s*\+\s*20|(?:机器评分|(?:AI|machine|automated) scoring)\s*30[^。]{0,45}\+[^。]{0,45}50[^。]{0,45}\+[^。]{0,45}20/i, 'new three-part score summary');
      assert.match(text, /25\.5\s*\+\s*35\s*\+\s*14\s*=\s*74\.5/, 'illustrative score calculation');
      assert.match(text, /0\.5/, 'AI half-point increments');
      assert.match(text, /10.*9.*8.*7.*6.*5.*4.*3.*2.*1|10\s*[至到–—-]\s*1|10\s+(?:down\s+)?to\s+1/i, 'ten ranked voting bands');
      if (language === 'zh-CN') {
        assert.match(text, /(?:3|三)[^。]{0,40}(?:AI|人工智能)/i);
        assert.match(text, /(?:5|五)[^。]{0,40}评委/);
        assert.match(text, /最高分.*最低分/);
        assert.match(text, /平均.*(?:乘以?|×|\*)\s*5/);
        assert.match(text, /前\s*5\s*(?:张有效票|张票|票|张有效得票).*2\s*分.*10\s*分/);
        assert.match(text, /同票同段同分|同票.*同(?:一)?段.*同分/);
        assert.match(text, /(?:同(?:总)?分|总分相同).*人工.*举办方/);
        assert.match(text, /前(?:三|3)名.*永久.*铭牌/);
        assert.match(text, /奖状/);
        assert.match(text, /累计最多(?:投\s*)?5\s*票/);
        assert.match(text, /不可撤回/);
      } else {
        assert.doesNotMatch(text, /\p{Script=Han}/u, 'static English page must not fall back to Chinese');
        assert.match(text, /(?:3|three)\s+(?:[a-z-]+\s+){0,3}AI/i);
        assert.match(text, /(?:5|five)\s+(?:[a-z-]+\s+){0,3}judges/i);
        assert.match(text, /highest.*lowest/i);
        assert.match(text, /(?:tie|tied|equal).*human.*organi[sz]er/i);
        assert.match(text, /permanent.*(?:nameplate|plaque)|(?:nameplate|plaque).*permanent/i);
        assert.match(text, /certificat/i);
        assert.match(text, /(?:5\s+votes|five\s+votes)/i);
        assert.match(text, /cannot be (?:withdrawn|retracted|undone)|irrevocable/i);
      }
      assert.match(text, /8650/);
      assert.match(text, /A1\s*mini/i);
      assert.match(text, /VR-N76/i);
      // Assert concrete prizes, not incidental image counts or CSS hierarchy.
      assert.match(text, /RSP1/);
      assert.match(text, /FORGE\s+GK300\s+W/i);
      assert.match(text, /GM01\s+PRO/i);
      assert.match(text, /喜多郁代|(?:Ikuyo\s+Kita|Kita\s+Ikuyo)/i);
      assert.deepEqual(page.requests.map(item => item.url).sort(), [contestUrl, newsUrl(1)].sort(), 'render only reads existing contest/news APIs');
      page.request(contestUrl).resolve({ contest: { approvedRegistrationCount: 7 } });
      page.request(newsUrl(1)).resolve({ items: [], page: 1, pages: 0 });
      await flush();
      assert.match(page.progress.innerHTML, /value="7"/, 'real API count, not the mockup count of 2');
      assert.match(plain(page.progress.innerHTML), /\b7\b/);
      assert.match(plain(page.progress.innerHTML), /\b93\b/);
      assert.equal(page.progress.getAttribute('aria-busy'), null);
      assert.equal(page.news.getAttribute('aria-busy'), null);
      assert.equal(page.more.hidden, true);
      assert.equal(page.more.disabled, false);
      page.runFrames();
      assert.equal(page.scrolls, 1);
    });
  }
}

for (const count of [0, 7, 100, 127]) {
  test(`contest progress retains real count and caps its bar: ${count}`, async t => {
    const page = load();
    t.after(page.cleanup);
    page.request(contestUrl).resolve({ contest: { approvedRegistrationCount: count } });
    page.request(newsUrl(1)).resolve({ items: [], page: 1, pages: 0 });
    await flush();
    assert.match(page.progress.innerHTML, new RegExp('value="' + Math.min(count, 100) + '"'));
    assert.match(plain(page.progress.innerHTML), new RegExp('已通过审核：\\s*' + count + '\\s*人'));
    if (count >= 100) assert.match(plain(page.progress.innerHTML), /已解锁/);
  });
}

test('contest news stays scoped, escapes user content and paginates independently of progress retry', async t => {
  const page = load();
  t.after(page.cleanup);
  const item = { publishedAt: '2026-11-10T00:00:00Z', title: '<img src=x onerror=alert(1)>', body: '<script>untrusted</script>' };
  page.request(contestUrl).reject(Error('offline'));
  page.request(newsUrl(1)).resolve({ items: [item], page: 1, pages: 2 });
  await flush();
  assert.match(page.progress.innerHTML, /data-action="prize-progress"/);
  assert.equal(page.progress.getAttribute('aria-busy'), null);
  assert.match(page.news.innerHTML, /&lt;img/);
  assert.match(page.news.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(page.news.innerHTML, /<img|<script/i);
  const first = page.news.innerHTML;
  page.click('news');
  page.click('news');
  assert.equal(page.requests.length, 1, 'busy news cannot issue duplicate requests');
  page.request(newsUrl(2)).resolve({ items: [{ ...item, title: 'Second bulletin' }], page: 2, pages: 2 });
  page.click('prize-progress');
  page.request(contestUrl).resolve({ contest: { approvedRegistrationCount: 7 } });
  await flush();
  assert.ok(page.news.innerHTML.startsWith(first), 'next page appends without discarding the first');
  assert.match(page.news.innerHTML, /Second bulletin/);
  assert.equal(page.more.hidden, true);
  assert.match(page.progress.innerHTML, /value="7"/);
});

test('contest news failure retries without replacing successful progress', async t => {
  const page = load();
  t.after(page.cleanup);
  page.request(contestUrl).resolve({ contest: { approvedRegistrationCount: 7 } });
  page.request(newsUrl(1)).reject(Error('News unavailable'));
  await flush();
  const progress = page.progress.innerHTML;
  assert.match(page.news.innerHTML, /data-action="news"/);
  assert.equal(page.news.getAttribute('aria-busy'), null);
  assert.equal(page.more.disabled, false);
  assert.equal(page.toasts.length, 1);
  page.click('news');
  page.request(newsUrl(1)).resolve({ items: [], page: 1, pages: 0 });
  await flush();
  assert.equal(page.progress.innerHTML, progress);
  assert.match(plain(page.news.innerHTML), /暂无赛事动态/);
  assert.equal(page.more.hidden, true);
});

test('contest invalid participant counts show retry rather than fabricated progress', async t => {
  const page = load();
  t.after(page.cleanup);
  page.request(contestUrl).resolve({ contest: { approvedRegistrationCount: '7' } });
  page.request(newsUrl(1)).resolve({ items: [], page: 1, pages: 0 });
  await flush();
  assert.match(page.progress.innerHTML, /data-action="prize-progress"/);
  assert.doesNotMatch(page.progress.innerHTML, /<progress/);
});

for (const reject of [false, true]) {
  test(`contest cleanup aborts events, cancels scrolling and ignores late API ${reject ? 'failure' : 'success'}`, async () => {
    const page = load();
    const pending = [...page.requests];
    const before = [page.progress.innerHTML, page.news.innerHTML];
    page.cleanup();
    assert.equal(page.container.listeners.size, 0);
    assert.equal(page.frames.size, 0);
    for (const request of pending) {
      if (reject) request.reject(Error('late failure'));
      else request.resolve(request.url === contestUrl
        ? { contest: { approvedRegistrationCount: 7 } }
        : { items: [{ title: 'Late bulletin', body: 'ignored', publishedAt: '2026-11-10T00:00:00Z' }], page: 1, pages: 1 });
    }
    await flush();
    assert.deepEqual([page.progress.innerHTML, page.news.innerHTML], before);
    assert.deepEqual(page.toasts, []);
    page.runFrames();
    assert.equal(page.scrolls, 0);
  });
}
