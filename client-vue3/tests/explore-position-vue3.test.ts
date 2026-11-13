import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useExplorePositionVue3 } from '../src/composables/use-explore-position-vue3';

let wrapper: VueWrapper;
let position: ReturnType<typeof useExplorePositionVue3>;
let frames: Map<number, FrameRequestCallback>;
let intent: ReturnType<typeof vi.fn>;
beforeEach(() => {
  frames = new Map();
  let next = 1;
  vi.stubGlobal('scrollY', 3900);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = next++; frames.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('scrollTo', vi.fn((options: ScrollToOptions) => { Object.defineProperty(window, 'scrollY', { value: options.top, configurable: true }); }));
  intent = vi.fn();
  wrapper = mount(defineComponent({ setup() {
    const root = ref<HTMLElement>();
    position = useExplorePositionVue3(root, intent);
    return () => h('div', { ref: root }, h('article', { 'data-card-id': 'anchor' }));
  } }));
  vi.spyOn(wrapper.find('article').element as HTMLElement, 'offsetTop', 'get').mockReturnValue(4100);
  vi.spyOn(wrapper.find('article').element as HTMLElement, 'offsetHeight', 'get').mockReturnValue(300);
});
afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function tick() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); }

it('captures an untransformed anchor and restores it after layout changes — vue3', async () => {
  const saved = position.capture();
  expect(saved).toEqual({ scrollY: 3900, anchorId: 'anchor', anchorOffset: 200 });
  vi.mocked(Object.getOwnPropertyDescriptor(wrapper.find('article').element, 'offsetTop')!.get!).mockReturnValue(4600);
  const pending = position.restore(saved);
  await nextTick(); tick(); tick();
  expect(await pending).toBe(true);
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 4400, behavior: 'instant' });
});

it('lets user scrolling cancel pending restoration — vue3', async () => {
  const pending = position.restore({ scrollY: 3900, anchorOffset: 0 });
  await nextTick();
  window.dispatchEvent(new Event('wheel'));
  expect(await pending).toBe(false);
  expect(frames.size).toBe(0);
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(intent).toHaveBeenCalledOnce();
});

it('cleans animation frames and window listeners when leaving — vue3', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const pending = position.restore({ scrollY: 3900, anchorOffset: 0 });
  await nextTick();
  wrapper.unmount();
  expect(await pending).toBe(false);
  expect(frames.size).toBe(0);
  for (const name of ['wheel', 'touchmove', 'pointerdown', 'keydown', 'scroll']) expect(remove).toHaveBeenCalledWith(name, expect.any(Function));
});
