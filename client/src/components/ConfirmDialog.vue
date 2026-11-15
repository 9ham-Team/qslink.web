<script setup lang="ts">
import Dialog from './Dialog.vue';
import type { ConfirmOptionsVue3 } from '../contracts';
defineProps<{ options: ConfirmOptionsVue3; t: (source: string) => string }>();
const emit = defineEmits<{ close: []; answer: [value: boolean] }>();
function answer(value: boolean) { emit('answer', value); emit('close'); }
</script>
<template><Dialog :title="options.title || t('请确认')" :t="t" size="sm" @close="answer(false)">
<p class="modal-text">{{ options.message }}</p>
<template #actions><button type="button" class="btn btn-ghost" @click="answer(false)">{{ options.cancelText || t('取消') }}</button><button type="button" class="btn" :class="options.danger ? 'btn-danger' : 'btn-primary'" @click="answer(true)">{{ options.confirmText || t('确认') }}</button></template>
</Dialog></template>
