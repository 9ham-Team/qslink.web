<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AvatarVue3 from '../components/Avatar.vue';
import CardTileVue3 from '../components/CardTile.vue';
import ExchangeApproveDialogVue3 from '../components/ExchangeApproveDialog.vue';
import ExchangeContactLogsVue3 from '../components/ExchangeContactLogs.vue';
import ExchangeRejectDialogVue3 from '../components/ExchangeRejectDialog.vue';
import IconVue3, { type IconNameVue3 } from '../components/Icon.vue';
import { useCountUpVue3 } from '../composables/use-count-up';
import { useScrollRevealVue3 } from '../composables/use-scroll-reveal';
import type {
  AccountServicesVue3,
  CardVue3,
  ExchangeItemVue3,
  OverviewStatsVue3,
  PublicUserVue3,
  SelfUserVue3,
} from '../contracts';

const props = defineProps<{ services: AccountServicesVue3 }>();
const rootRef = ref<HTMLElement>();
const { scan } = useScrollRevealVue3(rootRef);

let disposed = false;
let authEpoch = 0;
let applyingSelfUser = false;
let overviewGen = 0;
let overviewAbort: AbortController | null = null;

const initialUser = props.services.user() as SelfUserVue3 | null;
const initialUserId = initialUser?.id || null;
const initialToken = props.services.token();

const currentUser = ref<SelfUserVue3 | null>(initialUser);
const canJudgeContest = ref(false);
const stats = ref<OverviewStatsVue3 | null>(null);
const pendingItems = ref<ExchangeItemVue3[]>([]);
const recentCards = ref<CardVue3[]>([]);
const loading = ref(true);
const loadError = ref('');
const busyRowId = ref<string | null>(null);
const busyRowAction = ref<'approve' | 'reject' | null>(null);
const activeApproveExchange = ref<ExchangeItemVue3 | null>(null);
const activeRejectExchange = ref<ExchangeItemVue3 | null>(null);

// Count-up refs for the 4 stat cards
const cardsTarget = computed(() => (stats.value ? Number(stats.value.cards) || 0 : null));
const likesTarget = computed(() => (stats.value ? Number(stats.value.likesReceived) || 0 : null));
const incomingTarget = computed(() => (stats.value ? Number(stats.value.incomingPending) || 0 : null));
const completedTarget = computed(() => (stats.value ? Number(stats.value.completedExchanges) || 0 : null));

const formatNum = (value: number) => props.services.formatNumber(value);
const cardsCount = useCountUpVue3(cardsTarget, { format: formatNum });
const likesCount = useCountUpVue3(likesTarget, { format: formatNum });
const incomingCount = useCountUpVue3(incomingTarget, { format: formatNum });
const completedCount = useCountUpVue3(completedTarget, { format: formatNum });

const greetingInfo = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return {
      text: props.services.t('早上好'),
      icon: 'sun' as IconNameVue3,
      hint: props.services.t('新的一天，从一张 QSL 卡片开始。'),
    };
  }
  if (hour < 18) {
    return {
      text: props.services.t('下午好'),
      icon: 'sun' as IconNameVue3,
      hint: props.services.t('电波正暖，来看看有没有新的换卡申请。'),
    };
  }
  return {
    text: props.services.t('晚上好'),
    icon: 'moon' as IconNameVue3,
    hint: props.services.t('夜深了，适合整理今天的通联收藏。'),
  };
});

