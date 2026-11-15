<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LegacyQslVue3 } from '../contracts';
import type { AdminCard, AdminStats } from './contracts';
import { message } from './contracts';
import { useAdmin } from './use-admin';
import AdminFeedback from './AdminFeedback.vue';
import AdminCardImages from './AdminCardImages.vue';
import AdminCardDialog from './AdminCardDialog.vue';
import AdminStat from './AdminStat.vue';
import Avatar from '../components/Avatar.vue';
import ResponsiveImage from '../components/ResponsiveImage.vue';
const props = defineProps<{ qsl: LegacyQslVue3 }>();
const emit = defineEmits<{ 'open-tab':[tab:string]; stats:[stats:AdminStats] }>();
const api = useAdmin(props.qsl), stats = ref<AdminStats>(), loading = ref(false), error = ref('');
const editing = ref<{card:AdminCard;action:'approve'|'reject'|'preview'}>();
const statItems = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const t=props.qsl.t;
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
  catch (err) { if (api.live()) error.value = props.qsl.t(message(err)); }
  finally { if (api.live()) loading.value = false; }
}
function saved() { editing.value = undefined; void load(); }
onMounted(load);
</script>
<template><div class="a-tab-body"><AdminFeedback :loading="loading" :error="error" :t="qsl.t" @retry="load" /><template v-if="stats && !loading && !error"><div class="stats-grid a-stats"><AdminStat v-for="item in statItems" :key="item.label" v-bind="item" :label="qsl.t(item.label)" :format="qsl.formatNumber" /></div><section class="a-block glass"><div class="section-head a-block-head"><h2>{{ qsl.t('待审核卡片') }} · {{ stats.cards.pending }}</h2><button type="button" class="btn btn-ghost" @click="emit('open-tab','cards')">{{ qsl.t('查看全部') }}</button></div><AdminFeedback :empty="!stats.pendingCards.length" :t="qsl.t" /><div v-if="stats.pendingCards.length" class="a-cardlist"><article v-for="card in stats.pendingCards" :key="card.id" class="a-cardrow"><AdminCardImages :card="card" :qsl="qsl" /><div class="a-cardrow-main"><h3>{{ card.title }}</h3><p>{{ card.owner?.displayName || card.owner?.username }} · {{ card.callSign }}</p><p v-if="card.contestOptIn" class="a-contest-auto-info">{{ qsl.t('自动参赛') }} · {{ card.contestDescription }}</p></div><div class="a-cardrow-actions"><button v-for="action in ['preview','approve','reject'] as const" :key="action" type="button" class="a-act" @click="editing = {card,action}">{{ qsl.t({preview:'查看卡片',approve:'通过审核',reject:'拒绝'}[action]) }}</button></div></article></div></section><div class="a-split"><section class="a-block glass"><h2>{{ qsl.t('最近注册用户') }}</h2><ul class="a-list"><li v-for="user in stats.recentUsers" :key="user.id" class="a-list-row"><span class="a-list-user"><Avatar :user="user" :size="34" /><span class="a-list-main"><b>{{ user.displayName || user.username }}</b><small>@{{ user.username }} · {{ user.callSign }}</small></span></span><span class="a-list-side"><time>{{ qsl.timeAgo(user.createdAt || user.joinedAt || "") }}</time></span></li></ul><button type="button" class="btn btn-ghost" @click="emit('open-tab','users')">{{ qsl.t('用户管理') }}</button></section><section class="a-block glass"><h2>{{ qsl.t('最近换卡申请') }}</h2><ul class="a-list"><li v-for="item in stats.recentExchanges" :key="item.id" class="a-list-row"><span class="a-mini-thumb"><ResponsiveImage :src="item.card?.frontImage || qsl.PLACEHOLDER_IMAGE" :alt="item.card?.title || qsl.t('卡片已删除')" :services="{image:qsl.images.apply,placeholder:qsl.PLACEHOLDER_IMAGE}" /></span><span class="a-list-main"><b>{{ item.card?.title || qsl.t('卡片已删除') }}</b><small>{{ item.fromUser?.displayName || qsl.t('用户已删除') }} → {{ item.toUser?.displayName || qsl.t('用户已删除') }}</small></span><span class="a-list-side">{{ qsl.exchangeText(item.status) }}</span></li></ul><button type="button" class="btn btn-ghost" @click="emit('open-tab','exchanges')">{{ qsl.t('换卡记录') }}</button></section></div></template><AdminCardDialog v-if="editing" :qsl="qsl" :card="editing.card" :action="editing.action" @close="editing = undefined" @saved="saved" /></div></template>
