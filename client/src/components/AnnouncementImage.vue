<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  src: string;
  alt: string;
  loadImage?: (src: string, signal: AbortSignal) => Promise<Blob>;
  errorLabel?: string;
}>();
const preview = ref('');
const failed = ref(false);
watch(() => [props.src, props.loadImage] as const, async ([src, load], _previous, cleanup) => {
  preview.value = '';
  failed.value = false;
  if (!load) return;
  const controller = new AbortController();
  let url = '';
  cleanup(() => { controller.abort(); if (url) URL.revokeObjectURL(url); });
  try {
    const blob = await load(src, controller.signal);
    if (!controller.signal.aborted) preview.value = url = URL.createObjectURL(blob);
  } catch {
    if (!controller.signal.aborted) failed.value = true;
  }
}, { immediate: true });
</script>

<template>
  <span v-if="failed && errorLabel" role="status">{{ errorLabel }}</span>
  <img v-else-if="!loadImage || preview" :src="loadImage ? preview : src" :alt="alt" loading="lazy" decoding="async" @error="failed = true">
</template>

<style scoped>
img { display: block; max-width: 100%; max-height: 640px; width: auto; height: auto; object-fit: contain; border-radius: 8px; }
</style>
