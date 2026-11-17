import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { useScrollRevealVue3 } from '../src/composables/use-scroll-reveal';
import { useCountUpVue3 } from '../src/composables/use-count-up';
import { useMagneticVue3 } from '../src/composables/use-magnetic';

function createMatchMediaStub(initial: Record<string, boolean> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const state = { ...initial };

  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return !!state[query];
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_type: string, cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));

  return {
    matchMedia,
    setMatch(query: string, matches: boolean) {
      state[query] = matches;
      listeners.get(query)?.forEach(cb => cb());
    },
  };
}

describe('home animation composables', () => {
  const originalMatchMedia = window.matchMedia;
  const originalIO = globalThis.IntersectionObserver;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.IntersectionObserver = originalIO;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('useScrollRevealVue3', () => {
    it('applies stagger delay, reveals on intersection, and cleans up on unmount', () => {
      vi.useFakeTimers();
      const mm = createMatchMediaStub({ '(prefers-reduced-motion: reduce)': false });
      window.matchMedia = mm.matchMedia as unknown as typeof window.matchMedia;

      let ioCallback: IntersectionObserverCallback | null = null;
      const observe = vi.fn();
      const unobserve = vi.fn();
      const disconnect = vi.fn();
      globalThis.IntersectionObserver = vi.fn(function (cb: IntersectionObserverCallback) {
        ioCallback = cb;
        return { observe, unobserve, disconnect, takeRecords: () => [], root: null, rootMargin: '', thresholds: [] };
      }) as unknown as typeof IntersectionObserver;

      let api!: ReturnType<typeof useScrollRevealVue3>;
      const Comp = defineComponent({
        setup() {
          const root = ref<HTMLElement>();
          api = useScrollRevealVue3(root);
          return () =>
            h('div', { ref: root }, [
              h('div', { class: 'target-a', 'data-vue-reveal': '', 'data-vue-reveal-delay': '120' }),
              h('div', { class: 'target-b', 'data-vue-reveal': '', 'data-vue-reveal-delay': '2500' }),
            ]);
        },
      });

      const wrapper = mount(Comp, { attachTo: document.body });
      const a = wrapper.find('.target-a').element as HTMLElement;
      const b = wrapper.find('.target-b').element as HTMLElement;
      expect(a.classList.contains('fx-will-reveal')).toBe(true);
      expect(a.style.getPropertyValue('--fx-reveal-delay')).toBe('120ms');
      expect(b.style.getPropertyValue('--fx-reveal-delay')).toBe('1200ms');
      expect(observe).toHaveBeenCalledTimes(2);

      ioCallback!([{ isIntersecting: true, target: a } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
      expect(a.classList.contains('is-revealed')).toBe(true);
      expect(unobserve).toHaveBeenCalledWith(a);

      // After 640 + 120ms, animation classes and delay variable are released to free will-change
      vi.advanceTimersByTime(760);
      expect(a.classList.contains('fx-will-reveal')).toBe(false);
      expect(a.classList.contains('is-revealed')).toBe(false);
      expect(a.style.getPropertyValue('--fx-reveal-delay')).toBe('');

      // Re-scanning does not replay already-seen element
      api.scan();
      expect(a.classList.contains('fx-will-reveal')).toBe(false);

      // Reveal b, then unmount before its cleanup timer fires
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      ioCallback!([{ isIntersecting: true, target: b } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
      expect(b.classList.contains('is-revealed')).toBe(true);

      wrapper.unmount();
      expect(disconnect).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Advancing timers after unmount must not throw or touch detached nodes
      vi.advanceTimersByTime(2000);
    });

    it('disarms immediately when IntersectionObserver is unavailable', () => {
      // @ts-expect-error testing missing IntersectionObserver
      globalThis.IntersectionObserver = undefined;

      const Comp = defineComponent({
        setup() {
          const root = ref<HTMLElement>();
          useScrollRevealVue3(root);
          return () => h('div', { ref: root }, [h('div', { class: 'target', 'data-vue-reveal': '' })]);
        },
      });

      const wrapper = mount(Comp, { attachTo: document.body });
      const el = wrapper.find('.target').element as HTMLElement;
      expect(el.classList.contains('fx-will-reveal')).toBe(false);
      wrapper.unmount();
    });

    it('disarms on initial and runtime prefers-reduced-motion', () => {
      const mm = createMatchMediaStub({ '(prefers-reduced-motion: reduce)': false });
      window.matchMedia = mm.matchMedia as unknown as typeof window.matchMedia;
      const disconnect = vi.fn();
      globalThis.IntersectionObserver = vi.fn(function () {
        return { observe: vi.fn(), unobserve: vi.fn(), disconnect, takeRecords: () => [], root: null, rootMargin: '', thresholds: [] };
      }) as unknown as typeof IntersectionObserver;

      const Comp = defineComponent({
        setup() {
          const root = ref<HTMLElement>();
          useScrollRevealVue3(root);
          return () => h('div', { ref: root }, [h('div', { class: 'target', 'data-vue-reveal': '', 'data-vue-reveal-delay': '80' })]);
        },
      });

      const wrapper = mount(Comp, { attachTo: document.body });
      const el = wrapper.find('.target').element as HTMLElement;
      expect(el.classList.contains('fx-will-reveal')).toBe(true);

      mm.setMatch('(prefers-reduced-motion: reduce)', true);
      expect(el.classList.contains('fx-will-reveal')).toBe(false);
      expect(el.classList.contains('is-revealed')).toBe(false);
      expect(el.style.getPropertyValue('--fx-reveal-delay')).toBe('');
      expect(disconnect).toHaveBeenCalled();
      wrapper.unmount();
    });
  });

  describe('useCountUpVue3', () => {
    it('keeps "—" for null, animates to target, avoids restarting on same value, and cleans up on unmount', async () => {
      vi.useFakeTimers();
      const mm = createMatchMediaStub({ '(prefers-reduced-motion: reduce)': false });
      window.matchMedia = mm.matchMedia as unknown as typeof window.matchMedia;

      const rafQueue: FrameRequestCallback[] = [];
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        rafQueue.push(cb);
        return rafQueue.length;
      });
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

      const target = ref<number | null>(null);
      let api!: ReturnType<typeof useCountUpVue3>;

      const Comp = defineComponent({
        setup() {
          api = useCountUpVue3(target, { format: n => String(n), duration: 900 });
          return () => h('span', api.text.value);
        },
      });

      const wrapper = mount(Comp);
      expect(api.text.value).toBe('—');
      vi.advanceTimersByTime(1500);
      expect(api.text.value).toBe('—');
      expect(rafSpy).not.toHaveBeenCalled();

      target.value = 120;
      await wrapper.vm.$nextTick();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      // Same value should not restart animation
      target.value = 120;
      await wrapper.vm.$nextTick();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      // Advance fallback timer to finish cleanly
      vi.advanceTimersByTime(1200);
      expect(api.text.value).toBe('120');
      expect(api.done.value).toBe(true);

      // Trigger another update then unmount mid-flight
      target.value = 240;
      await wrapper.vm.$nextTick();
      wrapper.unmount();
      expect(cancelSpy).toHaveBeenCalled();

      // Late rAF callback after unmount must not update text
      const lastCb = rafQueue[rafQueue.length - 1];
      if (lastCb) lastCb(performance.now() + 500);
      expect(api.text.value).toBe('120');
    });

    it('snaps immediately to target when prefers-reduced-motion is enabled or toggled', async () => {
      vi.useFakeTimers();
      const mm = createMatchMediaStub({ '(prefers-reduced-motion: reduce)': true });
      window.matchMedia = mm.matchMedia as unknown as typeof window.matchMedia;

      const target = ref<number | null>(48);
      let api!: ReturnType<typeof useCountUpVue3>;

      const Comp = defineComponent({
        setup() {
          api = useCountUpVue3(target, { format: n => String(n), duration: 900 });
          return () => h('span', api.text.value);
        },
      });

      const wrapper = mount(Comp);
      expect(api.text.value).toBe('48');
      expect(api.done.value).toBe(false);

      // Toggle off then on mid-animation
      mm.setMatch('(prefers-reduced-motion: reduce)', false);
      target.value = 96;
      await wrapper.vm.$nextTick();
      mm.setMatch('(prefers-reduced-motion: reduce)', true);
      expect(api.text.value).toBe('96');
      expect(api.done.value).toBe(false);
      wrapper.unmount();
    });
  });

  describe('useMagneticVue3', () => {
    it('translates on fine pointer without overwriting transform, ignores touch/reduced-motion, and resets', () => {
      const mm = createMatchMediaStub({
        '(hover: hover) and (pointer: fine)': true,
        '(prefers-reduced-motion: reduce)': false,
      });
      window.matchMedia = mm.matchMedia as unknown as typeof window.matchMedia;

      const rafQueue: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        rafQueue.push(cb);
        return rafQueue.length;
      });

      const Comp = defineComponent({
        setup() {
          const btn = ref<HTMLElement>();
          useMagneticVue3(btn, 10);
          return () => h('button', { ref: btn, style: 'transform: scale(1)' }, 'CTA');
        },
      });

      const wrapper = mount(Comp, { attachTo: document.body });
      const btnEl = wrapper.element as HTMLElement;
      btnEl.getBoundingClientRect = () => ({ left: 100, top: 100, width: 100, height: 40, right: 200, bottom: 140, x: 100, y: 100, toJSON: () => ({}) });

      btnEl.dispatchEvent(new PointerEvent('pointermove', { clientX: 180, clientY: 130, pointerType: 'mouse' }));
      rafQueue.shift()?.(16);
      expect(btnEl.style.translate).not.toBe('');
      expect(btnEl.style.transform).toBe('scale(1)');
      expect(btnEl.classList.contains('fx-mag-active')).toBe(true);

      // Touch event resets and is ignored
      btnEl.dispatchEvent(new PointerEvent('pointermove', { clientX: 180, clientY: 130, pointerType: 'touch' }));
      expect(btnEl.style.translate).toBe('');
      expect(btnEl.classList.contains('fx-mag-active')).toBe(false);

      // Re-activate then test window blur reset
      btnEl.dispatchEvent(new PointerEvent('pointermove', { clientX: 180, clientY: 130, pointerType: 'mouse' }));
      rafQueue.shift()?.(32);
      expect(btnEl.classList.contains('fx-mag-active')).toBe(true);
      window.dispatchEvent(new Event('blur'));
      expect(btnEl.style.translate).toBe('');
      expect(btnEl.classList.contains('fx-mag-active')).toBe(false);

      // Reduced motion prevents magnetic translate
      mm.setMatch('(prefers-reduced-motion: reduce)', true);
      btnEl.dispatchEvent(new PointerEvent('pointermove', { clientX: 180, clientY: 130, pointerType: 'mouse' }));
      expect(rafQueue.length).toBe(0);
      expect(btnEl.style.translate).toBe('');

      wrapper.unmount();
    });
  });
});
