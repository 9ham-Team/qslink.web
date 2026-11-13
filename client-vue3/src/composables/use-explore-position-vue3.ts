import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';
import type { ExploreSnapshotVue3 } from '../explore-memory-vue3';

function layoutTop(element: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

export function useExplorePositionVue3(host: Ref<HTMLElement | undefined>, onIntent: () => void) {
  let alive = true;
  let generation = 0;
  let frame = 0;
  let finish: ((value: boolean) => void) | undefined;
  let appliedY: number | undefined;
  function cancel() {
    generation++;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    finish?.(false); finish = undefined;
  }
  function intent() { cancel(); appliedY = undefined; onIntent(); }
  function keydown(event: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) intent();
  }
  function scrolled() { if (appliedY != null && Math.abs(window.scrollY - appliedY) > 3) intent(); }
  function capture() {
    const tiles = Array.from(host.value?.querySelectorAll<HTMLElement>('[data-card-id]') || []);
    const focused = document.activeElement?.closest<HTMLElement>('[data-card-id]');
    const anchor = focused && host.value?.contains(focused) ? focused :
      tiles.find(tile => layoutTop(tile) + tile.offsetHeight > window.scrollY + 80);
    return { scrollY: window.scrollY, anchorId: anchor?.dataset.cardId, anchorOffset: anchor ? layoutTop(anchor) - window.scrollY : 0 };
  }
  async function restore(snapshot: Pick<ExploreSnapshotVue3, 'scrollY' | 'anchorId' | 'anchorOffset'>) {
    cancel();
    const request = generation;
    await nextTick();
    if (!alive || request !== generation) return false;
    return new Promise<boolean>(resolve => {
      finish = resolve;
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!alive || request !== generation) { finish = undefined; resolve(false); return; }
          const anchor = Array.from(host.value?.querySelectorAll<HTMLElement>('[data-card-id]') || [])
            .find(tile => tile.dataset.cardId === snapshot.anchorId);
          const top = anchor ? layoutTop(anchor) - snapshot.anchorOffset : snapshot.scrollY;
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
          appliedY = window.scrollY;
          finish = undefined; resolve(true);
        });
      });
    });
  }
  onMounted(() => {
    window.addEventListener('wheel', intent, { passive: true });
    window.addEventListener('touchmove', intent, { passive: true });
    window.addEventListener('pointerdown', intent, { passive: true });
    window.addEventListener('keydown', keydown);
    window.addEventListener('scroll', scrolled, { passive: true });
  });
  onBeforeUnmount(() => {
    alive = false; cancel();
    window.removeEventListener('wheel', intent);
    window.removeEventListener('touchmove', intent);
    window.removeEventListener('pointerdown', intent);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('scroll', scrolled);
  });
  return { capture, restore, cancel };
}
