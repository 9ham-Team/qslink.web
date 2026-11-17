<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import AvatarVue3 from '../components/Avatar.vue';
import Card3DViewerVue3 from '../components/Card3DViewer.vue';
import IconVue3 from '../components/Icon.vue';
import { useExchangeRequestVue3 } from '../composables/use-exchange-request';
import type { CardDetailServicesVue3, CardDetailVue3, PublicUserVue3 } from '../contracts';

const props = defineProps<{
  token: string;
  services: CardDetailServicesVue3;
}>();

const t = props.services.t;
const exchange = useExchangeRequestVue3(props.services);

const currentUser = shallowRef(props.services.user());
const loading = ref(true);
const missing = ref<'not-found' | 'error' | null>(null);
const card = ref<CardDetailVue3 | null>(null);
const owner = ref<PublicUserVue3 | null>(null);

let active = true;
let loadGen = 0;
let shareAbort: AbortController | undefined;

const viewerOptions = {
  width: 480,
  autoRotateSpeed: 4.2,
  idleDelay: 3400,
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
const status = computed(() => card.value?.status || 'approved');
const statusTone = computed(() => {
  if (status.value === 'approved') return 'mint';
  if (status.value === 'pending') return 'amber';
  if (status.value === 'rejected') return 'rose';
  return 'slate';
});
const myExchange = computed(() => card.value?.myExchange || null);
const ownerName = computed(() => ownerData.value?.callSign || ownerData.value?.displayName || ownerData.value?.username || t('卡片主人'));
const callSignBadge = computed(() => ownerData.value?.callSign || card.value?.callSign || '');
const nonApplicable = computed(() => {
  const c = card.value;
  if (!c || isOwner.value) return false;
  if (myExchange.value && (myExchange.value.status === 'pending' || myExchange.value.status === 'approved')) return false;
  return c.stock === 0 || c.canApply === false;
});
const showGuestLead = computed(() => !currentUser.value && !loading.value && !missing.value && !!card.value && !nonApplicable.value);

function sharePath() {
  return location.pathname + location.search;
}

function goLogin() {
  props.services.navigate('/login?next=' + encodeURIComponent(sharePath()));
}

function goRegister() {
  props.services.navigate('/register?next=' + encodeURIComponent(sharePath()));
}

function copyShareUrl() {
  const url = location.origin + sharePath();
  void props.services.copyText(url, t('分享链接已复制，快发给朋友吧'));
}

function onApply() {
  if (!props.services.user()) {
    goLogin();
    return;
  }
  if (card.value) exchange.open(card.value);
}

function setPageTitle(title: string) {
  try {
    document.title = title;
  } catch { /* Ignore title write errors. */ }
}

async function load() {
  if (!active) return;
  shareAbort?.abort();
  exchange.cancel();

  const gen = ++loadGen;
  const ctrl = new AbortController();
  shareAbort = ctrl;

  loading.value = true;
  missing.value = null;
  card.value = null;
  owner.value = null;
  setPageTitle(t('QSL 卡片分享') + ' · QSLink');

  if (!props.token) {
    missing.value = 'not-found';
    loading.value = false;
    setPageTitle(t('页面不存在 · QSLink'));
    return;
  }

  try {
    const res = await props.services.getPublicCard(props.token, ctrl.signal);
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
    setPageTitle((res.card.title || t('QSL 卡片分享')) + ' · QSLink');
  } catch (err) {
    if (!active || gen !== loadGen || ctrl.signal.aborted) return;
    card.value = null;
    owner.value = null;
    loading.value = false;
    const statusCode = err && typeof err === 'object' ? (err as { status?: number; code?: string }).status : undefined;
    const errCode = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
    const isNotFound = statusCode === 404 || errCode === 'NOT_FOUND';
    missing.value = isNotFound ? 'not-found' : 'error';
    setPageTitle(isNotFound ? t('页面不存在 · QSLink') : t('加载失败') + ' · QSLink');
    if (!isNotFound) {
      props.services.toast(err instanceof Error ? err.message : t('分享页加载失败，请稍后重试'), 'error');
    }
  }
}

const offAuth = props.services.onAuth(user => {
  currentUser.value = user;
  exchange.cancel();
  void load();
});

watch(() => props.token, () => {
  void load();
});

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  active = false;
  loadGen++;
  shareAbort?.abort();
  offAuth();
  exchange.cancel();
});
</script>

