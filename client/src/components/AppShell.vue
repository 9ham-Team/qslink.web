<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted } from 'vue';
import { getActivePinia, storeToRefs } from 'pinia';
import { RouterView, useRoute } from 'vue-router';
import type { LegacyQslVue3 } from '../contracts';
import FxBackgroundVue3 from './FxBackground.vue';
import SiteFooterVue3 from './SiteFooter.vue';
import SiteHeaderVue3 from './SiteHeader.vue';
import ToastHostVue3 from './ToastHost.vue';
import { createRuntimeStoreVue3 } from '../state';
import { ROUTER_RUNTIME_VUE3, type RouterRuntimeVue3 } from '../router';

const props = defineProps<{ qsl: LegacyQslVue3 }>();
const route = useRoute();
const pinia = getActivePinia();
if (!pinia) throw new Error('Pinia runtime is unavailable');
const store = createRuntimeStoreVue3(pinia);
const runtime = inject<RouterRuntimeVue3 | null>(ROUTER_RUNTIME_VUE3, null);
const { user, config, accountVersion } = storeToRefs(store);
const currentPath = computed(() => route.path);

let lastUserRefresh = 0;
let offRouteRendered: (() => void) | null = null;
let offRouteBefore: (() => void) | null = null;

function maybeRefreshUser() {
  if (!props.qsl.state.user || typeof location === 'undefined') return;
  if (!location.pathname.startsWith('/dashboard') && !location.pathname.startsWith('/admin')) return;
  const now = Date.now();
  if (now - lastUserRefresh < 4000) return;
  lastUserRefresh = now;
  props.qsl.refreshUser?.().catch(() => {});
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  console.error('[QSL] unhandled rejection:', event.reason);
}

onMounted(() => {
  offRouteBefore = props.qsl.on('route:before', () => {
    props.qsl.i18n?.resetEdits?.();
  });
  offRouteRendered = props.qsl.on('route:rendered', () => {
    maybeRefreshUser();
  });
  window.addEventListener('unhandledrejection', onUnhandledRejection);
});

onBeforeUnmount(() => {
  offRouteBefore?.();
  offRouteRendered?.();
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
});
</script>

<template>
  <FxBackgroundVue3 :qsl="qsl" />
  <SiteHeaderVue3 :qsl="qsl" :user="user" :current-path="currentPath" />
  <Teleport to="#app">
    <RouterView v-slot="{ Component, route: current }">
      <component
        v-if="Component"
        :is="Component"
        :key="current.path + ':' + (runtime?.renderVersion.value || 0) + ':' + accountVersion"
      />
    </RouterView>
  </Teleport>
  <SiteFooterVue3 :qsl="qsl" :user="user" :config="config" />
  <ToastHostVue3 :t="qsl.t" />
</template>
