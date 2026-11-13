<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import AvatarVue3 from '../components/Avatar-vue3.vue';
import CardTileVue3 from '../components/CardTile-vue3.vue';
import type { CardVue3, ServicesVue3, SpaceResponseVue3 } from '../contracts-vue3';

const props = defineProps<{ uid: string; services: ServicesVue3 }>();
const t = props.services.t;
const profile = shallowRef<SpaceResponseVue3>();
const cards = ref<CardVue3[]>([]);
const loading = ref(false);
const error = ref<number | null>(null);
const status = ref('');
const page = ref(0);
const pages = ref(0);
const sort = ref('latest');
const view = ref('grid');
const expanded = ref(false);
const retryReset = ref(false);
const currentUser = shallowRef(props.services.user());
let active = true;
let requestId = 0;
let controller: AbortController | undefined;
let modal: { close(): void } | undefined;
const own = computed(() => currentUser.value?.uid === props.uid);
const bio = computed(() => profile.value?.user.bio?.trim() || t('在电波中相遇，73！'));
const collapsible = computed(() => bio.value.length > 40 || /[\r\n]/.test(bio.value));
const more = computed(() => retryReset.value || page.value < pages.value);

try { if (localStorage.getItem('qsl_space_view') === 'large') view.value = 'large'; } catch { /* optional preference */ }
function setView(value: string) {
  view.value = value;
  try { localStorage.setItem('qsl_space_view', value); } catch { /* optional preference */ }
}
function share() {
  modal?.close();
  modal = props.services.share(profile.value?.url || location.origin + '/space/' + encodeURIComponent(props.uid));
}
function liked(id: string, result: { liked: boolean; likeCount: number }) {
  const card = cards.value.find(item => item.id === id);
  if (card) Object.assign(card, result);
}

async function load(reset = false) {
  if (!active || (loading.value && !reset)) return;
  reset = reset || retryReset.value;
  retryReset.value = false;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const request = ++requestId;
  const nextPage = reset ? 1 : page.value + 1;
  loading.value = true;
  error.value = null;
  status.value = '';
  try {
    const response = await props.services.getSpace(props.uid, sort.value, nextPage, signal);
    if (!active || request !== requestId) return;
    profile.value = response;
    cards.value = reset ? response.cards.items : cards.value.concat(response.cards.items);
    page.value = response.cards.page;
    pages.value = response.cards.pages;
    document.title = (response.user.displayName || t('火腿')) + t('的个人主页 · QSLink');
    status.value = response.cards.total ? '' : t('这里的卡片故事，正等待第一张开始。');
  } catch (err) {
    if (!active || request !== requestId || signal.aborted) return;
    const failure = err as { status?: number; message?: string };
    if (!profile.value) error.value = failure.status || 500;
    else {
      retryReset.value = reset;
      // Keep the old collection and page after either a sort or paging failure.
      if (!reset) pages.value = Math.max(pages.value, page.value + 1);
      status.value = t('加载失败，请点击加载更多重试。');
    }
    props.services.toast(failure.message || t('主页加载失败'), 'error');
  } finally {
    if (active && request === requestId) loading.value = false;
  }
}

const offAuth = props.services.onAuth(user => {
  currentUser.value = user;
  modal?.close();
  modal = undefined;
  // liked is viewer-dependent; do not keep one account's state for another.
  profile.value = undefined;
  cards.value = [];
  page.value = 0;
  void load(true);
});
watch(() => props.uid, () => {
  modal?.close();
  modal = undefined;
  profile.value = undefined;
  cards.value = [];
  page.value = 0;
  sort.value = 'latest';
  expanded.value = false;
  void load(true);
}, { immediate: true });
onBeforeUnmount(() => {
  active = false;
  requestId++;
  controller?.abort();
  modal?.close();
  offAuth();
});
</script>

