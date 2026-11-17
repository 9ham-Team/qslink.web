<script setup lang="ts">
defineProps<{ loading?: boolean; error?: string; empty?: boolean; t: (source: string) => string }>();
defineEmits<{ retry: [] }>();
</script>
<template><div v-if="loading" class="stack" role="status" :aria-label="t('加载中…')"><div v-for="n in 3" :key="n" class="skeleton" style="height:90px"></div></div><div v-else-if="error" class="empty-state"><p role="alert">{{ error }}</p><button type="button" class="btn btn-ghost" @click="$emit('retry')">{{ t('重新加载') }}</button></div><div v-else-if="empty" class="empty-state"><p>{{ t('暂无数据') }}</p></div></template>
