<script setup lang="ts">
import type { LegacyQslVue3 } from '../contracts';

defineProps<{ qsl: LegacyQslVue3 }>();
</script>

<template>
  <section class="container section route-notfound">
    <div class="empty-state" style="margin:8vh auto 0">
      <div class="empty-state-emoji">404</div>
      <h2>{{ qsl.t('这里没有信号') }}</h2>
      <p>{{ qsl.t('你访问的页面不存在，或卡片已被移除。') }}</p>
      <a class="btn btn-primary" href="/" data-link>{{ qsl.t('返回首页') }}</a>
    </div>
  </section>
</template>
