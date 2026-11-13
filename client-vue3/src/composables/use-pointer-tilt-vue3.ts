import { onBeforeUnmount, onMounted, type Ref } from 'vue';

// Keep per-frame presentation outside reactive state and the legacy enhancer.
export function usePointerTiltVue3(host: Ref<HTMLElement | undefined>) {
  let node: HTMLElement | undefined;
  let fine: MediaQueryList | undefined;
  let reduced: MediaQueryList | undefined;
  let rect: DOMRect | undefined;
  let frame = 0;
  let x = 0;
  let y = 0;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  function reset() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    rect = undefined;
    node?.classList.remove('fx-tilt-active');
    node?.style.removeProperty('--fx-tilt-x');
    node?.style.removeProperty('--fx-tilt-y');
  }
  function move(event: PointerEvent) {
    if (!fine?.matches || reduced?.matches || event.pointerType === 'touch') { reset(); return; }
    if (!node) return;
    // Cache once per hover; never measure the rotating card on every frame.
    rect ??= node.getBoundingClientRect();
    if (!rect.width || !rect.height) { reset(); return; }
    x = event.clientX;
    y = event.clientY;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!node || !rect) return;
      const nx = clamp(((x - rect.left) / rect.width - 0.5) * 2);
      const ny = clamp(((y - rect.top) / rect.height - 0.5) * 2);
      node.style.setProperty('--fx-tilt-x', (-ny * 7).toFixed(2) + 'deg');
      node.style.setProperty('--fx-tilt-y', (nx * 7).toFixed(2) + 'deg');
      node.classList.add('fx-tilt-active');
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
