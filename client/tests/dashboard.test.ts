import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardVue3 from '../src/pages/Dashboard.vue';
import type { AccountServicesVue3, OverviewResponseVue3, SelfUserVue3 } from '../src/contracts';

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
    role: 'user',
    avatarColor: '#0eaf8f',
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeOverview(overrides: Partial<OverviewResponseVue3> = {}): OverviewResponseVue3 {
  const user = overrides.user || makeUser();
  return {
    user,
    canJudgeContest: false,
    stats: {
      cards: 5,
      approvedCards: 3,
      pendingCards: 2,
      likesReceived: 12,
      incomingPending: 2,
      outgoingPending: 1,
      completedExchanges: 4,
    },
    recentIncoming: [
      {
        id: 'ex-pending-1',
        status: 'pending',
        direction: 'incoming',
        createdAt: '2026-11-10T10:00:00.000Z',
        message: '希望换卡',
        card: { id: 'c1', title: '我的主卡', ratio: { w: 3, h: 2 } },
        fromUser: { id: 'u2', uid: '10002', username: 'bg1xyz', displayName: 'BG1XYZ', callSign: 'BG1XYZ', joinedAt: '2026-01-02T00:00:00.000Z', stats: { cards: 1, likesReceived: 0 } },
      },
      {
        id: 'ex-approved-ignore',
        status: 'approved',
        direction: 'incoming',
        createdAt: '2026-11-09T10:00:00.000Z',
        card: { id: 'c1', title: '已同意记录', ratio: { w: 3, h: 2 } },
        fromUser: { id: 'u3', uid: '10003', username: 'ba2bbb', displayName: 'BA2BBB', joinedAt: '2026-01-02T00:00:00.000Z', stats: { cards: 0, likesReceived: 0 } },
      },
    ],
    recentCards: [
      {
        id: 'c1',
        title: '审核中卡片',
        status: 'pending',
        stock: 5,
        liked: false,
        likeCount: 1,
        ratio: { w: 3, h: 2 },
        owner: { uid: '10001', username: 'bh4abc', displayName: 'BH4ABC', joinedAt: '2026-01-01T00:00:00.000Z', stats: { cards: 5, likesReceived: 12 } },
      },
    ],
    ...overrides,
  };
}

function makeServices(user: SelfUserVue3 | null, overrides: Partial<AccountServicesVue3> = {}) {
  let currentUser = user;
  let currentToken: string | null = user ? 'tok-1' : null;
  const authListeners = new Set<(u: SelfUserVue3 | null) => void>();

  const services: AccountServicesVue3 = {
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
    avatarColors: () => ['#0eaf8f', '#38bdf8'],
    timeAgo: () => '1 小时前',
    language: () => 'zh-CN',
    getOverview: vi.fn(async () => makeOverview({ user: currentUser || makeUser() })),
    updateProfile: vi.fn(),
    updatePassword: vi.fn(),
    getApplicantCards: vi.fn(async () => ({ items: [], page: 1, pages: 1, hasUploadedCards: true })),
    approveExchange: vi.fn(async () => ({ exchange: { id: 'ex-pending-1', status: 'approved', createdAt: '2026-11-10T10:00:00.000Z' } })),
    rejectExchange: vi.fn(async () => ({ exchange: { id: 'ex-pending-1', status: 'rejected', createdAt: '2026-11-10T10:00:00.000Z' } })),
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/assets/placeholder.svg',
    formatDate: v => v.slice(0, 10),
    formatNumber: v => String(v),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    ...overrides,
  };

  return {
    services,
    emitExternalAuth(next: SelfUserVue3 | null, nextToken: string | null = next ? 'tok-2' : null) {
      currentUser = next;
      currentToken = nextToken;
      authListeners.forEach(fn => fn(next));
    },
  };
}

describe('DashboardVue3', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('redirects guests to login with next=/dashboard', async () => {
    const { services } = makeServices(null);
    const wrapper = mount(DashboardVue3, { props: { services } });
    await flush();
    expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard', { replace: true });
    expect(services.getOverview).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renders true stats, filters only pending incoming rows, shows card status, and gates judge/admin links', async () => {
    const judgeUser = makeUser({ role: 'user' });
    const { services } = makeServices(judgeUser, {
      getOverview: vi.fn(async () => makeOverview({ user: judgeUser, canJudgeContest: true })),
    });
    const wrapper = mount(DashboardVue3, { props: { services } });
    await flush();

    expect(wrapper.findAll('.f-req')).toHaveLength(1);
    expect(wrapper.text()).toContain('3 张已通过 · 2 张审核中');
    expect(wrapper.text()).toContain('有 1 条申请等待对方回应');
    expect(wrapper.find('.qsl-tile-status .badge').text()).toBe('审核中');
    expect(wrapper.find('a[href="/events/qsl-design-2026-11/judging"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('requires explicit confirmation when applicant has no uploaded cards and handles OUT_OF_STOCK without optimistic decrement', async () => {
    const { services } = makeServices(makeUser(), {
      getApplicantCards: vi.fn(async () => ({ items: [], page: 1, pages: 1, hasUploadedCards: false })),
      approveExchange: vi.fn(async () => {
        const err = new Error('该卡片库存不足，请补充库存后再同意') as Error & { code?: string };
        err.code = 'OUT_OF_STOCK';
        throw err;
      }),
    });
    const wrapper = mount(DashboardVue3, { props: { services } });
    await flush();

    await wrapper.get('[data-act="approve"]').trigger('click');
    await flush();

    const confirmBtn = Array.from(document.body.querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('确认交换')) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    await flush();

    // Must open secondary confirmation dialog instead of calling approve immediately
    expect(services.approveExchange).not.toHaveBeenCalled();
    const dialogs = document.body.querySelectorAll('.modal-overlay');
    expect(dialogs).toHaveLength(2);
    const secondConfirm = Array.from(dialogs[1].querySelectorAll('.modal-actions button'))
      .find(b => b.textContent?.includes('确认交换')) as HTMLButtonElement;
    secondConfirm.click();
    await flush();

    expect(services.approveExchange).toHaveBeenCalledWith(
      'ex-pending-1',
      { preferredCardId: null, confirmNoCards: true },
      expect.any(AbortSignal),
    );
    expect(document.body.querySelector('[data-choice-error]')?.textContent).toContain('库存不足');
    // Pending row is still present
    expect(wrapper.findAll('.f-req')).toHaveLength(1);
    wrapper.unmount();
  });

  it('clears private state and ignores late overview responses when auth is cleared', async () => {
    let resolveOverview!: (v: OverviewResponseVue3) => void;
    const { services, emitExternalAuth } = makeServices(makeUser(), {
      getOverview: vi.fn(() => new Promise<OverviewResponseVue3>(res => { resolveOverview = res; })),
    });
    const wrapper = mount(DashboardVue3, { props: { services } });
    await flush();

    emitExternalAuth(null, null);
    await flush();

    expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard', { replace: true });
    expect(wrapper.find('.f-dash').exists()).toBe(false);

    // Late response resolves after logout
    resolveOverview(makeOverview({ canJudgeContest: true }));
    await flush();
    expect(wrapper.find('.f-dash').exists()).toBe(false);
    wrapper.unmount();
  });
});
