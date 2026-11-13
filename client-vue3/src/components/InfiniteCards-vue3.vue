<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LoadMoreVue3 from './LoadMore-vue3.vue';

const props = defineProps<{ visible: boolean; enabled: boolean; loading: boolean; failed: boolean; t: (source: string) => string }>();
const emit = defineEmits<{ load: [] }>();
const sentinel = ref<HTMLElement>();
const supported = ref(false);
let observer: IntersectionObserver | undefined;
let alive = true;
let intersecting = false;
async function check() {
  await nextTick();
  if (!alive || !intersecting || !props.visible || !props.enabled || props.loading || props.failed) return;
  const rect = sentinel.value?.getBoundingClientRect();
  // Recheck after appending: an old observer event must not load all pages.
  if (rect && rect.top <= window.innerHeight + 320 && rect.bottom >= 0) emit('load');
}
onMounted(() => {
  if (typeof IntersectionObserver !== 'function') return;
  supported.value = true;
  observer = new IntersectionObserver(entries => {
    intersecting = entries.some(entry => entry.isIntersecting);
    void check();
  }, { rootMargin: '0px 0px 320px 0px' });
  observer.observe(sentinel.value!);
});
watch(() => [props.visible, props.enabled, props.loading, props.failed], () => { void check(); });
onBeforeUnmount(() => { alive = false; observer?.disconnect(); });
</script>

<template>
  <div v-show="visible" ref="sentinel" class="g-explore__more" data-infinite-vue3>
    <LoadMoreVue3 v-if="!supported" :visible="visible" :loading="loading" :t="t" large @load="$emit('load')" />
    <p v-else-if="!failed" class="muted" role="status">{{ loading ? t('加载中…') : t('向下滚动加载更多') }}</p>
  </div>
</template>
