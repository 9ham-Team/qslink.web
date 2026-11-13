<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AvatarVue3 from './Avatar-vue3.vue';
import type { CardVue3, ServicesVue3 } from '../contracts-vue3';
import { usePointerTiltVue3 } from '../composables/use-pointer-tilt-vue3';

const props = defineProps<{ card: CardVue3; services: ServicesVue3 }>();
const emit = defineEmits<{ liked: [id: string, result: { liked: boolean; likeCount: number }] }>();
const image = ref<HTMLImageElement>();
const busy = ref(false);
const heartbeat = ref(false);
let heartbeatTimer = 0;
function resetHeartbeat() { window.clearTimeout(heartbeatTimer); heartbeatTimer = 0; heartbeat.value = false; }
const tile = ref<HTMLElement>();
usePointerTiltVue3(tile);
let active = true;
let generation = 0;
let resize: ResizeObserver | undefined;
function applyImage() {
  if (!image.value) return;
  const width = image.value.clientWidth;
  if (width > 0) props.services.image(image.value, props.card.frontImage || props.services.placeholder, width);
}
onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resize = new ResizeObserver(applyImage);
    resize.observe(image.value!);
  }
  applyImage();
});
watch(() => props.card.frontImage, applyImage);
const offAuth = props.services.onAuth(() => { generation++; busy.value = false; resetHeartbeat(); });
onBeforeUnmount(() => { active = false; generation++; resize?.disconnect(); offAuth(); resetHeartbeat(); });

async function like(event: MouseEvent) {
  if (busy.value) return;
  if (!props.services.user()) {
    props.services.toast(props.services.t('登录后即可点赞收藏'), 'info');
    props.services.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search));
    return;
  }
  busy.value = true;
  resetHeartbeat();
  const request = ++generation;
  try {
    const result = await props.services.likeCard(props.card.id);
    if (active && generation === request) {
      emit('liked', props.card.id, result);
      if (result.liked && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        heartbeat.value = true;
        heartbeatTimer = window.setTimeout(resetHeartbeat, 760);
        props.services.celebrate(event.clientX, event.clientY);
      }
    }
  } catch (err) {
    if (active && generation === request) props.services.toast(err instanceof Error ? err.message : props.services.t('点赞失败'), 'error');
  } finally {
    if (active && generation === request) busy.value = false;
  }
}
</script>

<template>
  <article ref="tile" class="qsl-tile" :data-card-id="card.id" data-tilt>
    <div class="qsl-tile-frame">
      <a class="qsl-tile-media" :href="'/card/' + card.id" data-link :aria-label="card.title || services.t('查看卡片')">
        <span class="qsl-tile-img" :style="{ aspectRatio: (card.ratio?.w || 3) + ' / ' + (card.ratio?.h || 2) }">
          <img ref="image" :alt="card.title || ''" loading="lazy" decoding="async">
        </span>
        <span class="qsl-tile-sheen"></span>
        <span class="qsl-tile-3d"><span>{{ services.t('3D 预览') }}</span></span>
      </a>
      <button class="qsl-like" :class="{ 'is-liked': card.liked, 'fx-heartbeat': heartbeat }" type="button" :disabled="busy"
        :aria-label="services.t('点赞')" :title="services.t('点赞')" @click.stop.prevent="like" @animationend="resetHeartbeat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
        <span class="qsl-like-count">{{ services.formatNumber(card.likeCount || 0) }}</span>
      </button>
    </div>
    <div class="qsl-tile-info">
      <a class="qsl-tile-title" :href="'/card/' + card.id" data-link>{{ card.title || services.t('未命名卡片') }}</a>
      <div class="qsl-tile-meta"><span class="owner-line"><AvatarVue3 :user="card.owner" :size="26" />
        <span class="owner-name">{{ card.owner.displayName || card.owner.username || services.t('未知用户') }}</span>
        <b v-if="card.owner.callSign" class="owner-call">{{ card.owner.callSign }}</b>
      </span></div>
      <p class="hint">{{ card.stock == null ? services.t('库存未设置') : card.stock === 0 ? services.t('暂无库存') : services.t('剩余') + ' ' + card.stock + ' ' + services.t('张') }}</p>
    </div>
  </article>
</template>
