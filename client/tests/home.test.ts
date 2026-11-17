import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import HomeVue3 from '../src/pages/Home.vue';
import type { CardVue3, HomeServicesVue3 } from '../src/contracts';

function makeCard(id: string, overrides: Partial<CardVue3> = {}): CardVue3 {
  return {
    id,
    title: 'Card ' + id,
    frontImage: '/uploads/' + id + '-front.webp',
    backImage: '/uploads/' + id + '-back.webp',
    stock: 3,
    liked: false,
    likeCount: 5,
    ratio: { w: 3, h: 2 },
    owner: {
      uid: '000000001',
      username: 'bg7mom',
      displayName: 'Test Ham',
      callSign: 'BG7MOM',
      joinedAt: '2026-10-01',
      stats: { cards: 1, likesReceived: 5 },
    },
    ...overrides,
  };
}

function createHomeServices(initialUser: { uid?: string } | null = null) {
  const auth = new Set<(user: { uid?: string } | null) => void>();
  const viewer = { setImages: vi.fn(), setRatio: vi.fn(), destroy: vi.fn() };
  const createViewer = vi.fn(() => viewer);
  const service: HomeServicesVue3 = {
    t: source => source,
    user: () => initialUser,
    onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn().mockResolvedValue({ liked: true, likeCount: 6 }),
    image: vi.fn((img, src) => { img.src = src; }),
    placeholder: '/assets/placeholder.svg',
    formatDate: x => x,
    formatDateTime: x => x || '',
    formatNumber: n => String(n),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(() => ({ close: vi.fn() })),
    getHomeCards: vi.fn().mockResolvedValue({
      items: [
        makeCard('c0', { frontImage: '', likeCount: 10 }),
        makeCard('c1', { ratio: { w: 4, h: 5 }, likeCount: 12 }),
        makeCard('c2', { likeCount: 3 }),
        makeCard('c3', { likeCount: 4 }),
        makeCard('c4', { likeCount: 5 }),
        makeCard('c5', { likeCount: 6 }),
      ],
      total: 120,
      page: 1,
      pages: 3,
    }),
    getStats: vi.fn().mockResolvedValue({ userCount: 42 }),
    listAnnouncements: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 1, pages: 1 }),
    dismissAnnouncement: vi.fn().mockResolvedValue({ dismissed: true }),
    scrollToHash: vi.fn(),
    createViewer,
  };
  return { service, auth, viewer, createViewer };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('home page — vue3', () => {
  it('picks first card with frontImage for hero, preserves its ratio without recreating viewer, and computes stats accurately', async () => {
    vi.useFakeTimers();
    const { service, viewer, createViewer } = createHomeServices();
    const wrapper = mount(HomeVue3, { props: { services: service } });
    await flushPromises();
    vi.advanceTimersByTime(1200);
    await flushPromises();

    // Viewer created once with placeholder, then updated via setters (never destroyed/recreated)
    expect(createViewer).toHaveBeenCalledTimes(1);
    expect(viewer.destroy).not.toHaveBeenCalled();
    expect(viewer.setImages).toHaveBeenCalledWith('/uploads/c1-front.webp', '/uploads/c1-back.webp');
    expect(viewer.setRatio).toHaveBeenCalledWith({ w: 4, h: 5 });

    // Stats: total=120 from /api/cards, userCount=42 from /api/stats, likes=10+12+3+4+5+6=40
    const stats = wrapper.findAll('.g-stat dd span').map(node => node.text());
    expect(stats).toEqual(['120', '42', '40']);

    // Featured excludes hero c1 since >= 4 other cards remain (c0, c2, c3, c4, c5)
    const tileIds = wrapper.findAll('.g-showcase__grid .qsl-tile').map(node => node.attributes('data-card-id'));
    expect(tileIds).toEqual(['c0', 'c2', 'c3', 'c4', 'c5']);

    wrapper.unmount();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it('renders empty state with brand placeholder when card library is empty and keeps dash when /api/stats fails', async () => {
    const { service, viewer } = createHomeServices();
    vi.mocked(service.getHomeCards).mockResolvedValue({ items: [], total: 0, page: 1, pages: 0 });
    vi.mocked(service.getStats).mockRejectedValue(new Error('stats down'));

    const wrapper = mount(HomeVue3, { props: { services: service } });
    await flushPromises();

    expect(wrapper.find('.empty-state-title').text()).toBe('广场还在等第一张卡片');
    expect(wrapper.findAll('.g-stat dd span').map(node => node.text())).toEqual(['0', '—', '0']);
    expect(viewer.setImages).not.toHaveBeenCalled();

    await wrapper.find('.empty-state button').trigger('click');
    expect(service.navigate).toHaveBeenCalledWith('/login?next=' + encodeURIComponent('/dashboard/cards/new'));
    wrapper.unmount();
  });

  it('shows error panel on cards failure and retries successfully', async () => {
    const { service } = createHomeServices();
    vi.mocked(service.getHomeCards)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ items: [makeCard('ok1')], total: 1, page: 1, pages: 1 });

    const wrapper = mount(HomeVue3, { props: { services: service } });
    await flushPromises();

    expect(wrapper.find('.g-error-panel').exists()).toBe(true);
    expect(service.toast).toHaveBeenCalledWith('network down', 'error');

    await wrapper.find('[data-retry]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.g-error-panel').exists()).toBe(false);
    expect(wrapper.find('[data-card-id="ok1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('updates CTAs and reloads cards on auth changes, toggles FAQ, and aborts requests on unmount', async () => {
    const { service, auth } = createHomeServices(null);
    const wrapper = mount(HomeVue3, { props: { services: service } });
    await flushPromises();

    expect(wrapper.find('.g-hero__actions .btn-primary').attributes('href')).toBe('/register');
    expect(wrapper.find('.g-join__actions .btn-primary').attributes('href')).toBe('/register');

    for (const fn of [...auth]) fn({ uid: '012345678' });
    await flushPromises();

    expect(wrapper.find('.g-hero__actions .btn-primary').attributes('href')).toBe('/dashboard/cards/new');
    expect(wrapper.find('.g-join__actions .btn-primary').attributes('href')).toBe('/dashboard/cards/new');
    expect(service.getHomeCards).toHaveBeenCalledTimes(2);

    const faqItems = wrapper.findAll('.g-faq__item');
    expect(faqItems[0].attributes('data-expanded')).toBe('true');
    expect(faqItems[1].attributes('data-expanded')).toBe('false');
    await faqItems[1].find('summary').trigger('click');
    expect(faqItems[1].attributes('data-expanded')).toBe('true');

    const cardSignal = vi.mocked(service.getHomeCards).mock.calls[1][0];
    const statsSignal = vi.mocked(service.getStats).mock.calls[0][0];
    wrapper.unmount();
    expect(cardSignal.aborted).toBe(true);
    expect(statsSignal.aborted).toBe(true);
    expect(auth.size).toBe(0);
  });
});
