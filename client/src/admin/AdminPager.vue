<script setup lang="ts">
import type { Page } from './contracts';
defineProps<{ page: Pick<Page<unknown>, 'page' | 'pages' | 'total'>; t: (source: string) => string; busy?: boolean }>();
defineEmits<{ go: [page: number] }>();
</script>
<template><div class="pagination a-pager"><span>{{ t('共') }} {{ page.total }} · {{ page.page }} / {{ Math.max(1, page.pages) }}</span><span class="a-pager-btns"><button type="button" :disabled="busy || page.page <= 1" @click="$emit('go', page.page - 1)">{{ t('上一页') }}</button><button type="button" :disabled="busy || page.page >= page.pages" @click="$emit('go', page.page + 1)">{{ t('下一页') }}</button></span></div></template>
