import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExchangesVue3 from '../src/pages/Exchanges.vue';
import type { ExchangeItemVue3, ExchangeListResponseVue3, ExchangeServicesVue3, RouteContextVue3, SelfUserVue3 } from '../src/contracts';

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeUser(overrides: Partial<SelfUserVue3> = {}): SelfUserVue3 {
  return {
    id: 'u1',
    uid: '10001',
    username: 'bh4abc',
    displayName: 'BH4ABC',
    callSign: 'BH4ABC',
    ...overrides,
  };
}

function makeExchange(overrides: Partial<ExchangeItemVue3> = {}): ExchangeItemVue3 {
  return {
    id: 'ex-1',
    status: 'pending',
    direction: 'incoming',
    createdAt: '2026-11-10T10:00:00.000Z',
    message: '希望换卡',
    card: { id: 'c1', title: '我的主卡', ratio: { w: 3, h: 2 } },
    fromUser: { id: 'u2', uid: '10002', username: 'bg1xyz', displayName: 'BG1XYZ', callSign: 'BG1XYZ', joinedAt: '2026-01-01T00:00:00.000Z', stats: { cards: 1, likesReceived: 0 } },
    toUser: { id: 'u1', uid: '10001', username: 'bh4abc', displayName: 'BH4ABC', callSign: 'BH4ABC', joinedAt: '2026-01-01T00:00:00.000Z', stats: { cards: 1, likesReceived: 0 } },
    fromAddress: null,
    toAddress: null,
    ...overrides,
  };
}

