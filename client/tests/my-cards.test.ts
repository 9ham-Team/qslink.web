import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MyCardsVue3 from '../src/pages/MyCards.vue';
import type { CardManageServicesVue3, MyCardItemVue3, RouteContextVue3 } from '../src/contracts';

function makeCard(overrides: Partial<MyCardItemVue3> = {}): MyCardItemVue3 {
  return {
    id: 'c1',
    title: '雪线之上的守候',
    callSign: 'BG4JEC',
    frontImage: '/uploads/f1.webp',
    backImage: '/uploads/b1.webp',
    stock: 5,
    liked: false,
    likeCount: 2,
    status: 'approved',
    ratio: { w: 3, h: 2 },
    updatedAt: '2026-11-10T00:00:00.000Z',
    owner: { uid: 'u1', username: 'bg4jec', displayName: 'BG4JEC', joinedAt: '2026-01-01', stats: { cards: 1, likesReceived: 2 } },
    ...overrides,
  };
}

function makeServices(overrides: Partial<CardManageServicesVue3> = {}) {
  const authListeners = new Set<(user: { id?: string; uid?: string } | null) => void>();
  let currentUser: { id?: string; uid?: string } | null = { id: 'u1', uid: 'u1' };

  const services: CardManageServicesVue3 = {
    t: s => s,
    user: () => currentUser,
    onAuth: fn => {
      authListeners.add(fn);
      return () => authListeners.delete(fn);
    },
    getSpace: vi.fn(),
    listCards: vi.fn(),
    setQuery: vi.fn(),
    celebrate: vi.fn(),
    likeCard: vi.fn(),
    image: vi.fn(),
    placeholder: '/placeholder.svg',
    formatDate: s => s,
    formatNumber: n => String(n),
    navigate: vi.fn(),
    toast: vi.fn(),
    share: vi.fn(),
    token: () => 'tok-1',
    i18nError: s => s,
    resetEdits: vi.fn(),
    isLanguageSwitching: () => false,
    timeAgo: () => '1 天前',
    statusText: s => ({ approved: '已通过', pending: '审核中', rejected: '已拒绝' }[s] || s),
    getMyCards: vi.fn().mockResolvedValue({ items: [] }),
    getCardDetail: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    updateCardStock: vi.fn(),
    deleteCard: vi.fn().mockResolvedValue({ ok: true }),
    shareCard: vi.fn().mockResolvedValue(true),
    getContestEntry: vi.fn(),
    createImageProcessor: () => ({ process: vi.fn(), destroy: vi.fn() }),
    setLeaveGuard: () => () => {},
    ...overrides,
  };

  return {
    services,
    emitAuth(nextUser: { id?: string; uid?: string } | null) {
      currentUser = nextUser;
      for (const fn of authListeners) fn(nextUser);
    },
  };
}

function makeCtx(search = '', hash = ''): RouteContextVue3 {
  return { path: '/dashboard/cards', params: {}, query: new URLSearchParams(search), hash };
}

