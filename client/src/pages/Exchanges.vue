<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AvatarVue3 from '../components/Avatar.vue';
import DialogVue3 from '../components/Dialog.vue';
import ExchangeApproveDialogVue3 from '../components/ExchangeApproveDialog.vue';
import ExchangeContactLogsVue3 from '../components/ExchangeContactLogs.vue';
import ExchangeRejectDialogVue3 from '../components/ExchangeRejectDialog.vue';
import IconVue3 from '../components/Icon.vue';
import ResponsiveImageVue3 from '../components/ResponsiveImage.vue';
import type {
  AddressVue3,
  ExchangeCountsVue3,
  ExchangeItemVue3,
  ExchangeServicesVue3,
  PublicUserVue3,
  RouteContextVue3,
  SelfUserVue3,
} from '../contracts';
import {
  displayNameVue3,
  exchangeStatusToneVue3,
  formatAddressTextVue3,
  personLabelVue3,
} from '../exchange-utils';
import { useScrollRevealVue3 } from '../composables/use-scroll-reveal';

const props = defineProps<{
  ctx?: RouteContextVue3;
  services: ExchangeServicesVue3;
}>();

const t = props.services.t;
const rootRef = ref<HTMLElement>();
const tabsRef = ref<HTMLElement>();
const listRef = ref<HTMLElement>();
const { scan } = useScrollRevealVue3(rootRef);

const STATUS_KEYS = ['all', 'pending', 'approved', 'completed', 'rejected', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_KEYS)[number];
type BoxFilter = 'incoming' | 'outgoing';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: t('全部'),
  pending: t('待处理'),
  approved: t('已同意'),
  completed: t('已完成'),
  rejected: t('已拒绝'),
  cancelled: t('已取消'),
};

function boxFromQuery(query?: URLSearchParams): BoxFilter {
  return query?.get('box') === 'outgoing' ? 'outgoing' : 'incoming';
}

function statusFromQuery(query?: URLSearchParams): StatusFilter {
  const raw = query?.get('status') || '';
  return STATUS_KEYS.includes(raw as StatusFilter) ? (raw as StatusFilter) : 'all';
}

const initialBox = boxFromQuery(props.ctx?.query);
const initialStatus = statusFromQuery(props.ctx?.query);

const initialUser = props.services.user() as SelfUserVue3 | null;
const initialUserId = initialUser?.id || null;
const initialToken = props.services.token();

let disposed = false;
let authEpoch = 0;
let listGen = 0;
let listAbort: AbortController | null = null;
let actionAbort: AbortController | null = null;
let switchTimer = 0;
let gliderFrame = 0;
let tabsObserver: ResizeObserver | null = null;

const currentUser = ref<SelfUserVue3 | null>(initialUser);
const box = ref<BoxFilter>(initialBox);
const statusFilter = ref<StatusFilter>(initialStatus);
const items = ref<ExchangeItemVue3[]>([]);
const counts = ref<ExchangeCountsVue3>({});
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref('');
const hasGlider = ref(false);
const gliderStyle = ref<{ width: string; transform: string }>({ width: '0px', transform: 'translateX(0px)' });
const switchClass = ref('');

const busyRowId = ref<string | null>(null);
const copyingKey = ref<string | null>(null);
const activeApproveExchange = ref<ExchangeItemVue3 | null>(null);
const activeRejectExchange = ref<ExchangeItemVue3 | null>(null);
const confirmDialog = ref<{
  type: 'cancel' | 'complete';
  exchange: ExchangeItemVue3;
} | null>(null);
const confirmSubmitting = ref(false);

const inBoxItems = computed(() => items.value.filter(item => item.direction === box.value));

const statusCounts = computed(() => {
  const map: Record<string, number> = { all: inBoxItems.value.length };
  for (const item of inBoxItems.value) {
    map[item.status] = (map[item.status] || 0) + 1;
  }
  return map;
});

const visibleItems = computed(() =>
  inBoxItems.value.filter(item => statusFilter.value === 'all' || item.status === statusFilter.value),
);

const totalSummaryText = computed(() => {
  if (loadError.value) return t('加载失败');
  const total = inBoxItems.value.length;
  if (!total) return '';
  if (statusFilter.value === 'all') return `${t('共')} ${total} ${t('条')}`;
  return `${t('共')} ${total} ${t('条')}${t('，当前')} ${visibleItems.value.length} ${t('条')}`;
});