<template>
  <div class="g-share">
    <div class="g-share__crumb">
      <div class="container g-share__crumb-inner">
        <nav class="g-crumbs g-share__breadcrumb" :aria-label="t('面包屑')">
          <a href="/" data-link>{{ t('首页') }}</a>
          <span class="g-crumbs__sep">/</span>
          <a href="/explore" data-link>{{ t('卡片广场') }}</a>
          <span class="g-crumbs__sep">/</span>
          <span class="g-crumbs__current">{{ t('QSL 卡片分享') }}</span>
        </nav>
        <span class="g-share__crumb-note">
          <IconVue3 name="globe" :size="14" />
          <span>{{ t('公开分享 · 无需登录即可欣赏 3D 卡片') }}</span>
        </span>
      </div>
    </div>

    <div v-if="!missing" class="g-share__main container" data-share-main>
      <div class="g-share__grid" :class="{ 'has-lead': showGuestLead }">
        <div class="g-share__viewer g-panel" :class="{ 'is-ready': !loading && !!card }" data-share-viewer>
          <div v-if="loading || !card" class="g-share__viewer-skel">
            <div class="g-skeleton g-share__skel-card"></div>
            <div class="g-skeleton g-skeleton-line" style="width:160px;margin-top:26px"></div>
          </div>
          <template v-else>
            <div class="g-share__viewer-deco" aria-hidden="true"></div>
            <div class="g-share__viewer-stage" data-share-viewer-mount :aria-label="t('3D 卡片查看器')">
              <Card3DViewerVue3
                :front="card.frontImage || ''"
                :back="card.backImage || ''"
                :ratio="card.ratio || { w: 3, h: 2 }"
                :create="services.createViewer"
                :options="viewerOptions"
              />
            </div>
            <div class="g-share__viewer-foot">
              <span class="badge badge-mint">
                <IconVue3 name="3d" :size="13" />
                {{ ' ' + t('3D 可交互') }}
              </span>
              <span class="g-share__ratio">{{ services.ratioLabel(card.ratio) }}</span>
              <span class="g-share__viewer-note">{{ t('拖拽旋转 · 双击翻面 · 可切换正反面') }}</span>
            </div>
          </template>
        </div>

        <div v-if="showGuestLead" class="g-share__lead" data-share-lead>
          <div class="g-share__cta is-guest">
            <div class="g-share__cta-icon"><IconVue3 name="send" :size="22" /></div>
            <h2>{{ t('喜欢这张卡片？') }}</h2>
            <p>{{ t('注册 QSLink 账号，就能向') + ' ' + ownerName + ' ' + t('申请换卡，收集属于你的 QSL 卡片。') }}</p>
            <div class="g-share__cta-actions">
              <button class="btn btn-primary btn-lg" type="button" data-guest-register @click="goRegister">
                <IconVue3 name="sparkles" :size="17" />
                <span>{{ t('注册并申请换卡') }}</span>
              </button>
              <button class="btn btn-ghost" type="button" data-guest-login @click="goLogin">
                {{ t('已有账号，登录') }}
              </button>
            </div>
            <span class="g-share__cta-hint">
              <IconVue3 name="lock" :size="13" />
              {{ ' ' + t('地址只在双方同意后可见') }}
            </span>
          </div>
        </div>

        <div class="g-share__aside" data-share-aside>
          <div v-if="loading || !card" class="g-share__aside-skel">
            <div class="g-skeleton g-skeleton-line" style="width:110px;height:20px"></div>
            <div class="g-skeleton g-skeleton-line" style="width:82%;height:40px;margin-top:18px"></div>
            <div class="g-skeleton g-skeleton-line" style="width:46%;height:16px;margin-top:16px"></div>
            <div class="g-skeleton g-skeleton-line" style="width:100%;height:120px;margin-top:26px"></div>
          </div>

          <template v-else>
            <div class="g-share__badges">
              <span v-if="callSignBadge" class="badge badge-sky">{{ callSignBadge }}</span>
              <span class="badge badge-slate">{{ services.ratioLabel(card.ratio) }}</span>
              <span class="badge badge-mint">
                <IconVue3 name="share" :size="12" />
                {{ ' ' + t('公开分享') }}
              </span>
              <span v-if="status !== 'approved'" class="badge" :class="'badge-' + statusTone">
                {{ services.statusText(status) }}
              </span>
            </div>

            <h1 class="g-share__title">{{ card.title || t('未命名卡片') }}</h1>

            <div class="g-share__owner">
              <span class="owner-line">
                <AvatarVue3 :user="ownerData" :size="26" />
                <span class="owner-name">{{ ownerData.displayName || ownerData.username || t('未知火腿') }}</span>
                <b v-if="ownerData.callSign" class="owner-call">{{ ownerData.callSign }}</b>
              </span>
              <span class="g-share__date">{{ services.timeAgo(card.createdAt) + t('分享') }}</span>
            </div>

            <p v-if="card.notes" class="g-share__notes">{{ card.notes }}</p>
            <p v-else class="g-share__notes is-empty">{{ t('这张卡片的主人还没有留下简介。') }}</p>

            <dl class="g-share__meta">
              <div><dt>{{ t('卡片比例') }}</dt><dd>{{ services.ratioLabel(card.ratio) }}</dd></div>
              <div><dt>{{ t('剩余库存') }}</dt><dd>{{ card.stock == null ? t('未设置') : card.stock + ' ' + t('张') }}</dd></div>
              <div><dt>{{ t('点赞') }}</dt><dd>{{ services.formatNumber(card.likeCount || 0) }}</dd></div>
              <div><dt>{{ t('换卡') }}</dt><dd>{{ String(card.exchangeCount || 0) + ' ' + t('次') }}</dd></div>
              <div><dt>{{ t('发布时间') }}</dt><dd>{{ services.formatDate(card.createdAt) }}</dd></div>
            </dl>

            <div v-if="isOwner && status !== 'approved'" class="g-share__notice is-warn">
              <IconVue3 name="clock" :size="15" />
              <span>{{ t('这张卡片') + services.statusText(status) + t('中，分享链接暂时只对你有意义；审核通过后所有人可见。') }}</span>
            </div>

            <div v-if="nonApplicable" class="g-share__cta">
              <h2>{{ card.stock === 0 ? t('暂无库存') : t('暂不可申请') }}</h2>
              <p>{{ card.stock === 0 ? t('这张卡片暂时没有库存，仍可欣赏与分享。') : t('这张卡片暂不可申请换卡，仍可欣赏与分享。') }}</p>
              <a class="btn btn-ghost" href="/explore" data-link>{{ t('看看其它卡片') }}</a>
            </div>

            <div v-else-if="!currentUser" class="g-share__cta is-guest">
              <div class="g-share__cta-icon"><IconVue3 name="send" :size="22" /></div>
              <h2>{{ t('喜欢这张卡片？') }}</h2>
              <p>{{ t('注册 QSLink 账号，就能向') + ' ' + ownerName + ' ' + t('申请换卡，收集属于你的 QSL 卡片。') }}</p>
              <div class="g-share__cta-actions">
                <button class="btn btn-primary btn-lg" type="button" data-guest-register @click="goRegister">
                  <IconVue3 name="sparkles" :size="17" />
                  <span>{{ t('注册并申请换卡') }}</span>
                </button>
                <button class="btn btn-ghost" type="button" data-guest-login @click="goLogin">
                  {{ t('已有账号，登录') }}
                </button>
              </div>
              <span class="g-share__cta-hint">
                <IconVue3 name="lock" :size="13" />
                {{ ' ' + t('地址只在双方同意后可见') }}
              </span>
            </div>

            <div v-else-if="isOwner" class="g-share__cta is-owner">
              <div class="g-share__cta-icon"><IconVue3 name="user" :size="22" /></div>
              <h2>{{ t('这是你的卡片') }}</h2>
              <p>{{ t('朋友正在欣赏你的 QSL 卡片。把链接分享给更多火腿，让这张卡片抵达对的人。') }}</p>
              <div class="g-share__cta-actions">
                <button class="btn btn-primary" type="button" data-copy-share @click="copyShareUrl">
                  <IconVue3 name="copy" :size="16" />
                  {{ t('复制分享链接') }}
                </button>
                <a class="btn btn-ghost" :href="'/dashboard/cards/' + encodeURIComponent(card.id) + '/edit'" data-link>
                  <IconVue3 name="edit" :size="16" />
                  {{ t('编辑卡片') }}
                </a>
                <a class="btn btn-ghost" href="/dashboard/cards" data-link>
                  <IconVue3 name="cards" :size="16" />
                  {{ t('我的卡片') }}
                </a>
              </div>
            </div>

            <div v-else-if="myExchange && myExchange.status === 'pending'" class="g-share__cta is-pending">
              <div class="g-share__cta-icon"><IconVue3 name="clock" :size="22" /></div>
              <h2>{{ t('申请已送达') }}</h2>
              <p>{{ t('你已向') + ' ' + ownerName + ' ' + t('提交换卡申请，耐心等待对方回应吧。') }}</p>
              <div class="g-share__cta-actions">
                <a class="btn btn-primary" href="/dashboard/exchanges" data-link>
                  <IconVue3 name="send" :size="16" />
                  {{ t('查看我的申请') }}
                </a>
                <a class="btn btn-ghost" href="/explore" data-link>{{ t('继续逛广场') }}</a>
              </div>
            </div>

            <div v-else-if="myExchange && myExchange.status === 'approved'" class="g-share__cta is-ok">
              <div class="g-share__cta-icon"><IconVue3 name="check-circle" :size="22" /></div>
              <h2>{{ t('已达成交换') }}</h2>
              <p>{{ t('对方已经同意了你的换卡申请，去换卡申请页查看地址并寄出卡片吧。') }}</p>
              <div class="g-share__cta-actions">
                <a class="btn btn-primary" href="/dashboard/exchanges" data-link>
                  <IconVue3 name="send" :size="16" />
                  {{ t('查看地址') }}
                </a>
              </div>
            </div>

            <div v-else class="g-share__cta is-user">
              <div class="g-share__cta-icon"><IconVue3 name="send" :size="22" /></div>
              <h2>{{ t('想和') + ' ' + ownerName + ' ' + t('交换这张卡片吗？') }}</h2>
              <p>{{ t('提交换卡申请并填写邮寄地址，对方同意后即可互相查看地址、互寄卡片。') }}</p>
              <div class="g-share__cta-actions">
                <button class="btn btn-primary btn-lg" type="button" data-apply @click="onApply">
                  <IconVue3 name="send" :size="17" />
                  <span>{{ t('申请换卡') }}</span>
                </button>
                <a class="btn btn-ghost" href="/explore" data-link>{{ t('再看看其它卡片') }}</a>
              </div>
              <span class="g-share__cta-hint">
                <IconVue3 name="lock" :size="13" />
                {{ ' ' + t('地址只在双方同意后可见 · 73') }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-else class="g-share__missing" data-share-missing>
      <div class="g-share__missing-inner">
        <div class="g-share__missing-art">
          <template v-if="missing === 'not-found'">404</template>
          <IconVue3 v-else name="alert" :size="40" />
        </div>
        <h1 class="g-display">{{ missing === 'not-found' ? t('这张分享卡片不在了') : t('分享页加载失败') }}</h1>
        <p>{{ missing === 'not-found'
          ? t('链接可能已失效、卡片尚未通过审核，或者已经被主人删除。去卡片广场看看其它卡片吧。')
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
        <p class="g-share__missing-tip">
          <IconVue3 name="sparkles" :size="14" />
          <span>{{ t('在 QSLink，每一张 QSL 卡片都值得被看见。') }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
