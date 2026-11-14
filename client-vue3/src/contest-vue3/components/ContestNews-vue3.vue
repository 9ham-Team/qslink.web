<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { contestKeyVue3, type ContestServicesVue3, type NewsVue3, type PageVue3 } from '../contracts-vue3';
import { beijingTimeVue3 } from '../services-vue3';
import LoadMoreVue3 from '../../components/LoadMore-vue3.vue';
const props = defineProps<{ services: ContestServicesVue3 }>(); const t = props.services.t;
const emit = defineEmits<{ ready: [] }>(); let announced = false;
const items = ref<NewsVue3[]>([]), busy = ref(false), error = ref(''), page = ref(0), pages = ref(0), loaded = ref(false);
const controller = new AbortController(); let active = true;
async function load() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    const data = await props.services.get<PageVue3<NewsVue3>>('/api/announcements?' + new URLSearchParams({ eventKey: contestKeyVue3, page: String(page.value + 1), limit: '6' }), controller.signal);
    if (!active) return;
    items.value.push(...data.items); page.value = data.page; pages.value = data.pages; loaded.value = true;
  } catch (err) { if (active) { error.value = (err as Error).message || t('加载失败'); props.services.toast(error.value, 'error'); } }
  finally { if (active) { busy.value = false; if (!announced) { announced = true; emit('ready'); } } }
}
void load(); onBeforeUnmount(() => { active = false; controller.abort(); });
</script>
<template><div :aria-busy="busy || undefined" aria-live="polite"><p v-if="busy && !items.length">{{ t('加载中…') }}</p><article v-for="item in items" :key="item.id" class="f-contest-news"><time :datetime="item.publishedAt">{{ beijingTimeVue3(item.publishedAt) }}</time><h3>{{ item.title }}</h3><p>{{ item.body }}</p></article><p v-if="loaded && !items.length" class="f-contest-notice">{{ t('暂无赛事动态，后续安排将在这里公布。') }}</p><div v-if="error" class="f-contest-notice" role="alert"><p>{{ error }}</p><button class="btn btn-soft" type="button" @click="load">{{ t('重试') }}</button></div><div class="f-contest-more"><LoadMoreVue3 :visible="page < pages" :loading="busy" :t="t" @load="load" /></div></div></template>
