<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import AvatarVue3 from '../components/Avatar.vue';
import Card3DViewerVue3 from '../components/Card3DViewer.vue';
import CardShareButtonVue3 from '../components/CardShareButton.vue';
import CardTileVue3 from '../components/CardTile.vue';
import IconVue3 from '../components/Icon.vue';
import { useExchangeRequestVue3 } from '../composables/use-exchange-request';
import { useScrollRevealVue3 } from '../composables/use-scroll-reveal';
import type { CardDetailServicesVue3, CardDetailVue3, CardVue3, PublicUserVue3 } from '../contracts';

const props = defineProps<{
  cardId: string;
  services: CardDetailServicesVue3;
}>();

const t = props.services.t;
const rootEl = ref<HTMLElement>();
const likeBtn = ref<HTMLButtonElement>();
const reveal = useScrollRevealVue3(rootEl);
const exchange = useExchangeRequestVue3(props.services);

const currentUser = shallowRef(props.services.user());
const loading = ref(true);
const missing = ref<'not-found' | 'error' | null>(null);
const card = ref<CardDetailVue3 | null>(null);
const owner = ref<PublicUserVue3 | null>(null);
const recoCards = ref<CardVue3[]>([]);
const likeBusy = ref(false);
const likeHeartbeat = ref(false);

let active = true;
let loadGen = 0;
let likeGen = 0;
let heartbeatTimer = 0;
let detailAbort: AbortController | undefined;
let recoAbort: AbortController | undefined;

const viewerOptions = {
  width: 430,
  autoRotateSpeed: 4.6,
  idleDelay: 3200,
  initialYaw: -16,
  initialPitch: 4,
  interactive: true,
  showControls: true,
  initialSide: 'front',
  ambient: true,
};

const ownerData = computed<PublicUserVue3>(() => owner.value || card.value?.owner || ({} as PublicUserVue3));
const isOwner = computed(() => {
  const c = card.value;
  const u = currentUser.value;
  if (!c) return false;
  return !!(
    c.isOwner ||
    (u?.id && ((c.owner?.id && u.id === c.owner.id) || (owner.value?.id && u.id === owner.value.id)))
  );
});
const userKey = computed(() => currentUser.value?.id || currentUser.value?.uid || 'guest');
const status = computed(() => card.value?.status || 'approved');
const statusTone = computed(() => {
  if (status.value === 'approved') return 'mint';
  if (status.value === 'pending') return 'amber';
  if (status.value === 'rejected') return 'rose';
  return 'slate';
});
const canApply = computed(() => card.value?.canApply !== false);
const myExchange = computed(() => card.value?.myExchange || null);
const callSignBadge = computed(() => card.value?.callSign || ownerData.value?.callSign || '');

function resetHeartbeat() {
  window.clearTimeout(heartbeatTimer);
  heartbeatTimer = 0;
  likeHeartbeat.value = false;
}

function toNextLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  props.services.navigate('/login?next=' + next);
}

async function loadReco(currentId: string, gen: number) {
  recoAbort?.abort();
  const ctrl = new AbortController();
  recoAbort = ctrl;
  try {
    const res = await props.services.getPopularCards(ctrl.signal);
    if (!active || gen !== loadGen || ctrl.signal.aborted) return;
    const merged: CardVue3[] = [];
    const seen = new Set([currentId]);
    for (const item of res?.items || []) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
      if (merged.length >= 4) break;
    }
    recoCards.value = merged;
    if (merged.length) {
      await nextTick();
      if (active && gen === loadGen) reveal.scan();
    }
  } catch {
    // Recommendation failure should never block main card detail.
  }
}

function setPageTitle(title: string) {
  try {
    document.title = title;
  } catch { /* Ignore title write errors. */ }
}