describe('MyCards', () => {
  it('redirects unauthenticated visitors to login', async () => {
    const { services } = makeServices({ user: () => null });
    mount(MyCardsVue3, { props: { ctx: makeCtx(), services } });
    await flushPromises();
    expect(services.navigate).toHaveBeenCalledWith('/login?next=' + encodeURIComponent('/dashboard/cards'), { replace: true });
    expect(services.getMyCards).not.toHaveBeenCalled();
  });

  it('filters by URL status, updates query, and displays counts', async () => {
    const items = [
      makeCard({ id: 'c1', status: 'approved', title: '已通过卡' }),
      makeCard({ id: 'c2', status: 'pending', title: '审核中卡' }),
      makeCard({ id: 'c3', status: 'rejected', title: '被驳回卡', rejectReason: '图片模糊' }),
    ];
    const { services } = makeServices({ getMyCards: vi.fn().mockResolvedValue({ items }) });
    const wrapper = mount(MyCardsVue3, { props: { ctx: makeCtx('?status=pending'), services } });
    await flushPromises();

    expect(wrapper.find('[data-filter="pending"]').classes()).toContain('is-active');
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(1);
    expect(wrapper.find('.f-card-cell').text()).toContain('审核中卡');
    expect(wrapper.find('[data-count-for="all"]').text()).toBe('3');
    expect(wrapper.find('[data-count-for="rejected"]').text()).toBe('1');

    await wrapper.find('[data-filter="rejected"]').trigger('click');
    expect(services.setQuery).toHaveBeenCalledWith({ status: 'rejected' });
    expect(wrapper.find('.f-card-reject').text()).toContain('图片模糊');

    await wrapper.find('[data-filter="all"]').trigger('click');
    expect(services.setQuery).toHaveBeenCalledWith({ status: null });
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(3);
  });

  it('follows same-path query navigation without refetching, including clearing status and hash-only changes — vue3', async () => {
    const items = [
      makeCard({ id: 'c1', status: 'approved', title: '已通过卡' }),
      makeCard({ id: 'c2', status: 'pending', title: '审核中卡' }),
      makeCard({ id: 'c3', status: 'rejected', title: '被驳回卡' }),
    ];
    const getMyCards = vi.fn().mockResolvedValue({ items });
    const { services } = makeServices({ getMyCards });
    const wrapper = mount(MyCardsVue3, { props: { ctx: makeCtx('?status=pending'), services } });
    await flushPromises();
    expect(wrapper.find('[data-filter="pending"]').classes()).toContain('is-active');
    expect(getMyCards).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ ctx: makeCtx('?status=approved') });
    await flushPromises();
    expect(wrapper.find('[data-filter="approved"]').classes()).toContain('is-active');
    expect(wrapper.find('.f-card-cell').text()).toContain('已通过卡');

    await wrapper.setProps({ ctx: makeCtx('?status=rejected') });
    await wrapper.setProps({ ctx: makeCtx('?status=approved', '#grid') });
    await flushPromises();
    expect(wrapper.find('[data-filter="approved"]').classes()).toContain('is-active');

    await wrapper.setProps({ ctx: makeCtx('', '#grid') });
    await flushPromises();
    expect(wrapper.find('[data-filter="all"]').classes()).toContain('is-active');
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(3);
    expect(getMyCards).toHaveBeenCalledTimes(1);
    expect(services.setQuery).not.toHaveBeenCalled();
  });

  it('handles delete confirmation, cancellation, failure, and success', async () => {
    const items = [makeCard({ id: 'c1', title: '待删卡片' })];
    const deleteCard = vi.fn()
      .mockRejectedValueOnce(new Error('删除失败'))
      .mockResolvedValueOnce({ ok: true });
    const { services } = makeServices({
      getMyCards: vi.fn().mockResolvedValue({ items }),
      deleteCard,
    });
    const wrapper = mount(MyCardsVue3, { props: { ctx: makeCtx(), services }, attachTo: document.body });
    await flushPromises();

    // Cancel delete
    await wrapper.find('[data-act="delete"]').trigger('click');
    expect(document.body.querySelector('[data-confirm-delete]')).not.toBeNull();
    const cancelBtn = Array.from(document.body.querySelectorAll('.modal-actions button')).find(b => b.textContent?.includes('保留')) as HTMLButtonElement;
    cancelBtn.click();
    await flushPromises();
    expect(deleteCard).not.toHaveBeenCalled();
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(1);

    // Failed delete keeps card
    await wrapper.find('[data-act="delete"]').trigger('click');
    (document.body.querySelector('[data-confirm-delete]') as HTMLButtonElement).click();
    await flushPromises();
    expect(deleteCard).toHaveBeenCalledTimes(1);
    expect(services.toast).toHaveBeenCalledWith('删除失败', 'error');
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(1);

    // Retry delete succeeds
    await wrapper.find('[data-act="delete"]').trigger('click');
    (document.body.querySelector('[data-confirm-delete]') as HTMLButtonElement).click();
    await flushPromises();
    expect(deleteCard).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.f-card-cell')).toHaveLength(0);
    wrapper.unmount();
  });

  it('updates stock via shared dialog without altering status or rejectReason', async () => {
    const items = [makeCard({ id: 'c1', status: 'rejected', rejectReason: '原原因', stock: 3 })];
    const updateCardStock = vi.fn().mockResolvedValue({
      card: { id: 'c1', stock: 0, updatedAt: '2026-11-14T00:00:00.000Z' },
    });
    const { services } = makeServices({
      getMyCards: vi.fn().mockResolvedValue({ items }),
      updateCardStock,
    });
    const wrapper = mount(MyCardsVue3, { props: { ctx: makeCtx(), services }, attachTo: document.body });
    await flushPromises();

    await wrapper.find('[data-act="stock"]').trigger('click');
    const stockInput = document.body.querySelector('[data-stock]') as HTMLInputElement;
    expect(stockInput.value).toBe('3');
    stockInput.value = '0';
    stockInput.dispatchEvent(new Event('input'));
    (document.body.querySelector('[data-stock-save]') as HTMLButtonElement).click();
    await flushPromises();

    expect(updateCardStock).toHaveBeenCalledWith('c1', 0, expect.any(AbortSignal));
    expect(wrapper.find('.f-card-reject').text()).toContain('原原因');
    expect(wrapper.find('.qsl-tile-info .hint').text()).toContain('暂无库存');
    wrapper.unmount();
  });

  it('isolates account switches and aborts stale requests', async () => {
    let resolveFirst!: (val: { items: MyCardItemVue3[] }) => void;
    const getMyCards = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
      .mockResolvedValueOnce({ items: [makeCard({ id: 'c2', title: '新账号卡片' })] });

    const { services, emitAuth } = makeServices({ getMyCards });
    const wrapper = mount(MyCardsVue3, { props: { ctx: makeCtx(), services } });

    // Same-account profile refresh should not wipe or reload
    emitAuth({ id: 'u1', uid: 'u1' });
    expect(getMyCards).toHaveBeenCalledTimes(1);

    // Switch to u2 before first request resolves
    emitAuth({ id: 'u2', uid: 'u2' });
    resolveFirst({ items: [makeCard({ id: 'c1', title: '旧账号卡片' })] });
    await flushPromises();

    expect(wrapper.findAll('.f-card-cell')).toHaveLength(1);
    expect(wrapper.text()).toContain('新账号卡片');
    expect(wrapper.text()).not.toContain('旧账号卡片');
  });
});
