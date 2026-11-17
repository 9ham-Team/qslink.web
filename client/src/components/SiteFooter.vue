<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import type { AppConfigVue3, AuthUserVue3, ApplicationContext } from '../contracts';

const props = defineProps<{
  platform: ApplicationContext;
  user: AuthUserVue3 | null;
  config: AppConfigVue3 | null;
}>();

const t = props.platform.t;
const target = typeof document !== 'undefined' && document.getElementById('site-footer') ? '#site-footer' : null;

const buildText = computed(() => {
  if (typeof props.platform.footerBuildText === 'function') {
    return props.platform.footerBuildText(props.config?.build);
  }
  return t('开发版 · 镜像构建时间未知');
});

onMounted(() => {
  const el = document.getElementById('site-footer');
  if (el) el.dataset.vue3 = 'footer';
});

onBeforeUnmount(() => {
  const el = document.getElementById('site-footer');
  if (el) delete el.dataset.vue3;
});
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="/" data-link>
            <img class="brand-mark" :src="'/assets/logo-mark.svg'" alt="" width="38" height="38" />
            <span class="brand-text"><b>QSLink</b><small>{{ t('QSL 卡片交换站') }}</small></span>
          </a>
          <p>{{ t('收集电波那端的风景，交换一张有温度的卡片。QSLink 为业余无线电爱好者提供 QSL 卡片的展示、点赞与换卡服务。') }}</p>
        </div>

        <div class="footer-col">
          <h4>{{ t('探索') }}</h4>
          <a href="/explore" data-link>{{ t('卡片广场') }}</a>
          <a href="/explore?sort=popular" data-link>{{ t('热门卡片') }}</a>
          <a href="/explore?sort=latest" data-link>{{ t('最新上传') }}</a>
          <a href="/#how-it-works" data-link>{{ t('换卡流程') }}</a>
        </div>

        <div class="footer-col">
          <h4>{{ t('我的') }}</h4>
          <template v-if="user">
            <a href="/dashboard" data-link>{{ t('个人中心') }}</a>
            <a href="/dashboard/cards" data-link>{{ t('我的卡片') }}</a>
            <a href="/dashboard/exchanges" data-link>{{ t('换卡申请') }}</a>
          </template>
          <template v-else>
            <a href="/login" data-link>{{ t('登录账号') }}</a>
            <a href="/register" data-link>{{ t('注册加入') }}</a>
            <a href="/explore" data-link>{{ t('逛逛广场') }}</a>
          </template>
        </div>

        <div class="footer-col">
          <h4>{{ t('关于') }}</h4>
          <a href="/#features" data-link>{{ t('平台特性') }}</a>
          <a href="/#showcase" data-link>{{ t('精选展示') }}</a>
          <a href="/#join" data-link>{{ t('加入我们') }}</a>
          <a href="/#faq" data-link>{{ t('常见问题') }}</a>
          <a href="/legal/terms.html" target="_blank" rel="noopener">{{ t('用户条款') }}</a>
          <a href="/legal/privacy.html" target="_blank" rel="noopener">{{ t('隐私说明') }}</a>
        </div>
      </div>

      <div class="footer-bottom">
        <span>{{ t('© 2026 QSLink · 9ham.net · 联系我们：') }}<a href="mailto:services@9ham.net">services@9ham.net</a></span>
        <div class="footer-signoff">
          <span>{{ t('让每一张 QSL 卡片，都抵达对的人') }} <span class="seventy-three">73!</span></span>
          <small class="footer-build">{{ buildText }}</small>
        </div>
      </div>
    </div>
  </Teleport>
</template>
