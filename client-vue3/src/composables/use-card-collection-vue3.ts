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
  }
  async function load(reset = false) {
    if (!alive || (loading.value && !reset)) return;
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
  return { items, page, pages, total, loading, loaded, error, retryReset, hasMore, load, cancel, clear, liked };
}
