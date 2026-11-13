import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { usePointerTiltVue3 } from '../src/composables/use-pointer-tilt-vue3';

let wrapper: VueWrapper;
let fine: EventTarget & { matches: boolean };
let reduced: EventTarget & { matches: boolean };
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  fine = Object.assign(new EventTarget(), { matches: true });
  reduced = Object.assign(new EventTarget(), { matches: false });
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal('matchMedia', (query: string) => query.includes('prefers-reduced-motion') ? reduced : fine);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  wrapper = mount(defineComponent({
    setup() {
      const host = ref<HTMLElement>();
      usePointerTiltVue3(host);
      return () => h('article', { ref: host, 'data-tilt': '' });
    },
  }));
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 100));
});
afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function move(x = 190, y = 30, type = 'mouse') {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: type });
  wrapper.element.dispatchEvent(event);
}
function flushFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach(fn => fn(0));
}
function angle(name: string) { return (wrapper.element as HTMLElement).style.getPropertyValue(name); }

it('coalesces movement, caches geometry, and changes tilt direction — vue3', () => {
  move(100, 60);
  move();
  expect(frames.size).toBe(1);
  flushFrame();
  expect(angle('--fx-tilt-x')).toBe('5.60deg');
  expect(angle('--fx-tilt-y')).toBe('5.60deg');
  expect(wrapper.classes()).toContain('fx-tilt-active');
  move(30, 110);
  flushFrame();
  expect(angle('--fx-tilt-x')).toBe('-5.60deg');
  expect(angle('--fx-tilt-y')).toBe('-5.60deg');
  expect(wrapper.element.getBoundingClientRect).toHaveBeenCalledOnce();
});

it('clears tilt and pending frames on leave, scroll, resize and blur — vue3', () => {
  for (const event of ['pointerleave', 'pointercancel', 'scroll', 'resize', 'blur']) {
    move(); flushFrame(); move(30, 110);
    expect(frames.size).toBe(1);
    const target = event.startsWith('pointer') ? wrapper.element : window;
    target.dispatchEvent(new Event(event));
    expect(frames.size).toBe(0);
    expect(angle('--fx-tilt-x')).toBe('');
    expect(wrapper.classes()).not.toContain('fx-tilt-active');
  }
});

it('disables touch and coarse pointers and responds to reduced-motion changes — vue3', () => {
  move(190, 30, 'touch');
  expect(frames.size).toBe(0);
  fine.matches = false;
  move();
  expect(frames.size).toBe(0);
  fine.matches = true;
  move(); flushFrame();
  reduced.matches = true;
  reduced.dispatchEvent(new Event('change'));
  expect(angle('--fx-tilt-y')).toBe('');
  move();
  expect(frames.size).toBe(0);
});

it('cancels animation and removes element, media and global listeners on unmount — vue3', () => {
  const offFine = vi.spyOn(fine, 'removeEventListener');
  const offReduced = vi.spyOn(reduced, 'removeEventListener');
  const offWindow = vi.spyOn(window, 'removeEventListener');
  move();
  expect(frames.size).toBe(1);
  const element = wrapper.element;
  wrapper.unmount();
  expect(frames.size).toBe(0);
  expect(offFine).toHaveBeenCalledWith('change', expect.any(Function));
  expect(offReduced).toHaveBeenCalledWith('change', expect.any(Function));
  expect(offWindow).toHaveBeenCalledWith('scroll', expect.any(Function), true);
  element.dispatchEvent(new MouseEvent('pointermove', { clientX: 190, clientY: 30 }));
  expect(frames.size).toBe(0);
});
