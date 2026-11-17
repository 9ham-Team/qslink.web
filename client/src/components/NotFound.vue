<script setup lang="ts">
import type { ApplicationContext } from '../contracts';

defineProps<{ platform: ApplicationContext }>();
</script>

<template>
  <section class="container section route-notfound">
    <div class="empty-state" style="margin:8vh auto 0">
      <div class="empty-state-emoji">404</div>
      <h2>{{ platform.t('这里没有信号') }}</h2>
      <p>{{ platform.t('你访问的页面不存在，或卡片已被移除。') }}</p>
      <a class="btn btn-primary" href="/" data-link>{{ platform.t('返回首页') }}</a>
    </div>
  </section>
</template>
