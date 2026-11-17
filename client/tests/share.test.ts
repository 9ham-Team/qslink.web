import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ShareVue3Page from '../src/pages/Share.vue';
import type { CardDetailServicesVue3, CardDetailVue3, PublicUserVue3 } from '../src/contracts';

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

function makeCard(overrides: Partial<CardDetailVue3> = {}): CardDetailVue3 {
  return {
    id: 'c_1',
    title: 'Shared Card',
    callSign: 'BG7MOM',
    notes: 'Hello from share',
    frontImage: '/uploads/c_1-front.webp',
    backImage: '/uploads/c_1-back.webp',
    stock: 2,
    liked: false,
    likeCount: 8,
    exchangeCount: 1,
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

function createShareServices(initialUser: { id?: string; uid?: string } | null = null) {
  let user = initialUser;
  const auth = new Set<(u: { id?: string; uid?: string } | null) => void>();
  const viewer = { setImages: vi.fn(), setRatio: vi.fn(), destroy: vi.fn() };
  const createViewer = vi.fn(() => viewer);
  const exchangeClose = vi.fn();
  const openExchange = vi.fn(() => ({ close: exchangeClose }));

  const services: CardDetailServicesVue3 = {
    t: s => s,
    user: () => user,
    onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    heartbeat: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn((img, src) => { img.src = src; }),
    placeholder: '/assets/placeholder.svg',
    formatDate: x => x.slice(0, 10),
    formatNumber: n => String(n),
    timeAgo: () => '1小时前',
    ratioLabel: r => `${r?.w || 3} : ${r?.h || 2}`,
    statusText: s => s,
    exchangeText: s => s,
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    copyText: vi.fn().mockResolvedValue(true),
    getCardDetail: vi.fn(),
    getPublicCard: vi.fn().mockResolvedValue({ card: makeCard(), owner: makeOwner() }),
    getPopularCards: vi.fn(),
    createViewer,
    sharing:{getUrl:vi.fn().mockResolvedValue('https://example.test/s/AbCdEf'),poster:vi.fn(),qr:vi.fn(()=>document.createElement('canvas'))},
    openExchange,
    isExchangeReady: () => true,
  };

  return {
    services,
    viewer,
    createViewer,
    openExchange,
    exchangeClose,
    setUser(next: { id?: string; uid?: string } | null) {
      user = next;
      auth.forEach(fn => fn(next));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public share page — vue3', () => {
  it('preserves case-sensitive token, never falls back to card detail on 404, and renders guest CTAs', async () => {
    const { services, createViewer, viewer } = createShareServices(null);
    const wrapper = mount(ShareVue3Page, { props: { token: 'AbCdEf', services } });
    await flushPromises();

    expect(services.getPublicCard).toHaveBeenCalledWith('AbCdEf', expect.any(AbortSignal));
    expect(services.getCardDetail).not.toHaveBeenCalled();
    expect(wrapper.find('.g-share__lead .g-share__cta.is-guest').exists()).toBe(true);
    expect(wrapper.find('.g-share__aside .g-share__cta.is-guest').exists()).toBe(true);
    expect(createViewer).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-guest-register]').trigger('click');
    expect(services.navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/register\?next=/));

    vi.mocked(services.getPublicCard).mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    await wrapper.setProps({ token: 'ZzZzZz' });
    await flushPromises();
    expect(wrapper.find('[data-share-missing]').exists()).toBe(true);
    expect(wrapper.find('[data-retry]').exists()).toBe(false);
    expect(services.getCardDetail).not.toHaveBeenCalled();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it('renders owner, pending, approved, zero-stock, and canApply=false states without executable apply button', async () => {
    const { services, openExchange, exchangeClose, setUser } = createShareServices({ id: 'u_1', uid: '012345678' });
    vi.mocked(services.getPublicCard).mockResolvedValueOnce({
      card: makeCard({ isOwner: true }),
      owner: makeOwner(),
    });
    const wrapper = mount(ShareVue3Page, { props: { token: 'AbCdEf', services } });
    await flushPromises();
    expect(wrapper.find('.g-share__cta.is-owner').exists()).toBe(true);
    await wrapper.find('[data-copy-share]').trigger('click');
    expect(services.copyText).toHaveBeenCalledTimes(1);

    // Zero stock -> non-executable CTA
    vi.mocked(services.getPublicCard).mockResolvedValueOnce({
      card: makeCard({ stock: 0, canApply: false }),
      owner: makeOwner({ id: 'u_1' }),
    });
    setUser({ id: 'u_2', uid: '000000002' });
    await flushPromises();
    expect(wrapper.text()).toContain('暂无库存');
    expect(wrapper.find('[data-apply]').exists()).toBe(false);

    // canApply=false with non-zero stock -> non-executable CTA
    vi.mocked(services.getPublicCard).mockResolvedValueOnce({
      card: makeCard({ stock: 3, canApply: false }),
      owner: makeOwner({ id: 'u_1' }),
    });
    await wrapper.setProps({ token: 'XyZ123' });
    await flushPromises();
    expect(wrapper.text()).toContain('暂不可申请');
    expect(wrapper.find('[data-apply]').exists()).toBe(false);

    // Applicable user -> opens exchange and closes on unmount
    vi.mocked(services.getPublicCard).mockResolvedValueOnce({
      card: makeCard({ stock: 3, canApply: true }),
      owner: makeOwner({ id: 'u_1' }),
    });
    await wrapper.setProps({ token: 'Apply1' });
    await flushPromises();
    expect(document.title).toBe('Shared Card · QSLink');
    await wrapper.find('[data-apply]').trigger('click');
    expect(openExchange).toHaveBeenCalledTimes(1);

    // Token change with delayed 404 resets document.title immediately and on 404
    let rejectNext!: (err: unknown) => void;
    vi.mocked(services.getPublicCard).mockImplementationOnce(() => new Promise((_, reject) => { rejectNext = reject; }));
    await wrapper.setProps({ token: 'Gone99' });
    expect(document.title).toBe('QSL 卡片分享 · QSLink');
    rejectNext(Object.assign(new Error('Not found'), { status: 404 }));
    await flushPromises();
    expect(document.title).toBe('页面不存在 · QSLink');

    wrapper.unmount();
    expect(exchangeClose).toHaveBeenCalledTimes(1);
  });
});
