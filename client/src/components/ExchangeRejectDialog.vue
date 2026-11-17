<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import DialogVue3 from './Dialog.vue';
import type { ExchangeDecisionServicesVue3, ExchangeItemVue3 } from '../contracts';
import { personLabelVue3 } from '../exchange-utils';
import { PROFILE_LIMITS_VUE3, unicodeLengthVue3 } from '../profile-utils';

const props = defineProps<{
  open: boolean;
  exchange: ExchangeItemVue3 | null;
  services: ExchangeDecisionServicesVue3;
}>();

const emit = defineEmits<{
  close: [];
  rejected: [exchange: ExchangeItemVue3];
}>();

let disposed = false;
let openedUserId: string | null = null;
let openedToken: string | null = null;
let submitAbort: AbortController | null = null;

const state = reactive({
  reason: '',
  submitting: false,
  errorText: '',
});

const reasonLength = computed(() => unicodeLengthVue3(state.reason));

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(): boolean {
  if (disposed || !props.open || !props.exchange) return false;
  const u = props.services.user();
  return !!u && u.id === openedUserId && props.services.token() === openedToken;
}

function resetAndAbort() {
  submitAbort?.abort();
  submitAbort = null;
  state.reason = '';
  state.submitting = false;
  state.errorText = '';
}

function handleClose() {
  if (state.submitting) return;
  resetAndAbort();
  emit('close');
}

async function submitReject() {
  const ex = props.exchange;
  if (!ex || state.submitting || !isSessionValid()) return;

  const trimmed = state.reason.trim();
  if (unicodeLengthVue3(trimmed) > PROFILE_LIMITS_VUE3.rejectReason) {
    state.errorText = props.services.t('拒绝原因不能超过 200 个字符');
    return;
  }

  state.submitting = true;
  state.errorText = '';
  submitAbort?.abort();
  const controller = new AbortController();
  submitAbort = controller;

  try {
    const res = await props.services.rejectExchange(ex.id, { reason: trimmed }, controller.signal);
    if (!isSessionValid()) return;
    state.submitting = false;
    resetAndAbort();
    props.services.toast(props.services.t('已拒绝该换卡申请'), 'info');
    emit('rejected', res?.exchange || ex);
  } catch (err) {
    if (isAbortError(err) || !isSessionValid()) return;
    state.submitting = false;
    const apiErr = err as { fields?: Record<string, string>; message?: string };
    state.errorText =
      (apiErr.fields && apiErr.fields.reason) ||
      apiErr.message ||
      props.services.t('操作失败，请稍后重试');
  } finally {
    if (submitAbort === controller) submitAbort = null;
    if (isSessionValid()) state.submitting = false;
  }
}

watch(
  [() => props.open, () => props.exchange?.id],
  ([isOpen]) => {
    if (isOpen && props.exchange) {
      openedUserId = props.services.user()?.id || null;
      openedToken = props.services.token();
      state.reason = '';
      state.submitting = false;
      state.errorText = '';
    } else {
      resetAndAbort();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disposed = true;
  resetAndAbort();
});
</script>

<template>
  <DialogVue3
    v-if="open && exchange"
    :title="services.t('拒绝换卡申请')"
    :t="services.t"
    :busy="state.submitting"
    size="sm"
    @close="handleClose"
  >
    <p class="modal-text">
      {{ services.t('来自「') }}{{ personLabelVue3(exchange.fromUser, services.t) }}{{ services.t('」的换卡申请：') }}{{ exchange.card?.title || '' }}
    </p>
    <label class="f-modal-field">
      <span class="label">
        {{ services.t('拒绝理由') }}
        <span class="f-optional">{{ services.t('选填') }}</span>
      </span>
      <textarea
        v-model="state.reason"
        class="textarea"
        data-reject-reason
        rows="3"
        :disabled="state.submitting"
        :placeholder="services.t('例如：这张卡暂时不互换，抱歉啦')"
      ></textarea>
      <span class="f-counter" data-reject-counter>{{ reasonLength }} / {{ PROFILE_LIMITS_VUE3.rejectReason }}</span>
    </label>
    <p v-if="state.errorText" class="f-modal-error" data-modal-error role="alert">
      {{ state.errorText }}
    </p>
    <template #actions>
      <button class="btn btn-ghost" type="button" :disabled="state.submitting" @click="handleClose">
        {{ services.t('取消') }}
      </button>
      <button class="btn btn-danger" type="button" :disabled="state.submitting" @click="submitReject">
        {{ state.submitting ? services.t('提交中') : services.t('确认拒绝') }}
      </button>
    </template>
  </DialogVue3>
</template>
