<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import DialogVue3 from './Dialog.vue';
import IconVue3 from './Icon.vue';
import type { AnnouncementVue3, HomeServicesVue3 } from '../contracts';

const props = defineProps<{ services: HomeServicesVue3 }>();
const t = props.services.t;

const entryButton = ref<HTMLButtonElement>();
const noticeEl = ref<HTMLElement>();
const boardListEl = ref<HTMLElement>();

const currentUser = shallowRef(props.services.user());

const noticeItem = shallowRef<AnnouncementVue3 | null>(null);
const noticeVisible = ref(false);
const noticeShow = ref(false);
const noticeClosing = ref(false);
const toastPaused = ref(false);
const hovered = ref(false);
const focusedWithin = ref(false);
const docHidden = ref(typeof document !== 'undefined' ? document.hidden : false);
const saving = ref(false);
const durationMs = ref(30000);
const remainingMs = ref(30000);

const paused = computed(() =>
  docHidden.value || toastPaused.value || hovered.value || focusedWithin.value || saving.value,
);
const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1000));
const progressScale = computed(() => (durationMs.value > 0 ? remainingMs.value / durationMs.value : 0));

const boardOpen = ref(false);
const boardItems = shallowRef<AnnouncementVue3[]>([]);
const boardPage = ref(1);
const boardPages = ref(1);
const boardLoading = ref(false);
const boardLoaded = ref(false);
const boardError = ref('');

let active = true;
let accountGeneration = 0;
let reminderGeneration = 0;
let modalJob = 0;

let reminderController: AbortController | null = null;
let dismissController: AbortController | null = null;
let modalController: AbortController | null = null;

let noticeFrame = 0;
let noticeTimer = 0;
let countdownTimer = 0;
let lastTick = typeof performance !== 'undefined' ? performance.now() : Date.now();
let toastObserver: MutationObserver | null = null;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clearNoticeTimers() {
  cancelAnimationFrame(noticeFrame);
  noticeFrame = 0;
  window.clearTimeout(noticeTimer);
  noticeTimer = 0;
  window.clearInterval(countdownTimer);
  countdownTimer = 0;
}

function resetNoticeImmediate() {
  clearNoticeTimers();
  noticeVisible.value = false;
  noticeShow.value = false;
  noticeClosing.value = false;
  noticeItem.value = null;
  hovered.value = false;
  focusedWithin.value = false;
  saving.value = false;
}

function syncToastPause() {
  const toastRoot = document.getElementById('toast-root');
  const hasToast = !!(toastRoot && toastRoot.querySelector('.toast'));
  toastPaused.value = hasToast;
  if (hasToast && noticeEl.value && document.activeElement && noticeEl.value.contains(document.activeElement)) {
    if (entryButton.value?.isConnected) entryButton.value.focus({ preventScroll: true });
    focusedWithin.value = false;
  }
}

function dismissNotice() {
  if (!noticeVisible.value || noticeClosing.value) return;
  noticeClosing.value = true;
  clearNoticeTimers();
  const hadFocus = !!(noticeEl.value && document.activeElement && noticeEl.value.contains(document.activeElement));
  noticeShow.value = false;
  hovered.value = false;
  focusedWithin.value = false;
  if (hadFocus && entryButton.value?.isConnected) {
    entryButton.value.focus({ preventScroll: true });
  }
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    noticeVisible.value = false;
    noticeItem.value = null;
    noticeClosing.value = false;
    return;
  }
  noticeTimer = window.setTimeout(() => {
    noticeVisible.value = false;
    noticeItem.value = null;
    noticeClosing.value = false;
  }, 280);
}

function tickCountdown() {
  if (!noticeVisible.value || noticeClosing.value) return;
  const now = nowMs();
  if (!paused.value) {
    remainingMs.value = Math.max(0, remainingMs.value - (now - lastTick));
  }
  lastTick = now;
  if (remainingMs.value <= 0) {
    dismissNotice();
  }
}

watch(paused, () => {
  lastTick = nowMs();
});

