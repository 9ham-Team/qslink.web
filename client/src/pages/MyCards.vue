<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CardStockDialogVue3 from '../components/CardStockDialog.vue';
import CardTileVue3 from '../components/CardTile.vue';
import DialogVue3 from '../components/Dialog.vue';
import IconVue3 from '../components/Icon.vue';
import type { CardManageServicesVue3, CardVue3, MyCardItemVue3, RouteContextVue3 } from '../contracts';
import { cardUserKeyVue3 } from '../card-manage-utils';

const props = defineProps<{
  ctx: RouteContextVue3;
  services: CardManageServicesVue3;
}>();

type FilterKey = 'all' | 'approved' | 'pending' | 'rejected';

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'approved', label: '已通过' },
  { key: 'pending', label: '审核中' },
  { key: 'rejected', label: '已拒绝' },
];

const STATUS_TONES: Record<string, string> = {
  approved: 'mint',
  pending: 'amber',
  rejected: 'rose',
  draft: 'slate',
};

function initialFilter(query?: URLSearchParams): FilterKey {
  const raw = query?.get('status');
  if (raw === 'approved' || raw === 'pending' || raw === 'rejected') return raw;
  return 'all';
}

const filter = ref<FilterKey>(initialFilter(props.ctx.query));
const items = ref<MyCardItemVue3[]>([]);
const loading = ref(true);
const loadError = ref('');
const stockTarget = ref<MyCardItemVue3 | null>(null);
const deleteTarget = ref<MyCardItemVue3 | null>(null);
const deletingId = ref<string | null>(null);
const sharingId = ref<string | null>(null);

let active = true;
let generation = 0;
let currentUserKey = cardUserKeyVue3(props.services.user());
let loadController: AbortController | null = null;
let deleteController: AbortController | null = null;

const counts = computed(() => {
  const map: Record<FilterKey, number> = { all: items.value.length, approved: 0, pending: 0, rejected: 0 };
  for (const item of items.value) {
    if (item.status === 'approved' || item.status === 'pending' || item.status === 'rejected') {
      map[item.status]++;
    }
  }
  return map;
});

const visibleItems = computed(() => {
  if (filter.value === 'all') return items.value;
  return items.value.filter(item => item.status === filter.value);
});

function statusTone(status?: string): string {
  return (status && STATUS_TONES[status]) || 'slate';
}

function tileCard(card: MyCardItemVue3): CardVue3 {
  if (card.owner && card.owner.uid) return card;
  const user = props.services.user() as { uid?: string; username?: string; displayName?: string; callSign?: string; avatarColor?: string } | null;
  return {
    ...card,
    owner: {
      uid: user?.uid || '',
      username: user?.username,
      displayName: user?.displayName,
      callSign: card.callSign || user?.callSign,
      avatarColor: user?.avatarColor,
      joinedAt: '',
      stats: { cards: 0, likesReceived: 0 },
    },
  };
}

function setFilter(next: FilterKey) {
  if (filter.value === next) return;
  filter.value = next;
  props.services.setQuery({ status: next === 'all' ? null : next });
}

watch(
  () => props.ctx.query.toString(),
  () => {
    const next = initialFilter(props.ctx.query);
    if (filter.value !== next) filter.value = next;
  },
);

function abortAll() {
  loadController?.abort();
  loadController = null;
  deleteController?.abort();
  deleteController = null;
}

async function loadCards() {
  if (!active || !props.services.user()) return;
  const reqGen = ++generation;
  const userKeyAtStart = currentUserKey;
  loadController?.abort();
  const abort = new AbortController();
  loadController = abort;
  loading.value = true;
  loadError.value = '';

  try {
    const data = await props.services.getMyCards(abort.signal);
    if (!active || reqGen !== generation || currentUserKey !== userKeyAtStart) return;
    items.value = Array.isArray(data && data.items) ? data.items : [];
  } catch (err) {
    if (!active || reqGen !== generation || abort.signal.aborted || currentUserKey !== userKeyAtStart) return;
    loadError.value = (err instanceof Error ? err.message : '') || props.services.t('网络异常，请稍后重试');
  } finally {
    if (loadController === abort) loadController = null;
    if (active && reqGen === generation) loading.value = false;
  }
}

