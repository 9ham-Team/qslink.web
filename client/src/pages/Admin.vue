<script setup lang="ts">
import { computed, provide, reactive, ref, watch } from 'vue';
import type { ApplicationContext, RouteContextVue3 } from '../contracts';
import { ADMIN_TABS, TAB_LABELS, normalizeTab, type AdminStats } from '../admin/contracts';
import AdminOverview from '../admin/AdminOverview.vue';
import Icon, { type IconNameVue3 } from '../components/Icon.vue';
import { useAdmin } from '../admin/use-admin';
import { ADMIN_MEMORY, type AdminMemory } from '../admin/memory';
import AdminUsers from '../admin/AdminUsers.vue';
import AdminCards from '../admin/AdminCards.vue';
import AdminExchanges from '../admin/AdminExchanges.vue';
import AdminAnnouncements from '../admin/AdminAnnouncements.vue';
import AdminContest from '../admin/AdminContest.vue';
const props = defineProps<{ platform: ApplicationContext; ctx: RouteContextVue3 }>();
const tab = computed(() => normalizeTab(props.ctx.query.get('tab')));
const version = ref(0);
provide(ADMIN_MEMORY, reactive<AdminMemory>({}));
const pending = ref<{ cards?: number; exchanges?: number }>({});
const components = { overview: AdminOverview, users: AdminUsers, cards: AdminCards, exchanges: AdminExchanges, announcements: AdminAnnouncements, contest: AdminContest };
const icons: Record<string,IconNameVue3> = { overview:'grid',users:'user',cards:'cards',exchanges:'send',announcements:'info',contest:'star' };
const api = useAdmin(props.platform);
let statsJob = 0;
async function refreshStats() {
  const job = ++statsJob;
  try { const stats = await api.get<AdminStats>('/api/admin/stats'); if (api.live() && job === statsJob) pending.value = {cards:stats.cards.pending,exchanges:stats.exchanges.pending}; }
  catch { /* Optional badges never block the management module. */ }
}
watch(tab, value => { if(value !== 'overview' && !Object.keys(pending.value).length) void refreshStats(); },{immediate:true});
function select(value: string) { props.platform.setQuery({ tab: value }); }
function keydown(event: KeyboardEvent, index: number) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!delta) return; event.preventDefault();
  const target = ADMIN_TABS[(index + delta + ADMIN_TABS.length) % ADMIN_TABS.length];
  select(target); document.getElementById('admin-tab-' + target)?.focus();
}
</script>
<template><div data-vue3="admin" class="a-page container">
  <header class="a-hero glass"><div class="a-hero-main"><span class="a-hero-seal"><Icon name="shield" :size="30" /></span><div class="a-hero-text"><p class="eyebrow">ADMIN CONSOLE</p><h1 class="a-hero-title">{{ platform.t('管理后台') }}</h1><p class="a-hero-desc">{{ platform.t('审核卡片、管理用户、查看换卡记录 · 以') }} <b>{{ platform.store.user?.displayName || platform.store.user?.username }}</b> {{ platform.t('身份登录') }}</p></div></div><div class="a-hero-actions"><button type="button" class="btn btn-ghost btn-sm" @click="version++">{{ platform.t('刷新数据') }}</button><a href="/" class="btn btn-soft btn-sm" data-link>{{ platform.t('返回前台') }}</a></div></header>
  <nav class="a-tabs-wrap" :aria-label="platform.t('管理后台导航')"><div class="tabs tabs-lg a-tabs" role="tablist"><button v-for="(key, index) in ADMIN_TABS" :id="'admin-tab-' + key" :key="key" type="button" class="tab" :class="{ 'is-active': tab === key }" role="tab" :aria-selected="tab === key" aria-controls="a-panel" :tabindex="tab === key ? 0 : -1" :data-tab="key" @click="select(key)" @keydown="keydown($event, index)"><Icon :name="icons[key]" :size="17" />{{ platform.t(TAB_LABELS[key]) }}<b v-if="(key === 'cards' || key === 'exchanges') && pending[key]" class="tab-count">{{ pending[key] }}</b></button></div></nav>
  <section id="a-panel" class="a-panel" role="tabpanel" :aria-labelledby="'admin-tab-' + tab"><component :is="components[tab]" :key="tab + ':' + version" :platform="platform" @open-tab="select" @changed="refreshStats" @stats="pending = { cards: $event.cards.pending, exchanges: $event.exchanges.pending }" /></section>
</div></template>
