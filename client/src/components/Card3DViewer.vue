<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ViewerVue3 = {
  destroy(): void;
  setImages(front: string | null | undefined, back?: string | null): void;
  setRatio(ratio: { w: number; h: number }): void;
};
const props = defineProps<{
  front?: string | null;
  back?: string | null;
  ratio: { w: number; h: number };
  create?: ((root: HTMLElement, options: Record<string, unknown>) => ViewerVue3) | null;
  options?: Record<string, unknown>;
}>();
const emit = defineEmits<{ fallback: [active: boolean] }>();
const host = ref<HTMLElement>();
const useFallback = ref(false);
let viewer: ViewerVue3 | undefined;

onMounted(() => {
  if (typeof props.create !== 'function') {
    useFallback.value = true;
    emit('fallback', true);
    return;
  }
  try {
    viewer = props.create(host.value!, {
      front: props.front ?? null,
      back: props.back,
      ratio: props.ratio,
      autoRotate: typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches,
      interactive: true,
      ...props.options,
    });
    emit('fallback', false);
  } catch (err) {
    console.error('[Card3DViewer] create failed', err);
    viewer = undefined;
    useFallback.value = true;
    emit('fallback', true);
  }
});

watch(() => [props.front, props.back], () => {
  if (!viewer) return;
  try {
    viewer.setImages(props.front ?? null, props.back);
  } catch (err) {
    console.error('[Card3DViewer] setImages failed', err);
    viewer.destroy();
    viewer = undefined;
    useFallback.value = true;
    emit('fallback', true);
  }
});

watch(() => [props.ratio.w, props.ratio.h], () => {
  if (!viewer) return;
  try {
    viewer.setRatio(props.ratio);
  } catch (err) {
    console.error('[Card3DViewer] setRatio failed', err);
  }
});

onBeforeUnmount(() => {
  if (viewer) {
    try { viewer.destroy(); } catch { /* Ignore cleanup errors from 3D engine. */ }
    viewer = undefined;
  }
});
</script>

<template>
  <slot v-if="useFallback" name="fallback" />
  <div v-else ref="host" class="g-card3d-host-vue3" style="height:100%"></div>
</template>
