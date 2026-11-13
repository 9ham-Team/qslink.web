<script setup lang="ts">
import { computed } from 'vue';
import type { PublicUserVue3 } from '../contracts-vue3';
const props = withDefaults(defineProps<{ user: PublicUserVue3; size?: number }>(), { size: 36 });
const name = computed(() => props.user.displayName || props.user.username || '?');
const initial = computed(() => {
  const raw = (props.user.callSign && props.user.callSign.length >= 2 ? props.user.callSign : name.value)
    .replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '');
  return (raw.slice(0, 2) || 'Q').toUpperCase();
});
</script>

<template>
  <span class="avatar" :style="{ '--av-size': size + 'px', '--av-color': user.avatarColor || '#0eaf8f' }" :title="name">
    <span class="avatar-initial">{{ initial }}</span>
  </span>
</template>