const incomingPendingCount = computed(() => Number(counts.value.incomingPending) || 0);
const outgoingPendingCount = computed(() => Number(counts.value.outgoingPending) || 0);

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(epoch = authEpoch): boolean {
  if (disposed || epoch !== authEpoch) return false;
  const u = props.services.user() as SelfUserVue3 | null;
  return !!u && u.id === initialUserId && props.services.token() === initialToken;
}

function counterpartOf(ex: ExchangeItemVue3): PublicUserVue3 | null {
  return (ex.direction === 'incoming' ? ex.fromUser : ex.toUser) || null;
}

function moveGlider() {
  const tabsEl = tabsRef.value;
  if (!tabsEl) return;
  const active = tabsEl.querySelector<HTMLElement>('.tab.is-active');
  if (!active || !active.offsetWidth) return;
  gliderStyle.value = {
    width: active.offsetWidth + 'px',
    transform: `translateX(${active.offsetLeft}px)`,
  };
  if (!hasGlider.value) {
    gliderFrame = requestAnimationFrame(() => {
      hasGlider.value = true;
    });
  }
}

function syncQuery() {
  props.services.setQuery({
    box: box.value === 'incoming' ? null : box.value,
    status: statusFilter.value === 'all' ? null : statusFilter.value,
  });
}

function animateBoxSwitch(nextBox: BoxFilter) {
  void nextTick().then(moveGlider);
  window.clearTimeout(switchTimer);
  switchClass.value = nextBox === 'outgoing' ? 'is-switch-right' : 'is-switch-left';
  switchTimer = window.setTimeout(() => {
    switchClass.value = '';
  }, 800);
}

function selectBox(nextBox: BoxFilter) {
  if (box.value === nextBox) return;
  box.value = nextBox;
  syncQuery();
  animateBoxSwitch(nextBox);
}

function selectStatus(nextStatus: StatusFilter) {
  if (statusFilter.value === nextStatus) return;
  statusFilter.value = nextStatus;
  syncQuery();
}

watch(
  () => props.ctx?.query.toString() || '',
  () => {
    const nextBox = boxFromQuery(props.ctx?.query);
    const nextStatus = statusFromQuery(props.ctx?.query);
    const boxChanged = box.value !== nextBox;
    box.value = nextBox;
    statusFilter.value = nextStatus;
    if (boxChanged) animateBoxSwitch(nextBox);
  },
);

function resetAllDialogs() {
  actionAbort?.abort();
  actionAbort = null;
  activeApproveExchange.value = null;
  activeRejectExchange.value = null;
  confirmDialog.value = null;
  confirmSubmitting.value = false;
  busyRowId.value = null;
}

function clearPrivateState() {
  listGen++;
  listAbort?.abort();
  listAbort = null;
  resetAllDialogs();
  currentUser.value = null;
  items.value = [];
  counts.value = {};
  loading.value = false;
  refreshing.value = false;
  loadError.value = '';
}

async function loadExchanges(showRefreshToast = false) {
  if (!isSessionValid()) return;
  const gen = ++listGen;
  const epoch = authEpoch;
  listAbort?.abort();
  const controller = new AbortController();
  listAbort = controller;

  if (!items.value.length) loading.value = true;
  loadError.value = '';

  try {
    const data = await props.services.listExchanges(controller.signal);
    if (gen !== listGen || !isSessionValid(epoch)) return;
    items.value = Array.isArray(data?.items) ? data.items : [];
    counts.value = data?.counts || {};
    loading.value = false;
    if (showRefreshToast) {
      props.services.toast(t('列表已刷新'), 'info');
    }
    await nextTick();
    moveGlider();
    scan();
  } catch (err) {
    if (isAbortError(err) || gen !== listGen || !isSessionValid(epoch)) return;
    loading.value = false;
    const message = err instanceof Error && err.message ? err.message : t('网络异常，请稍后重试');
    loadError.value = message;
    props.services.toast(message, 'error');
  } finally {
    if (listAbort === controller) listAbort = null;
  }
}

async function handleRefresh() {
  if (refreshing.value || !isSessionValid()) return;
  refreshing.value = true;
  try {
    await loadExchanges(true);
  } finally {
    if (isSessionValid()) refreshing.value = false;
  }
}

