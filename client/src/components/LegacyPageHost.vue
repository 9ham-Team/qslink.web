<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import type {
  LegacyQslVue3,
  RouteContextVue3,
} from '../contracts';

const props = defineProps<{
  qsl: LegacyQslVue3;
  pageName: string;
  buildContext: (route: RouteLocationNormalizedLoaded) => RouteContextVue3;
  onReady: (context: RouteContextVue3) => void;
}>();

const route = useRoute();
const root = ref<HTMLElement>();
const cleanup = shallowRef<(() => void) | null>(null);
const error = ref('');
let active = true;
let lastReadyPath = '';

function dispose() {
  const fn = cleanup.value;
  cleanup.value = null;
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    console.error('[QSL] legacy page cleanup error:', err);
  }
}

async function renderLegacy() {
  if (!active || !root.value) return;
  dispose();
  error.value = '';
  const context = props.buildContext(route);
  const page = props.qsl.pages?.[props.pageName];
  if (!page || typeof page.render !== 'function') {
    error.value = props.qsl.t('页面模块加载失败');
    return;
  }
  try {
    const result = await page.render(root.value, context);
    if (!active) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup.value = typeof result === 'function' ? result : null;
    await nextTick();
    if (!active || route.fullPath === lastReadyPath) return;
    lastReadyPath = route.fullPath;
    props.onReady(context);
  } catch (err) {
    if (!active) return;
    error.value = err instanceof Error ? err.message : String(err || '');
  }
}

watch(
  () => route.fullPath,
  async () => {
    if (!cleanup.value || !root.value) return;
    lastReadyPath = '';
    await nextTick();
    if (!active) return;
    props.onReady(props.buildContext(route));
  },
);

onMounted(() => { void renderLegacy(); });
onBeforeUnmount(() => {
  active = false;
  dispose();
});
</script>

<template>
  <div ref="root" class="legacy-page-host" />
  <section v-if="error" class="container section route-error">
    <div class="empty-state" style="margin:8vh auto 0">
      <h2>{{ qsl.t('页面加载失败') }}</h2>
      <p>{{ error }}</p>
      <button class="btn btn-primary" type="button" @click="renderLegacy">{{ qsl.t('重试') }}</button>
    </div>
  </section>
</template>