function makeServices(user: SelfUserVue3 | null, overrides: Partial<ExchangeServicesVue3> = {}) {
  let currentUser = user;
  let currentToken: string | null = user ? 'tok-1' : null;
  const authListeners = new Set<(u: SelfUserVue3 | null) => void>();

  const services: ExchangeServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    token: () => currentToken,
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
    timeAgo: () => '1 小时前',
    exchangeText: s => s,
    copyText: vi.fn(async () => true),
    listExchanges: vi.fn(async (): Promise<ExchangeListResponseVue3> => ({
      items: [
        makeExchange({ id: 'ex-in-pending', direction: 'incoming', status: 'pending' }),
        makeExchange({
          id: 'ex-out-approved',
          direction: 'outgoing',
          status: 'approved',
          preferredCardId: 'c-pref',
          preferredCardTitle: '偏好卡',
          preferredCard: { id: 'c-pref', title: '偏好卡', ratio: { w: 3, h: 2 } },
          fromAddress: { name: '张三', city: '长沙市', line1: '岳麓区1号' },
          toAddress: { name: '李四', city: '北京市', line1: '海淀区2号' },
        }),
        makeExchange({
          id: 'ex-out-deleted-pref',
          direction: 'outgoing',
          status: 'completed',
          preferredCardId: null,
          preferredCardTitle: '已删除偏好卡',
          preferredCard: null,
          fromAddress: { name: '张三', city: '长沙市', line1: '岳麓区1号' },
          toAddress: null,
        }),
      ],
      counts: { incomingPending: 1, outgoingPending: 0, total: 3 },
    })),
    getApplicantCards: vi.fn(async () => ({ items: [], page: 1, pages: 1, hasUploadedCards: false })),
    approveExchange: vi.fn(async () => ({ exchange: makeExchange({ status: 'approved' }) })),
    rejectExchange: vi.fn(async () => ({ exchange: makeExchange({ status: 'rejected' }) })),
    cancelExchange: vi.fn(async () => ({ exchange: makeExchange({ status: 'cancelled' }) })),
    completeExchange: vi.fn(async () => ({ exchange: makeExchange({ status: 'completed' }) })),
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

describe('ExchangesVue3', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('redirects guests to login', async () => {
    const { services } = makeServices(null);
    const wrapper = mount(ExchangesVue3, { props: { services } });
    await flush();
    expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fexchanges', { replace: true });
    expect(services.listExchanges).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('respects deep-link box/status, hides addresses for pending, shows addresses & preferredCard links for approved/completed', async () => {
    const { services } = makeServices(makeUser());
    const ctx: RouteContextVue3 = { params: {}, query: new URLSearchParams('box=outgoing&status=all') };
    const wrapper = mount(ExchangesVue3, { props: { ctx, services } });
    await flush();

    // Outgoing tab is active and shows 2 outgoing items
    expect(wrapper.findAll('.f-ex')).toHaveLength(2);
    expect(wrapper.find('.f-ex-preference-link').attributes('href')).toBe('/card/c-pref');
    expect(wrapper.text()).toContain('已删除偏好卡（已不可用）');

    // Copy address
    await wrapper.get('[data-ex-act="copy-address"][data-addr="from"]').trigger('click');
    await flush();
    expect(services.copyText).toHaveBeenCalledWith(expect.stringContaining('岳麓区1号'), '地址已复制，去寄卡片吧');

    // Switch to incoming (pending) -> no addresses rendered
    await wrapper.get('[data-box="incoming"]').trigger('click');
    await flush();
    expect(wrapper.findAll('.f-ex')).toHaveLength(1);
    expect(wrapper.find('.f-addr').exists()).toBe(false);
    expect(services.setQuery).toHaveBeenCalledWith({ box: null, status: null });

    wrapper.unmount();
  });

  it('follows same-path query navigation without duplicating list requests or resetting loaded data — vue3', async () => {
    const { services } = makeServices(makeUser());
    const wrapper = mount(ExchangesVue3, {
      props: {
        ctx: { params: {}, query: new URLSearchParams('box=outgoing&status=all'), hash: '' },
        services,
      },
    });
    await flush();
    expect(wrapper.get('[data-box="outgoing"]').classes()).toContain('is-active');
    expect(wrapper.get('[data-status="all"]').classes()).toContain('is-active');
    expect(services.listExchanges).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ ctx: { params: {}, query: new URLSearchParams('box=incoming&status=pending'), hash: '' } });
    await flush();
    expect(wrapper.get('[data-box="incoming"]').classes()).toContain('is-active');
    expect(wrapper.get('[data-status="pending"]').classes()).toContain('is-active');
    expect(wrapper.findAll('.f-ex')).toHaveLength(1);

    await wrapper.setProps({ ctx: { params: {}, query: new URLSearchParams('box=outgoing&status=approved'), hash: '' } });
    await wrapper.setProps({ ctx: { params: {}, query: new URLSearchParams('box=outgoing&status=completed'), hash: '#list' } });
    await flush();
    expect(wrapper.get('[data-box="outgoing"]').classes()).toContain('is-active');
    expect(wrapper.get('[data-status="completed"]').classes()).toContain('is-active');
    expect(wrapper.findAll('.f-ex')).toHaveLength(1);

    await wrapper.setProps({ ctx: { params: {}, query: new URLSearchParams(), hash: '#list' } });
    await flush();
    expect(wrapper.get('[data-box="incoming"]').classes()).toContain('is-active');
    expect(wrapper.get('[data-status="all"]').classes()).toContain('is-active');
    expect(services.listExchanges).toHaveBeenCalledTimes(1);
    expect(services.setQuery).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('handles approve with no-cards confirmation, cancel, and complete actions', async () => {
    const { services } = makeServices(makeUser());
    const wrapper = mount(ExchangesVue3, { props: { services } });
    await flush();

    // Approve pending incoming -> requires secondary confirmation when hasUploadedCards=false
    await wrapper.get('[data-ex-act="approve"]').trigger('click');
    await flush();
    const confirm1 = Array.from(document.body.querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('确认交换')) as HTMLButtonElement;
    confirm1.click();
    await flush();
    expect(services.approveExchange).not.toHaveBeenCalled();
    const dialogs = document.body.querySelectorAll('.modal-overlay');
    expect(dialogs).toHaveLength(2);
    const confirm2 = Array.from(dialogs[1].querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('确认交换')) as HTMLButtonElement;
    confirm2.click();
    await flush();
    expect(services.approveExchange).toHaveBeenCalledWith('ex-in-pending', { preferredCardId: null, confirmNoCards: true }, expect.any(AbortSignal));

    // Switch to outgoing & complete approved exchange
    await wrapper.get('[data-box="outgoing"]').trigger('click');
    await flush();
    await wrapper.get('[data-ex-act="complete"]').trigger('click');
    await flush();
    const completeConfirm = Array.from(document.body.querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('标记完成')) as HTMLButtonElement;
    completeConfirm.click();
    await flush();
    expect(services.completeExchange).toHaveBeenCalledWith('ex-out-approved', expect.any(AbortSignal));

    wrapper.unmount();
  });

  it('ignores late list responses after logout/account switch', async () => {
    let resolveList!: (v: ExchangeListResponseVue3) => void;
    const { services, emitAuth } = makeServices(makeUser(), {
      listExchanges: vi.fn(() => new Promise<ExchangeListResponseVue3>(res => { resolveList = res; })),
    });
    const wrapper = mount(ExchangesVue3, { props: { services } });
    await flush();

    emitAuth(null, null);
    await flush();
    expect(wrapper.find('.f-exchanges').exists()).toBe(false);

    resolveList({ items: [makeExchange()], counts: { incomingPending: 1 } });
    await flush();
    expect(wrapper.find('.f-exchanges').exists()).toBe(false);
    wrapper.unmount();
  });
});
