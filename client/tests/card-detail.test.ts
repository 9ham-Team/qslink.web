import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CardDetailVue3Page from '../src/pages/CardDetail.vue';
import type { CardDetailServicesVue3, CardDetailVue3, CardVue3, PublicUserVue3 } from '../src/contracts';

function makeOwner(overrides: Partial<PublicUserVue3> = {}): PublicUserVue3 {
  return {
    id: 'u_1',
    uid: '012345678',
    username: 'bg7mom',
    displayName: 'Test Ham',
    callSign: 'BG7MOM',
    joinedAt: '2026-10-01',
    stats: { cards: 2, likesReceived: 10 },
    ...overrides,
  };
}

function makeCard(id = 'c_1', overrides: Partial<CardDetailVue3> = {}): CardDetailVue3 {
  return {
    id,
    title: 'Mountain QSL',
    callSign: 'BG7MOM',
    notes: '73 from 4500m',
    frontImage: '/uploads/' + id + '-front.webp',
    backImage: '/uploads/' + id + '-back.webp',
    stock: null,
    liked: false,
    likeCount: 5,
    exchangeCount: 2,
    status: 'approved',
    createdAt: '2026-10-01T12:00:00.000Z',
    ratio: { w: 3, h: 2 },
    canApply: true,
    isOwner: false,
    myExchange: null,
    owner: makeOwner(),
    ...overrides,
  };
}

function makeReco(id: string): CardVue3 {
  return {
    id,
    title: 'Reco ' + id,
    frontImage: '/uploads/' + id + '.webp',
    stock: 1,
    liked: false,
    likeCount: 1,
    ratio: { w: 3, h: 2 },
    owner: makeOwner({ id: 'u_other', uid: '000000002' }),
  };
}