const todayLabel = computed(() => {
  try {
    return new Intl.DateTimeFormat(props.services.language(), {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date());
  } catch {
    return props.services.formatDate(new Date().toISOString());
  }
});

const displayName = computed(() => {
  const u = currentUser.value;
  if (!u) return props.services.t('火腿');
  return u.displayName || u.username || props.services.t('火腿');
});

const avatarUser = computed<PublicUserVue3>(() => ({
  uid: currentUser.value?.uid || '',
  username: currentUser.value?.username,
  displayName: currentUser.value?.displayName,
  callSign: currentUser.value?.callSign,
  avatarColor: currentUser.value?.avatarColor,
  joinedAt: currentUser.value?.joinedAt || '',
  stats: { cards: 0, likesReceived: 0 },
}));

const quickLinks = computed(() => {
  const links: Array<{ href: string; icon: IconNameVue3; title: string; desc: string; admin?: boolean }> = [
    { href: '/dashboard/cards/new', icon: 'upload', title: props.services.t('上传新卡片'), desc: props.services.t('正反两面，提交审核') },
    { href: '/dashboard/cards', icon: 'cards', title: props.services.t('我的卡片'), desc: props.services.t('管理、编辑与分享') },
    { href: '/dashboard/exchanges', icon: 'inbox', title: props.services.t('换卡申请'), desc: props.services.t('处理收到的申请') },
    { href: '/dashboard/profile', icon: 'settings', title: props.services.t('个人资料'), desc: props.services.t('地址、密码与头像') },
  ];
  const u = currentUser.value;
  if (u && u.role === 'user' && canJudgeContest.value === true) {
    links.push({
      href: '/events/qsl-design-2026-11/judging',
      icon: 'star',
      title: props.services.t('评委工作台'),
      desc: props.services.t('指定评委专用，权限由服务器核验'),
    });
  }
  if (u && u.role === 'admin') {
    links.push({
      href: '/admin',
      icon: 'shield',
      title: props.services.t('管理后台'),
      desc: props.services.t('审核卡片与用户'),
      admin: true,
    });
  }
  return links;
});

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(epoch: number): boolean {
  if (disposed || epoch !== authEpoch) return false;
  const u = props.services.user() as SelfUserVue3 | null;
  return !!u && u.id === initialUserId && props.services.token() === initialToken;
}

function closeAllDialogs() {
  activeApproveExchange.value = null;
  activeRejectExchange.value = null;
  busyRowId.value = null;
  busyRowAction.value = null;
}

function clearPrivateState() {
  overviewGen++;
  overviewAbort?.abort();
  overviewAbort = null;
  closeAllDialogs();
  currentUser.value = null;
  canJudgeContest.value = false;
  stats.value = null;
  pendingItems.value = [];
  recentCards.value = [];
  loading.value = false;
  loadError.value = '';
}

async function loadOverview() {
  if (!isSessionValid(authEpoch)) return;
  const gen = ++overviewGen;
  const epoch = authEpoch;
  overviewAbort?.abort();
  const controller = new AbortController();
  overviewAbort = controller;
  loading.value = true;
  loadError.value = '';

  try {
    const data = await props.services.getOverview(controller.signal);
    if (gen !== overviewGen || !isSessionValid(epoch)) return;
    if (data && data.user) {
      currentUser.value = data.user;
      applyingSelfUser = true;
      try {
        props.services.setUser(data.user);
      } finally {
        applyingSelfUser = false;
      }
    }
    canJudgeContest.value = data?.canJudgeContest === true && data?.user?.role === 'user';
    stats.value = data?.stats || {
      cards: 0,
      approvedCards: 0,
      pendingCards: 0,
      likesReceived: 0,
      incomingPending: 0,
      outgoingPending: 0,
      completedExchanges: 0,
    };
    // 后端 recentIncoming 可能包含非 pending 的历史记录，这里只展示真正待处理的申请
    pendingItems.value = (Array.isArray(data?.recentIncoming) ? data.recentIncoming : [])
      .filter(item => item && item.status === 'pending')
      .slice(0, 3);
    recentCards.value = Array.isArray(data?.recentCards) ? data.recentCards.slice(0, 3) : [];
    loading.value = false;
    await nextTick();
    scan();
  } catch (err) {
    if (isAbortError(err) || gen !== overviewGen || !isSessionValid(epoch)) return;
    loading.value = false;
    stats.value = null;
    pendingItems.value = [];
    recentCards.value = [];
    canJudgeContest.value = false;
    const message = err instanceof Error && err.message ? err.message : props.services.t('加载失败');
    loadError.value = message;
    props.services.toast(message, 'error');
  } finally {
    if (overviewAbort === controller) overviewAbort = null;
  }
}

function openApproveDialog(ex: ExchangeItemVue3) {
  if (activeApproveExchange.value || activeRejectExchange.value || busyRowId.value) return;
  busyRowId.value = ex.id;
  busyRowAction.value = 'approve';
  activeApproveExchange.value = ex;
}

function closeApproveDialog() {
  activeApproveExchange.value = null;
  busyRowId.value = null;
  busyRowAction.value = null;
}

function onApproved() {
  closeApproveDialog();
  void loadOverview();
}

function openRejectDialog(ex: ExchangeItemVue3) {
  if (activeApproveExchange.value || activeRejectExchange.value || busyRowId.value) return;
  busyRowId.value = ex.id;
  busyRowAction.value = 'reject';
  activeRejectExchange.value = ex;
}

function closeRejectDialog() {
  activeRejectExchange.value = null;
  busyRowId.value = null;
  busyRowAction.value = null;
}

function onRejected() {
  closeRejectDialog();
  void loadOverview();
}

function onCardLiked(id: string, result: { liked: boolean; likeCount: number }) {
  recentCards.value = recentCards.value.map(card =>
    card.id === id ? { ...card, liked: result.liked, likeCount: result.likeCount } : card,
  );
}

const offAuth = props.services.onAuth(nextUser => {
  if (applyingSelfUser) return;
  const tokenNow = props.services.token();
  if (nextUser && initialUserId && nextUser.id === initialUserId && tokenNow === initialToken) {
    currentUser.value = nextUser as SelfUserVue3;
    return;
  }
  authEpoch++;
  clearPrivateState();
  if (!nextUser) {
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard'), { replace: true });
  } else {
    props.services.navigate('/dashboard', { replace: true });
  }
});

onMounted(() => {
  if (!initialUser) {
    clearPrivateState();
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard'), { replace: true });
    return;
  }
  scan();
  void loadOverview();
});

watch(loading, async () => {
  await nextTick();
  scan();
});

onBeforeUnmount(() => {
  disposed = true;
  authEpoch++;
  offAuth();
  clearPrivateState();
});
</script>

<template>
  <div v-if="currentUser" ref="rootRef" class="f-dash container">
    <section class="f-dash-hero" data-vue-reveal>
      <div class="f-dash-hero-deco" aria-hidden="true">
        <span class="f-hero-orb f-hero-orb-a"></span>
        <span class="f-hero-orb f-hero-orb-b"></span>
        <svg class="f-hero-wave" viewBox="0 0 420 180" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-linecap="round">
            <path d="M2 150 Q 70 96 140 150 T 280 150 T 418 150" stroke-width="1.4" opacity=".5" />
            <path d="M2 168 Q 70 114 140 168 T 280 168 T 418 168" stroke-width="1.1" opacity=".32" />
            <circle cx="352" cy="44" r="26" stroke-width="1.2" opacity=".5" />
            <circle cx="352" cy="44" r="44" stroke-width="1" opacity=".3" stroke-dasharray="2 8" />
            <circle cx="352" cy="44" r="4" fill="currentColor" stroke="none" opacity=".7" />
          </g>
        </svg>
      </div>
      <div class="f-dash-hero-main">
        <span class="f-dash-eyebrow">
          <IconVue3 :name="greetingInfo.icon" :size="14" /> DASHBOARD · {{ todayLabel }}
        </span>
        <h1 class="f-dash-title">
          {{ greetingInfo.text }}，<span class="f-dash-name">{{ displayName }}</span>
          <span v-if="currentUser.callSign" class="f-dash-call mono">{{ currentUser.callSign }}</span>
        </h1>
        <p class="f-dash-sub">{{ greetingInfo.hint }}</p>
        <div class="f-dash-hero-actions">
          <a class="btn btn-primary" href="/dashboard/cards/new" data-link>
            <IconVue3 name="upload" :size="17" />{{ services.t('上传新卡片') }}
          </a>
          <a class="btn btn-ghost" href="/explore" data-link>
            <IconVue3 name="compass" :size="17" />{{ services.t('逛逛卡片广场') }}
          </a>
          <a v-if="currentUser.uid" class="btn btn-ghost" :href="'/space/' + currentUser.uid" data-link>
            <IconVue3 name="user" :size="17" />{{ services.t('我的公开主页') }}
          </a>
        </div>
      </div>
      <div class="f-dash-hero-user">
        <span class="f-dash-avatar"><AvatarVue3 :user="avatarUser" :size="64" /></span>
        <span class="f-dash-user-info">
          <b>{{ displayName }}</b>
          <span class="mono">{{ currentUser.callSign || services.t('未填写呼号') }}</span>
          <small v-if="currentUser.joinedAt">
            <IconVue3 name="calendar" :size="12" /> {{ services.formatDate(currentUser.joinedAt) }} {{ services.t('加入') }}
          </small>
        </span>
        <a
          class="f-dash-user-edit"
          href="/dashboard/profile"
          data-link
          :title="services.t('编辑个人资料')"
          :aria-label="services.t('编辑个人资料')"
        >
          <IconVue3 name="edit" :size="15" />
        </a>
      </div>
    </section>

    <section v-if="loading || stats" id="fDashStats" class="f-stats" :aria-label="services.t('数据概览')">
      <template v-if="loading && !stats">
        <div v-for="idx in 4" :key="idx" class="f-stat is-skeleton" aria-hidden="true">
          <span class="skeleton f-skeleton-icon"></span>
          <span class="f-stat-info">
            <span class="skeleton skeleton-line" style="width: 56%"></span>
            <span class="skeleton skeleton-line" style="width: 80%"></span>
          </span>
        </div>
      </template>
      <template v-else-if="stats">
        <a class="f-stat f-stat-mint" href="/dashboard/cards" data-link>
          <span class="f-stat-icon"><IconVue3 name="cards" :size="20" /></span>
          <span class="f-stat-info">
            <span class="f-stat-top">
              <b class="f-stat-num" :class="{ 'is-done': cardsCount.done.value }">{{ cardsCount.text.value }}</b>
              <span v-if="stats.pendingCards > 0" class="f-stat-badge is-amber">
                {{ stats.pendingCards }} {{ services.t('审核中') }}
              </span>
            </span>
            <span class="f-stat-label">{{ services.t('我的卡片') }}</span>
            <span class="f-stat-sub">
              {{ stats.approvedCards }} {{ services.t('张已通过') }}{{ stats.pendingCards ? ' · ' + stats.pendingCards + ' ' + services.t('张审核中') : '' }}
            </span>
          </span>
          <span class="f-stat-arrow"><IconVue3 name="arrow-right" :size="16" /></span>
        </a>

        <a class="f-stat f-stat-rose" href="/dashboard/cards" data-link>
          <span class="f-stat-icon"><IconVue3 name="heart" :size="20" /></span>
          <span class="f-stat-info">
            <span class="f-stat-top">
              <b class="f-stat-num" :class="{ 'is-done': likesCount.done.value }">{{ likesCount.text.value }}</b>
            </span>
            <span class="f-stat-label">{{ services.t('获得点赞') }}</span>
            <span class="f-stat-sub">{{ services.t('来自同好的收藏与喜欢') }}</span>
          </span>
          <span class="f-stat-arrow"><IconVue3 name="arrow-right" :size="16" /></span>
        </a>

        <a class="f-stat f-stat-amber" href="/dashboard/exchanges?box=incoming" data-link>
          <span class="f-stat-icon"><IconVue3 name="inbox" :size="20" /></span>
          <span class="f-stat-info">
            <span class="f-stat-top">
              <b class="f-stat-num" :class="{ 'is-done': incomingCount.done.value }">{{ incomingCount.text.value }}</b>
              <span v-if="stats.incomingPending > 0" class="f-stat-badge is-rose">{{ services.t('新') }}</span>
            </span>
            <span class="f-stat-label">{{ services.t('待处理申请') }}</span>
            <span class="f-stat-sub">
              {{ stats.incomingPending > 0 ? services.t('收到') + ' ' + stats.incomingPending + ' ' + services.t('条，尽快处理吧') : services.t('全部处理完毕') }}
            </span>
          </span>
          <span class="f-stat-arrow"><IconVue3 name="arrow-right" :size="16" /></span>
        </a>

        <a class="f-stat f-stat-sky" href="/dashboard/exchanges?box=outgoing" data-link>
          <span class="f-stat-icon"><IconVue3 name="send" :size="20" /></span>
          <span class="f-stat-info">
            <span class="f-stat-top">
              <b class="f-stat-num" :class="{ 'is-done': completedCount.done.value }">{{ completedCount.text.value }}</b>
            </span>
            <span class="f-stat-label">{{ services.t('已完成换卡') }}</span>
            <span class="f-stat-sub">
              {{ stats.outgoingPending > 0 ? services.t('有') + ' ' + stats.outgoingPending + ' ' + services.t('条申请等待对方回应') : services.t('每一次交换都值得纪念') }}
            </span>
          </span>
          <span class="f-stat-arrow"><IconVue3 name="arrow-right" :size="16" /></span>
        </a>
      </template>
    </section>

    <div class="f-dash-cols">
      <section class="f-panel f-dash-pending" data-vue-reveal data-vue-reveal-delay="60">
        <header class="f-panel-head">
          <div>
            <h2 class="f-panel-title">{{ services.t('待我处理的申请') }}</h2>
            <p class="f-panel-desc">{{ services.t('同意后双方地址将互相可见') }}</p>
          </div>
          <a class="f-panel-link" href="/dashboard/exchanges?box=incoming" data-link>
            {{ services.t('查看全部') }}<IconVue3 name="arrow-right" :size="15" />
          </a>
        </header>
        <div id="fDashPending" class="f-panel-body" aria-live="polite">
          <div v-if="loading && !stats" class="f-skeleton-rows">
            <div v-for="idx in 2" :key="idx" class="f-skeleton-row">
              <span class="skeleton f-skeleton-thumb"></span>
              <span class="f-skeleton-lines">
                <span class="skeleton skeleton-line" style="width: 55%"></span>
                <span class="skeleton skeleton-line" style="width: 82%"></span>
              </span>
            </div>
          </div>

          <div v-else-if="loadError" class="f-empty-inline is-error">
            <span class="f-empty-ico"><IconVue3 name="alert" :size="24" /></span>
            <div>
              <b>{{ services.t('数据加载失败') }}</b>
              <p>{{ loadError }}</p>
            </div>
            <button class="btn btn-sm btn-ghost" type="button" data-retry @click="loadOverview">
              {{ services.t('重试') }}
            </button>
          </div>

          <div v-else-if="!pendingItems.length" class="f-empty-inline f-empty-inline-success">
            <span class="f-empty-ico"><IconVue3 name="check-circle" :size="26" /></span>
            <div>
              <b>{{ services.t('暂时没有待处理的申请') }}</b>
              <p>{{ services.t('新的换卡申请会第一时间出现在这里。') }}</p>
            </div>
            <a class="btn btn-sm btn-ghost" href="/explore" data-link>
              {{ services.t('浏览卡片广场') }}<IconVue3 name="arrow-right" :size="15" />
            </a>
          </div>

          <template v-else>
            <article
              v-for="ex in pendingItems"
              :key="ex.id"
              class="f-req"
              :class="{ 'is-busy': busyRowId === ex.id }"
              :data-exchange-id="ex.id"
            >
              <a
                class="f-req-thumb"
                :href="'/card/' + (ex.card?.id || '')"
                data-link
                :aria-label="services.t('查看卡片') + ' ' + (ex.card?.title || '')"
              >
                <span :style="{ aspectRatio: (ex.card?.ratio?.w || 3) + ' / ' + (ex.card?.ratio?.h || 2) }">
                  <img :src="ex.card?.frontImage || services.placeholder" alt="" loading="lazy">
                </span>
              </a>
              <div class="f-req-main">
                <div class="f-req-head">
                  <span class="f-req-avatar">
                    <AvatarVue3
                      :user="ex.fromUser || { uid: '', joinedAt: '', stats: { cards: 0, likesReceived: 0 } }"
                      :size="38"
                    />
                  </span>
                  <span class="f-req-who">
                    <span class="f-req-name">
                      {{ ex.fromUser?.displayName || ex.fromUser?.username || services.t('未知用户') }}
                      <b class="f-req-call mono">{{ ex.fromUser?.callSign || '' }}</b>
                    </span>
                    <span class="f-req-desc">
                      {{ services.t('想交换你的卡片「') }}{{ ex.card?.title || services.t('未命名卡片') }}」
                    </span>
                  </span>
                  <time class="f-req-time" :datetime="ex.createdAt || ''">{{ services.timeAgo(ex.createdAt) }}</time>
                </div>

                <p v-if="ex.message" class="f-req-msg">
                  <IconVue3 name="send" :size="14" /><span>{{ ex.message }}</span>
                </p>

                <ExchangeContactLogsVue3
                  :logs="ex.selectedContactLogs"
                  :direction="ex.direction"
                  :t="services.t"
                />

                <div class="f-req-foot">
                  <span class="f-req-tags">
                    <span class="f-req-note"><IconVue3 name="clock" :size="13" /> {{ services.t('待处理') }}</span>
                  </span>
                  <span class="f-req-actions">
                    <button
                      class="btn btn-sm btn-primary"
                      type="button"
                      data-act="approve"
                      :disabled="busyRowId === ex.id"
                      @click="openApproveDialog(ex)"
                    >
                      <IconVue3 name="check" :size="15" />
                      {{ busyRowId === ex.id && busyRowAction === 'approve' ? services.t('处理中') : services.t('同意') }}
                    </button>
                    <button
                      class="btn btn-sm btn-ghost"
                      type="button"
                      data-act="reject"
                      :disabled="busyRowId === ex.id"
                      @click="openRejectDialog(ex)"
                    >
                      <IconVue3 name="x" :size="15" />
                      {{ busyRowId === ex.id && busyRowAction === 'reject' ? services.t('处理中') : services.t('拒绝') }}
                    </button>
                  </span>
                </div>
              </div>
            </article>
          </template>
        </div>
      </section>

      <section class="f-panel f-dash-quick-panel" data-vue-reveal data-vue-reveal-delay="120">
        <header class="f-panel-head">
          <div>
            <h2 class="f-panel-title">{{ services.t('快捷入口') }}</h2>
            <p class="f-panel-desc">{{ services.t('常用操作一步直达') }}</p>
          </div>
        </header>
        <div class="f-quick-grid">
          <a
            v-for="item in quickLinks"
            :key="item.href"
            class="f-quick"
            :class="{ 'f-quick-admin': item.admin }"
            :href="item.href"
            data-link
          >
            <span class="f-quick-icon"><IconVue3 :name="item.icon" :size="20" /></span>
            <span class="f-quick-text">
              <b>{{ item.title }}</b>
              <small>{{ item.desc }}</small>
            </span>
            <span class="f-quick-arrow"><IconVue3 name="arrow-right" :size="15" /></span>
          </a>
        </div>
      </section>
    </div>

    <section class="f-panel f-dash-recent" data-vue-reveal data-vue-reveal-delay="160">
      <header class="f-panel-head">
        <div>
          <h2 class="f-panel-title">{{ services.t('最近卡片') }}</h2>
          <p class="f-panel-desc">{{ services.t('你最近上传或更新的 QSL 卡片') }}</p>
        </div>
        <a class="f-panel-link" href="/dashboard/cards" data-link>
          {{ services.t('管理卡片') }}<IconVue3 name="arrow-right" :size="15" />
        </a>
      </header>
      <div id="fDashRecent" class="f-panel-body">
        <div v-if="loading && !stats" class="f-skeleton-cards">
          <div v-for="idx in 3" :key="idx" class="f-skeleton-card">
            <span class="skeleton f-skeleton-media"></span>
            <span class="skeleton skeleton-line" style="width: 66%"></span>
            <span class="skeleton skeleton-line" style="width: 44%"></span>
          </div>
        </div>
        <template v-else-if="!loadError">
          <div v-if="recentCards.length" class="f-grid-cards">
            <CardTileVue3
              v-for="card in recentCards"
              :key="card.id"
              :card="card"
              :services="services"
              :show-status="true"
              class="f-recent-tile"
              @liked="onCardLiked"
            />
          </div>
          <div v-else class="f-empty f-empty-panel">
            <div class="f-empty-visual"><IconVue3 name="cards" :size="36" /></div>
            <h3>{{ services.t('还没有 QSL 卡片') }}</h3>
            <p>{{ services.t('上传你的第一张双面卡片，等待审核通过后就能在广场被同好发现。') }}</p>
            <button class="btn btn-primary" type="button" @click="services.navigate('/dashboard/cards/new')">
              {{ services.t('上传第一张卡片') }}
            </button>
          </div>
        </template>
      </div>
    </section>

    <ExchangeApproveDialogVue3
      :open="!!activeApproveExchange"
      :exchange="activeApproveExchange"
      :services="services"
      @close="closeApproveDialog"
      @approved="onApproved"
    />

    <ExchangeRejectDialogVue3
      :open="!!activeRejectExchange"
      :exchange="activeRejectExchange"
      :services="services"
      @close="closeRejectDialog"
      @rejected="onRejected"
    />
  </div>
</template>
