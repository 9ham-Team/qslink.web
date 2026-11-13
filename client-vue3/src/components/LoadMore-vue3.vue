<script setup lang="ts">
defineProps<{ visible: boolean; loading: boolean; t: (source: string) => string; large?: boolean }>();
defineEmits<{ load: [] }>();
</script>

<template>
  <button v-if="visible" class="btn btn-soft" :class="{ 'btn-lg': large }" type="button" :disabled="loading" @click="$emit('load')">
    {{ loading ? t('加载中…') : t('加载更多') }}
  </button>
</template>
