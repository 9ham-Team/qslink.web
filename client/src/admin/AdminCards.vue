<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import type { LegacyQslVue3 } from '../contracts';
import type { AdminCard } from './contracts';
import { useAdminList } from './use-admin-list';
import { useAdminFilters } from './memory';
import AdminFeedback from './AdminFeedback.vue';
import AdminPager from './AdminPager.vue';
import AdminCardImages from './AdminCardImages.vue';
import AdminCardDialog from './AdminCardDialog.vue';
const props = defineProps<{ qsl: LegacyQslVue3 }>();
const emit = defineEmits<{changed:[]}>();
const state = useAdminFilters('/api/admin/cards',{q:'',status:'all'});
const search = toRef(state.filters,'q'), status = toRef(state.filters,'status'), query = ref(search.value);
let searchTimer:ReturnType<typeof setTimeout>;
watch(query,value => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { search.value = value.trim(); },280); });
onBeforeUnmount(() => clearTimeout(searchTimer));
const filters = computed(() => ({ q: search.value, status: status.value }));
const { data, loading, error, load } = useAdminList<AdminCard>(props.qsl, '/api/admin/cards', filters);
const editing = ref<{ card: AdminCard; action:'edit'|'approve'|'reject'|'delete'|'preview' }>();
function saved() { editing.value = undefined; emit('changed'); void load(); }
</script>
<template><div class="a-tab-body"><form class="toolbar a-toolbar" @submit.prevent="search = query.trim()"><label>{{ qsl.t('搜索卡片') }}<input v-model="query" type="search" class="input"></label><button type="submit" class="btn btn-ghost">{{ qsl.t('搜索') }}</button><div class="segmented"><button v-for="s in ['all','pending','approved','rejected']" :key="s" type="button" :class="{active:status === s}" @click="status = s">{{ s === 'all' ? qsl.t('全部') : qsl.statusText(s) }}</button></div></form>
<AdminFeedback :loading="loading" :error="error" :empty="!data?.items.length" :t="qsl.t" @retry="load()" />
<div v-if="data && data.items.length && !loading && !error" class="a-cardlist"><article v-for="card in data.items" :key="card.id" class="a-cardrow"><AdminCardImages :card="card" :qsl="qsl" /><div class="a-cardrow-main"><div class="a-cardrow-head"><h3 class="a-cardrow-title">{{ card.title }}</h3><span class="badge">{{ qsl.statusText(card.status || 'pending') }}</span></div><p>{{ card.owner?.displayName || card.owner?.username }} · {{ card.callSign }}</p><p class="a-cardrow-notes">{{ card.notes }}</p><small>{{ qsl.ratioLabel(card.ratio) }} · {{ qsl.t("点赞") }} {{ card.likeCount || 0 }}</small><a :href="'/card/' + encodeURIComponent(card.id)" data-link>{{ qsl.t("前台查看") }}</a><p v-if="card.rejectReason" class="a-reject-note">{{ card.rejectReason }}</p><div v-if="card.contestOptIn" class="a-contest-auto-info"><b>{{ qsl.t('自动参赛') }}</b><p>{{ card.contestDescription }}</p></div><small>{{ qsl.formatDateTime(card.createdAt) }}</small></div><div class="a-cardrow-actions"><button v-for="action in ['preview','approve','reject','edit','delete'] as const" :key="action" v-show="!(action === 'approve' && card.status === 'approved') && !(action === 'reject' && card.status === 'rejected')" type="button" class="a-act a-act--wide" @click="editing = { card,action }">{{ qsl.t({ preview:'查看卡片',approve:'通过审核',reject:'拒绝',edit:'编辑',delete:'删除' }[action]) }}</button></div></article></div>
<AdminPager v-if="data" :page="data" :busy="loading" :t="qsl.t" @go="load" /><AdminCardDialog v-if="editing" :qsl="qsl" :card="editing.card" :action="editing.action" @close="editing = undefined" @saved="saved" /></div></template>