async function loadReminder() {
  const gen = ++reminderGeneration;
  const authGen = accountGeneration;
  reminderController?.abort();
  reminderController = new AbortController();
  try {
    const res = await props.services.listAnnouncements(
      { page: 1, limit: 1, reminder: true },
      reminderController.signal,
    );
    if (!active || gen !== reminderGeneration || authGen !== accountGeneration) return;
    if (!res.items.length) return;
    const item = res.items[0];
    const sec = Number.isInteger(item.displaySeconds) && item.displaySeconds! >= 1 && item.displaySeconds! <= 3600
      ? item.displaySeconds!
      : 30;
    durationMs.value = sec * 1000;
    remainingMs.value = sec * 1000;
    noticeClosing.value = false;
    noticeShow.value = false;
    noticeItem.value = item;
    noticeVisible.value = true;
    await nextTick();
    if (!active || gen !== reminderGeneration || authGen !== accountGeneration || !noticeVisible.value) return;
    syncToastPause();
    lastTick = nowMs();
    countdownTimer = window.setInterval(tickCountdown, 100);
    noticeEl.value?.getBoundingClientRect();
    noticeFrame = requestAnimationFrame(() => {
      if (active && !noticeClosing.value && noticeVisible.value) {
        noticeShow.value = true;
      }
    });
  } catch (err) {
    if (!active || gen !== reminderGeneration || authGen !== accountGeneration) return;
    if ((err as Error)?.name === 'AbortError') return;
    props.services.toast((err as Error)?.message || t('公告加载失败'), 'error');
  }
}

async function onDismissClick() {
  if (!currentUser.value) {
    props.services.navigate('/login?next=' + encodeURIComponent('/'));
    return;
  }
  if (saving.value || !noticeItem.value || noticeClosing.value) return;
  saving.value = true;
  const authGen = accountGeneration;
  dismissController?.abort();
  dismissController = new AbortController();
  try {
    await props.services.dismissAnnouncement(noticeItem.value.id, dismissController.signal);
    if (!active || authGen !== accountGeneration) return;
    dismissNotice();
  } catch (err) {
    if (!active || authGen !== accountGeneration) return;
    if ((err as Error)?.name === 'AbortError') return;
    props.services.toast((err as Error)?.message || t('保存失败，请重试'), 'error');
  } finally {
    if (active && authGen === accountGeneration) {
      saving.value = false;
    }
  }
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (noticeEl.value && next && noticeEl.value.contains(next)) return;
  focusedWithin.value = false;
}

async function loadBoardPage(page: number) {
  const job = ++modalJob;
  modalController?.abort();
  modalController = new AbortController();
  boardLoading.value = true;
  boardError.value = '';
  try {
    const res = await props.services.listAnnouncements({ page, limit: 8 }, modalController.signal);
    if (!active || !boardOpen.value || job !== modalJob) return;
    boardItems.value = res.items;
    boardPage.value = page;
    boardPages.value = Math.max(1, res.pages || 1);
    boardLoaded.value = true;
    await nextTick();
    const modalBody = boardListEl.value?.closest('.modal-body');
    if (modalBody) modalBody.scrollTop = 0;
  } catch (err) {
    if (!active || !boardOpen.value || job !== modalJob) return;
    if ((err as Error)?.name === 'AbortError') return;
    if (!boardLoaded.value) {
      boardError.value = t('公告加载失败，请关闭后重试。');
    }
    props.services.toast((err as Error)?.message || t('公告加载失败'), 'error');
  } finally {
    if (active && boardOpen.value && job === modalJob) {
      boardLoading.value = false;
    }
  }
}

function openBoard() {
  modalJob++;
  modalController?.abort();
  modalController = null;
  boardItems.value = [];
  boardPage.value = 1;
  boardPages.value = 1;
  boardLoaded.value = false;
  boardLoading.value = false;
  boardError.value = '';
  boardOpen.value = true;
  void loadBoardPage(1);
}

function closeBoard() {
  boardOpen.value = false;
  modalJob++;
  modalController?.abort();
  modalController = null;
  boardLoading.value = false;
}

function openBoardFromNotice() {
  dismissNotice();
  openBoard();
}

function onVisibilityChange() {
  docHidden.value = document.hidden;
  lastTick = nowMs();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !noticeVisible.value || noticeClosing.value || boardOpen.value) return;
  if (document.querySelector('.modal-overlay')) return;
  dismissNotice();
}

const offAuth = props.services.onAuth(user => {
  currentUser.value = user;
  accountGeneration++;
  dismissController?.abort();
  dismissController = null;
  reminderController?.abort();
  reminderController = null;
  resetNoticeImmediate();
  void loadReminder();
});

