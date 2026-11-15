<script setup lang="ts">
import Dialog from './Dialog.vue';
defineProps<{ url: string; t: (source: string) => string; copy: (url: string, message: string) => Promise<unknown> }>();
defineEmits<{ close: [] }>();
</script>
<template><Dialog :title="t('分享主页')" :t="t" @close="$emit('close')"><p>{{ t('把你的卡片小站分享给朋友，任何人都可以直接访问。') }}</p><label class="field"><span class="label">{{ t('主页链接') }}</span><input class="input" type="text" readonly data-space-url :value="url" @click="($event.target as HTMLInputElement).select()"></label><template #actions><button type="button" class="btn btn-primary" @click="copy(url, t('主页链接已复制'))">{{ t('复制链接') }}</button></template></Dialog></template>
