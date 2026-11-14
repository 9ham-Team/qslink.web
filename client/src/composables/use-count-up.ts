import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export function useCountUpVue3(
  target: Ref<number | null>,
  options: { format: (value: number) => string; duration?: number },
) {
  const text = ref('—');
  const done = ref(false);
  const duration = Math.max(300, Math.min(2200, options.duration ?? 900));

  let active = true;
  let frame = 0;
  let fallbackTimer = 0;
  let lastTarget: number | null = null;
  let currentValue = 0;
  let reduced: MediaQueryList | undefined;

  function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function cancel() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
  }

  function isReduced() {
    if (reduced) return reduced.matches;
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function finish(finalValue: number, pop: boolean) {
    cancel();
    if (!active) return;
    currentValue = finalValue;
    text.value = options.format(finalValue);
    done.value = pop;
  }

  function start(nextValue: number) {
    cancel();
    if (!active) return;
    if (isReduced()) {
      finish(nextValue, false);
      return;
    }
    const from = currentValue;
    done.value = false;
    text.value = options.format(Math.round(from));
    const startTime = nowMs();

    const step = (ts: number) => {
      frame = 0;
      if (!active || isReduced()) return;
      const elapsed = Math.max(0, ts - startTime);
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (nextValue - from) * eased;
      currentValue = val;
      text.value = options.format(Math.round(val));
      if (p < 1) {
        frame = window.requestAnimationFrame(step);
      } else {
        finish(nextValue, true);
      }
    };

    frame = window.requestAnimationFrame(step);
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = 0;
      if (active && lastTarget !== null) finish(lastTarget, true);
    }, duration + 240);
  }

  function onReducedChange() {
    if (!active || !isReduced()) return;
    if (lastTarget !== null) finish(lastTarget, false);
  }

  onMounted(() => {
    if (typeof window.matchMedia === 'function') {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced.addEventListener('change', onReducedChange);
    }
    if (lastTarget !== null && isReduced()) {
      finish(lastTarget, false);
    }
  });

  watch(
    target,
    raw => {
      if (raw === null || !Number.isFinite(raw)) {
        cancel();
        lastTarget = null;
        currentValue = 0;
        done.value = false;
        text.value = '—';
        return;
      }
      const next = Math.max(0, Math.round(raw));
      if (next === lastTarget) return;
      lastTarget = next;
      start(next);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    active = false;
    cancel();
    reduced?.removeEventListener('change', onReducedChange);
  });

  return { text, done };
}
