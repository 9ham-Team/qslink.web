import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExchangeRequestModalVue3 from '../src/components/ExchangeRequestModal.vue';
import { createExchangeRequestService } from '../src/exchange-request-service';
import type {
  CardDetailVue3,
  ExchangeRequestServicesVue3,
  ApplicationContext,
  LogbookPageResponseVue3,
  SelfUserVue3,
} from '../src/contracts';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeCard(overrides: Partial<CardDetailVue3> = {}): CardDetailVue3 {
  return {
    id: 'card-1',
    title: '山顶电台卡',
    stock: 3,
    liked: false,
    likeCount: 2,
    status: 'approved',
    ratio: { w: 3, h: 2 },
    createdAt: '2026-11-01T00:00:00.000Z',
    owner: {
      id: 'u-owner',
      uid: '20001',
      username: 'owner1',
      displayName: 'Owner1',
      callSign: 'BA1AA',
      joinedAt: '2026-01-01T00:00:00.000Z',
      stats: { cards: 1, likesReceived: 0 },
    },
    ...overrides,
  };
}

function makeUser(overrides: Partial<SelfUserVue3> = {}): SelfUserVue3 {
  return {
    id: 'u1',
    uid: '10001',
    username: 'bh4abc',
    displayName: 'BH4ABC',
    callSign: 'BH4ABC',
    address: {
      name: '张三',
      phone: '13800138000',
      province: '湖南省',
      city: '长沙市岳麓区',
      line1: '麓山南路1号',
      postalCode: '410000',
      country: '中国',
    },
    ...overrides,
  };
}

function makeLegacyQsl(user: SelfUserVue3 | null = makeUser()): ApplicationContext {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let token: string | null = user ? 'tok-1' : null;
  return {
    t: s => s,
    store: { user },
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      token: () => token,
      setToken: next => { token = next; },
      cards: { like: vi.fn() },
    },
    images: { apply: vi.fn() },
    PLACEHOLDER_IMAGE: '/assets/placeholder.svg',
    formatDate: v => v,
    formatDateTime: v => String(v || ''),
    formatNumber: v => String(v),
    timeAgo: () => '刚刚',
    ratioLabel: r => `${r?.w || 3} : ${r?.h || 2}`,
    statusText: s => s,
    exchangeText: s => s,
    icon: name => `<svg data-ico="${name}"></svg>`,
    navigate: vi.fn(),
    toast: vi.fn(),
    setQuery: vi.fn(),
    scrollToHash: vi.fn(),
    card3d: { create: vi.fn() },
    escapeHtml: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    copyText: vi.fn(),
    modal: vi.fn(),
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    registerPage: vi.fn(),
    // helper for test
    ...({
      __emit(event: string, payload?: unknown) {
        listeners.get(event)?.forEach(fn => fn(payload));
      },
    } as Record<string, unknown>),
  } as ApplicationContext & { __emit(event: string, payload?: unknown): void };
}

function makeModalServices(user: SelfUserVue3 | null = makeUser(), overrides: Partial<ExchangeRequestServicesVue3> = {}) {
  let currentUser = user;
  let currentToken: string | null = user ? 'tok-1' : null;
  const authListeners = new Set<(u: SelfUserVue3 | null) => void>();

  const services: ExchangeRequestServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    token: () => currentToken,
    setUser: vi.fn((next: SelfUserVue3 | null) => {
      currentUser = next;
      authListeners.forEach(fn => fn(next));
    }),
    onAuth: fn => {
      authListeners.add(fn as (u: SelfUserVue3 | null) => void);
      return () => authListeners.delete(fn as (u: SelfUserVue3 | null) => void);
    },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/assets/placeholder.svg',
    formatDate: v => v,
    formatNumber: v => String(v),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    ratioLabel: r => `${r?.w || 3} : ${r?.h || 2}`,
    listLogbook: vi.fn(async (page): Promise<LogbookPageResponseVue3> => ({
      items: [
        {
          id: `qso-${page}-1`,
          qsoAt: '2026-11-10T12:34:00.000Z',
          callSign: 'JA1ABC',
          stationCallSign: 'BH4ABC',
          band: '20m',
          mode: 'FT8',
          lotwConfirmed: true,
          source: 'lotw',
        },
      ],
      total: 2,
      page,
      limit: 25,
      pages: 2,
      stats: { total: 2, confirmed: 1 },
    })),
    createExchange: vi.fn(async () => ({
      exchange: { id: 'ex-new', status: 'pending', createdAt: '2026-11-14T00:00:00.000Z' },
    })),
    updateProfileAddress: vi.fn(async () => ({ user: currentUser || makeUser() })),
    ...overrides,
  };

  return {
    services,
    emitAuth(next: SelfUserVue3 | null, nextToken: string | null = next ? 'tok-2' : null) {
      currentUser = next;
      currentToken = nextToken;
      authListeners.forEach(fn => fn(next));
    },
  };
}

