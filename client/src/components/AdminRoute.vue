<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import type { LegacyQslVue3, RouteContextVue3 } from '../contracts';
import RoutePage from './RoutePage.vue';
const props = defineProps<{
  qsl: LegacyQslVue3;
  buildContext: (route: RouteLocationNormalizedLoaded) => RouteContextVue3;
  onReady: (context: RouteContextVue3) => void;
}>();
const load = () => import('../pages/Admin.vue');
const route = useRoute();
const allowed = computed(() => props.qsl.state.user?.role === 'admin');
const version = ref(0);
let identity = [props.qsl.api.token?.(), props.qsl.state.user?.id, props.qsl.state.user?.role].join(':');
const off = props.qsl.on('auth', () => {
  const next = [props.qsl.api.token?.(), props.qsl.state.user?.id, props.qsl.state.user?.role].join(':');
  if (next !== identity) { identity = next; version.value++; }
});
onBeforeUnmount(off);
onMounted(() => { if (!allowed.value) props.onReady(props.buildContext(route)); });
</script>
<template>
  <RoutePage v-if="allowed" :key="version" :qsl="qsl" :load="load" :build-props="() => ({ qsl, ctx: buildContext(route) })" :build-context="buildContext" :on-ready="onReady" />
  <section v-else class="container section route-forbidden">
    <div class="empty-state" style="margin:8vh auto 0">
      <h2>{{ qsl.t('没有访问权限') }}</h2>
      <p>{{ qsl.t('此页面仅限管理员访问。如需管理权限，请联系站点管理员。') }}</p>
      <a class="btn btn-primary" href="/" data-link>{{ qsl.t('返回首页') }}</a>
    </div>
  </section>
</template>
