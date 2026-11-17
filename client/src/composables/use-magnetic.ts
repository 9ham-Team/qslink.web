import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useMagneticVue3(host: Ref<HTMLElement | undefined>, strength = 8) {
  let node: HTMLElement | undefined;
  let fine: MediaQueryList | undefined;
  let reduced: MediaQueryList | undefined;
  let rect: DOMRect | undefined;
  let frame = 0;
  let x = 0;
  let y = 0;
  const maxOffset = Math.max(0, Math.min(20, strength));
  const clamp = (value: number) => Math.max(-maxOffset, Math.min(maxOffset, value));

  function reset() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    rect = undefined;
    node?.classList.remove('fx-mag-active');
    node?.style.removeProperty('translate');
  }

  function move(event: PointerEvent) {
    if (!fine?.matches || reduced?.matches || event.pointerType === 'touch') {
      reset();
      return;
    }
    if (!node) return;
    rect ??= node.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      reset();
      return;
    }
    x = event.clientX;
    y = event.clientY;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!node || !rect) return;
      const dx = clamp((x - (rect.left + rect.width / 2)) * 0.18);
      const dy = clamp((y - (rect.top + rect.height / 2)) * 0.18);
      node.style.translate = dx.toFixed(2) + 'px ' + dy.toFixed(2) + 'px';
      node.classList.add('fx-mag-active');
    });
  }

  onMounted(() => {
    node = host.value;
    if (!node || typeof window.matchMedia !== 'function') return;
    fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    fine.addEventListener('change', reset);
    reduced.addEventListener('change', reset);
    node.addEventListener('pointermove', move, { passive: true });
    node.addEventListener('pointerleave', reset);
    node.addEventListener('pointercancel', reset);
    window.addEventListener('scroll', reset, { capture: true, passive: true });
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
  });

  onBeforeUnmount(() => {
    reset();
    fine?.removeEventListener('change', reset);
    reduced?.removeEventListener('change', reset);
    node?.removeEventListener('pointermove', move);
    node?.removeEventListener('pointerleave', reset);
    node?.removeEventListener('pointercancel', reset);
    window.removeEventListener('scroll', reset, true);
    window.removeEventListener('resize', reset);
    window.removeEventListener('blur', reset);
    node = undefined;
  });
}