async function load() {
  if (!active) return;
  detailAbort?.abort();
  recoAbort?.abort();
  exchange.cancel();

  const gen = ++loadGen;
  const ctrl = new AbortController();
  detailAbort = ctrl;

  loading.value = true;
  missing.value = null;
  card.value = null;
  owner.value = null;
  recoCards.value = [];
  setPageTitle(t('卡片详情') + ' · QSLink');

  if (!props.cardId) {
    missing.value = 'not-found';
    loading.value = false;
    setPageTitle(t('页面不存在 · QSLink'));
    return;
  }

  try {
    const res = await props.services.getCardDetail(props.cardId, ctrl.signal);
    if (!active || gen !== loadGen || ctrl.signal.aborted) return;
    if (!res?.card) {
      missing.value = 'not-found';
      loading.value = false;
      setPageTitle(t('页面不存在 · QSLink'));
      return;
    }
    card.value = res.card;
    owner.value = res.owner || res.card.owner || null;
    missing.value = null;
    loading.value = false;
    setPageTitle((res.card.title || t('卡片详情')) + ' · QSLink');
    void loadReco(res.card.id, gen);
    await nextTick();
    if (active && gen === loadGen) reveal.scan();
  } catch (err) {
    if (!active || gen !== loadGen || ctrl.signal.aborted) return;
    card.value = null;
    owner.value = null;
    recoCards.value = [];
    loading.value = false;
    const statusCode = err && typeof err === 'object' ? (err as { status?: number; code?: string }).status : undefined;
    const errCode = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
    const isNotFound = statusCode === 404 || errCode === 'NOT_FOUND';
    missing.value = isNotFound ? 'not-found' : 'error';
    setPageTitle(isNotFound ? t('页面不存在 · QSLink') : t('加载失败') + ' · QSLink');
    if (!isNotFound) {
      props.services.toast(err instanceof Error ? err.message : t('卡片加载失败，请稍后重试'), 'error');
    }
  }
}

async function onLike(event: MouseEvent) {
  if (!currentUser.value) {
    props.services.toast(t('登录后即可点赞收藏'), 'info');
    toNextLogin();
    return;
  }
  if (likeBusy.value || !card.value) return;
  likeBusy.value = true;
  resetHeartbeat();
  const reqLikeGen = ++likeGen;
  const reqLoadGen = loadGen;
  const targetId = card.value.id;
  try {
    const res = await props.services.likeCard(targetId);
    if (!active || reqLikeGen !== likeGen || reqLoadGen !== loadGen || card.value?.id !== targetId) return;
    card.value = {
      ...card.value,
      liked: !!res.liked,
      likeCount: Number(res.likeCount) || 0,
    };
    if (res.liked) {
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        likeHeartbeat.value = true;
        heartbeatTimer = window.setTimeout(resetHeartbeat, 760);
        if (likeBtn.value) props.services.heartbeat(likeBtn.value);
        props.services.celebrate(event.clientX, event.clientY);
      }
    }
  } catch (err) {
    if (active && reqLikeGen === likeGen && reqLoadGen === loadGen) {
      props.services.toast(err instanceof Error ? err.message : t('点赞失败'), 'error');
    }
  } finally {
    if (active && reqLikeGen === likeGen && reqLoadGen === loadGen) {
      likeBusy.value = false;
    }
  }
}

function onApply() {
  if (!props.services.user()) {
    props.services.toast(t('登录后即可申请换卡'), 'info');
    toNextLogin();
    return;
  }
  if (card.value) exchange.open(card.value);
}

function onRecoLiked(id: string, result: { liked: boolean; likeCount: number }) {
  recoCards.value = recoCards.value.map(item =>
    item.id === id ? { ...item, liked: result.liked, likeCount: result.likeCount } : item,
  );
}

const offAuth = props.services.onAuth(user => {
  currentUser.value = user;
  likeGen++;
  likeBusy.value = false;
  resetHeartbeat();
  exchange.cancel();
  void load();
});

watch(() => props.cardId, () => {
  likeGen++;
  likeBusy.value = false;
  resetHeartbeat();
  void load();
});

onMounted(() => {
  reveal.scan();
  void load();
});

onBeforeUnmount(() => {
  active = false;
  loadGen++;
  likeGen++;
  detailAbort?.abort();
  recoAbort?.abort();
  offAuth();
  resetHeartbeat();
  exchange.cancel();
});
</script>

