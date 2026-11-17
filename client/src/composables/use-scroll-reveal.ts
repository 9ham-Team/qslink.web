import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useScrollRevealVue3(root: Ref<HTMLElement | undefined>) {
  let active = true;
  let observer: IntersectionObserver | undefined;
  let reduced: MediaQueryList | undefined;
  let sweepTimer = 0;
  const seen = new WeakSet<HTMLElement>();
  const tracked = new Set<HTMLElement>();
  const frames = new Set<number>();
  const cleanupTimers = new Set<number>();

  function clamp(value: number, min: number, max: number) {
    return value < min ? min : value > max ? max : value;
  }

  function isReduced() {
    return !!(reduced && reduced.matches);
  }

  function inViewport(el: HTMLElement, margin: number) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
    const vw = window.innerWidth || document.documentElement?.clientWidth || 0;
    return rect.bottom > -margin && rect.top < vh + margin && rect.right > -margin && rect.left < vw + margin;
  }

  function releaseEl(el: HTMLElement) {
    el.classList.remove('fx-will-reveal');
    el.classList.remove('is-revealed');
    el.style.removeProperty('--fx-reveal-delay');
  }

  function revealEl(el: HTMLElement) {
    if (!active || !el.isConnected || !el.classList.contains('fx-will-reveal')) return;
    el.classList.add('is-revealed');
    const delay = parseFloat(el.style.getPropertyValue('--fx-reveal-delay')) || 0;
    const timer = window.setTimeout(() => {
      cleanupTimers.delete(timer);
      if (!active || !el.isConnected) return;
      releaseEl(el);
      tracked.delete(el);
    }, 640 + delay);
    cleanupTimers.add(timer);
  }

  function disarmAll() {
    window.clearTimeout(sweepTimer);
    sweepTimer = 0;
    cleanupTimers.forEach(id => window.clearTimeout(id));
    cleanupTimers.clear();
    frames.forEach(id => window.cancelAnimationFrame(id));
    frames.clear();
    observer?.disconnect();
    tracked.forEach(releaseEl);
    tracked.clear();
  }

  function scheduleFrame(fn: () => void) {
    const id = window.requestAnimationFrame(() => {
      frames.delete(id);
      if (active) fn();
    });
    frames.add(id);
  }

  function scheduleSweep() {
    if (sweepTimer || isReduced()) return;
    sweepTimer = window.setTimeout(() => {
      sweepTimer = 0;
      if (!active || isReduced()) return;
      tracked.forEach(el => {
        if (el.isConnected && !el.classList.contains('is-revealed') && inViewport(el, 80)) {
          observer?.unobserve(el);
          revealEl(el);
        }
      });
    }, 1100);
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver !== 'function') return observer;
    observer = new IntersectionObserver(entries => {
      if (!active) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        observer?.unobserve(target);
        revealEl(target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    return observer;
  }

  function scan() {
    if (!active || !root.value) return;
    if (isReduced() || typeof IntersectionObserver !== 'function') {
      disarmAll();
      return;
    }
    const io = ensureObserver();
    const list = root.value.querySelectorAll<HTMLElement>('[data-vue-reveal]');
    for (const el of list) {
      if (seen.has(el)) continue;
      seen.add(el);
      tracked.add(el);
      const rawDelay = parseInt(el.getAttribute('data-vue-reveal-delay') || '0', 10);
      const delay = Number.isFinite(rawDelay) ? clamp(rawDelay, 0, 1200) : 0;
      el.classList.add('fx-will-reveal');
      if (delay > 0) el.style.setProperty('--fx-reveal-delay', delay + 'ms');
      if (inViewport(el, 40)) {
        scheduleFrame(() => revealEl(el));
      } else {
        io?.observe(el);
      }
    }
    scheduleSweep();
  }

  function onReducedChange() {
    if (isReduced()) disarmAll();
  }

  onMounted(() => {
    if (typeof window.matchMedia === 'function') {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced.addEventListener('change', onReducedChange);
    }
    scan();
  });

  onBeforeUnmount(() => {
    active = false;
    reduced?.removeEventListener('change', onReducedChange);
    disarmAll();
    observer = undefined;
  });

  return { scan };
}