function createDetailServices(initialUser: { id?: string; uid?: string } | null = null) {
  let user = initialUser;
  const auth = new Set<(u: { id?: string; uid?: string } | null) => void>();
  const viewer = { setImages: vi.fn(), setRatio: vi.fn(), destroy: vi.fn() };
  const createViewer = vi.fn(() => viewer);
  const shareCleanup = vi.fn();
  const bindShare = vi.fn(() => shareCleanup);
  const exchangeClose = vi.fn();
  const openExchange = vi.fn(() => ({ close: exchangeClose }));
  let exchangeReady = true;

  const services: CardDetailServicesVue3 = {
    t: s => s,
    user: () => user,
    onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    heartbeat: vi.fn(),
    likeCard: vi.fn().mockResolvedValue({ liked: true, likeCount: 6 }),
    image: vi.fn((img, src) => { img.src = src; }),
    placeholder: '/assets/placeholder.svg',
    formatDate: x => x.slice(0, 10),
    formatNumber: n => String(n),
    timeAgo: () => '3天前',
    ratioLabel: r => `${r?.w || 3} : ${r?.h || 2}`,
    statusText: s => s === 'pending' ? '审核中' : s,
    exchangeText: s => s === 'rejected' ? '已拒绝' : s === 'cancelled' ? '已取消' : s,
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    copyText: vi.fn().mockResolvedValue(true),
    getCardDetail: vi.fn().mockResolvedValue({ card: makeCard(), owner: makeOwner() }),
    getPublicCard: vi.fn(),
    getPopularCards: vi.fn().mockResolvedValue({
      items: [makeReco('c_1'), makeReco('r_1'), makeReco('r_1'), makeReco('r_2'), makeReco('r_3'), makeReco('r_4'), makeReco('r_5')],
      total: 7,
      page: 1,
      pages: 1,
    }),
    createViewer,
    bindShare,
    openExchange,
    isExchangeReady: () => exchangeReady,
  };

  return {
    services,
    viewer,
    createViewer,
    bindShare,
    shareCleanup,
    openExchange,
    exchangeClose,
    setUser(next: { id?: string; uid?: string } | null) {
      user = next;
      auth.forEach(fn => fn(next));
    },
    setExchangeReady(ready: boolean) {
      exchangeReady = ready;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('card detail page — vue3', () => {
  it('renders details, escapes XSS text, deduplicates recommendations, and prevents late title overwrite on unmount', async () => {
    let resolveDetail!: (value: { card: CardDetailVue3; owner: PublicUserVue3 }) => void;
    const { services, createViewer, viewer, bindShare, shareCleanup } = createDetailServices();
    const xssTitle = '<img src=x onerror=alert(1)>';
    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_1', { title: xssTitle, notes: '<script>bad()</script>', stock: null }),
      owner: makeOwner(),
    });

    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'c_1', services } });
    await flushPromises();

    expect(wrapper.find('h1.g-detail__title').text()).toBe(xssTitle);
    expect(wrapper.find('h1.g-detail__title img').exists()).toBe(false);
    expect(wrapper.find('.g-detail__notes').text()).toBe('<script>bad()</script>');
    expect(wrapper.text()).toContain('未设置');
    expect(document.title).toBe(xssTitle + ' · QSLink');
    expect(createViewer).toHaveBeenCalledTimes(1);
    expect(bindShare).toHaveBeenCalledTimes(1);

    const recoIds = wrapper.findAll('.g-detail__reco-grid .qsl-tile').map(el => el.attributes('data-card-id'));
    expect(recoIds).toEqual(['r_1', 'r_2', 'r_3', 'r_4']);

    wrapper.unmount();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
    expect(shareCleanup).toHaveBeenCalledTimes(1);

    // Late response after unmount must not touch document.title
    vi.mocked(services.getCardDetail).mockImplementationOnce(() => new Promise(resolve => { resolveDetail = resolve; }));
    const wrapper2 = mount(CardDetailVue3Page, { props: { cardId: 'c_2', services } });
    wrapper2.unmount();
    document.title = 'Other Page · QSLink';
    resolveDetail({ card: makeCard('c_2', { title: 'Late Title' }), owner: makeOwner() });
    await flushPromises();
    expect(document.title).toBe('Other Page · QSLink');
  });

  it('shows 404 and retryable error states while keeping 3D viewer destroyed', async () => {
    const { services, createViewer } = createDetailServices();
    vi.mocked(services.getCardDetail).mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));

    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'missing', services } });
    await flushPromises();
    expect(wrapper.find('.g-detail__missing').exists()).toBe(true);
    expect(wrapper.find('[data-retry]').exists()).toBe(false);
    expect(createViewer).not.toHaveBeenCalled();

    vi.mocked(services.getCardDetail).mockRejectedValueOnce(new Error('Network error'));
    await wrapper.setProps({ cardId: 'err_1' });
    await flushPromises();
    expect(wrapper.find('[data-retry]').exists()).toBe(true);

    vi.mocked(services.getCardDetail).mockResolvedValueOnce({ card: makeCard('err_1'), owner: makeOwner() });
    await wrapper.find('[data-retry]').trigger('click');
    await flushPromises();
    expect(wrapper.find('h1.g-detail__title').text()).toBe('Mountain QSL');
    expect(createViewer).toHaveBeenCalledTimes(1);
  });

  it('handles guest/owner/pending/approved/rejected/unavailable states and recommendation failure isolation', async () => {
    const { services } = createDetailServices({ id: 'u_2', uid: '000000002' });
    vi.mocked(services.getPopularCards).mockRejectedValueOnce(new Error('Reco failed'));
    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_1', { stock: 0, canApply: false }),
      owner: makeOwner({ id: 'u_1' }),
    });
    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'c_1', services } });
    await flushPromises();
    expect(wrapper.find('h1.g-detail__title').text()).toBe('Mountain QSL');
    expect(wrapper.find('[data-detail-reco]').exists()).toBe(false);
    expect(wrapper.text()).toContain('暂无库存');

    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_2', { myExchange: { id: 'e_1', status: 'pending' } }),
      owner: makeOwner({ id: 'u_1' }),
    });
    await wrapper.setProps({ cardId: 'c_2' });
    await flushPromises();
    expect(wrapper.text()).toContain('申请处理中');

    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_3', { myExchange: { id: 'e_2', status: 'rejected' }, canApply: true }),
      owner: makeOwner({ id: 'u_1' }),
    });
    await wrapper.setProps({ cardId: 'c_3' });
    await flushPromises();
    expect(wrapper.find('[data-apply]').exists()).toBe(true);
    expect(wrapper.text()).toContain('可以重新申请');

    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_4', { isOwner: true, status: 'pending' }),
      owner: makeOwner({ id: 'u_2' }),
    });
    await wrapper.setProps({ cardId: 'c_4' });
    await flushPromises();
    expect(wrapper.text()).toContain('编辑这张卡片');
    expect(wrapper.text()).toContain('审核中');
  });

  it('guards like against duplicates, guest redirect, share rebinding, and stale account responses', async () => {
    const { services, bindShare, setUser } = createDetailServices(null);
    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'c_1', services } });
    await flushPromises();

    await wrapper.find('[data-like]').trigger('click');
    expect(services.navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=/));

    setUser({ id: 'u_2', uid: '000000002' });
    await flushPromises();
    const shareCallsAfterAuth = bindShare.mock.calls.length;

    let resolveLike!: (res: { liked: boolean; likeCount: number }) => void;
    vi.mocked(services.likeCard).mockImplementationOnce(() => new Promise(r => { resolveLike = r; }));

    await wrapper.find('[data-like]').trigger('click');
    await wrapper.find('[data-like]').trigger('click');
    expect(services.likeCard).toHaveBeenCalledTimes(1);

    // Switch account while like is in flight -> stale response must be ignored
    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_1', { liked: false, likeCount: 5 }),
      owner: makeOwner(),
    });
    setUser({ id: 'u_3', uid: '000000003' });
    resolveLike({ liked: true, likeCount: 99 });
    await flushPromises();
    expect(wrapper.find('[data-like-count]').text()).toBe('5');

    // Successful like does not rebind share button
    const shareBeforeLike = bindShare.mock.calls.length;
    expect(shareBeforeLike).toBeGreaterThanOrEqual(shareCallsAfterAuth);
    vi.mocked(services.likeCard).mockResolvedValueOnce({ liked: true, likeCount: 6 });
    await wrapper.find('[data-like]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-like-count]').text()).toBe('6');
    expect(bindShare).toHaveBeenCalledTimes(shareBeforeLike);
  });

  it('cancels delayed exchange retry and closes exchange modal on unmount or auth change', async () => {
    vi.useFakeTimers();
    const { services, openExchange, exchangeClose, setExchangeReady, setUser } = createDetailServices({ id: 'u_2', uid: '000000002' });
    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'c_1', services } });
    await flushPromises();

    // Open and then switch account -> closes handle
    await wrapper.find('[data-apply]').trigger('click');
    expect(openExchange).toHaveBeenCalledTimes(1);
    setUser({ id: 'u_3', uid: '000000003' });
    expect(exchangeClose).toHaveBeenCalledTimes(1);
    await flushPromises();

    // Delayed retry cancelled on unmount
    setExchangeReady(false);
    await wrapper.find('[data-apply]').trigger('click');
    expect(services.toast).toHaveBeenCalledWith('换卡申请加载中，请稍后再试', 'info');
    setExchangeReady(true);
    wrapper.unmount();
    vi.advanceTimersByTime(1000);
    expect(openExchange).toHaveBeenCalledTimes(1);
  });

  it('clears private pending card title and breadcrumb immediately on auth loss before delayed 404 arrives', async () => {
    const { services, setUser } = createDetailServices({ id: 'u_1', uid: '012345678' });
    vi.mocked(services.getCardDetail).mockResolvedValueOnce({
      card: makeCard('c_priv', { title: 'Secret Pending Card', status: 'pending', isOwner: true }),
      owner: makeOwner({ id: 'u_1' }),
    });

    const wrapper = mount(CardDetailVue3Page, { props: { cardId: 'c_priv', services } });
    await flushPromises();
    expect(wrapper.find('[data-crumb-current]').text()).toBe('Secret Pending Card');
    expect(document.title).toBe('Secret Pending Card · QSLink');

    let rejectReload!: (err: unknown) => void;
    vi.mocked(services.getCardDetail).mockImplementationOnce(() => new Promise((_, reject) => { rejectReload = reject; }));

    // Auth invalidated -> immediately clears old card/owner, breadcrumb, and document.title
    setUser(null);
    await flushPromises();
    expect(wrapper.find('[data-crumb-current]').text()).toBe('卡片详情');
    expect(wrapper.text()).not.toContain('Secret Pending Card');
    expect(document.title).toBe('卡片详情 · QSLink');

    // Delayed 404 arrives -> shows 404 and updates document.title
    rejectReload(Object.assign(new Error('Not found'), { status: 404 }));
    await flushPromises();
    expect(wrapper.find('.g-detail__missing').exists()).toBe(true);
    expect(document.title).toBe('页面不存在 · QSLink');
  });
});