<template>
  <div ref="rootEl" class="g-detail" :class="{ 'is-loaded': !loading && !missing && !!card }">
    <div class="container">
      <template v-if="missing">
        <nav class="g-crumbs" :aria-label="t('面包屑')">
          <a href="/" data-link>{{ t('首页') }}</a>
          <span class="g-crumbs__sep">/</span>
          <a href="/explore" data-link>{{ t('卡片广场') }}</a>
          <span class="g-crumbs__sep">/</span>
          <span class="g-crumbs__current">{{ missing === 'not-found' ? t('卡片不存在') : t('加载失败') }}</span>
        </nav>
        <div class="g-detail__missing">
          <div class="g-detail__missing-art">
            <template v-if="missing === 'not-found'">404</template>
            <IconVue3 v-else name="alert" :size="40" />
          </div>
          <h1 class="g-display">{{ missing === 'not-found' ? t('这张卡片不见了') : t('卡片加载失败') }}</h1>
          <p>{{ missing === 'not-found'
            ? t('它可能尚未通过审核、已被删除，或者链接抄错了一个字符。去广场看看其它卡片吧。')
            : t('电波暂时有点杂音，请稍后重试。') }}</p>
          <div class="btn-group">
            <button v-if="missing === 'error'" class="btn btn-primary" type="button" data-retry @click="load">
              {{ t('重新加载') }}
            </button>
            <a class="btn" :class="missing === 'not-found' ? 'btn-primary' : 'btn-ghost'" href="/explore" data-link>
              <IconVue3 name="grid" :size="16" />
              <span>{{ t('去卡片广场') }}</span>
            </a>
            <a class="btn btn-ghost" href="/" data-link>{{ t('返回首页') }}</a>
          </div>
        </div>
      </template>

      <template v-else>
        <nav class="g-crumbs" :aria-label="t('面包屑')" data-vue-reveal>
          <a href="/" data-link>{{ t('首页') }}</a>
          <span class="g-crumbs__sep">/</span>
          <a href="/explore" data-link>{{ t('卡片广场') }}</a>
          <span class="g-crumbs__sep">/</span>
          <span class="g-crumbs__current" data-crumb-current>{{ card?.title || t('卡片详情') }}</span>
        </nav>

        <div class="g-detail__grid">
          <div class="g-detail__viewer g-panel" :class="{ 'is-ready': !loading && !!card }" data-detail-viewer>
            <div v-if="loading || !card" class="g-detail__viewer-skel">
              <div class="g-skeleton g-detail__skel-card"></div>
              <div class="g-skeleton g-skeleton-line" style="width:150px;margin-top:26px"></div>
            </div>
            <template v-else>
              <div class="g-detail__viewer-deco" aria-hidden="true"></div>
              <div class="g-detail__viewer-stage" data-viewer-mount :aria-label="t('3D 卡片查看器')">
                <Card3DViewerVue3
                  :front="card.frontImage || ''"
                  :back="card.backImage || ''"
                  :ratio="card.ratio || { w: 3, h: 2 }"
                  :create="services.createViewer"
                  :options="viewerOptions"
                />
              </div>
              <div class="g-detail__viewer-foot">
                <span class="badge badge-mint">
                  <IconVue3 name="3d" :size="13" />
                  {{ ' ' + t('3D 可交互') }}
                </span>
                <span class="g-detail__ratio">{{ services.ratioLabel(card.ratio) }}</span>
                <span class="g-detail__viewer-note">{{ t('拖拽旋转 · 双击翻面') }}</span>
              </div>
            </template>
          </div>

          <div class="g-detail__info" data-detail-info>
            <div v-if="loading || !card" class="g-detail__info-skel">
              <div class="g-skeleton g-skeleton-line" style="width:120px;height:22px"></div>
              <div class="g-skeleton g-skeleton-line" style="width:76%;height:38px;margin-top:18px"></div>
              <div class="g-skeleton g-skeleton-line" style="width:44%;height:18px;margin-top:16px"></div>
              <div class="g-skeleton g-skeleton-line" style="width:100%;height:82px;margin-top:26px"></div>
              <div class="g-skeleton g-skeleton-line" style="width:100%;height:64px;margin-top:24px"></div>
            </div>

            <template v-else>
              <div class="g-detail__badges">
                <span v-if="callSignBadge" class="badge badge-sky">{{ callSignBadge }}</span>
                <span class="badge badge-slate">{{ services.ratioLabel(card.ratio) }}</span>
                <span v-if="status !== 'approved'" class="badge" :class="'badge-' + statusTone">
                  {{ services.statusText(status) }}
                </span>
              </div>

              <h1 class="g-detail__title">{{ card.title || t('未命名卡片') }}</h1>

              <div class="g-detail__owner">
                <a v-if="ownerData.uid" :href="'/space/' + ownerData.uid" data-link :aria-label="t('查看上传者的公开主页')">
                  <span class="owner-line">
                    <AvatarVue3 :user="ownerData" :size="26" />
                    <span class="owner-name">{{ ownerData.displayName || ownerData.username || t('未知用户') }}</span>
                    <b v-if="ownerData.callSign" class="owner-call">{{ ownerData.callSign }}</b>
                  </span>
                </a>
                <span v-else class="owner-line">
                  <AvatarVue3 :user="ownerData" :size="26" />
                  <span class="owner-name">{{ ownerData.displayName || ownerData.username || t('未知火腿') }}</span>
                  <b v-if="ownerData.callSign" class="owner-call">{{ ownerData.callSign }}</b>
                </span>
                <span class="g-detail__owner-time">{{ services.timeAgo(card.createdAt) + t('发布') }}</span>
              </div>

              <p v-if="card.notes" class="g-detail__notes">{{ card.notes }}</p>
              <p v-else class="g-detail__notes is-empty">{{ t('这张卡片的主人还没有留下简介。') }}</p>

              <dl class="g-detail__meta">
                <div class="g-detail__meta-item">
                  <dt>{{ t('卡片比例') }}</dt>
                  <dd>{{ services.ratioLabel(card.ratio) }}</dd>
                </div>
                <div class="g-detail__meta-item">
                  <dt>{{ t('剩余库存') }}</dt>
                  <dd>{{ card.stock == null ? t('未设置') : card.stock + ' ' + t('张') }}</dd>
                </div>
                <div class="g-detail__meta-item">
                  <dt>{{ t('换卡次数') }}</dt>
                  <dd>{{ String(card.exchangeCount || 0) + ' ' + t('次') }}</dd>
                </div>
                <div class="g-detail__meta-item">
                  <dt>{{ t('发布时间') }}</dt>
                  <dd>{{ services.formatDate(card.createdAt) }}</dd>
                </div>
              </dl>

              <div class="g-detail__actions">
                <template v-if="isOwner">
                  <a class="btn btn-primary btn-lg" :href="'/dashboard/cards/' + encodeURIComponent(card.id) + '/edit'" data-link>
                    <IconVue3 name="edit" :size="17" />
                    <span>{{ t('编辑这张卡片') }}</span>
                  </a>
                  <a class="btn btn-soft" href="/dashboard/cards" data-link>
                    <IconVue3 name="cards" :size="16" />
                    <span>{{ t('我的卡片') }}</span>
                  </a>
                </template>
                <button v-else-if="myExchange && myExchange.status === 'pending'" class="btn btn-soft btn-lg" type="button" disabled>
                  <IconVue3 name="clock" :size="17" />
                  <span>{{ t('申请处理中') }}</span>
                </button>
                <a v-else-if="myExchange && myExchange.status === 'approved'" class="btn btn-primary btn-lg" href="/dashboard/exchanges" data-link>
                  <IconVue3 name="check-circle" :size="17" />
                  <span>{{ t('已达成交换') }}</span>
                </a>
                <button v-else-if="!canApply" class="btn btn-ghost btn-lg" type="button" disabled>
                  <IconVue3 name="send" :size="17" />
                  <span>{{ card.stock === 0 ? t('暂无库存') : t('暂不可申请') }}</span>
                </button>
                <button v-else class="btn btn-primary btn-lg" type="button" data-apply @click="onApply">
                  <IconVue3 name="send" :size="17" />
                  <span>{{ t('申请换卡') }}</span>
                </button>

                <button
                  ref="likeBtn"
                  class="btn btn-ghost g-like-btn"
                  :class="{ 'is-liked': card.liked, 'fx-heartbeat': likeHeartbeat }"
                  type="button"
                  data-like
                  :disabled="likeBusy"
                  :aria-pressed="card.liked ? 'true' : 'false'"
                  :aria-label="t('点赞这张卡片')"
                  @click="onLike"
                  @animationend="resetHeartbeat"
                >
                  <IconVue3 name="heart" :size="17" />
                  <span data-like-count>{{ services.formatNumber(card.likeCount || 0) }}</span>
                </button>

                <CardShareButtonVue3
                  :card="card"
                  :services="services"
                  :is-owner="isOwner"
                  :user-key="userKey"
                />
              </div>

              <p class="g-detail__hint">
                <IconVue3 name="lock" :size="13" />
                <span>{{ t('交换地址仅在双方同意后互相可见 · 73') }}</span>
              </p>

              <template v-if="isOwner">
                <div v-if="status !== 'approved'" class="g-detail__notice is-warn">
                  <IconVue3 name="clock" :size="16" />
                  <span>{{ t('这张卡片') + services.statusText(status) + t('中，仅你自己可见；审核通过后才会出现在卡片广场。') }}</span>
                </div>
                <div class="g-detail__notice is-owner">
                  <IconVue3 name="user" :size="16" />
                  <span>
                    {{ t('这是你的卡片，你可以编辑它、查看分享链接，或等待火腿们的换卡申请。') }}
                    <a href="/dashboard/exchanges" data-link>{{ t('查看换卡申请') }}</a>
                  </span>
                </div>
              </template>
              <div v-else-if="myExchange && myExchange.status === 'pending'" class="g-detail__notice is-pending">
                <IconVue3 name="clock" :size="16" />
                <span>
                  {{ t('你已提交换卡申请，等待对方处理 ·') + ' ' }}
                  <a href="/dashboard/exchanges" data-link>{{ t('查看我的申请') }}</a>
                </span>
              </div>
              <div v-else-if="myExchange && myExchange.status === 'approved'" class="g-detail__notice is-ok">
                <IconVue3 name="check-circle" :size="16" />
                <span>{{ t('对方已同意你的换卡申请，去换卡申请页查看地址并寄出卡片吧。') }}</span>
              </div>
              <div
                v-else-if="canApply && myExchange && (myExchange.status === 'rejected' || myExchange.status === 'cancelled')"
                class="g-detail__notice is-muted"
              >
                <IconVue3 name="info" :size="16" />
                <span>{{ t('你之前的申请') + services.exchangeText(myExchange.status) + t('，可以重新申请。') }}</span>
              </div>
            </template>
          </div>
        </div>

        <section v-if="recoCards.length" class="g-detail__reco" data-detail-reco>
          <div class="g-sec-head" data-vue-reveal>
            <div>
              <p class="eyebrow">MORE CARDS</p>
              <h2 class="g-sec-title">{{ t('同好推荐') }}</h2>
              <p class="g-sec-desc">{{ t('广场里，也许还有你想交换的卡片。') }}</p>
            </div>
            <a class="g-sec-link" href="/explore" data-link>
              {{ t('去广场看看') }}
              <IconVue3 name="arrow-right" :size="16" />
            </a>
          </div>
          <div class="g-detail__reco-grid" data-reco-grid>
            <CardTileVue3
              v-for="(item, index) in recoCards"
              :key="item.id"
              :card="item"
              :services="services"
              data-vue-reveal
              :data-vue-reveal-delay="String(index * 60)"
              @liked="onRecoLiked"
            />
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