<template>
  <div class="container g-space">
    <div v-if="error && !profile" class="g-error-panel">
      <h1>{{ error === 404 ? t('这个主页暂时无法访问') : t('主页加载失败') }}</h1>
      <p>{{ error === 404 ? t('请检查九位 UID，或到广场发现更多同好。') : t('电波暂时有点杂音，请稍后重试。') }}</p>
      <a class="btn btn-soft" href="/explore" data-link>{{ t('逛逛卡片广场') }}</a>
      <button v-if="error !== 404" class="btn btn-primary" type="button" @click="load(true)">{{ t('重新加载') }}</button>
    </div>
    <template v-else-if="profile">
      <nav class="g-crumbs" :aria-label="t('面包屑')"><a href="/explore" data-link>{{ t('卡片广场') }}</a><span>/</span><span>{{ t('个人主页') }}</span></nav>
      <section class="g-space__hero"><div class="g-space__identity"><AvatarVue3 :user="profile.user" :size="48" /><div>
        <div class="g-space__name"><h1>{{ profile.user.displayName || t('火腿') }}</h1><span v-if="profile.user.callSign" class="g-space__call mono">{{ profile.user.callSign }}</span></div>
        <p id="space-bio" class="g-space__bio" :class="{ 'is-collapsed': collapsible && !expanded }">{{ bio }}</p>
        <button v-if="collapsible" class="g-space__bio-toggle" type="button" :aria-expanded="expanded" aria-controls="space-bio" @click="expanded = !expanded">{{ expanded ? t('收起简介') : t('展开简介') }}</button>
      </div></div></section>
      <section class="g-space__collection" aria-labelledby="space-cards-title">
        <header class="g-space__heading"><div class="g-space__title"><h2 id="space-cards-title">{{ t('公开卡片') }}</h2>
          <div class="g-space__stats"><span><b>{{ profile.user.stats.cards }}</b> {{ t('张公开卡片') }}</span><span><b>{{ profile.user.stats.likesReceived }}</b> {{ t('次喜欢') }}</span></div>
        </div><div class="g-space__controls"><div class="g-space__views" role="group" :aria-label="t('卡片显示模式')">
          <button type="button" :aria-pressed="view === 'grid'" @click="setView('grid')">{{ t('紧凑') }}</button>
          <button type="button" :aria-pressed="view === 'large'" @click="setView('large')">{{ t('大图') }}</button>
        </div><select v-model="sort" class="g-space__sort" :disabled="loading" :aria-label="t('卡片排序')" @change="load(true)">
          <option value="latest">{{ t('最新') }}</option><option value="popular">{{ t('最热') }}</option>
        </select></div></header>
        <div class="g-space__grid" :data-view="view" :aria-busy="loading ? 'true' : undefined">
          <CardTileVue3 v-for="card in cards" :key="card.id" :card="card" :services="services" @liked="liked" />
        </div>
        <p class="g-space__status" role="status">{{ status }}</p>
        <div class="g-space__more"><button v-show="more" class="btn btn-soft" type="button" :disabled="loading" @click="load()">{{ loading ? t('加载中…') : t('加载更多') }}</button></div>
      </section>
      <footer class="g-space__foot"><div class="g-space__meta"><span class="mono">UID {{ profile.user.uid }}</span><span>{{ services.formatDate(profile.user.joinedAt) }} {{ t('加入 QSLink') }}</span></div>
        <div class="g-space__actions"><template v-if="own"><a class="btn btn-ghost" href="/dashboard/profile" data-link>{{ t('编辑资料') }}</a><a class="btn btn-ghost" href="/dashboard" data-link>{{ t('个人中心') }}</a></template>
          <button class="btn btn-primary" type="button" @click="share">{{ t('分享主页') }}</button>
        </div>
      </footer>
    </template>
    <template v-else><p role="status">{{ t('正在接收这位火腿的电波…') }}</p><div class="skeleton skeleton-block" style="height:220px" aria-hidden="true"></div></template>
  </div>
</template>