function onCardLiked(cardId: string, result: { liked: boolean; likeCount: number }) {
  items.value = items.value.map(item =>
    item.id === cardId ? { ...item, liked: result.liked, likeCount: result.likeCount } : item,
  );
}

function openStock(card: MyCardItemVue3) {
  if (stockTarget.value || deletingId.value === card.id) return;
  stockTarget.value = card;
}

function onStockSaved(updated: MyCardItemVue3) {
  items.value = items.value.map(item =>
    item.id === updated.id
      ? { ...item, stock: updated.stock, updatedAt: updated.updatedAt || item.updatedAt }
      : item,
  );
}

async function onShare(card: MyCardItemVue3) {
  if (sharingId.value === card.id || deletingId.value === card.id) return;
  const reqGen = generation;
  const userKeyAtStart = currentUserKey;
  sharingId.value = card.id;
  try {
    await props.services.shareCard(card);
  } catch (err) {
    if (active && reqGen === generation && currentUserKey === userKeyAtStart) {
      props.services.toast((err instanceof Error ? err.message : '') || props.services.t('分享失败'), 'error');
    }
  } finally {
    if (active && reqGen === generation && sharingId.value === card.id) {
      sharingId.value = null;
    }
  }
}

function askDelete(card: MyCardItemVue3) {
  if (deletingId.value || deleteTarget.value) return;
  deleteTarget.value = card;
}

async function confirmDelete() {
  const card = deleteTarget.value;
  if (!card || deletingId.value) return;
  deleteTarget.value = null;
  deletingId.value = card.id;

  const reqGen = generation;
  const userKeyAtStart = currentUserKey;
  deleteController?.abort();
  const abort = new AbortController();
  deleteController = abort;

  try {
    await props.services.deleteCard(card.id, abort.signal);
    if (!active || reqGen !== generation || currentUserKey !== userKeyAtStart) return;
    items.value = items.value.filter(item => item.id !== card.id);
    props.services.toast(props.services.t('卡片已删除'), 'success');
  } catch (err) {
    if (!active || reqGen !== generation || abort.signal.aborted || currentUserKey !== userKeyAtStart) return;
    props.services.toast((err instanceof Error ? err.message : '') || props.services.t('删除失败，请稍后重试'), 'error');
  } finally {
    if (deleteController === abort) deleteController = null;
    if (active && reqGen === generation && deletingId.value === card.id) {
      deletingId.value = null;
    }
  }
}

const offAuth = props.services.onAuth(user => {
  const nextKey = cardUserKeyVue3(user);
  if (!user) {
    currentUserKey = '';
    generation++;
    abortAll();
    items.value = [];
    stockTarget.value = null;
    deleteTarget.value = null;
    deletingId.value = null;
    sharingId.value = null;
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/cards'), { replace: true });
    return;
  }
  if (nextKey !== currentUserKey) {
    currentUserKey = nextKey;
    generation++;
    abortAll();
    items.value = [];
    stockTarget.value = null;
    deleteTarget.value = null;
    deletingId.value = null;
    sharingId.value = null;
    void loadCards();
  }
});

onMounted(() => {
  if (!props.services.user()) {
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/cards'), { replace: true });
    return;
  }
  void loadCards();
});

onBeforeUnmount(() => {
  active = false;
  generation++;
  abortAll();
  offAuth();
});
</script>

