import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import type { CardPageVue3, CardVue3 } from '../contracts-vue3';

export interface CollectionErrorVue3 { status?: number; message?: string }

export function useCardCollectionVue3<Response>(options: {
  fetch(page: number, signal: AbortSignal): Promise<Response>;
  pageOf(response: Response): CardPageVue3;
  onSuccess?(response: Response, appended: boolean): void;
  onError?(error: CollectionErrorVue3): void;
}) {
  const items = ref<CardVue3[]>([]);
  const page = ref(0);
  const pages = ref(0);
  const total = ref(0);
  const loading = ref(false);
  const loaded = ref(false);
  const error = shallowRef<CollectionErrorVue3 | null>(null);
  const retryReset = ref(false);
  const hasMore = computed(() => retryReset.value || (page.value < pages.value && items.value.length < total.value));
  let alive = true;
  let generation = 0;
  let controller: AbortController | undefined;
  let retryPages = 0;

  function cancel() {
    generation++;
    controller?.abort();
    loading.value = false;
    error.value = null;
  }
  function clear() {
    cancel();
    items.value = [];
    page.value = pages.value = total.value = 0;
    loaded.value = retryReset.value = false;
    retryPages = 0;
  }
  function restore(value: CardPageVue3) {
    clear();
    items.value = value.items;
    page.value = value.page; pages.value = value.pages; total.value = value.total;
    loaded.value = true;
  }
  async function refresh(targetPages = page.value) {
    if (!alive) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const request = ++generation;
    loading.value = true; error.value = null;
    try {
      const fresh: CardVue3[] = [];
      let response!: Response;
      let result!: CardPageVue3;
      for (let current = 1; current <= Math.max(1, targetPages); current++) {
        response = await options.fetch(current, signal);
        if (!alive || request !== generation || signal.aborted) return;
        result = options.pageOf(response);
        const ids = new Set(fresh.map(card => card.id));
        fresh.push(...result.items.filter(card => !ids.has(card.id)));
        if (current >= result.pages) break;
      }
      items.value = fresh; page.value = result.page; pages.value = result.pages; total.value = result.total;
      loaded.value = true; retryReset.value = false; retryPages = 0;
      options.onSuccess?.(response, false);
    } catch (failure) {
      if (!alive || request !== generation || signal.aborted) return;
      error.value = failure && typeof failure === 'object' ? failure as CollectionErrorVue3 : {};
      retryReset.value = true; retryPages = targetPages;
      options.onError?.(error.value);
    } finally { if (alive && request === generation) loading.value = false; }
  }
  async function load(reset = false) {
    if (!alive || (loading.value && !reset)) return;
    if (!reset && retryPages) return refresh(retryPages);
    retryPages = 0;
    reset = reset || retryReset.value || !loaded.value;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const request = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const response = await options.fetch(reset ? 1 : page.value + 1, signal);
      if (!alive || request !== generation || signal.aborted) return;
      const result = options.pageOf(response);
      // Advance the page only after success; a failed append retries that page.
      const previous = reset ? [] : items.value;
      const ids = new Set(previous.map(item => item.id));
      items.value = previous.concat(result.items.filter(item => !ids.has(item.id)));
      page.value = result.page;
      pages.value = result.pages;
      total.value = result.total;
      loaded.value = true;
      retryReset.value = false;
      options.onSuccess?.(response, !reset);
    } catch (failure) {
      if (!alive || request !== generation || signal.aborted) return;
      error.value = failure && typeof failure === 'object' ? failure as CollectionErrorVue3 : {};
      retryReset.value = reset;
      options.onError?.(error.value);
    } finally {
      if (alive && request === generation) loading.value = false;
    }
  }
  function liked(id: string, result: { liked: boolean; likeCount: number }) {
    const card = items.value.find(item => item.id === id);
    if (card) Object.assign(card, result);
  }
  onBeforeUnmount(() => { alive = false; cancel(); });
  return { items, page, pages, total, loading, loaded, error, retryReset, hasMore, load, cancel, clear, restore, refresh, liked };
}
