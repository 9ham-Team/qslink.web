<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import CardTileVue3 from '../components/CardTile-vue3.vue';
import InfiniteCardsVue3 from '../components/InfiniteCards-vue3.vue';
import IconVue3 from '../components/Icon-vue3.vue';
import { useCardCollectionVue3 } from '../composables/use-card-collection-vue3';
import type { CardFiltersVue3, ServicesVue3 } from '../contracts-vue3';
import { filtersFromQueryVue3, type ExploreVisitVue3 } from '../explore-memory-vue3';
import { useExplorePositionVue3 } from '../composables/use-explore-position-vue3';

const props = defineProps<{ query: URLSearchParams; services: ServicesVue3; visit?: ExploreVisitVue3 }>();
const t = props.services.t;
const filters = reactive<CardFiltersVue3>({ callSign: '', sort: 'latest' });
const draft = ref('');
const searchInput = ref<HTMLInputElement>();
const pendingSearch = ref(false);
let searchTimer = 0;
const root = ref<HTMLElement>();
const restoring = ref(false);
const autoArmed = ref(true);
const unverified = ref(false);
let firstVisit = true;
let displayedFilters = '';
const filterKey = () => filters.sort + '\n' + filters.callSign;
const position = useExplorePositionVue3(root, () => { restoring.value = false; autoArmed.value = true; });
function stopRestoring() { position.cancel(); restoring.value = false; autoArmed.value = true; }
const sorts: { key: CardFiltersVue3['sort']; label: string }[] = [
  { key: 'latest', label: t('最新') }, { key: 'popular', label: t('最热') }, { key: 'oldest', label: t('最早') },
];
const collection = useCardCollectionVue3({
  fetch: (page, signal) => props.services.listCards({ ...filters }, page, signal),
  pageOf: response => response,
  onSuccess(response, appended) {
    displayedFilters = filterKey();
    unverified.value = false;
    if (restoring.value) {
      const saved = props.visit?.snapshot;
      const target = saved && response.total ? saved : { scrollY: 0, anchorOffset: 0 };
      void position.restore(target).then(restored => {
        restoring.value = false;
        if (restored && !saved) autoArmed.value = true;
      });
    }
  },
  onError(err) { restoring.value = false; props.services.toast(err.message || t('卡片加载失败'), 'error'); },
});
const { items: cards, loading, loaded, error, total, hasMore, load, liked } = collection;
const busy = computed(() => loading.value || pendingSearch.value);
const count = computed(() => {
  if (busy.value) return t('正在寻找卡片…');
  if (error.value && collection.retryReset.value) return t('卡片加载失败');
  if (!total.value) return filters.callSign ? t('没有匹配的呼号') : t('广场还没有卡片');
  const suffix = total.value > 12 ? ' ' + t('· 已展示') + ' ' + Math.min(cards.value.length, total.value) + ' ' + t('张') : '';
  return (filters.callSign ? t('找到') : t('共')) + ' ' + props.services.formatNumber(total.value) + ' ' + t('张卡片') + suffix;
});
function cancelSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = 0;
  pendingSearch.value = false;
}
function applyFilters() {
  stopRestoring();
  cancelSearch();
  filters.callSign = draft.value.trim();
  props.services.setQuery({ callSign: filters.callSign || null, sort: filters.sort === 'latest' ? null : filters.sort });
  window.scrollTo({ top: 0, behavior: 'instant' });
  void load(true);
}
function queueSearch(event?: Event) {
  if ((event as InputEvent | undefined)?.isComposing) return;
  stopRestoring();
  cancelSearch();
  collection.cancel();
  pendingSearch.value = true;
  searchTimer = window.setTimeout(applyFilters, 320);
}
function beginComposition() { cancelSearch(); collection.cancel(); pendingSearch.value = true; }
function submitSearch(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  applyFilters();
}
function selectSort(sort: CardFiltersVue3['sort']) {
  if (sort === filters.sort && !pendingSearch.value) return;
  filters.sort = sort;
  applyFilters();
}
function clearSearch(resetSort = false) {
  draft.value = '';
  if (resetSort) filters.sort = 'latest';
  applyFilters();
  searchInput.value?.focus();
}
function upload() {
  props.services.navigate(props.services.user() ? '/dashboard/cards/new' : '/login?next=' + encodeURIComponent('/dashboard/cards/new'));
}
const offAuth = props.services.onAuth(() => { unverified.value = false; collection.clear(); applyFilters(); });
watch(() => props.query.toString(), () => {
  stopRestoring();
  cancelSearch();
  collection.clear();
  const saved = firstVisit ? props.visit?.snapshot : undefined;
  firstVisit = false;
  Object.assign(filters, saved?.filters || filtersFromQueryVue3(props.query));
  draft.value = filters.callSign;
  if (saved) {
    displayedFilters = filterKey();
    collection.restore(saved);
    restoring.value = unverified.value = true;
    autoArmed.value = false;
    props.services.setQuery({ callSign: filters.callSign || null, sort: filters.sort === 'latest' ? null : filters.sort });
    void position.restore(saved);
    void collection.refresh(saved.page);
    return;
  }
  // A fresh visit (or an invalidated cache) must not inherit a previous route's
  // native scroll restoration and accidentally trigger the next page.
  restoring.value = true;
  autoArmed.value = false;
  void load(true);
}, { immediate: true });
onBeforeUnmount(() => {
  if (loaded.value && !unverified.value && !pendingSearch.value && displayedFilters === filterKey()) {
    props.visit?.save({ items: cards.value, page: collection.page.value, pages: collection.pages.value, total: total.value,
      filters: { ...filters }, ...position.capture() }, location.pathname);
  }
  cancelSearch(); offAuth();
});
</script>

