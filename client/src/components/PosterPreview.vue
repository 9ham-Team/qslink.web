<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { CardDetailVue3 } from '../contracts';
import type { SharingService, ShareWork } from '../sharing';
import Dialog from './Dialog.vue';
const props = defineProps<{ card: Partial<CardDetailVue3>; work?: ShareWork; title: string; url: () => Promise<string>; sharing: SharingService; t: (source:string)=>string }>();
defineEmits<{ close: [] }>();
const source = ref(''), error = ref(''), canSend = ref(false);
const controller = new AbortController(); let active = true, file: File | undefined;
onMounted(async () => {
  try {
    const url = await props.url();
    if (!active) return;
    const blob = await props.sharing.poster(props.card,url,controller.signal,props.work);
    if (!active) return;
    source.value = URL.createObjectURL(blob);
    file = new File([blob],'QSLink-card.png',{type:'image/png'});
    canSend.value = !!navigator.canShare?.({files:[file]});
  } catch(err) { if (active && !controller.signal.aborted) error.value = (err as Error).message || props.t('生成失败，请关闭后重试'); }
});
function send() { if (file) void navigator.share({files:[file],title:props.title}).catch(err=>{ if(err.name!=='AbortError')error.value=err.message; }); }
onBeforeUnmount(() => { active=false;controller.abort();if(source.value)URL.revokeObjectURL(source.value);file=undefined; });
</script>
<template><Dialog :title="t('生成分享图')" :t="t" modal-class="g-card-share-modal" overlay-class="g-card-share-overlay" viewport-fit @close="$emit('close')"><div class="g-card-share__poster"><template v-if="source"><img :src="source" :alt="t(work ? '赛事作品分享图，含直达作品详情的二维码' : '卡片分享图，含直达分享页的二维码')"><p>{{ t('保存图片后发送给朋友；手机也可长按图片保存。') }}</p><div class="btn-group"><a class="btn btn-primary" :href="source" download="QSLink-card.png">{{ t('保存分享图') }}</a><button v-if="canSend" type="button" class="btn btn-soft" @click="send">{{ t('发送图片到…') }}</button></div></template><p v-else role="status">{{ error || t('正在生成分享图…') }}</p></div></Dialog></template>
