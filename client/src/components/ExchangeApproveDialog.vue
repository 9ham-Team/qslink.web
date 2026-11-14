<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import DialogVue3 from './Dialog.vue';
import ExchangeContactLogsVue3 from './ExchangeContactLogs.vue';
import IconVue3 from './Icon.vue';
import type {
  CardVue3,
  ExchangeDecisionServicesVue3,
  ExchangeItemVue3,
} from '../contracts';
import { personLabelVue3 } from '../exchange-utils';

const props = defineProps<{
  open: boolean;
  exchange: ExchangeItemVue3 | null;
  services: ExchangeDecisionServicesVue3;
}>();

const emit = defineEmits<{
  close: [];
  approved: [exchange: ExchangeItemVue3];
}>();

let disposed = false;
let openedUserId: string | null = null;
let openedToken: string | null = null;
let cardsAbort: AbortController | null = null;
let submitAbort: AbortController | null = null;

const state = reactive<{
  loadingCards: boolean;
  ready: boolean;
  submitting: boolean;
  hasUploadedCards: boolean;
  cards: CardVue3[];
  selectedCardId: string | null;
  statusText: string;
  errorText: string;
  confirmNoCardsOpen: boolean;
  jobId: number;
}>({
  loadingCards: false,
  ready: false,
  submitting: false,
  hasUploadedCards: true,
  cards: [],
  selectedCardId: null,
  statusText: '',
  errorText: '',
  confirmNoCardsOpen: false,
  jobId: 0,
});

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(): boolean {
  if (disposed || !props.open || !props.exchange) return false;
  const u = props.services.user();
  return !!u && u.id === openedUserId && props.services.token() === openedToken;
}

function resetAndAbort() {
  cardsAbort?.abort();
  cardsAbort = null;
  submitAbort?.abort();
  submitAbort = null;
  state.jobId++;
  state.confirmNoCardsOpen = false;
  state.cards = [];
  state.selectedCardId = null;
  state.loadingCards = false;
  state.ready = false;
  state.submitting = false;
  state.errorText = '';
  state.statusText = '';
}

async function loadApplicantCards() {
  const ex = props.exchange;
  if (!ex || !props.open) return;
  const job = ++state.jobId;
  cardsAbort?.abort();
  const controller = new AbortController();
  cardsAbort = controller;

  state.loadingCards = true;
  state.ready = false;
  state.errorText = '';
  state.statusText = props.services.t('正在加载申请者的卡片…');
  state.cards = [];
  state.selectedCardId = null;

  try {
    const collected = new Map<string, CardVue3>();
    let lastPage = 1;
    let hasUploads = true;
    for (let page = 1; page <= lastPage; page++) {
      const result = await props.services.getApplicantCards(ex.id, page, controller.signal);
      if (!isSessionValid() || job !== state.jobId) return;
      if (page === 1) {
        lastPage = Math.max(1, Number(result.pages) || 1);
        hasUploads = !!result.hasUploadedCards;
      }
      for (const card of result.items || []) {
        if (card && card.id) collected.set(card.id, card);
      }
    }
    const cards = Array.from(collected.values());
    state.hasUploadedCards = hasUploads;
    state.cards = cards;
    state.selectedCardId = null;
    state.ready = true;
    state.statusText = cards.length
      ? props.services.t('申请者的已审核公开卡片 · 默认选择“无所谓”')
      : hasUploads
        ? props.services.t('申请者已上传卡片，暂无已审核公开卡片可选。')
        : props.services.t('该申请者没有上传卡片，可选择“无所谓”继续。');
  } catch (err) {
    if (isAbortError(err) || !isSessionValid() || job !== state.jobId) return;
    state.statusText = props.services.t('卡片加载失败，暂时无法确认交换。');
    state.errorText = err instanceof Error && err.message ? err.message : props.services.t('请重新加载卡片');
  } finally {
    if (cardsAbort === controller) cardsAbort = null;
    if (job === state.jobId && isSessionValid()) {
      state.loadingCards = false;
    }
  }
}

function handleClose() {
  if (state.submitting) return;
  resetAndAbort();
  emit('close');
}

function handleConfirmClick() {
  if (!state.ready || state.submitting || !props.open) return;
  if (!state.hasUploadedCards) {
    state.confirmNoCardsOpen = true;
  } else {
    void submitApprove(false);
  }
}

function cancelNoCardsConfirm() {
  if (state.submitting) return;
  state.confirmNoCardsOpen = false;
}

function proceedNoCardsConfirm() {
  if (state.submitting || !props.open) return;
  state.confirmNoCardsOpen = false;
  void submitApprove(true);
}

