<script setup lang="ts">
withDefaults(defineProps<{ name: 'search' | 'x' | 'refresh' | 'chevron-down'; size?: number }>(), { size: 18 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></template>
    <path v-else-if="name === 'x'" d="m6 6 12 12M18 6 6 18" />
    <template v-else-if="name === 'refresh'"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1" /></template>
    <path v-else d="m6 9 6 6 6-6" />
  </svg>
</template>
