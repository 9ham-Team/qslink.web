<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ViewerVue3 = {
  destroy(): void;
  setImages(front: string, back?: string): void;
  setRatio(ratio: { w: number; h: number }): void;
};
const props = defineProps<{
  front: string;
  back?: string;
  ratio: { w: number; h: number };
  create: (root: HTMLElement, options: Record<string, unknown>) => ViewerVue3;
}>();
const host = ref<HTMLElement>();
let viewer: ViewerVue3 | undefined;
onMounted(() => {
  viewer = props.create(host.value!, { front: props.front, back: props.back, ratio: props.ratio, autoRotate: true, interactive: true });
});
watch(() => [props.front, props.back], () => viewer?.setImages(props.front, props.back));
watch(() => [props.ratio.w, props.ratio.h], () => viewer?.setRatio(props.ratio));
onBeforeUnmount(() => { viewer?.destroy(); viewer = undefined; });
</script>

<template><div ref="host" class="g-card3d-host-vue3"></div></template>