async function submitApprove(confirmNoCards: boolean) {
  const ex = props.exchange;
  if (!ex || state.submitting || !state.ready || !isSessionValid()) return;

  state.submitting = true;
  state.errorText = '';
  submitAbort?.abort();
  const controller = new AbortController();
  submitAbort = controller;

  try {
    const res = await props.services.approveExchange(
      ex.id,
      { preferredCardId: state.selectedCardId || null, confirmNoCards },
      controller.signal,
    );
    if (!isSessionValid()) return;
    state.submitting = false;
    resetAndAbort();
    props.services.toast(props.services.t('已同意换卡申请，双方地址已解锁'), 'success');
    props.services.celebrate(window.innerWidth / 2, window.innerHeight / 3);
    emit('approved', res?.exchange || ex);
  } catch (err) {
    if (isAbortError(err) || !isSessionValid()) return;
    state.submitting = false;
    const apiErr = err as { code?: string; fields?: Record<string, string>; message?: string };
    state.errorText =
      (apiErr.fields && apiErr.fields.preferredCardId) ||
      apiErr.message ||
      props.services.t('操作失败，请稍后重试');
    if (apiErr.code === 'APPLICANT_HAS_NO_CARDS' || (apiErr.fields && apiErr.fields.preferredCardId)) {
      void loadApplicantCards();
    }
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
      state.hasUploadedCards = true;
      state.ready = false;
      state.submitting = false;
      state.errorText = '';
      state.confirmNoCardsOpen = false;
      void loadApplicantCards();
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
    :title="services.t('选择希望交换的卡片')"
    :t="services.t"
    :busy="state.submitting"
    size="lg"
    @close="handleClose"
  >
    <p class="modal-text">
      {{ services.t('申请者：') }}{{ personLabelVue3(exchange.fromUser, services.t) }}{{ services.t('。请选择希望收到的卡片，也可以保持“无所谓”。确认同意后，双方寄送地址将互相可见。') }}
    </p>

    <ExchangeContactLogsVue3
      :logs="exchange.selectedContactLogs"
      :direction="exchange.direction"
      :t="services.t"
    />

    <p class="muted" data-choice-status role="status">{{ state.statusText }}</p>

    <div
      v-if="state.ready"
      class="f-ex-showcase"
      role="radiogroup"
      :aria-label="services.t('希望收到的卡片')"
    >
      <label class="f-ex-choice">
        <input
          v-model="state.selectedCardId"
          type="radio"
          name="preferred-card"
          :value="null"
          :disabled="state.submitting"
        >
        <span class="f-ex-choice__stage is-any">
          <IconVue3 name="cards" :size="40" />
          <b>{{ services.t('无所谓') }}</b>
          <small>{{ services.t('不指定对方寄送的卡片') }}</small>
        </span>
        <span class="f-ex-choice__name">{{ services.t('无所谓') }}</span>
        <span class="f-ex-choice__check" aria-hidden="true"><IconVue3 name="check" :size="16" /></span>
      </label>

      <label v-for="card in state.cards" :key="card.id" class="f-ex-choice">
        <input
          v-model="state.selectedCardId"
          type="radio"
          name="preferred-card"
          :value="card.id"
          :disabled="state.submitting"
        >
        <span class="f-ex-choice__stage">
          <img
            v-if="card.frontImage"
            :src="card.frontImage"
            :alt="card.title || services.t('未命名卡片')"
            loading="lazy"
            decoding="async"
          >
          <IconVue3 v-else name="cards" :size="40" />
        </span>
        <span class="f-ex-choice__name">{{ card.title || services.t('未命名卡片') }}</span>
        <span class="f-ex-choice__check" aria-hidden="true"><IconVue3 name="check" :size="16" /></span>
      </label>
    </div>

    <p v-if="state.errorText" class="f-modal-error" data-choice-error role="alert">
      {{ state.errorText }}
    </p>
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      data-choice-reload
      :disabled="state.loadingCards || state.submitting"
      @click="loadApplicantCards"
    >
      {{ services.t('重新加载卡片') }}
    </button>

    <template #actions>
      <button class="btn btn-ghost" type="button" :disabled="state.submitting" @click="handleClose">
        {{ services.t('取消') }}
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="!state.ready || state.submitting"
        @click="handleConfirmClick"
      >
        {{ state.submitting ? services.t('提交中') : services.t('确认交换') }}
      </button>
    </template>
  </DialogVue3>

  <DialogVue3
    v-if="open && state.confirmNoCardsOpen"
    :title="services.t('请确认是否交换')"
    :t="services.t"
    :busy="state.submitting"
    size="sm"
    @close="cancelNoCardsConfirm"
  >
    <p class="modal-text">{{ services.t('该申请者没有上传卡片哦，请确认是否进行交换') }}</p>
    <template #actions>
      <button class="btn btn-ghost" type="button" :disabled="state.submitting" @click="cancelNoCardsConfirm">
        {{ services.t('再想想') }}
      </button>
      <button class="btn btn-primary" type="button" :disabled="state.submitting" @click="proceedNoCardsConfirm">
        {{ services.t('确认交换') }}
      </button>
    </template>
  </DialogVue3>
</template>
