<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import type {
  LegacyQslVue3,
  RouteContextVue3,
} from '../contracts';
import LegacyPageHostVue3 from './LegacyPageHost.vue';

const props = defineProps<{
  qsl: LegacyQslVue3;
  buildContext: (route: RouteLocationNormalizedLoaded) => RouteContextVue3;
  onReady: (context: RouteContextVue3) => void;
}>();

const route = useRoute();
const allowed = computed(() => props.qsl.state.user?.role === 'admin');
onMounted(() => {
  if (!allowed.value) props.onReady(props.buildContext(route));
});
</script>

<template>
  <LegacyPageHostVue3
    v-if="allowed"
    :qsl="qsl"
    page-name="admin"
    :build-context="buildContext"
    :on-ready="onReady"
  />
  <section v-else class="container section route-forbidden">
    <div class="empty-state" style="margin:8vh auto 0">
      <h2>{{ qsl.t('没有访问权限') }}</h2>
      <p>{{ qsl.t('此页面仅限管理员访问。如需管理权限，请联系站点管理员。') }}</p>
      <a class="btn btn-primary" href="/" data-link>{{ qsl.t('返回首页') }}</a>
    </div>
  </section>
</template>