<template>
  <div ref="root" class="g-explore"><section class="g-explore__head"><div class="container">
    <div class="g-explore__intro fx-slide-up"><p class="eyebrow">{{ t('EXPLORE · 卡片广场') }}</p>
      <h1 class="g-explore__title">{{ t('在电波里，') }}<span class="g-explore__title-em">{{ t('交换一张卡片') }}</span></h1>
      <p class="g-explore__desc">{{ t('输入呼号，找到那位火腿的 QSL 卡片；也可以按最新或最热，慢慢逛。') }}</p>
    </div>
    <div class="g-explore__toolbar g-panel">
      <div class="g-search"><span class="g-search__icon"><IconVue3 name="search" /></span>
        <input ref="searchInput" v-model="draft" class="g-search__input" type="search" inputmode="search" autocomplete="off"
          autocapitalize="characters" :spellcheck="false" :placeholder="t('输入呼号搜索')" :aria-label="t('按呼号搜索卡片')"
          @input="queueSearch" @compositionstart="beginComposition" @compositionend="queueSearch" @keydown.enter="submitSearch">
        <button v-show="draft" class="g-search__clear" type="button" :aria-label="t('清空搜索')" @click="clearSearch()"><IconVue3 name="x" :size="15" /></button>
      </div>
      <div class="g-explore__sortbar"><span class="g-filter-label">{{ t('排序') }}</span>
        <div class="segmented"><button v-for="sort in sorts" :key="sort.key" type="button" :class="{ 'is-active': filters.sort === sort.key }" :aria-pressed="filters.sort === sort.key" @click="selectSort(sort.key)">{{ sort.label }}</button></div>
        <span class="g-explore__count" role="status">{{ count }}</span>
        <button v-show="filters.callSign || filters.sort !== 'latest'" class="g-reset-filter" type="button" @click="clearSearch(true)"><IconVue3 name="refresh" :size="14" /><span>{{ t('清空搜索') }}</span></button>
      </div>
    </div>
    <div class="g-explore__grid" aria-live="polite" :aria-busy="busy ? 'true' : undefined" :inert="busy || unverified || undefined"
      :style="{ opacity: (busy || unverified) && cards.length ? 0.55 : undefined, pointerEvents: busy || unverified ? 'none' : undefined }">
      <template v-if="busy && !cards.length"><div v-for="n in 8" :key="n" class="g-skeleton-card" aria-hidden="true"><div class="g-skeleton g-skeleton-media"></div><div class="g-skeleton g-skeleton-line" style="width:68%"></div><div class="g-skeleton g-skeleton-line" style="width:44%"></div></div></template>
      <div v-else-if="error && !cards.length" class="g-grid-empty"><div class="g-error-panel"><h3>{{ t('卡片加载失败') }}</h3><p>{{ error.message || t('电波暂时有点杂音，请稍后重试。') }}</p><button class="btn btn-primary" type="button" @click="load()">{{ t('重新加载') }}</button></div></div>
      <div v-else-if="loaded && !cards.length" class="g-grid-empty"><div class="empty-state">
        <img class="empty-state-img" :src="filters.callSign ? '/assets/empty-search.svg' : '/assets/empty-cards.svg'" alt="" width="180" height="140">
        <h3>{{ filters.callSign ? t('没有找到这个呼号的卡片') : t('广场还空着') }}</h3>
        <p>{{ filters.callSign ? t('检查一下呼号是否填写正确，或者换个呼号试试，也许那位火腿还没上传卡片。') : t('还没有已审核通过的卡片，成为第一个分享 QSL 卡片的人吧。') }}</p>
        <button class="btn btn-primary" type="button" @click="filters.callSign ? clearSearch(true) : upload()">{{ filters.callSign ? t('清空搜索') : t('上传我的卡片') }}</button>
      </div></div>
      <template v-else><CardTileVue3 v-for="card in cards" :key="card.id" :card="card" :services="services" @liked="liked" /></template>
    </div>
    <div v-if="error && cards.length && !busy" class="g-error-panel" role="status"><p>{{ error.message || t('卡片加载失败') }}</p><button class="btn btn-primary" type="button" @click="load()">{{ t('重新加载') }}</button></div>
    <InfiniteCardsVue3 :visible="hasMore && !!cards.length" :enabled="loaded && autoArmed && !restoring && !unverified" :loading="busy" :failed="!!error" :t="t" @load="load()" />
    <p v-if="loaded && cards.length && !hasMore && !busy && !error" class="g-explore__end">{{ t('已经看完全部卡片了 · 73!') }}</p>
  </div></section></div>
</template>
