import { initializeMockApplication } from './platform-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { bootShellVue3 } from '../src/shell-entry';
import type { ApplicationContext } from '../src/contracts';

function setupShellDom() {
  document.body.innerHTML = `
    <div id="site-header"></div>
    <main id="app"><div id="legacy-marker">existing</div></main>
    <div id="site-footer"></div>
    <div id="toast-root" class="toast-root" aria-live="polite" aria-atomic="true"></div>
    <div id="modal-root"></div>
    <div id="fx-layer" class="fx-layer" aria-hidden="true"></div>
  `;
}

function createMockQsl(overrides: Partial<ApplicationContext> = {}) {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  let currentToken: string | null = null;
  const platform: any = {
    t: (s: string) => s,
    i18n: {
      language: 'zh-CN',
      switchLanguage: vi.fn(),
    },
    AVATAR_COLORS: ['#2563eb'],
    store: {
      user: null,
      config: {
        build: {
          revision: '1234567890abcdef',
          created: '2026-11-14T10:00:00Z',
        },
      },
    },
    api: {
      token: () => currentToken,
      setToken: (t: string | null) => {
        currentToken = t;
      },
      config: vi.fn(),
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({ ok: true }),
      put: vi.fn().mockResolvedValue({}),
      cards: { like: vi.fn() },
    },
    boot: vi.fn().mockResolvedValue(undefined),
    setUser: vi.fn((user: any) => {
      platform.store.user = user;
      platform.emit('auth', user);
    }),
    footerBuildText: vi.fn((build: any) =>
      build?.revision ? `Build ${String(build.revision).slice(0, 7)} · 2026-11-14 18:00:00 HKT` : '开发版（未注入构建信息）',
    ),
    navigate: vi.fn((to: string) => {
      platform.navigation.current = { path: to, query: new URLSearchParams(), hash: '', params: {} };
      platform.emit('route:after', { to });
    }),
    setQuery: vi.fn(),
    scrollToHash: vi.fn(),
    PLACEHOLDER_IMAGE: '',
    images: { apply: vi.fn() },
    formatDate: (v: string) => v,
    formatDateTime: (v: string | null) => v || '',
    formatNumber: (n: number) => String(n),
    timeAgo: (v: string) => v,
    ratioLabel: () => '3:2',
    statusText: (s: string) => s,
    exchangeText: (s: string) => s,
    escapeHtml: (v: unknown) => String(v ?? ''),
    copyText: vi.fn(),
    toast: vi.fn(() => () => {}),
    modal: vi.fn(),
    card3d: { create: vi.fn() },
    fx: {
      init: vi.fn(),
      setExternalBackground: vi.fn(),
      confetti: vi.fn(),
      heartbeat: vi.fn(),
    },
    navigation: {
      current: { path: '/', query: new URLSearchParams(), hash: '', params: {} },
      start: vi.fn(),
    },
    on(event: string, fn: (...args: any[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
    registerPage: vi.fn(),
    ...overrides,
  };
  initializeMockApplication(platform);
  platform.api.config.mockResolvedValue(platform.store.config);
  return {
    platform: platform as ApplicationContext & { emit: (e: string, ...a: unknown[]) => void },
    setTokenDirect: (t: string | null) => {
      currentToken = t;
    },
  };
}

describe('Vue3 public shell — vue3', () => {
  let activeShell: Awaited<ReturnType<typeof bootShellVue3>> | null = null;

  beforeEach(() => {
    setupShellDom();
    window.history.replaceState(null, '', '/');
    if (typeof ResizeObserver === 'undefined') {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
    }
  });

  afterEach(() => {
    activeShell?.unmount();
    activeShell = null;
    document.body.classList.remove('is-menu-open', 'modal-open');
    vi.restoreAllMocks();
  });

  it('boots once with Vue Router owning #app and records a recoverable boot failure — vue3', async () => {
    const { platform } = createMockQsl();
    (platform.api.config as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('config failed'));

    activeShell = await bootShellVue3(platform);
    const secondShell = await bootShellVue3(platform);
    expect(secondShell).toBe(activeShell);

    await platform.store.ready;
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    expect(platform.store.error).toContain('config failed');
    expect(typeof platform.navigation?.start).toBe('function');
    expect(platform.navigation?.current?.path).toBe('/');
    expect(document.getElementById('legacy-marker')).toBeNull();
    await vi.waitFor(() => {
      expect(document.querySelector('#app .g-home')).not.toBeNull();
    });
    expect(document.querySelector('#site-header[data-vue3="header"]')).not.toBeNull();
    expect(document.querySelector('#site-footer[data-vue3="footer"]')).not.toBeNull();
    expect(document.querySelector('#fx-layer[data-vue3="fx"] .fx-particles')).not.toBeNull();
    expect(Object.getOwnPropertyDescriptor(platform,'store')?.get).toBeUndefined();
  });

  it('renders guest, regular user, judge (without admin link), admin nav, and >99 pending badge — vue3', async () => {
    const { platform, setTokenDirect } = createMockQsl();
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    await nextTick();

    // Guest
    expect(document.querySelector('#site-header a[href="/login"]')).not.toBeNull();
    expect(document.querySelector('#site-header a[href="/register"]')).not.toBeNull();
    expect(document.querySelector('#site-header a[href="/admin"]')).toBeNull();

    // Regular user with 120 pending exchanges -> 99+
    setTokenDirect('tok-user');
    platform.setUser?.({
      id: 'u1',
      username: 'bg7aaa',
      displayName: 'BG7AAA',
      callSign: 'BG7AAA',
      role: 'user',
      stats: { pendingExchanges: 120 },
    });
    await nextTick();
    expect(document.querySelector('#site-header .nav-user-name')?.textContent).toBe('BG7AAA');
    expect(document.querySelector('#site-header .nav-badge')?.textContent?.trim()).toBe('99+');
    expect(document.querySelector('#site-header a[href="/admin"]')).toBeNull();

    // Judge must NOT see admin entry
    platform.setUser?.({
      id: 'u2',
      username: 'judge1',
      displayName: 'Judge One',
      role: 'judge',
    });
    await nextTick();
    expect(document.querySelector('#site-header a[href="/admin"]')).toBeNull();

    // Admin sees admin entry
    platform.setUser?.({
      id: 'u3',
      username: 'admin1',
      displayName: 'Admin One',
      role: 'admin',
    });
    await nextTick();
    expect(document.querySelector('#site-header a[href="/admin"]')).not.toBeNull();
  });

  it('prevents stale logout response from clearing a newer login session — vue3', async () => {
    const { platform, setTokenDirect } = createMockQsl();
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    await nextTick();

    setTokenDirect('old-token');
    platform.setUser?.({ id: 'old-u', username: 'old', displayName: 'Old', role: 'user' });
    await nextTick();

    let resolveLogout: (() => void) | null = null;
    (platform.api.post as any) = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );

    const logoutBtn = document.querySelector('#site-header [data-logout]') as HTMLButtonElement;
    expect(logoutBtn).not.toBeNull();
    logoutBtn.click();
    await nextTick();

    // New user logs in while old logout is still in-flight
    setTokenDirect('new-token');
    platform.setUser?.({ id: 'new-u', username: 'new', displayName: 'New', role: 'user' });
    await nextTick();

    // Old logout finishes now -> must NOT wipe new-token or new-u
    resolveLogout?.();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(platform.api.token?.()).toBe('new-token');
    expect(platform.store.user?.id).toBe('new-u');
  });

  it('handles contest sub-nav deep links, Escape, outside click, footer build info, and language switch — vue3', async () => {
    window.history.replaceState(null, '', '/events/qsl-design-2026-11/works');
    const { platform } = createMockQsl();
    platform.navigation!.current = { path: '/events/qsl-design-2026-11/works', query: new URLSearchParams(), hash: '', params: {} };
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    await nextTick();

    const toggle = document.querySelector('#site-header .nav-contest-toggle') as HTMLButtonElement;
    expect(toggle.classList.contains('is-active')).toBe(true);
    const worksLink = document.querySelector('#nav-contest-desktop a[href="/events/qsl-design-2026-11/works"]');
    expect(worksLink?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('site-header')?.classList.contains('is-contest-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(document.getElementById('site-header')?.classList.contains('is-contest-open')).toBe(false);

    toggle.click();
    await nextTick();
    expect(document.getElementById('site-header')?.classList.contains('is-contest-open')).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(document.getElementById('site-header')?.classList.contains('is-contest-open')).toBe(false);

    // Language switch delegates to QSL.i18n.switchLanguage
    (document.querySelector('#site-header [data-language]') as HTMLButtonElement).click();
    expect(platform.i18n?.switchLanguage).toHaveBeenCalledTimes(1);

    // Footer shows real build text & legal links
    const footerText = document.querySelector('#site-footer')?.textContent || '';
    expect(footerText).toContain('Build 1234567 · 2026-11-14 18:00:00 HKT');
    expect(document.querySelector('#site-footer a[href="/legal/privacy.html"]')).not.toBeNull();
    expect(document.querySelector('#site-footer a[href="/legal/terms.html"]')).not.toBeNull();

    // Missing build metadata falls back via footerBuildText(null)
    platform.store.config = { build: null };
    await nextTick();
    expect(document.querySelector('#site-footer')?.textContent).toContain('开发版（未注入构建信息）');
  });

  it('activates mobile static card scene when .card3d mounts asynchronously after route events — vue3', async () => {
    const origMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      })),
    });

    try {
      const { platform } = createMockQsl();
      activeShell = await bootShellVue3(platform);
      await platform.store.ready;
      await nextTick();

      const fxLayer = document.getElementById('fx-layer')!;
      expect(fxLayer.classList.contains('is-static-card-scene')).toBe(false);

      // Simulate async Vue page chunk inserting .card3d after route:rendered
      const card = document.createElement('div');
      card.className = 'card3d';
      document.getElementById('app')!.appendChild(card);
      await Promise.resolve();
      await nextTick();
      expect(fxLayer.classList.contains('is-static-card-scene')).toBe(true);

      // Removing .card3d restores non-static state
      card.remove();
      await Promise.resolve();
      await nextTick();
      expect(fxLayer.classList.contains('is-static-card-scene')).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: origMatchMedia,
      });
    }
  });

  it('guards deep links with safe next handling and renders the shared 404 route — vue3', async () => {
    window.history.replaceState(null, '', '/dashboard');
    const { platform } = createMockQsl();
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    await vi.waitFor(() => {
      expect(platform.navigation?.current?.path).toBe('/login');
    });
    expect(platform.navigation?.current?.query.get('next')).toBe('/dashboard');

    platform.setUser?.({ id: 'u1', uid: '000000001', username: 'one', role: 'user' });
    await platform.navigate('/login?next=' + encodeURIComponent('https://evil.example'));
    await vi.waitFor(() => {
      expect(platform.navigation?.current?.path).toBe('/');
    });

    await platform.navigate('/missing-page');
    await vi.waitFor(() => {
      expect(platform.navigation?.current?.path).toBe('/missing-page');
      expect(document.querySelector('#app .route-notfound')).not.toBeNull();
    });
  });

  it('emits route events only after accepted navigation and does not replace the page when a leave guard cancels — vue3', async () => {
    const { platform } = createMockQsl();
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    await vi.waitFor(() => { expect(document.querySelector('#app .g-home')).not.toBeNull(); });

    const events: string[] = [];
    const offs = ['route:before', 'route', 'route:rendered', 'route:after'].map(name =>
      platform.on(name, () => events.push(name)));

    const offGuard = platform.navigation?.setLeaveGuard?.(() => false);
    const canceled = await platform.navigate('/explore');
    await nextTick();
    expect(canceled).toBe(false);
    expect(platform.navigation?.current?.path).toBe('/');
    expect(events).toEqual([]);
    expect(document.querySelector('#app .g-home')).not.toBeNull();

    offGuard?.();
    const allowed = await platform.navigate('/explore');
    await vi.waitFor(() => {
      expect(platform.navigation?.current?.path).toBe('/explore');
      expect(events).toEqual(['route:before', 'route', 'route:rendered', 'route:after']);
    });
    expect(allowed).toBe(true);
    offs.forEach(off => off());
  });

  it('mounts /admin as Vue, never calls the legacy renderer, and cleans requests on leaving — vue3', async () => {
    const legacyRender = vi.fn();
    const { platform } = createMockQsl();
    (platform as any).pages = { admin: { title: '管理后台', render: legacyRender } };
    (platform.api.get as any).mockImplementation(async (path:string) => path === '/api/auth/me' ? {user:{ id:'admin-1',uid:'000000009',username:'admin',role:'admin' }} : { users:{total:0,active:0,banned:0,newThisWeek:0}, cards:{total:0,pending:0,approved:0,rejected:0}, exchanges:{total:0,pending:0,approved:0,completed:0,rejected:0}, likes:0,pendingCards:[],recentUsers:[],recentExchanges:[] });
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    platform.api.setToken?.('admin-token');
    platform.setUser?.({ id:'admin-1',uid:'000000009',username:'admin',role:'admin' });
    await platform.navigate('/admin');
    await vi.waitFor(() => expect(document.querySelector('#app [data-vue3="admin"]')).not.toBeNull());
    await vi.waitFor(() => expect(document.querySelector('#app .stat-card')).not.toBeNull());
    expect(legacyRender).not.toHaveBeenCalled();
    const calls = (platform.api.get as any).mock.calls;
    const signal = calls.find((call:any[]) => call[0] === '/api/admin/stats')?.[1]?.signal;
    await platform.navigate('/');
    await vi.waitFor(() => expect(document.querySelector('#app .g-home')).not.toBeNull());
    expect(signal.aborted).toBe(true);
    expect(document.querySelector('#app [data-vue3="admin"]')).toBeNull();
  });

  it('syncs query-only MyCards and Exchanges navigation without remounting pages or duplicating list requests — vue3', async () => {
    const { platform, setTokenDirect } = createMockQsl();
    const owner = {
      uid: '000000001',
      username: 'query-user',
      displayName: 'Query User',
      callSign: 'BG1QRY',
      joinedAt: '2026-01-01T00:00:00.000Z',
      stats: { cards: 2, likesReceived: 0 },
    };
    const cards = [
      { id: 'card-approved', title: 'Approved', status: 'approved', stock: null, liked: false, likeCount: 0,
        ratio: { w: 3, h: 2 }, frontImage: '/approved.webp', owner },
      { id: 'card-pending', title: 'Pending', status: 'pending', stock: null, liked: false, likeCount: 0,
        ratio: { w: 3, h: 2 }, frontImage: '/pending.webp', owner },
    ];
    const exchanges = [
      { id: 'ex-pending', status: 'pending', direction: 'outgoing', createdAt: '2026-11-15T00:00:00.000Z',
        card: { id: 'card-approved', title: 'Approved', ratio: { w: 3, h: 2 } },
        fromUser: { ...owner, id: 'u1' }, toUser: { ...owner, id: 'u2' }, fromAddress: null, toAddress: null },
      { id: 'ex-approved', status: 'approved', direction: 'incoming', createdAt: '2026-11-15T00:00:00.000Z',
        card: { id: 'card-pending', title: 'Pending', ratio: { w: 3, h: 2 } },
        fromUser: { ...owner, id: 'u2' }, toUser: { ...owner, id: 'u1' }, fromAddress: null, toAddress: null },
    ];
    const requests: string[] = [];
    platform.api.get = vi.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/me/cards') return { items: cards };
      if (path === '/api/me/exchanges') return { items: exchanges, counts: { incomingPending: 0, outgoingPending: 1 } };
      return {};
    });
    const user = { id: 'u1', ...owner, role: 'user' };
    platform.api.auth = { me: vi.fn(async () => ({ user })) };
    setTokenDirect('query-token');
    window.history.replaceState(null, '', '/dashboard/cards?status=pending');
    activeShell = await bootShellVue3(platform);
    await platform.store.ready;
    expect(platform.navigation?.current?.path).toBe('/dashboard/cards');
    expect(platform.navigation?.current?.query.get('status')).toBe('pending');
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-vue3="my-cards"]'),
        document.getElementById('app')?.innerHTML,
      ).not.toBeNull();
      expect(document.querySelector('[data-vue3="my-cards"] [data-filter="pending"]')?.classList.contains('is-active')).toBe(true);
    }, { timeout: 3000 });
    const myCardsRoot = document.querySelector('[data-vue3="my-cards"]');
    expect(myCardsRoot).not.toBeNull();

    await platform.navigate('/dashboard/cards?status=approved');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-vue3="my-cards"] [data-filter="approved"]')?.classList.contains('is-active')).toBe(true);
    });
    expect(document.querySelector('[data-vue3="my-cards"]')).toBe(myCardsRoot);
    expect(requests.filter(path => path === '/api/me/cards')).toHaveLength(1);

    await platform.navigate('/dashboard/exchanges?box=incoming&status=pending');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-vue3="exchanges"] [data-box="incoming"]')?.classList.contains('is-active')).toBe(true);
      expect(document.querySelector('[data-vue3="exchanges"] [data-status="pending"]')?.classList.contains('is-active')).toBe(true);
    });
    const exchangesRoot = document.querySelector('[data-vue3="exchanges"]');

    void platform.navigate('/dashboard/exchanges?box=incoming&status=all');
    await platform.navigate('/dashboard/exchanges?box=outgoing&status=pending');
    await vi.waitFor(() => {
      expect(document.querySelector('[data-vue3="exchanges"] [data-box="outgoing"]')?.classList.contains('is-active')).toBe(true);
      expect(document.querySelector('[data-vue3="exchanges"] [data-status="pending"]')?.classList.contains('is-active')).toBe(true);
    });
    expect(document.querySelector('[data-vue3="exchanges"]')).toBe(exchangesRoot);
    expect(requests.filter(path => path === '/api/me/exchanges')).toHaveLength(1);
  });
});