<template>
  <div class="f-page f-my-cards container">
    <header class="page-head">
      <p class="eyebrow">MY COLLECTION</p>
      <div class="page-head-row">
        <div class="page-head-main">
          <h1 class="page-title">{{ services.t('我的卡片') }}</h1>
          <p class="page-desc">{{ services.t('管理你上传的双面 QSL 卡片：编辑、分享，或查看审核状态。') }}</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-primary" href="/dashboard/cards/new" data-link>
            <IconVue3 name="upload" :size="17" />
            <span>{{ services.t('上传新卡片') }}</span>
          </a>
        </div>
      </div>
    </header>

    <section class="f-contest-entry-guide" aria-labelledby="fMyCardsContestTitle">
      <div class="f-contest-entry-guide-copy">
        <h2 id="fMyCardsContestTitle">
          <IconVue3 name="trophy" :size="20" />
          {{ services.t('参赛提醒：可在提交卡片时勾选自动参赛') }}
        </h2>
        <p>{{ services.t('想参加第一届 QSLink 杯 QSL 卡片设计大赛？上传卡片时可勾选「审核通过后自动参赛」并填写参赛说明，通过广场审核后将连同说明一起审核并自动参赛；也可以先上传，通过后前往比赛报名页选择 1–2 件作品。每个账号最多 2 件参赛作品。') }}</p>
        <ol>
          <li>{{ services.t('上传卡片并通过广场审核') }}</li>
          <li>{{ services.t('勾选自动参赛并填写说明，或审核通过后手动报名') }}</li>
          <li>{{ services.t('审核通过后自动参赛，或在报名页查看状态') }}</li>
        </ol>
      </div>
      <a class="btn btn-primary" href="/events/qsl-design-2026-11/registration" data-link>
        {{ services.t('比赛报名 / 查看状态') }}
        <IconVue3 name="arrow-right" :size="16" />
      </a>
    </section>

    <div class="f-cards-toolbar">
      <div class="f-filters" role="tablist" :aria-label="services.t('卡片状态筛选')">
        <button
          v-for="item in FILTERS"
          :key="item.key"
          class="f-filter"
          :class="{ 'is-active': filter === item.key }"
          type="button"
          role="tab"
          :aria-selected="filter === item.key ? 'true' : 'false'"
          :data-filter="item.key"
          @click="setFilter(item.key)"
        >
          {{ services.t(item.label) }}
          <b class="f-filter-count" :data-count-for="item.key">{{ counts[item.key] }}</b>
        </button>
      </div>
      <span class="f-cards-total" data-cards-total>
        <template v-if="loading">{{ services.t('加载中…') }}</template>
        <template v-else-if="loadError">{{ services.t('加载失败') }}</template>
        <template v-else>{{ services.t('共') }} {{ items.length }} {{ services.t('张卡片') }}</template>
      </span>
    </div>

    <div class="f-cards-grid-wrap" id="fMyCardsGrid">
      <template v-if="loading">
        <div v-for="n in 4" :key="n" class="qsl-tile is-skeleton" aria-hidden="true">
          <div class="qsl-tile-frame"><div class="skel skel-media"></div></div>
          <div class="qsl-tile-info">
            <div class="skel skel-line" style="width:72%"></div>
            <div class="skel skel-line" style="width:48%"></div>
          </div>
        </div>
      </template>

      <div v-else-if="loadError" class="f-my-cards-empty">
        <div class="empty-state">
          <div class="empty-state-icon"><IconVue3 name="alert" :size="34" /></div>
          <h3>{{ services.t('卡片加载失败') }}</h3>
          <p>{{ loadError }}</p>
          <button class="btn btn-primary" type="button" @click="loadCards">{{ services.t('重新加载') }}</button>
        </div>
      </div>

      <div v-else-if="!items.length" class="f-my-cards-empty">
        <div class="empty-state">
          <div class="empty-state-icon"><IconVue3 name="cards" :size="34" /></div>
          <h3>{{ services.t('还没有 QSL 卡片') }}</h3>
          <p>{{ services.t('上传你的第一张双面卡片（正面 + 背面），审核通过后就能在卡片广场被同好发现。') }}</p>
          <button class="btn btn-primary" type="button" @click="services.navigate('/dashboard/cards/new')">
            {{ services.t('上传第一张卡片') }}
          </button>
        </div>
      </div>

      <div v-else-if="!visibleItems.length" class="f-my-cards-empty">
        <div class="empty-state">
          <div class="empty-state-icon"><IconVue3 name="search" :size="34" /></div>
          <h3>{{ services.t('没有符合条件的卡片') }}</h3>
          <p>{{ services.t('试试切换上方的状态筛选，查看其它卡片。') }}</p>
          <button class="btn btn-primary" type="button" @click="setFilter('all')">
            {{ services.t('查看全部卡片') }}
          </button>
        </div>
      </div>

      <div v-else class="f-grid-cards">
        <article
          v-for="(card, index) in visibleItems"
          :key="card.id"
          class="f-card-cell"
          :class="{ 'is-busy': deletingId === card.id }"
          :data-card-id="card.id"
          :style="{ '--f-delay': index * 40 + 'ms' }"
        >
          <span class="f-status-pin">
            <span class="badge" :class="'badge-' + statusTone(card.status)">{{ services.statusText(card.status || '') }}</span>
          </span>

          <CardTileVue3 :card="tileCard(card)" :services="services" :show-status="false" @liked="onCardLiked" />

          <div class="f-card-foot">
            <div class="f-card-meta">
              <span class="f-card-status">
                <span class="badge" :class="'badge-' + statusTone(card.status)">{{ services.statusText(card.status || '') }}</span>
              </span>
              <span class="f-card-time">{{ services.t('更新于') }} {{ services.timeAgo(card.updatedAt || card.createdAt || '') }}</span>
            </div>

            <div class="f-card-actions">
              <a
                class="f-card-act"
                :href="'/card/' + encodeURIComponent(card.id)"
                data-link
                :aria-disabled="deletingId === card.id ? 'true' : undefined"
              >
                <IconVue3 name="external" :size="15" />
                <span>{{ services.t('查看') }}</span>
              </a>
              <a
                class="f-card-act"
                :href="'/dashboard/cards/' + encodeURIComponent(card.id) + '/edit'"
                data-link
                :aria-disabled="deletingId === card.id ? 'true' : undefined"
              >
                <IconVue3 name="edit" :size="15" />
                <span>{{ services.t('编辑') }}</span>
              </a>
              <button
                class="f-card-act"
                type="button"
                data-act="share"
                :disabled="sharingId === card.id || deletingId === card.id"
                @click="onShare(card)"
              >
                <IconVue3 name="share" :size="15" />
                <span>{{ services.t('分享') }}</span>
              </button>
              <button
                class="f-card-act"
                type="button"
                data-act="stock"
                :disabled="deletingId === card.id"
                @click="openStock(card)"
              >
                <IconVue3 name="cards" :size="15" />
                <span>{{ services.t('库存') }}</span>
              </button>
              <button
                class="f-card-act is-danger"
                type="button"
                data-act="delete"
                :disabled="deletingId === card.id"
                @click="askDelete(card)"
              >
                <IconVue3 name="trash" :size="15" />
                <span>{{ services.t('删除') }}</span>
              </button>
            </div>

            <div v-if="card.status === 'rejected'" class="f-card-reject">
              <span class="f-card-reject-ico"><IconVue3 name="alert" :size="15" /></span>
              <span>
                <b>{{ services.t('审核未通过') }}</b>
                <template v-if="card.rejectReason">：{{ card.rejectReason }}</template>
                <template v-else>{{ services.t('，请修改后重新提交。') }}</template>
              </span>
            </div>
            <p v-else-if="card.status === 'pending'" class="f-card-pending-hint">
              <IconVue3 name="clock" :size="14" />
              {{ services.t('正在审核中，通过后将出现在卡片广场') }}
            </p>
          </div>
        </article>
      </div>
    </div>

    <CardStockDialogVue3
      v-if="stockTarget"
      :card="stockTarget"
      :services="services"
      @close="stockTarget = null"
      @saved="onStockSaved"
    />

    <DialogVue3
      v-if="deleteTarget"
      :title="services.t('删除卡片')"
      :t="services.t"
      size="sm"
      @close="deleteTarget = null"
    >
      <p>{{ services.t('确定要删除「') }}{{ deleteTarget.title || services.t('未命名卡片') }}{{ services.t('」吗？删除后不可恢复，相关点赞与换卡申请也会一并移除。') }}</p>
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="deleteTarget = null">{{ services.t('保留') }}</button>
        <button class="btn btn-danger" type="button" data-confirm-delete @click="confirmDelete">{{ services.t('删除卡片') }}</button>
      </template>
    </DialogVue3>
  </div>
</template>
