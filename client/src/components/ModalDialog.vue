<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUnmounted, reactive, ref } from 'vue';
import type { ModalActionVue3, ModalInstanceVue3 } from '../contracts';
import { isTopModalVue3, registerModalStackVue3, syncBodyModalOpenVue3, unregisterModalStackVue3 } from '../modal-stack';
import IconVue3 from './Icon.vue';

const props = withDefaults(defineProps<{
  title?: string;
  size?: string;
  dismissible?: boolean;
  actions?: ModalActionVue3[];
  confirmMessage?: string;
  t: (source: string) => string;
  onRequestClose: () => void;
  onReady?: (refs: { overlay: HTMLElement; modal: HTMLElement; body: HTMLElement; setShow: (v: boolean) => void }) => void;
  getInstance: () => ModalInstanceVue3;
}>(), {
  title: '',
  size: 'md',
  dismissible: true,
  actions: () => [],
  confirmMessage: undefined,
});

const overlayRef = ref<HTMLElement>();
const modalRef = ref<HTMLElement>();
const bodyRef = ref<HTMLElement>();
const show = ref(false);
const actionBusy = reactive<Record<number, boolean>>({});
let stackEntry: { id: symbol; zIndex: number } | null = null;
const zIndex = ref(120);
let unmounted = false;
let closing = false;
let enterRaf = 0;

function cancelEnterRaf() {
  if (enterRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(enterRaf);
  }
  enterRaf = 0;
}

function handleClose() {
  if (!props.dismissible) return;
  props.onRequestClose();
}

function handleBackdropMousedown(event: MouseEvent) {
  if (event.target === overlayRef.value && props.dismissible) {
    props.onRequestClose();
  }
}

async function handleActionClick(action: ModalActionVue3, index: number) {
  if (action.disabled || actionBusy[index]) return;
  if (typeof action.onClick === 'function') {
    actionBusy[index] = true;
    try {
      const result = await action.onClick(props.getInstance());
      if (unmounted) return;
      if (result === false) return;
    } catch (err) {
      console.error(err);
      return;
    } finally {
      actionBusy[index] = false;
    }
  }
  if (!unmounted && action.closeOnClick !== false) {
    props.onRequestClose();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!stackEntry || !isTopModalVue3(stackEntry.id)) return;
  if (event.key === 'Escape') {
    if (props.dismissible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      props.onRequestClose();
    }
    return;
  }
  if (event.key === 'Tab') {
    const controls = Array.from(
      modalRef.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter(node => !node.hidden && node.offsetParent !== null);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
      return;
    }
    if (!modalRef.value?.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

onMounted(() => {
  stackEntry = registerModalStackVue3({
    dismissible: props.dismissible,
    close: () => props.onRequestClose(),
  });
  zIndex.value = stackEntry.zIndex;
  document.addEventListener('keydown', onKeydown, true);

  if (overlayRef.value && modalRef.value && bodyRef.value && props.onReady) {
    props.onReady({
      overlay: overlayRef.value,
      modal: modalRef.value,
      body: bodyRef.value,
      setShow: (v: boolean) => {
        if (!v) {
          closing = true;
          cancelEnterRaf();
        } else if (closing || unmounted) {
          return;
        }
        show.value = v;
        if (!v && stackEntry) {
          unregisterModalStackVue3(stackEntry.id);
          stackEntry = null;
          void nextTick(syncBodyModalOpenVue3);
        }
      },
    });
  }

  const reduced = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    if (!closing && !unmounted) show.value = true;
  } else if (typeof requestAnimationFrame === 'function') {
    enterRaf = requestAnimationFrame(() => {
      enterRaf = 0;
      if (!closing && !unmounted) show.value = true;
    });
  } else {
    if (!closing && !unmounted) show.value = true;
  }

  const focusTarget =
    bodyRef.value?.querySelector<HTMLElement>('textarea:not(:disabled),input:not(:disabled),select:not(:disabled)') ||
    modalRef.value?.querySelector<HTMLElement>('.modal-actions button:not(:disabled)') ||
    modalRef.value?.querySelector<HTMLElement>('.modal-x:not(:disabled)');
  focusTarget?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
  unmounted = true;
  closing = true;
  cancelEnterRaf();
  document.removeEventListener('keydown', onKeydown, true);
  if (stackEntry) {
    unregisterModalStackVue3(stackEntry.id);
    stackEntry = null;
  }
});

onUnmounted(() => {
  syncBodyModalOpenVue3();
});
</script>

<template>
  <div
    ref="overlayRef"
    data-vue3="modal"
    class="modal-overlay"
    :class="{ 'is-show': show }"
    :style="{ zIndex }"
    @mousedown="handleBackdropMousedown"
  >
    <div
      ref="modalRef"
      class="modal"
      :class="'modal-' + size"
      role="dialog"
      aria-modal="true"
      :aria-label="title || undefined"
    >
      <div class="modal-head">
        <h3 class="modal-title">{{ title }}</h3>
        <button
          class="modal-x"
          type="button"
          :aria-label="t('关闭')"
          @click="handleClose"
        >
          <IconVue3 name="close" :size="18" />
        </button>
      </div>
      <div ref="bodyRef" class="modal-body">
        <p v-if="confirmMessage !== undefined" class="modal-text">{{ confirmMessage }}</p>
      </div>
      <div v-if="actions.length" class="modal-actions">
        <button
          v-for="(action, idx) in actions"
          :key="idx"
          type="button"
          class="btn"
          :class="'btn-' + (action.type || 'ghost')"
          :disabled="!!action.disabled || !!actionBusy[idx]"
          @click="handleActionClick(action, idx)"
        >
          {{ action.label || t('确定') }}
        </button>
      </div>
    </div>
  </div>
</template>