function openApprove(ex: ExchangeItemVue3) {
  if (busyRowId.value || activeApproveExchange.value || activeRejectExchange.value || confirmDialog.value) return;
  busyRowId.value = ex.id;
  activeApproveExchange.value = ex;
}

function closeApprove() {
  activeApproveExchange.value = null;
  busyRowId.value = null;
}

function onApproved() {
  closeApprove();
  void loadExchanges();
}

function openReject(ex: ExchangeItemVue3) {
  if (busyRowId.value || activeApproveExchange.value || activeRejectExchange.value || confirmDialog.value) return;
  busyRowId.value = ex.id;
  activeRejectExchange.value = ex;
}

function closeReject() {
  activeRejectExchange.value = null;
  busyRowId.value = null;
}

function onRejected() {
  closeReject();
  void loadExchanges();
}

function openCancelConfirm(ex: ExchangeItemVue3) {
  if (busyRowId.value || activeApproveExchange.value || activeRejectExchange.value || confirmDialog.value) return;
  confirmDialog.value = { type: 'cancel', exchange: ex };
}

function openCompleteConfirm(ex: ExchangeItemVue3) {
  if (busyRowId.value || activeApproveExchange.value || activeRejectExchange.value || confirmDialog.value) return;
  confirmDialog.value = { type: 'complete', exchange: ex };
}

function closeConfirmDialog() {
  if (confirmSubmitting.value) return;
  confirmDialog.value = null;
}

async function submitConfirmDialog() {
  const current = confirmDialog.value;
  if (!current || confirmSubmitting.value || !isSessionValid()) return;
  const epoch = authEpoch;
  confirmSubmitting.value = true;
  busyRowId.value = current.exchange.id;
  actionAbort?.abort();
  const controller = new AbortController();
  actionAbort = controller;

  try {
    if (current.type === 'cancel') {
      await props.services.cancelExchange(current.exchange.id, controller.signal);
      if (!isSessionValid(epoch)) return;
      confirmSubmitting.value = false;
      confirmDialog.value = null;
      busyRowId.value = null;
      props.services.toast(t('已撤回换卡申请'), 'info');
      void loadExchanges();
    } else {
      await props.services.completeExchange(current.exchange.id, controller.signal);
      if (!isSessionValid(epoch)) return;
      confirmSubmitting.value = false;
      confirmDialog.value = null;
      busyRowId.value = null;
      props.services.toast(t('已标记完成，感谢这次电波相遇'), 'success');
      props.services.celebrate(window.innerWidth / 2, window.innerHeight / 3);
      void loadExchanges();
    }
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    confirmSubmitting.value = false;
    confirmDialog.value = null;
    busyRowId.value = null;
    const fallback = current.type === 'cancel' ? t('撤回失败，请稍后重试') : t('操作失败，请稍后重试');
    props.services.toast(err instanceof Error && err.message ? err.message : fallback, 'error');
  } finally {
    if (actionAbort === controller) actionAbort = null;
  }
}

async function copyAddress(ex: ExchangeItemVue3, addrKey: 'from' | 'to') {
  const addr: AddressVue3 | null | undefined = addrKey === 'from' ? ex.fromAddress : ex.toAddress;
  if (!addr) return;
  const key = `${ex.id}:${addrKey}`;
  if (copyingKey.value === key) return;
  copyingKey.value = key;
  try {
    await props.services.copyText(formatAddressTextVue3(addr), t('地址已复制，去寄卡片吧'));
  } finally {
    if (copyingKey.value === key) copyingKey.value = null;
  }
}

const offAuth = props.services.onAuth(nextUser => {
  const tokenNow = props.services.token();
  if (nextUser && initialUserId && nextUser.id === initialUserId && tokenNow === initialToken) {
    currentUser.value = nextUser as SelfUserVue3;
    return;
  }
  authEpoch++;
  clearPrivateState();
  if (!nextUser) {
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/exchanges'), { replace: true });
  } else {
    props.services.navigate('/dashboard/exchanges', { replace: true });
  }
});

onMounted(async () => {
  if (!initialUser) {
    clearPrivateState();
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/exchanges'), { replace: true });
    return;
  }
  await nextTick();
  moveGlider();
  if (tabsRef.value && typeof ResizeObserver === 'function') {
    tabsObserver = new ResizeObserver(moveGlider);
    tabsObserver.observe(tabsRef.value);
  }
  scan();
  void loadExchanges();
});

