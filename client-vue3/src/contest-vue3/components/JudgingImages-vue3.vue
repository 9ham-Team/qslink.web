<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import type { ContestErrorVue3, ContestServicesVue3, MaterialVue3 } from '../contracts-vue3';
const props = defineProps<{ item: MaterialVue3; services: ContestServicesVue3 }>();
const emit = defineEmits<{ forbidden: [problem: ContestErrorVue3] }>();
const urls = reactive({ front: '', back: '' }), errors = reactive({ front: '', back: '' });
let controller = new AbortController(); let active = true, generation = 0;
function cleanup() {
  controller.abort(); generation++;
  for (const side of ['front', 'back'] as const) { if (urls[side]) URL.revokeObjectURL(urls[side]); urls[side] = ''; errors[side] = ''; }
}
watch(() => [props.item.id, props.item.frontUrl, props.item.backUrl].join('\n'), () => {
  cleanup(); controller = new AbortController(); const task = generation;
  for (const side of ['front', 'back'] as const) {
    const path = props.item[side + 'Url' as 'frontUrl' | 'backUrl'];
    if (!path) { errors[side] = props.services.t('无图片'); continue; }
    void props.services.privateImage(path, controller.signal).then(blob => {
      if (active && task === generation && !controller.signal.aborted) urls[side] = URL.createObjectURL(blob);
    }).catch(failure => {
      if (!active || task !== generation || controller.signal.aborted) return;
      const problem = failure as ContestErrorVue3;
      errors[side] = problem.message || props.services.t('评审资源加载失败，请刷新后重试');
      if ([401, 403, 404].includes(problem.status || 0)) emit('forbidden', problem);
    });
  }
}, { immediate: true });
onBeforeUnmount(() => { active = false; cleanup(); });
</script>
<template><div class="f-judging-images"><figure v-for="side in (['front', 'back'] as const)" :key="side"><figcaption>{{ services.t(side === 'front' ? '正面' : '背面') }}</figcaption><p v-if="!urls[side]" role="status">{{ errors[side] || services.t('图片加载中…') }}</p><img v-if="urls[side]" :src="urls[side]" :alt="services.t(side === 'front' ? '正面' : '背面')"></figure></div></template>
