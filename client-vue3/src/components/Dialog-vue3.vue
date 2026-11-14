<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
const props = withDefaults(defineProps<{ title: string; t: (source: string) => string; busy?: boolean; size?: string }>(), { size: 'md' });
const emit = defineEmits<{ close: [] }>();
const overlay = ref<HTMLElement>();
const previous = document.activeElement as HTMLElement | null;
const target = document.getElementById('modal-root') ? '#modal-root' : 'body';
function close() { if (!props.busy) emit('close'); }
function keydown(event: KeyboardEvent) {
  const dialogs = document.querySelectorAll('.modal-overlay');
  if (dialogs[dialogs.length - 1] !== overlay.value) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  if (event.key === 'Tab') {
    const controls = Array.from(overlay.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || []).filter(node => !node.hidden);
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
onMounted(async () => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', keydown, true);
  await nextTick(); (overlay.value?.querySelector<HTMLElement>('textarea,input') || overlay.value?.querySelector<HTMLElement>('button'))?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', keydown, true);
  if (![...document.querySelectorAll('.modal-overlay')].some(node => node !== overlay.value)) document.body.classList.remove('modal-open');
  if (previous?.isConnected) previous.focus({ preventScroll: true });
});
</script>
<template><Teleport :to="target"><div ref="overlay" data-vue3="dialog" class="modal-overlay is-show" style="display:flex;align-items:center;justify-content:center" @click.self="close"><div class="modal" :class="'modal-' + size" style="min-width:0;max-width:100%;max-height:88dvh" role="dialog" aria-modal="true" :aria-label="title">
  <div class="modal-head" style="flex-shrink:0"><h3 class="modal-title">{{ title }}</h3><button class="modal-x" type="button" :disabled="busy" :aria-label="t('关闭')" @click="close">×</button></div>
  <div class="modal-body" style="min-height:0"><slot /></div><div class="modal-actions" style="flex-shrink:0"><slot name="actions" /></div>
</div></div></Teleport></template>