onMounted(() => {
  const toastRoot = document.getElementById('toast-root');
  if (toastRoot && typeof MutationObserver === 'function') {
    toastObserver = new MutationObserver(syncToastPause);
    toastObserver.observe(toastRoot, { childList: true });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onDocumentKeydown);
  void loadReminder();
});

onBeforeUnmount(() => {
  active = false;
  accountGeneration++;
  reminderGeneration++;
  modalJob++;
  offAuth();
  reminderController?.abort();
  dismissController?.abort();
  modalController?.abort();
  toastObserver?.disconnect();
  toastObserver = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('keydown', onDocumentKeydown);
  clearNoticeTimers();
  boardOpen.value = false;
  noticeVisible.value = false;
  noticeItem.value = null;
});
</script>

<template>
  <div class="container g-announcement-entry">
    <button ref="entryButton" class="btn btn-ghost btn-sm" type="button" @click="openBoard">
      <IconVue3 name="info" :size="16" />{{ t('公告板 · 查看全部') }}
    </button>
  </div>

  <Teleport to="body">
    <aside
      v-if="noticeVisible && noticeItem"
      ref="noticeEl"
      data-vue3="announcement-notice"
      class="g-announcement-notice qsl-notification toast-info"
      :class="{ 'is-show': noticeShow, 'is-hide': noticeClosing, 'is-paused': toastPaused }"
      :inert="toastPaused || noticeClosing || undefined"
      aria-labelledby="home-announcement-title"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focusin="focusedWithin = true"
      @focusout="onFocusOut"
    >
      <div class="g-announcement-head">
        <span class="g-announcement-label">
          <span class="toast-icon"><IconVue3 name="info" :size="18" /></span>{{ t('最新公告') }}
        </span>
        <button
          class="toast-close"
          type="button"
          :aria-label="t('关闭公告')"
          :disabled="noticeClosing"
          @click="dismissNotice"
        >
          <IconVue3 name="close" :size="14" />
        </button>
      </div>
      <h2 id="home-announcement-title">{{ noticeItem.title }}</h2>
      <time class="muted">{{ services.formatDateTime(noticeItem.publishedAt) }}</time>
      <p class="g-announcement-body">{{ noticeItem.body }}</p>
      <div class="g-announcement-actions">
        <button type="button" class="btn btn-soft btn-sm" :disabled="noticeClosing" @click="openBoardFromNotice">
          {{ t('查看全部公告') }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving || noticeClosing" @click="onDismissClick">
          {{ currentUser ? t('不再提醒') : t('登录后不再提醒') }}
        </button>
      </div>
      <div class="g-announcement-countdown">
        <span>{{ remainingSeconds }} {{ t('秒后关闭') }}{{ paused ? ' ' + t('· 已暂停') : '' }}</span>
        <div
          class="g-announcement-progress"
          role="progressbar"
          :aria-label="t('公告剩余停留时间')"
          aria-valuemin="0"
          :aria-valuemax="durationMs / 1000"
          :aria-valuenow="remainingSeconds"
        >
          <span :style="{ transform: 'scaleX(' + progressScale + ')' }"></span>
        </div>
      </div>
    </aside>
  </Teleport>

  <DialogVue3 v-if="boardOpen" :title="t('公告板')" size="lg" :t="t" @close="closeBoard">
    <p v-if="boardLoading && !boardLoaded" class="muted">{{ t('正在加载公告…') }}</p>
    <p v-else-if="boardError && !boardLoaded">{{ boardError }}</p>
    <template v-else-if="boardLoaded">
      <div ref="boardListEl" class="g-announcement-list" :aria-busy="boardLoading ? 'true' : undefined">
        <template v-if="boardItems.length">
          <article v-for="item in boardItems" :key="item.id">
            <h3>{{ item.title }}</h3>
            <time class="muted">{{ services.formatDateTime(item.publishedAt) }}</time>
            <p class="g-announcement-body">{{ item.body }}</p>
          </article>
        </template>
        <p v-else class="muted">{{ t('暂无已发布公告') }}</p>
      </div>
      <div class="g-announcement-pager">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="boardLoading || boardPage <= 1"
          @click="loadBoardPage(boardPage - 1)"
        >
          {{ t('上一页') }}
        </button>
        <span>{{ boardPage }} / {{ Math.max(1, boardPages) }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="boardLoading || boardPage >= boardPages"
          @click="loadBoardPage(boardPage + 1)"
        >
          {{ t('下一页') }}
        </button>
      </div>
    </template>
  </DialogVue3>
</template>
