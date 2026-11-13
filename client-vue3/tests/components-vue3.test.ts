import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SpaceVue3 from '../src/pages/Space-vue3.vue';
import Card3DViewerVue3 from '../src/components/Card3DViewer-vue3.vue';
import CardTileVue3 from '../src/components/CardTile-vue3.vue';
import { registerSpaceVue3 } from '../src/bridge-vue3';
import type { CardVue3, ServicesVue3, SpaceResponseVue3 } from '../src/contracts-vue3';

const user = { uid: '012345678', displayName: '<img src=x onerror=alert(1)>', bio: 'A'.repeat(60), joinedAt: '2026-10-01', stats: { cards: 2, likesReceived: 0 } };
const card = (id: string): CardVue3 => ({ id, title: '<script>unsafe</script>', frontImage: '/assets/stamp.svg', ratio: { w: 3, h: 2 }, owner: user, liked: false, likeCount: 0, stock: 0 });
const response = (id = 'a', page = 1, pages = 2): SpaceResponseVue3 => ({ user, cards: { items: [card(id)], total: 2, page, pages }, url: null });
function services() {
  const auth = new Set<(user: { uid?: string } | null) => void>();
  const close = vi.fn();
  const service: ServicesVue3 = {
    t: source => source, user: () => null,
    onAuth: fn => { auth.add(fn); return () => auth.delete(fn); },
    getSpace: vi.fn().mockResolvedValue(response()),
    likeCard: vi.fn().mockResolvedValue({ liked: true, likeCount: 1 }),
    image: vi.fn(), placeholder: '/assets/stamp.svg', formatDate: x => x,
    formatNumber: x => String(x), navigate: vi.fn(), toast: vi.fn(), share: vi.fn(() => ({ close })),
  };
  return { service, auth, close };
}
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('public space — vue3', () => {
  it('escapes content, persists view, expands bio, and disposes modal and auth subscriptions', async () => {
    const { service, auth, close } = services();
    const wrapper = mount(SpaceVue3, { props: { uid: user.uid, services: service } });
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe(user.displayName);
    expect(wrapper.find('h1 img').exists()).toBe(false);
    expect(wrapper.html()).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(wrapper.find('script').exists()).toBe(false);
    await wrapper.find('.g-space__bio-toggle').trigger('click');
    expect(wrapper.find('.g-space__bio-toggle').attributes('aria-expanded')).toBe('true');
    await wrapper.findAll('.g-space__views button')[1].trigger('click');
    expect(localStorage.getItem('qsl_space_view')).toBe('large');
    await wrapper.find('.g-space__actions button').trigger('click');
    expect(service.share).toHaveBeenCalled();
    const signal = vi.mocked(service.getSpace).mock.calls[0][3];
    wrapper.unmount();
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(auth.size).toBe(0);
  });

  it('keeps the old collection after sort failure and retries page one instead of appending', async () => {
    const { service } = services();
    vi.mocked(service.getSpace).mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response('b'));
    const wrapper = mount(SpaceVue3, { props: { uid: user.uid, services: service } });
    await flushPromises();
    await wrapper.find('select').setValue('popular');
    await flushPromises();
    expect(wrapper.find('[data-card-id="a"]').exists()).toBe(true);
    expect(wrapper.find('select').attributes('disabled')).toBeUndefined();
    await wrapper.find('.g-space__more button').trigger('click');
    await flushPromises();
    expect(service.getSpace).toHaveBeenLastCalledWith(user.uid, 'popular', 1, expect.any(AbortSignal));
    expect(wrapper.find('[data-card-id="a"]').exists()).toBe(false);
    expect(wrapper.find('[data-card-id="b"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ignores an old uid response, retries initial errors, and renders a 404 without retry', async () => {
    const { service } = services();
    let resolveOld!: (result: SpaceResponseVue3) => void;
    vi.mocked(service.getSpace).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 }));
    const wrapper = mount(SpaceVue3, { props: { uid: user.uid, services: service } });
    await wrapper.setProps({ uid: '999999999' });
    await flushPromises();
    resolveOld(response());
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('这个主页暂时无法访问');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('discards pending requests on unmount without toasts or detached updates', async () => {
    const { service } = services();
    let reject!: (err: Error) => void;
    vi.mocked(service.getSpace).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    const wrapper = mount(SpaceVue3, { props: { uid: user.uid, services: service } });
    wrapper.unmount();
    reject(new Error('late'));
    await flushPromises();
    expect(service.toast).not.toHaveBeenCalled();
  });
});

it('aborts a viewer-dependent collection and closes sharing on account changes — vue3', async () => {
  const { service, auth, close } = services();
  const wrapper = mount(SpaceVue3, { props: { uid: user.uid, services: service } });
  await flushPromises();
  await wrapper.find('.g-space__actions button').trigger('click');
  const oldSignal = vi.mocked(service.getSpace).mock.calls[0][3];
  for (const fn of [...auth]) fn({ uid: 'different' });
  await flushPromises();
  expect(oldSignal.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(service.getSpace).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});

it('creates a 3D engine once, uses setters, and destroys it once — vue3', async () => {
  const viewer = { setImages: vi.fn(), setRatio: vi.fn(), destroy: vi.fn() };
  const create = vi.fn(() => viewer);
  const wrapper = mount(Card3DViewerVue3, { props: { front: 'a', ratio: { w: 3, h: 2 }, create } });
  await wrapper.setProps({ front: 'b', ratio: { w: 2, h: 3 } });
  expect(create).toHaveBeenCalledOnce();
  expect(viewer.setImages).toHaveBeenCalledWith('b', undefined);
  expect(viewer.setRatio).toHaveBeenCalledWith({ w: 2, h: 3 });
  wrapper.unmount();
  expect(viewer.destroy).toHaveBeenCalledOnce();
});

it('cleans the responsive image observer and ignores a late like after unmount — vue3', async () => {
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; });
  const { service } = services();
  service.user = () => ({ uid: user.uid });
  let resolve!: (value: { liked: boolean; likeCount: number }) => void;
  vi.mocked(service.likeCard).mockImplementation(() => new Promise(done => { resolve = done; }));
  const wrapper = mount(CardTileVue3, { props: { card: card('a'), services: service } });
  await wrapper.find('.qsl-like').trigger('click');
  expect(wrapper.find('.qsl-like').attributes('disabled')).toBeDefined();
  wrapper.unmount();
  resolve({ liked: true, likeCount: 10 });
  await flushPromises();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(wrapper.emitted('liked')).toBeUndefined();
});

it('does not mount a late chunk after navigation and returns idempotent cleanup — vue3', async () => {
  let render!: (root: HTMLElement, ctx: unknown) => () => void;
  let resolve!: (module: { mountSpaceVue3: ReturnType<typeof vi.fn> }) => void;
  const off = vi.fn();
  const qsl = { t: (x: string) => x, escapeHtml: (x: string) => x, on: vi.fn(() => off), registerPage: (_: string, page: any) => { render = page.render; } };
  registerSpaceVue3(qsl as any, () => new Promise(done => { resolve = done; }));
  const root = document.createElement('div');
  const cleanup = render(root, { params: { uid: user.uid } });
  cleanup(); cleanup();
  const mountSpaceVue3 = vi.fn();
  resolve({ mountSpaceVue3 });
  await flushPromises();
  expect(mountSpaceVue3).not.toHaveBeenCalled();
  expect(off).toHaveBeenCalledOnce();
  expect(root.childElementCount).toBe(0);
});
