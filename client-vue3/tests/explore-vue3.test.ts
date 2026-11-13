import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import ExploreVue3 from '../src/pages/Explore-vue3.vue';
import type { CardPageVue3, CardVue3, ServicesVue3 } from '../src/contracts-vue3';

let wrapper: VueWrapper;
beforeEach(() => { vi.stubGlobal('scrollTo', vi.fn()); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const owner = { uid: '012345678', displayName: 'Test', joinedAt: '2026-01-01', stats: { cards: 24, likesReceived: 0 } };
function result(id = 'a', page = 1): CardPageVue3 {
  return { items: [{ id, title: '<script>card</script>', stock: null, liked: false, likeCount: 0, ratio: { w: 3, h: 2 }, owner } as CardVue3], total: 24, page, pages: 2 };
}
function setup(query = '', listCards = vi.fn().mockResolvedValue(result())) {
  const auth = new Set<Function>();
  const services: ServicesVue3 = {
    t: value => value, user: () => null, onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    listCards, getSpace: vi.fn(), likeCard: vi.fn(), image: vi.fn(),
    setQuery: vi.fn(), celebrate: vi.fn(), placeholder: '', formatDate: value => value, formatNumber: String,
    navigate: vi.fn(), toast: vi.fn(), share: vi.fn(),
  };
  wrapper = mount(ExploreVue3, { props: { query: new URLSearchParams(query), services } });
  return { services, auth };
}

it('hydrates URL filters, escapes card content, and normalizes unsupported sort — vue3', async () => {
  const { services } = setup('callSign=%20bg7%20&sort=oldest');
  await flushPromises();
  expect(services.listCards).toHaveBeenCalledWith({ callSign: 'bg7', sort: 'oldest' }, 1, expect.any(AbortSignal));
  expect(wrapper.find('.qsl-tile-title').text()).toBe('<script>card</script>');
  expect(wrapper.find('script').exists()).toBe(false);
  await wrapper.setProps({ query: new URLSearchParams('sort=bad') }); await flushPromises();
  expect(services.listCards).toHaveBeenLastCalledWith({ callSign: '', sort: 'latest' }, 1, expect.any(AbortSignal));
});

it('debounces search and aborts the old request before the new query is sent — vue3', async () => {
  const { services } = setup(); await flushPromises();
  vi.useFakeTimers();
  const oldSignal = vi.mocked(services.listCards).mock.calls[0][2];
  await wrapper.find('input').setValue('B');
  await wrapper.find('input').setValue('BG7');
  expect(oldSignal.aborted).toBe(true);
  expect(services.listCards).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(320);
  expect(services.listCards).toHaveBeenCalledTimes(2);
  expect(services.setQuery).toHaveBeenCalledWith({ callSign: 'BG7', sort: null });
});

it('sort changes supersede in-flight requests rather than dropping a filter change — vue3', async () => {
  const { services } = setup(); await flushPromises();
  let resolveOld!: (value: CardPageVue3) => void;
  vi.mocked(services.listCards).mockImplementationOnce(() => new Promise(done => { resolveOld = done; })).mockResolvedValueOnce(result('new'));
  await wrapper.findAll('.segmented button')[1].trigger('click');
  const oldSignal = vi.mocked(services.listCards).mock.calls[1][2];
  await wrapper.findAll('.segmented button')[2].trigger('click'); await flushPromises();
  resolveOld(result('old')); await flushPromises();
  expect(oldSignal.aborted).toBe(true);
  expect(wrapper.find('[data-card-id="new"]').exists()).toBe(true);
  expect(wrapper.find('[data-card-id="old"]').exists()).toBe(false);
});

it('preserves cards and retries page two when loading more fails — vue3', async () => {
  const { services } = setup(); await flushPromises();
  vi.mocked(services.listCards).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result('b', 2));
  await wrapper.find('.g-explore__more button').trigger('click'); await flushPromises();
  expect(wrapper.find('[data-card-id="a"]').exists()).toBe(true);
  await wrapper.find('.g-error-panel button').trigger('click'); await flushPromises();
  expect(services.listCards).toHaveBeenLastCalledWith({ callSign: '', sort: 'latest' }, 2, expect.any(AbortSignal));
  expect(wrapper.findAll('.qsl-tile')).toHaveLength(2);
});

it('supports filtered empty/reset and sends guests to login before upload — vue3', async () => {
  const { services } = setup('callSign=MISSING&sort=popular');
  await flushPromises();
  vi.mocked(services.listCards).mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 });
  await wrapper.findAll('.segmented button')[2].trigger('click'); await flushPromises();
  expect(wrapper.find('.empty-state h3').text()).toBe('没有找到这个呼号的卡片');
  await wrapper.find('.empty-state button').trigger('click'); await flushPromises();
  expect(services.setQuery).toHaveBeenLastCalledWith({ callSign: null, sort: null });
  expect(wrapper.find('.empty-state h3').text()).toBe('广场还空着');
  await wrapper.find('.empty-state button').trigger('click');
  expect(services.navigate).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fcards%2Fnew');
});

it('cancels pending debounce and releases account subscriptions on leaving — vue3', async () => {
  const { services, auth } = setup(); await flushPromises();
  vi.useFakeTimers();
  await wrapper.find('input').setValue('BG7');
  wrapper.unmount();
  await vi.advanceTimersByTimeAsync(500);
  expect(services.listCards).toHaveBeenCalledTimes(1);
  expect(auth.size).toBe(0);
});

it('keeps account-dependent likes isolated when authentication changes — vue3', async () => {
  const { services, auth } = setup(); await flushPromises();
  const prior = vi.mocked(services.listCards).mock.calls[0][2];
  for (const fn of [...auth]) fn({ uid: 'other' });
  await flushPromises();
  expect(prior.aborted).toBe(true);
  expect(services.listCards).toHaveBeenCalledTimes(2);
});

it('does not submit intermediate IME text or its confirmation Enter — vue3', async () => {
  const { services } = setup(); await flushPromises();
  vi.useFakeTimers();
  const input = wrapper.find('input');
  await input.trigger('compositionstart');
  input.element.value = 'JA';
  await input.trigger('input', { isComposing: true });
  await input.trigger('keydown', { key: 'Enter', isComposing: true });
  await vi.advanceTimersByTimeAsync(400);
  expect(services.listCards).toHaveBeenCalledTimes(1);
  await input.trigger('compositionend');
  await vi.advanceTimersByTimeAsync(320);
  expect(services.listCards).toHaveBeenLastCalledWith({ callSign: 'JA', sort: 'latest' }, 1, expect.any(AbortSignal));
});

it('escapes an initial error and can retry without changing filters — vue3', async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>')).mockResolvedValueOnce(result('recovered'));
  const { services } = setup('sort=popular', list); await flushPromises();
  expect(wrapper.find('.g-error-panel p').text()).toBe('<img src=x onerror=alert(1)>');
  expect(wrapper.find('.g-error-panel img').exists()).toBe(false);
  expect(services.toast).toHaveBeenCalledWith('<img src=x onerror=alert(1)>', 'error');
  await wrapper.find('.g-error-panel button').trigger('click'); await flushPromises();
  expect(wrapper.find('[data-card-id="recovered"]').exists()).toBe(true);
  expect(list).toHaveBeenLastCalledWith({ callSign: '', sort: 'popular' }, 1, expect.any(AbortSignal));
});
