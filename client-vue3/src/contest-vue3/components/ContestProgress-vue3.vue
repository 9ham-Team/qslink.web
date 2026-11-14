<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { contestApiVue3, type ContestServicesVue3 } from '../contracts-vue3';
const props = defineProps<{ services: ContestServicesVue3 }>(); const t = props.services.t;
const emit = defineEmits<{ ready: [] }>(); let announced = false;
const count = ref<number | null>(null), busy = ref(false), failed = ref(false);
let active = true; const controller = new AbortController();
async function load() {
  if (busy.value) return; busy.value = true; failed.value = false;
  try {
    const data = await props.services.get<{ contest: { approvedRegistrationCount: number } }>(contestApiVue3, controller.signal);
    if (!active) return;
    const value = data.contest.approvedRegistrationCount;
    if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid progress');
    count.value = value;
  } catch { if (active) failed.value = true; }
  finally { if (active) { busy.value = false; if (!announced) { announced = true; emit('ready'); } } }
}
void load(); onBeforeUnmount(() => { active = false; controller.abort(); });
</script>
<template><div :aria-busy="busy || undefined"><p v-if="busy">{{ t('正在加载奖品进度…') }}</p><div v-else-if="failed" class="f-contest-notice" role="alert"><p>{{ t('奖品进度加载失败') }}</p><button class="btn btn-soft" type="button" @click="load">{{ t('重试') }}</button></div><template v-else-if="count !== null"><div class="f-contest-prize-progress-head"><span>{{ t('已通过审核：{n} 人', { n: count }) }}</span><span>{{ count >= 100 ? t('升级大奖已解锁，冠军二选一！') : t('再有 {n} 人即可升级大奖', { n: 100 - count }) }}</span></div><progress max="100" :value="Math.min(count, 100)" :aria-label="t('冠军奖品解锁进度')"></progress></template></div></template>