describe('Module exchange service & Vue modal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('guards invalid open calls, and cancels lazy mount when close() is called early', async () => {
    const platform = makeLegacyQsl(makeUser()) as ApplicationContext & { __emit(event: string, payload?: unknown): void };
    let resolveLoad!: (m: { mountExchangeRequestModalVue3: ReturnType<typeof vi.fn> }) => void;
    const mountFn = vi.fn(() => vi.fn());
    const load = vi.fn(() => new Promise<{ mountExchangeRequestModalVue3: ReturnType<typeof vi.fn> }>(res => {
      resolveLoad = res;
    }));

    platform.exchangeRequest = createExchangeRequestService(platform, load);

    // Stock 0 is blocked synchronously
    expect(platform.exchangeRequest!.open(makeCard({ stock: 0 }))).toBeNull();
    expect(load).not.toHaveBeenCalled();

    // Open returns handle synchronously even while lazy chunk is loading
    const handle = platform.exchangeRequest!.open(makeCard());
    expect(handle).toBeTruthy();
    expect(typeof handle!.close).toBe('function');
    // Duplicate open returns handle without triggering second load
    platform.exchangeRequest!.open(makeCard());
    expect(load).toHaveBeenCalledTimes(1);

    // Close before chunk resolves
    handle!.close();
    resolveLoad({ mountExchangeRequestModalVue3: mountFn });
    await flush();
    expect(mountFn).not.toHaveBeenCalled();
  });

  it('supports cross-page log selection, 100-item cap, city/district deduplication, and late profile-save isolation', async () => {
    let resolveProfile!: (v: { user: SelfUserVue3 }) => void;
    const { services, emitAuth } = makeModalServices(makeUser(), {
      updateProfileAddress: vi.fn(() => new Promise<{ user: SelfUserVue3 }>(res => { resolveProfile = res; })),
    });

    const wrapper = mount(ExchangeRequestModalVue3, {
      props: { card: makeCard(), services },
    });
    await flush();

    // Select page 1 log
    const cb1 = document.body.querySelector('input[data-select-log="qso-1-1"]') as HTMLInputElement;
    expect(cb1).toBeTruthy();
    cb1.checked = true;
    cb1.dispatchEvent(new Event('change'));
    await flush();

    // Go to page 2 and select page 2 log
    (document.body.querySelector('[data-log-next]') as HTMLButtonElement).click();
    await flush();
    const cb2 = document.body.querySelector('input[data-select-log="qso-2-1"]') as HTMLInputElement;
    expect(cb2).toBeTruthy();
    cb2.checked = true;
    cb2.dispatchEvent(new Event('change'));
    await flush();
    expect(document.body.querySelector('[data-log-selected-count]')?.textContent).toContain('2');

    // Same-account auth refresh must NOT clear draft or selected logs
    emitAuth(makeUser({ displayName: 'RefreshedName' }), 'tok-1');
    await flush();
    expect(document.body.querySelector('[data-log-selected-count]')?.textContent).toContain('2');

    // Fill district that is already in city ("长沙市岳麓区" + "岳麓区")
    const districtInput = document.body.querySelector('input[name="district"]') as HTMLInputElement;
    districtInput.value = '岳麓区';
    districtInput.dispatchEvent(new Event('input'));
    const msgInput = document.body.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    msgInput.value = '73!';
    msgInput.dispatchEvent(new Event('input'));
    await flush();

    // Submit
    const sendBtn = Array.from(document.body.querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('发送申请')) as HTMLButtonElement;
    sendBtn.click();
    await flush();

    expect(services.createExchange).toHaveBeenCalledWith(
      'card-1',
      {
        message: '73!',
        contactName: '张三',
        address: {
          name: '张三',
          phone: '13800138000',
          province: '湖南省',
          city: '长沙市岳麓区',
          line1: '麓山南路1号',
          postalCode: '410000',
          country: '中国',
        },
        contactLogIds: ['qso-1-1', 'qso-2-1'],
      },
      expect.any(AbortSignal),
    );
    expect(services.navigate).toHaveBeenCalledWith('/dashboard/exchanges?box=outgoing');

    // Switch account before late updateProfileAddress resolves
    emitAuth(makeUser({ id: 'u2', uid: '10002' }), 'tok-u2');
    resolveProfile({ user: makeUser({ id: 'u1', displayName: 'StaleUser' }) });
    await flush();
    expect(services.setUser).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('enforces the 100-item selection cap', async () => {
    const manyItems = Array.from({ length: 101 }, (_, idx) => ({
      id: `qso-${idx + 1}`,
      qsoAt: '2026-11-10T12:00:00.000Z',
      callSign: `JA1${idx}`,
      band: '20m',
      mode: 'FT8',
      lotwConfirmed: false,
      source: 'adif',
    }));
    const { services } = makeModalServices(makeUser(), {
      listLogbook: vi.fn(async () => ({
        items: manyItems,
        total: 101,
        page: 1,
        limit: 101,
        pages: 1,
        stats: { total: 101, confirmed: 0 },
      })),
    });

    const wrapper = mount(ExchangeRequestModalVue3, {
      props: { card: makeCard(), services },
    });
    await flush();

    const checkboxes = Array.from(document.body.querySelectorAll('.f-xreq-log-options input[type="checkbox"]')) as HTMLInputElement[];
    for (let i = 0; i < 101; i++) {
      checkboxes[i].checked = true;
      checkboxes[i].dispatchEvent(new Event('change'));
    }
    await flush();

    expect(services.toast).toHaveBeenCalledWith('每次最多附上 100 条通联记录', 'info');
    expect(document.body.querySelector('[data-log-selected-count]')?.textContent).toContain('100');
    wrapper.unmount();
  });
});
