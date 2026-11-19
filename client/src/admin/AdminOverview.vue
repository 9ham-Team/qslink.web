<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ApplicationContext } from '../contracts';
import type { AdminCard, AdminStats } from './contracts';
import { message } from './contracts';
import { exchangeStatusToneVue3 } from '../exchange-utils';
import Icon from '../components/Icon.vue';
import { useAdminFilters } from './memory';
import { useAdmin } from './use-admin';
import AdminFeedback from './AdminFeedback.vue';
import AdminCardImages from './AdminCardImages.vue';
import AdminCardDialog from './AdminCardDialog.vue';
import AdminStat from './AdminStat.vue';
import Avatar from '../components/Avatar.vue';
import ResponsiveImage from '../components/ResponsiveImage.vue';
const props = defineProps<{ platform: ApplicationContext }>();
const emit = defineEmits<{ 'open-tab':[tab:string]; stats:[stats:AdminStats] }>();
const t = props.platform.t;
const cardFilters = useAdminFilters('/api/admin/cards', { q: '', status: 'all' });
const api = useAdmin(props.platform), stats = ref<AdminStats>(), loading = ref(false), error = ref('');
const editing = ref<{card:AdminCard;action:'approve'|'reject'|'preview'}>();
const statItems = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    {label:'用户总数',value:s.users.total,icon:'user' as const,tone:'mint',hero:true,foot:t('活跃')+' '+s.users.active+' · '+t('已禁用')+' '+s.users.banned+' · '+t('本周新增用户')+' '+s.users.newThisWeek},
    {label:'活跃用户',value:s.users.active,icon:'radio' as const,tone:'sky',foot:t('活跃率')+' '+(s.users.total ? Math.round(s.users.active/s.users.total*100):0)+'%'},
    {label:'卡片总数',value:s.cards.total,icon:'cards' as const,tone:'violet',foot:t('已通过')+' '+s.cards.approved+' · '+t('待审核')+' '+s.cards.pending},
    {label:'待审核卡片',value:s.cards.pending,icon:'clock' as const,tone:'amber',foot:t('需要管理员处理的卡片')},
    {label:'待处理换卡',value:s.exchanges.pending,icon:'send' as const,tone:'rose',foot:t('累计')+' '+s.exchanges.total+' '+t('条换卡申请')},
    {label:'点赞总数',value:s.likes,icon:'heart' as const,tone:'rose',foot:t('来自广场访客的喜欢')},
    {label:'本周新增用户',value:s.users.newThisWeek,icon:'sparkles' as const,tone:'mint',foot:t('最近 7 天注册的爱好者')},
  ];
});
async function load() {
  if (loading.value) return; loading.value = true; error.value = '';
  try { const result = await api.get<AdminStats>('/api/admin/stats'); if (api.live()) { stats.value = result; emit('stats',result); } }
  catch (err) { if (api.live()) error.value = props.platform.t(message(err)); }
  finally { if (api.live()) loading.value = false; }
}
function saved() { editing.value = undefined; void load(); }
function openPending() {
  cardFilters.filters.status = 'pending';
  cardFilters.filters.q = '';
  cardFilters.page = 1;
  emit('open-tab', 'cards');
}
onMounted(load);
</script>
<template>
  <div class="a-tab-body">
    <AdminFeedback :loading="loading" :error="error" :t="t" @retry="load" />
    <div v-if="stats && !loading && !error" class="a-overview">
      <div class="stats-grid a-stats">
        <AdminStat v-for="item in statItems" :key="item.label" v-bind="item" :label="t(item.label)" :format="platform.formatNumber" />
      </div>
      <section class="a-block glass">
        <div class="section-head a-block-head">
          <div>
            <h2 class="section-title">{{ t('待审核卡片') }}</h2>
            <p class="section-desc">
              <template v-if="stats.cards.pending">
                {{ t('共') }} <b>{{ stats.cards.pending }}</b> {{ t('张卡片等待审核 · 通过后将立即出现在卡片广场') }}
              </template>
              <template v-else>{{ t('当前没有等待审核的卡片') }}</template>
            </p>
          </div>
          <button type="button" class="section-link" @click="openPending">
            {{ t('查看全部') }}<Icon name="arrow-right" :size="16" />
          </button>
        </div>
        <div v-if="stats.pendingCards.length" class="a-pending-row">
          <article v-for="card in stats.pendingCards" :key="card.id" class="a-pending">
            <div class="a-pending-thumbs">
              <AdminCardImages :card="card" :platform="platform" />
              <span class="a-ratio-chip">{{ platform.ratioLabel(card.ratio) }}</span>
            </div>
            <div class="a-pending-body">
              <h3 class="a-pending-title" :title="card.title">{{ card.title || t('未命名卡片') }}</h3>
              <div v-if="card.owner" class="a-pending-owner">
                <span class="owner-line">
                  <Avatar :user="card.owner" :size="26" />
                  <span class="owner-name">{{ card.owner.displayName || card.owner.username || t('未知用户') }}</span>
                </span>
              </div>
              <div class="a-pending-meta">
                <span class="a-meta-item"><Icon name="clock" :size="14" />{{ t('提交于') }} {{ platform.timeAgo(card.createdAt) }}</span>
                <span v-if="card.callSign" class="badge badge-slate">{{ card.callSign }}</span>
              </div>
              <div v-if="card.contestOptIn" class="a-contest-auto-info is-compact">
                <span class="a-contest-auto-tag"><Icon name="trophy" :size="14" />{{ t('自动参赛') }}</span>
                <p>{{ card.contestDescription || t('参赛说明缺失，无法自动参赛') }}</p>
              </div>
              <div class="a-pending-actions">
                <button type="button" class="a-act" @click="editing = { card, action: 'preview' }">
                  <Icon name="3d" :size="15" />{{ t('查看卡片') }}
                </button>
                <button type="button" class="btn btn-primary btn-sm" @click="editing = { card, action: 'approve' }">
                  <Icon name="check" :size="15" />{{ t('通过') }}
                </button>
                <button type="button" class="a-act a-act--danger" @click="editing = { card, action: 'reject' }">
                  <Icon name="x" :size="15" />{{ t('拒绝') }}
                </button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="a-all-clear">
          <span class="a-all-clear-ico"><Icon name="check-circle" :size="26" /></span>
          <div>
            <b>{{ t('审核队列已清空') }}</b>
            <p class="muted">{{ t('当前没有待审核的卡片，新的上传会出现在这里。') }}</p>
          </div>
        </div>
      </section>

      <div class="a-split">
        <section class="a-block glass">
          <div class="section-head a-block-head">
            <div>
              <h2 class="section-title">{{ t('最近注册用户') }}</h2>
              <p class="section-desc">{{ t('刚刚加入 QSLink 的业余无线电爱好者') }}</p>
            </div>
            <button type="button" class="section-link" @click="emit('open-tab', 'users')">
              {{ t('查看全部') }}<Icon name="arrow-right" :size="16" />
            </button>
          </div>
          <ul v-if="stats.recentUsers.length" class="a-list">
            <li v-for="user in stats.recentUsers.slice(0, 5)" :key="user.id" class="a-list-row">
              <span class="a-list-user">
                <Avatar :user="user" :size="34" />
                <span class="a-list-main">
                  <b>{{ user.displayName || user.username || t('未知用户') }}</b>
                  <small>@{{ user.username }}<template v-if="user.callSign"> · {{ user.callSign }}</template></small>
                </span>
              </span>
              <span class="a-list-side">
                <span v-if="user.role === 'admin'" class="badge badge-violet">{{ t('管理员') }}</span>
                <time>{{ platform.timeAgo(user.createdAt || user.joinedAt || '') }}</time>
              </span>
            </li>
          </ul>
          <div v-else class="a-inline-empty"><Icon name="user" :size="20" />{{ t('最近还没有新用户注册') }}</div>
        </section>
        <section class="a-block glass">
          <div class="section-head a-block-head">
            <div>
              <h2 class="section-title">{{ t('最近换卡申请') }}</h2>
              <p class="section-desc">{{ t('最新发生的 QSL 卡片交换动态') }}</p>
            </div>
            <button type="button" class="section-link" @click="emit('open-tab', 'exchanges')">
              {{ t('查看全部') }}<Icon name="arrow-right" :size="16" />
            </button>
          </div>
          <ul v-if="stats.recentExchanges.length" class="a-list">
            <li v-for="item in stats.recentExchanges.slice(0, 5)" :key="item.id" class="a-list-row a-list-row--exch">
              <span class="a-mini-thumb">
                <ResponsiveImage
                  :src="item.card?.frontImage || platform.PLACEHOLDER_IMAGE"
                  :alt="item.card?.title || t('卡片已删除')"
                  :services="{ image: platform.images.apply, placeholder: platform.PLACEHOLDER_IMAGE }"
                />
              </span>
              <span class="a-list-main">
                <b>{{ item.card?.title || t('卡片已删除') }}</b>
                <small>
                  {{ item.fromUser?.displayName || item.fromUser?.username || t('未知') }} →
                  {{ item.toUser?.displayName || item.toUser?.username || t('未知') }} · {{ platform.timeAgo(item.createdAt) }}
                </small>
              </span>
              <span class="a-list-side">
                <span class="badge" :class="'badge-' + exchangeStatusToneVue3(item.status)">{{ platform.exchangeText(item.status) }}</span>
              </span>
            </li>
          </ul>
          <div v-else class="a-inline-empty"><Icon name="send" :size="20" />{{ t('最近还没有换卡申请') }}</div>
        </section>
      </div>
    </div>
    <AdminCardDialog v-if="editing" :platform="platform" :card="editing.card" :action="editing.action" @close="editing = undefined" @saved="saved" />
  </div>
</template>
