<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import type { ApplicationContext, RouteContextVue3 } from '../contracts';
import RoutePage from './RoutePage.vue';
const props = defineProps<{
  platform: ApplicationContext;
  buildContext: (route: RouteLocationNormalizedLoaded) => RouteContextVue3;
  onReady: (context: RouteContextVue3) => void;
}>();
const load = () => import('../pages/Admin.vue');
const route = useRoute();
const allowed = computed(() => props.platform.store.user?.role === 'admin');
const version = ref(0);
let identity = [props.platform.api.token?.(), props.platform.store.user?.id, props.platform.store.user?.role].join(':');
const off = props.platform.on('auth', () => {
  const next = [props.platform.api.token?.(), props.platform.store.user?.id, props.platform.store.user?.role].join(':');
  if (next !== identity) { identity = next; version.value++; }
});
onBeforeUnmount(off);
onMounted(() => { if (!allowed.value) props.onReady(props.buildContext(route)); });
</script>
<template>
  <RoutePage v-if="allowed" :key="version" :platform="platform" :load="load" :build-props="() => ({ platform, ctx: buildContext(route) })" :build-context="buildContext" :on-ready="onReady" />
  <section v-else class="container section route-forbidden">
    <div class="empty-state" style="margin:8vh auto 0">
      <h2>{{ platform.t('没有访问权限') }}</h2>
      <p>{{ platform.t('此页面仅限管理员访问。如需管理权限，请联系站点管理员。') }}</p>
      <a class="btn btn-primary" href="/" data-link>{{ platform.t('返回首页') }}</a>
    </div>
  </section>
</template>