watch(loading, async () => {
  await nextTick();
  moveGlider();
  scan();
});

onBeforeUnmount(() => {
  disposed = true;
  authEpoch++;
  offAuth();
  window.clearTimeout(switchTimer);
  cancelAnimationFrame(gliderFrame);
  tabsObserver?.disconnect();
  tabsObserver = null;
  clearPrivateState();
});
</script>

<template>
  <div v-if="currentUser" ref="rootRef" class="f-page f-exchanges container">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">CARD EXCHANGES</span>
        <h1 class="page-title">{{ t('换卡申请') }}</h1>
        <p class="page-desc">{{ t('处理收到的换卡申请，跟进你发出的申请；达成交换后双方地址互相可见。') }}</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-primary" href="/explore" data-link>
          <IconVue3 name="compass" :size="17" />
          <span>{{ t('去广场找卡片') }}</span>
        </a>
      </div>
    </div>

    <div class="f-ex-toolbar" data-vue-reveal>
      <div
        ref="tabsRef"
        class="tabs tabs-lg f-ex-tabs"
        :class="{ 'has-glider': hasGlider }"
        role="tablist"
        :aria-label="t('申请分类')"
      >
        <span class="f-ex-tab-glider" aria-hidden="true" :style="gliderStyle"></span>
        <button
          class="tab"
          :class="{ 'is-active': box === 'incoming' }"
          type="button"
          role="tab"
          :aria-selected="box === 'incoming' ? 'true' : 'false'"
          data-box="incoming"
          @click="selectBox('incoming')"
        >
          <IconVue3 name="inbox" :size="16" />
          <span>{{ t('收到的申请') }}</span>
          <b class="tab-count" data-box-count="incoming" :hidden="incomingPendingCount <= 0">{{ incomingPendingCount }}</b>
        </button>
        <button
          class="tab"
          :class="{ 'is-active': box === 'outgoing' }"
          type="button"
          role="tab"
          :aria-selected="box === 'outgoing' ? 'true' : 'false'"
          data-box="outgoing"
          @click="selectBox('outgoing')"
        >
          <IconVue3 name="send" :size="16" />
          <span>{{ t('我发出的申请') }}</span>
          <b class="tab-count" data-box-count="outgoing" :hidden="outgoingPendingCount <= 0">{{ outgoingPendingCount }}</b>
        </button>
      </div>
      <div class="f-ex-toolbar-side">
        <span class="f-ex-total" data-ex-total>{{ totalSummaryText }}</span>
        <button
          class="btn btn-ghost btn-sm"
          type="button"
          data-refresh
          :disabled="refreshing"
          @click="handleRefresh"
        >
          <IconVue3 name="refresh" :size="15" />
          <span class="f-hide-sm">{{ t('刷新') }}</span>
        </button>
      </div>
    </div>

    <div class="f-ex-filters" role="group" :aria-label="t('状态筛选')">
      <button
        v-for="key in STATUS_KEYS"
        :key="key"
        class="chip"
        :class="{ 'is-active': statusFilter === key }"
        type="button"
        :data-status="key"
        @click="selectStatus(key)"
      >
        {{ STATUS_LABELS[key] }}<b class="f-ex-filter-count" :data-status-count="key">{{ statusCounts[key] || '' }}</b>
      </button>
    </div>

    <div
      id="fExchangeList"
      ref="listRef"
      class="f-ex-list"
      :class="switchClass"
      aria-live="polite"
    >
      <template v-if="loading">
        <div v-for="idx in 3" :key="idx" class="skeleton-row">
          <span class="skeleton skeleton-avatar"></span>
          <div class="skeleton-col">
            <span class="skeleton skeleton-line" style="width: 45%"></span>
            <span class="skeleton skeleton-line" style="width: 72%"></span>
          </div>
        </div>
      </template>

      <div v-else-if="loadError" class="empty-state">
        <div class="empty-icon"><IconVue3 name="alert" :size="36" /></div>
        <h3>{{ t('换卡申请加载失败') }}</h3>
        <p>{{ loadError }}</p>
        <button class="btn btn-primary" type="button" @click="loadExchanges()">{{ t('重新加载') }}</button>
      </div>

      <div v-else-if="!visibleItems.length" class="empty-state">
        <template v-if="statusFilter !== 'all'">
          <div class="empty-icon"><IconVue3 name="search" :size="36" /></div>
          <h3>{{ t('该状态下暂无申请') }}</h3>
          <p>{{ t('切换上方的状态筛选，查看其它申请记录。') }}</p>
          <button class="btn btn-primary" type="button" @click="selectStatus('all')">{{ t('查看全部') }}</button>
        </template>
        <template v-else>
          <div class="empty-icon"><IconVue3 :name="box === 'incoming' ? 'inbox' : 'send'" :size="36" /></div>
          <h3>{{ box === 'incoming' ? t('还没有收到换卡申请') : t('还没有发出换卡申请') }}</h3>
          <p>
            {{
              box === 'incoming'
                ? t('当其他火腿对你的卡片感兴趣时会在这里发起申请。先去广场看看，也多多上传自己的卡片吧。')
                : t('去卡片广场挑选喜欢的卡片，点击「申请换卡」即可把电波里的相遇寄出去。')
            }}
          </p>
          <button class="btn btn-primary" type="button" @click="services.navigate('/explore')">
            {{ box === 'incoming' ? t('去卡片广场逛逛') : t('去找喜欢的卡片') }}
          </button>
        </template>
      </div>

      <template v-else>
        <article
          v-for="ex in visibleItems"
          :key="ex.id"
          class="f-ex"
          :class="{ 'is-busy': busyRowId === ex.id }"
          :data-ex-id="ex.id"
          :data-status="ex.status"
          :data-direction="ex.direction || ''"
        >
          <div class="f-ex-side-card">
            <a
              class="f-ex-thumb"
              :href="ex.card?.id ? '/card/' + encodeURIComponent(ex.card.id) : '#'"
              :aria-label="t('查看卡片') + ' ' + (ex.card?.title || '')"
              data-link
            >
              <span :style="{ aspectRatio: `${ex.card?.ratio?.w || 3} / ${ex.card?.ratio?.h || 2}` }">
                <ResponsiveImageVue3
                  :src="ex.card?.frontImage || services.placeholder"
                  :width="100"
                  alt=""
                  :services="services"
                />
              </span>
              <span class="f-ex-thumb-dir">
                <IconVue3 :name="ex.direction === 'incoming' ? 'inbox' : 'send'" :size="15" />
              </span>
            </a>
            <div class="f-ex-side-info">
              <a
                class="f-ex-card-title"
                :href="ex.card?.id ? '/card/' + encodeURIComponent(ex.card.id) : '#'"
                data-link
              >
                {{ ex.card?.title || t('未命名卡片') }}
              </a>
              <span class="f-ex-card-meta">
                <span class="f-ex-ratio">{{ `${ex.card?.ratio?.w || 3} : ${ex.card?.ratio?.h || 2}` }}</span>
              </span>
              <span class="f-ex-counterpart">
                <IconVue3 :name="ex.direction === 'incoming' ? 'user' : 'globe'" :size="13" />
                {{ ex.direction === 'incoming' ? t('申请人') : t('卡片拥有者') }}：
                {{ displayNameVue3(counterpartOf(ex), t) }}
                <b class="mono">{{ counterpartOf(ex)?.callSign || '' }}</b>
              </span>
            </div>
          </div>

          <div class="f-ex-main">
            <div class="f-ex-head">
              <div class="f-ex-user">
                <AvatarVue3
                  :user="counterpartOf(ex) || { uid: '', joinedAt: '', stats: { cards: 0, likesReceived: 0 } }"
                  :size="40"
                />
                <div class="f-ex-user-info">
                  <b>{{ displayNameVue3(counterpartOf(ex), t) }}</b>
                  <span class="f-ex-user-sub">
                    <b class="mono">{{ counterpartOf(ex)?.callSign || '—' }}</b> · @{{ counterpartOf(ex)?.username || '' }}
                  </span>
                </div>
              </div>
              <div class="f-ex-status">
                <span class="badge" :class="'badge-' + exchangeStatusToneVue3(ex.status)">
                  {{ services.exchangeText(ex.status) }}
                </span>
                <time class="f-ex-time" :datetime="ex.createdAt || ''">{{ services.timeAgo(ex.createdAt) }}</time>
              </div>
            </div>

            <div class="f-ex-direction">
              <IconVue3 :name="ex.direction === 'incoming' ? 'inbox' : 'send'" :size="14" />
              <span v-if="ex.direction === 'incoming'">
                {{ t('收到来自') }} <b>{{ displayNameVue3(ex.fromUser, t) }}</b>（{{ ex.fromUser?.callSign || t('无呼号') }}{{ t('）的换卡申请') }}
              </span>
              <span v-else>
                {{ t('你向') }} <b>{{ displayNameVue3(ex.toUser, t) }}</b>（{{ ex.toUser?.callSign || t('无呼号') }}{{ t('）发出换卡申请') }}
              </span>
              <span v-if="ex.decidedAt" class="f-ex-decided">
                {{ t('处理于') }} {{ services.timeAgo(ex.decidedAt) }}
              </span>
            </div>

            <ExchangeContactLogsVue3
              :logs="ex.selectedContactLogs"
              :direction="ex.direction"
              :t="t"
            />

            <p v-if="ex.message" class="f-ex-message">
              <IconVue3 name="mail" :size="14" /><span>{{ ex.message }}</span>
            </p>

            <p
              v-if="ex.rejectReason && (ex.status === 'rejected' || ex.status === 'cancelled')"
              class="f-ex-reject"
            >
              <IconVue3 name="alert" :size="14" /><span>{{ t('拒绝理由：') }}{{ ex.rejectReason }}</span>
            </p>

            <p v-if="ex.status === 'approved' || ex.status === 'completed'" class="f-ex-preference">
              <IconVue3 name="cards" :size="15" />
              <span>
                {{ ex.direction === 'incoming' ? t('希望收到的卡片：') : t('对方希望收到的卡片：') }}
                <template v-if="ex.preferredCard">
                  <a
                    v-if="ex.direction !== 'incoming'"
                    class="f-ex-preference-link"
                    :href="'/card/' + encodeURIComponent(ex.preferredCard.id)"
                    data-link
                  >
                    {{ ex.preferredCard.title || t('未命名卡片') }}
                  </a>
                  <template v-else>{{ ex.preferredCard.title || t('未命名卡片') }}</template>
                </template>
                <template v-else-if="ex.preferredCardTitle">
                  {{ ex.preferredCardTitle }}{{ t('（已不可用）') }}
                </template>
                <template v-else>{{ t('无所谓') }}</template>
              </span>
            </p>

            <div
              v-if="(ex.status === 'approved' || ex.status === 'completed') && (ex.fromAddress || ex.toAddress)"
              class="f-ex-addresses"
            >
              <div v-if="ex.fromAddress" class="f-addr">
                <div class="f-addr-head">
                  <span class="f-addr-role">
                    <IconVue3 name="send" :size="14" />
                    {{ ex.direction === 'incoming' ? t('申请人 · 寄件地址') : t('我的寄件地址') }}
                  </span>
                  <span class="f-addr-person">{{ personLabelVue3(ex.fromUser, t) }}</span>
                </div>
                <div class="f-addr-body">
                  <b class="f-addr-name">{{ ex.fromAddress.name || '' }}</b>
                  <span v-if="ex.fromAddress.phone" class="f-addr-phone mono">{{ ex.fromAddress.phone }}</span>
                  <p class="f-addr-line">
                    {{ [ex.fromAddress.province, ex.fromAddress.city, ex.fromAddress.line1].filter(Boolean).join(' ') }}
                  </p>
                  <span v-if="ex.fromAddress.postalCode || ex.fromAddress.country" class="f-addr-tail">
                    {{ [ex.fromAddress.postalCode, ex.fromAddress.country].filter(Boolean).join(' · ') }}
                  </span>
                </div>
                <button
                  class="f-addr-copy"
                  type="button"
                  data-ex-act="copy-address"
                  data-addr="from"
                  :title="t('复制地址')"
                  :disabled="copyingKey === `${ex.id}:from`"
                  @click="copyAddress(ex, 'from')"
                >
                  <IconVue3 name="copy" :size="15" /><span>{{ t('复制') }}</span>
                </button>
              </div>

              <div v-if="ex.toAddress" class="f-addr">
                <div class="f-addr-head">
                  <span class="f-addr-role">
                    <IconVue3 name="map-pin" :size="14" />
                    {{ ex.direction === 'incoming' ? t('我的收件地址') : t('卡片拥有者 · 收件地址') }}
                  </span>
                  <span class="f-addr-person">{{ personLabelVue3(ex.toUser, t) }}</span>
                </div>
                <div class="f-addr-body">
                  <b class="f-addr-name">{{ ex.toAddress.name || '' }}</b>
                  <span v-if="ex.toAddress.phone" class="f-addr-phone mono">{{ ex.toAddress.phone }}</span>
                  <p class="f-addr-line">
                    {{ [ex.toAddress.province, ex.toAddress.city, ex.toAddress.line1].filter(Boolean).join(' ') }}
                  </p>
                  <span v-if="ex.toAddress.postalCode || ex.toAddress.country" class="f-addr-tail">
                    {{ [ex.toAddress.postalCode, ex.toAddress.country].filter(Boolean).join(' · ') }}
                  </span>
                </div>
                <button
                  class="f-addr-copy"
                  type="button"
                  data-ex-act="copy-address"
                  data-addr="to"
                  :title="t('复制地址')"
                  :disabled="copyingKey === `${ex.id}:to`"
                  @click="copyAddress(ex, 'to')"
                >
                  <IconVue3 name="copy" :size="15" /><span>{{ t('复制') }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="(ex.direction === 'incoming' && ex.status === 'pending') || (ex.direction === 'outgoing' && ex.status === 'pending') || ex.status === 'approved'"
              class="f-ex-actions"
            >
              <template v-if="ex.direction === 'incoming' && ex.status === 'pending'">
                <button
                  class="btn btn-sm btn-primary"
                  type="button"
                  data-ex-act="approve"
                  :disabled="busyRowId === ex.id"
                  @click="openApprove(ex)"
                >
                  <IconVue3 name="check" :size="15" />{{ t('同意交换') }}
                </button>
                <button
                  class="btn btn-sm btn-ghost"
                  type="button"
                  data-ex-act="reject"
                  :disabled="busyRowId === ex.id"
                  @click="openReject(ex)"
                >
                  <IconVue3 name="x" :size="15" />{{ t('拒绝') }}
                </button>
              </template>
              <button
                v-else-if="ex.direction === 'outgoing' && ex.status === 'pending'"
                class="btn btn-sm btn-ghost"
                type="button"
                data-ex-act="cancel"
                :disabled="busyRowId === ex.id"
                @click="openCancelConfirm(ex)"
              >
                <IconVue3 name="x" :size="15" />{{ t('撤回申请') }}
              </button>
              <button
                v-if="ex.status === 'approved'"
                class="btn btn-sm btn-primary"
                type="button"
                data-ex-act="complete"
                :disabled="busyRowId === ex.id"
                @click="openCompleteConfirm(ex)"
              >
                <IconVue3 name="check-circle" :size="15" />{{ t('标记完成') }}
              </button>
            </div>
          </div>
        </article>
      </template>
    </div>

    <ExchangeApproveDialogVue3
      :open="!!activeApproveExchange"
      :exchange="activeApproveExchange"
      :services="services"
      @close="closeApprove"
      @approved="onApproved"
    />

    <ExchangeRejectDialogVue3
      :open="!!activeRejectExchange"
      :exchange="activeRejectExchange"
      :services="services"
      @close="closeReject"
      @rejected="onRejected"
    />

    <DialogVue3
      v-if="confirmDialog"
      :title="confirmDialog.type === 'cancel' ? t('撤回换卡申请') : t('标记换卡完成')"
      :t="t"
      :busy="confirmSubmitting"
      size="sm"
      @close="closeConfirmDialog"
    >
      <p class="modal-text">
        {{
          confirmDialog.type === 'cancel'
            ? t('撤回后对方将看不到这条申请，你可以稍后重新申请。确定撤回吗？')
            : t('确认你与「') + personLabelVue3(counterpartOf(confirmDialog.exchange), t) + t('」都已经寄出并收到卡片了吗？标记后将记录这段通联。')
        }}
      </p>
      <template #actions>
        <button class="btn btn-ghost" type="button" :disabled="confirmSubmitting" @click="closeConfirmDialog">
          {{ confirmDialog.type === 'cancel' ? t('保留申请') : t('还没完成') }}
        </button>
        <button
          class="btn"
          :class="confirmDialog.type === 'cancel' ? 'btn-danger' : 'btn-primary'"
          type="button"
          :disabled="confirmSubmitting"
          @click="submitConfirmDialog"
        >
          {{ confirmDialog.type === 'cancel' ? t('撤回申请') : t('标记完成') }}
        </button>
      </template>
    </DialogVue3>
  </div>
</template>
