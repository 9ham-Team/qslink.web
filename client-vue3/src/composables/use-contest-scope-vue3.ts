import { onBeforeUnmount } from 'vue';
import type { ContestServicesVue3 } from '../contest-vue3/contracts-vue3';
export function useContestScopeVue3(services: ContestServicesVue3, onAccount: () => void) {
  let active = true, generation = 0;
  let controller = new AbortController();
  function renew() { generation++; controller.abort(); controller = new AbortController(); return { id: generation, signal: controller.signal }; }
  const off = services.onAuth(() => { if (active) { renew(); onAccount(); } });
  onBeforeUnmount(() => { active = false; generation++; controller.abort(); off(); });
  return { renew, valid: (id: number) => active && id === generation, signal: () => controller.signal, active: () => active };
}
