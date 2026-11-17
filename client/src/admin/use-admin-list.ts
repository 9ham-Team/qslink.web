import { inject, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import type { ApplicationContext } from '../contracts';
import { message, type Page } from './contracts';
import { useAdmin } from './use-admin';
import { ADMIN_MEMORY } from './memory';
export function useAdminList<T>(platform: ApplicationContext, path: string, filters: Ref<Record<string, string>>, limit = 8) {
  const api = useAdmin(platform), data = shallowRef<Page<T>>(), loading = ref(false), error = ref('');
  const memory = inject(ADMIN_MEMORY, null);
  const memoryKey = path + (filters.value.eventKey ? ':' + filters.value.eventKey : '');
  if (memory && !memory[memoryKey]) memory[memoryKey] = {filters:{...filters.value},page:1};
  let generation = 0, target = memory?.[memoryKey]?.page || 1;
  async function load(page = target) {
    const gen = ++generation; target = page; loading.value = true; error.value = '';
    try {
      const query = new URLSearchParams({ ...filters.value, page: String(page), limit: String(limit) });
      const result = await api.get<Page<T>>(path + '?' + query);
      if (api.live() && gen === generation) {
        if (result.page > Math.max(1,result.pages)) { void load(Math.max(1,result.pages)); return; }
        data.value = result; if (memory) memory[memoryKey].page = result.page;
      }
    } catch (err) { if (api.live() && gen === generation) error.value = platform.t(message(err)); }
    finally { if (api.live() && gen === generation) loading.value = false; }
  }
  watch(filters, () => { void load(1); }, { deep: true });
  onMounted(() => { void load(target); });
  return { api, data, loading, error, load };
}
