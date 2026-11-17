import { onBeforeUnmount, onMounted } from 'vue';
export function useContestAnchorVue3(scroll: () => void) {
  let frame = 0, active = true;
  function align() {
    if (!location.hash) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = 0; if (active) scroll(); });
  }
  onMounted(align);
  onBeforeUnmount(() => { active = false; cancelAnimationFrame(frame); });
  return align;
}
