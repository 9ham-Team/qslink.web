<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import IconVue3, { type IconNameVue3 } from './Icon.vue';
import { clearAllToastsVue3, closeToastVue3, useToastItemsVue3 } from '../toast-store';

defineProps<{ t: (source: string) => string }>();

const items = useToastItemsVue3();

function iconFor(kind: string): IconNameVue3 {
  if (kind === 'success') return 'check-circle';
  if (kind === 'error') return 'alert';
  if (kind === 'info') return 'info';
  return 'sparkles';
}

onBeforeUnmount(() => {
  clearAllToastsVue3();
});
</script>

<template>
  <Teleport to="#toast-root">
    <div
      v-for="item in items"
      :key="item.id"
      data-vue3="toast"
      class="toast qsl-notification"
      :class="['toast-' + item.kind, { 'is-show': item.show, 'is-hide': item.hide }]"
    >
      <span class="toast-icon"><IconVue3 :name="iconFor(item.kind)" :size="18" /></span>
      <span class="toast-msg">{{ item.message }}</span>
      <button
        class="toast-close"
        type="button"
        :aria-label="t('关闭')"
        @click="closeToastVue3(item.id)"
      >
        <IconVue3 name="close" :size="14" />
      </button>
    </div>
  </Teleport>
</template>
