<script setup lang="ts">
import { computed } from 'vue';
import AnnouncementImage from './AnnouncementImage.vue';

const props = defineProps<{
  body: string;
  loadImage?: (src: string, signal: AbortSignal) => Promise<Blob>;
  imagesAsText?: boolean;
  imageLabel?: string;
  imageError?: string;
}>();
const parts = computed(() => {
  const result: ({ text: string } | { alt: string; src: string })[] = [];
  const pattern = /!\[([^\[\]\r\n]{0,120})\]\((\/api\/announcement-images\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.webp)\)/g;
  let offset = 0;
  for (const match of props.body.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > offset) result.push({ text: props.body.slice(offset, start) });
    result.push({ alt: match[1], src: match[2] });
    offset = start + match[0].length;
  }
  if (offset < props.body.length) result.push({ text: props.body.slice(offset) });
  return result;
});
</script>

<template>
  <div class="announcement-content"><template v-for="(part, index) in parts" :key="index"><span v-if="'text' in part">{{ part.text }}</span><span v-else-if="imagesAsText">[{{ part.alt || imageLabel }}]</span><AnnouncementImage v-else :src="part.src" :alt="part.alt" :load-image="loadImage" :error-label="imageError" /></template></div>
</template>

<style scoped>
.announcement-content { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
