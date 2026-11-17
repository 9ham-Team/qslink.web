<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { ApplicationContext } from '../contracts';
import { CONTEST_API, type ContestEntry } from './contracts';
import { useAdminList } from './use-admin-list';
import { useAdminFilters } from './memory';
import AdminVoting from './AdminVoting.vue';
import AdminJudging from './AdminJudging.vue';
import AdminAnnouncements from './AdminAnnouncements.vue';
import AdminFeedback from './AdminFeedback.vue';
import AdminPager from './AdminPager.vue';
import AdminCardImages from './AdminCardImages.vue';
import AdminEntryDialog from './AdminEntryDialog.vue';
const props = defineProps<{platform:ApplicationContext}>();
const state = useAdminFilters(CONTEST_API + '/entries',{status:'pending'});
const status = toRef(state.filters,'status'), selected = ref('');
const filters = computed(() => ({status:status.value}));
const { data, loading, error, load } = useAdminList<ContestEntry>(props.platform, CONTEST_API + '/entries',filters);
function saved() { selected.value = ''; void load(); }
</script>
<template><div class="a-tab-body"><AdminVoting :platform="platform" /><AdminJudging :platform="platform" /><section class="a-contest-section"><div class="toolbar a-toolbar"><h2>{{ platform.t('作品说明审核') }}</h2><label>{{ platform.t('说明审核状态') }}<select v-model="status" class="select"><option value="all">{{ platform.t('全部') }}</option><option v-for="s in ['pending','approved','rejected']" :key="s" :value="s">{{ platform.statusText(s) }}</option></select></label></div><p class="muted">{{ platform.t('自动参赛的说明随广场卡片审核一并通过，通常无需在这里重复审核；此列表可查看全部报名，并审核手动报名及修改后的说明。图片审核通过后即可展示和投票，说明待审核或驳回不影响图片投票。') }}</p><AdminFeedback :loading="loading" :error="error" :empty="!data?.items.length" :t="platform.t" @retry="load()" /><div v-if="data && data.items.length && !loading && !error" class="a-cardlist"><article v-for="entry in data.items" :key="entry.id" class="a-cardrow"><div class="a-cardrow-thumbs"><AdminCardImages v-for="card in entry.cards" :key="card.id" :card="card" :platform="platform" /></div><div class="a-cardrow-main"><h3>{{ entry.cards.map(card => card.title).join('、') || platform.t('未关联卡片') }}</h3><p>{{ entry.user?.displayName || entry.user?.username }} · {{ platform.statusText(entry.status) }}</p><p v-for="work in entry.works" :key="work.number" class="a-contest-excerpt">#{{ String(work.number).padStart(3,'0') }} {{ work.description }}</p><small>{{ platform.formatDateTime(entry.updatedAt) }}</small></div><button type="button" class="a-act a-act--wide" @click="selected = entry.id">{{ platform.t('查看报名 / 审核') }}</button></article></div><AdminPager v-if="data" :page="data" :t="platform.t" :busy="loading" @go="load" /></section><section class="a-contest-section"><AdminAnnouncements :platform="platform" event-key="qsl-design-2026-11" /></section><AdminEntryDialog v-if="selected" :id="selected" :platform="platform" @close="selected = ''" @saved="saved" /></div></template>
