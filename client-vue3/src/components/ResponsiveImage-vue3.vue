<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ContestServicesVue3 } from '../contest-vue3/contracts-vue3';
const props = defineProps<{ src: string; alt: string; services: Pick<ContestServicesVue3, 'image' | 'placeholder'> }>();
const image = ref<HTMLImageElement>();
let observer: ResizeObserver | undefined;
function apply() { if (image.value?.clientWidth) props.services.image(image.value, props.src || props.services.placeholder, image.value.clientWidth); }
onMounted(() => { if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(apply); observer.observe(image.value!); } apply(); });
watch(() => props.src, apply);
onBeforeUnmount(() => observer?.disconnect());
</script>
<template><img ref="image" :alt="alt" loading="lazy" decoding="async"></template>
