<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Component,
} from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import type {
  LegacyQslVue3,
  RouteContextVue3,
} from '../contracts';

export type RoutePageScopeVue3 = Record<string, unknown>;
export type RoutePagePropsVue3 = (
  route: RouteLocationNormalizedLoaded,
  qsl: LegacyQslVue3,
  scope: RoutePageScopeVue3,
) => Record<string, unknown>;

const props = defineProps<{
  qsl: LegacyQslVue3;
  load: () => Promise<{ default: Component }>;
  buildProps: RoutePagePropsVue3;
  buildContext: (
    route: RouteLocationNormalizedLoaded,
    qsl: LegacyQslVue3,
    scope: RoutePageScopeVue3,
  ) => RouteContextVue3;
  onReady: (context: RouteContextVue3) => void;
}>();

const route = useRoute();
const page = shallowRef<Component | null>(null);
const error = ref('');
const scope: RoutePageScopeVue3 = {};
let active = true;
let generation = 0;
let lastReadyPath = '';

const pageProps = computed(() => props.buildProps(route, props.qsl, scope));

function context(): RouteContextVue3 {
  return props.buildContext(route, props.qsl, scope);
}

function ready() {
  if (!active || !page.value || !route.matched.length || route.fullPath === lastReadyPath) return;
  lastReadyPath = route.fullPath;
  props.onReady(context());
}

async function loadPage() {
  const task = ++generation;
  error.value = '';
  try {
    const module = await props.load();
    if (!active || task !== generation) return;
    page.value = module.default;
    ready();
  } catch (err) {
    if (!active || task !== generation) return;
    error.value = err instanceof Error ? err.message : String(err || '');
    await nextTick();
    if (active) props.onReady(context());
  }
}

watch(
  () => route.fullPath,
  () => {
    if (!page.value) return;
    lastReadyPath = '';
    ready();
  },
);

onMounted(() => { void loadPage(); });
onBeforeUnmount(() => {
  active = false;
  generation += 1;
  page.value = null;
});
</script>

<template>
  <component :is="page" v-if="page" v-bind="pageProps" />
  <section v-else-if="error" class="container section route-error">
    <div class="empty-state" style="margin:8vh auto 0">
      <h2>{{ qsl.t('页面加载失败') }}</h2>
      <p>{{ error }}</p>
      <button class="btn btn-primary" type="button" @click="loadPage">{{ qsl.t('重试') }}</button>
      <a class="btn btn-ghost" href="/" data-link>{{ qsl.t('返回首页') }}</a>
    </div>
  </section>
  <section v-else class="container section route-placeholder" role="status">
    <div class="skeleton skeleton-title" style="width:min(320px,60%)"></div>
    <div class="skeleton skeleton-block" style="height:220px;margin-top:24px;border-radius:24px"></div>
  </section>
</template>
