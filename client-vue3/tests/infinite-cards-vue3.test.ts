import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import InfiniteCardsVue3 from '../src/components/InfiniteCards-vue3.vue';

let wrapper: VueWrapper;
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
function setup(extra = {}) {
  let notify!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  wrapper = mount(InfiniteCardsVue3, { props: { visible: true, enabled: true, loading: false, failed: false, t: value => value, ...extra } });
  const rect = vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 700, 200, 20));
  return { notify: () => notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver), rect, disconnect, observe };
}

it('loads near the bottom without a button and rechecks layout after each page — vue3', async () => {
  const { notify, rect } = setup();
  notify(); await flushPromises();
  expect(wrapper.find('button').exists()).toBe(false);
  expect(wrapper.emitted('load')).toHaveLength(1);
  await wrapper.setProps({ loading: true });
  notify(); await flushPromises();
  expect(wrapper.emitted('load')).toHaveLength(1);
  rect.mockReturnValue(new DOMRect(0, 3000, 200, 20));
  await wrapper.setProps({ loading: false });
  expect(wrapper.emitted('load')).toHaveLength(1);
});

it('does not auto-retry failures or load while restoration/search is paused — vue3', async () => {
  const { notify } = setup({ failed: true });
  notify(); await flushPromises();
  expect(wrapper.emitted('load')).toBeUndefined();
  await wrapper.setProps({ failed: false, enabled: false });
  notify(); await flushPromises();
  expect(wrapper.emitted('load')).toBeUndefined();
});

it('disconnects and ignores late observer callbacks on unmount — vue3', async () => {
  const { notify, disconnect, observe } = setup();
  expect(observe).toHaveBeenCalledOnce();
  wrapper.unmount(); notify(); await flushPromises();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(wrapper.emitted('load')).toBeUndefined();
});

it('keeps a keyboard-operable fallback when IntersectionObserver is unavailable — vue3', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  wrapper = mount(InfiniteCardsVue3, { props: { visible: true, enabled: true, loading: false, failed: false, t: value => value } });
  await wrapper.find('button').trigger('click');
  expect(wrapper.emitted('load')).toHaveLength(1);
});
