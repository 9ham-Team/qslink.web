<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { contestApiVue3, type ContestServicesVue3, type WorkVue3, type PageVue3 } from '../contracts-vue3';
import { useContestScopeVue3 } from '../../composables/use-contest-scope-vue3';
import ContestWorkTileVue3 from '../components/ContestWorkTile-vue3.vue';
import LoadMoreVue3 from '../../components/LoadMore-vue3.vue';
const props = defineProps<{ query: URLSearchParams; services: ContestServicesVue3 }>();
const t = props.services.t;
const items = ref<WorkVue3[]>([]), q = ref(''), busy = ref(false), pendingSearch = ref(false), error = ref(''), loaded = ref(false), page = ref(0), pages = ref(0), total = ref(0);
let failedAppend = false;
let timer = 0;
const scope = useContestScopeVue3(props.services, () => { clearTimeout(timer); pendingSearch.value = false; items.value = []; page.value = 0; busy.value = false; void load(); });
async function load(append = false) {
  if (append && (busy.value || pendingSearch.value)) return;
  const task = scope.renew(); busy.value = true; error.value = '';
  try {
    const data = await props.services.get<PageVue3<WorkVue3>>(contestApiVue3 + '/works?' + new URLSearchParams({ q: q.value.trim(), page: String(append ? page.value + 1 : 1), limit: '12' }), task.signal);
    if (!scope.valid(task.id)) return;
    items.value = append ? items.value.concat(data.items) : data.items;
    page.value = data.page; pages.value = data.pages; total.value = data.total; loaded.value = true;
  } catch (err) { if (scope.valid(task.id)) { failedAppend = append; error.value = (err as Error).message || t('加载失败'); props.services.toast(error.value, 'error'); } }
  finally { if (scope.valid(task.id)) busy.value = false; }
}
function search(immediate = false) {
  clearTimeout(timer); scope.renew(); busy.value = false;
  pendingSearch.value = true;
  const run = () => { pendingSearch.value = false; props.services.setQuery({ q: q.value.trim() || null }); void load(); };
  if (immediate) run(); else timer = window.setTimeout(run, 320);
}
watch(() => props.query.toString(), () => { q.value = (props.query.get('q') || '').trim(); void load(); }, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template><div class="g-explore"><section class="g-explore__head"><div class="container"><div class="g-explore__intro"><p class="eyebrow">QSL DESIGN CONTEST · 2026.11</p><h1 class="g-explore__title">{{ t('参赛作品') }}</h1><p class="g-explore__desc">{{ t('按首次参赛提交顺序，发现每一张卡片的设计故事。') }}</p></div>
  <div class="g-explore__toolbar g-panel"><div class="g-search"><input v-model="q" class="g-search__input" type="search" :placeholder="t('搜索呼号或作品编号')" :aria-label="t('搜索呼号或作品编号')" @input="search()" @keydown.enter.prevent="search(true)"><button v-show="q" class="g-search__clear" type="button" :aria-label="t('清空搜索')" @click="q = ''; search(true)">×</button></div><p class="g-explore__count" role="status">{{ busy ? t('加载中…') : t('共 {n} 件参赛作品', { n: total }) }}</p></div>
  <div class="g-explore__grid" :aria-busy="busy || undefined"><p v-if="busy && !items.length" class="g-grid-empty">{{ t('加载中…') }}</p><div v-else-if="loaded && !items.length && !error" class="g-grid-empty empty-state"><h3>{{ t(q ? '没有匹配的参赛作品' : '暂无公开参赛作品') }}</h3><p>{{ t(q ? '试试其他呼号或作品编号。' : '使用已通过广场审核的卡片报名后，即可在这里展示并参与投票。') }}</p></div><ContestWorkTileVue3 v-for="work in items" :key="work.id" :work="work" :services="services" /></div>
  <div v-if="error" class="g-error-panel" role="alert"><p>{{ error }}</p><button class="btn btn-primary" type="button" @click="load(failedAppend)">{{ t('重新加载') }}</button></div><div class="g-explore__more"><LoadMoreVue3 :visible="page < pages" :loading="busy || pendingSearch" :t="t" large @load="load(true)" /></div>
</div></section></div></template>
