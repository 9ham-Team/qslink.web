<script setup lang="ts">
import { ref } from 'vue';
import AvatarVue3 from '../../components/Avatar-vue3.vue';
import ResponsiveImageVue3 from '../../components/ResponsiveImage-vue3.vue';
import { usePointerTiltVue3 } from '../../composables/use-pointer-tilt-vue3';
import { contestPathVue3, type ContestServicesVue3, type WorkVue3 } from '../contracts-vue3';
const props = defineProps<{ work: WorkVue3; services: ContestServicesVue3 }>();
const tile = ref<HTMLElement>(); usePointerTiltVue3(tile);
const href = contestPathVue3 + '/works/' + encodeURIComponent(props.work.id);
</script>
<template><article ref="tile" class="qsl-tile" data-tilt :data-work-id="work.id"><div class="qsl-tile-frame">
  <a class="qsl-tile-media" :href="href" data-link :aria-label="work.card.title"><span class="qsl-tile-img" :style="{ aspectRatio: (work.card.ratio?.w || 3) + '/' + (work.card.ratio?.h || 2) }"><ResponsiveImageVue3 :src="work.card.frontImage || ''" :alt="work.card.title" :services="services" /></span><span class="qsl-tile-sheen"></span><span class="qsl-tile-3d">{{ services.t('3D 预览') }}</span></a>
  <span class="g-contest-votes" :aria-label="services.t('{n} 票', { n: work.voteCount })">{{ services.t('{n} 票', { n: work.voteCount }) }}</span>
  </div><div class="qsl-tile-info"><a class="qsl-tile-title" :href="href" data-link>{{ work.card.title || services.t('未命名卡片') }}</a>
  <div class="qsl-tile-meta"><span class="owner-line"><AvatarVue3 :user="work.card.owner" :size="26" /><span class="owner-name">{{ work.card.owner.displayName || work.card.owner.username }}</span><b class="owner-call">{{ work.card.owner.callSign }}</b></span></div>
  <div class="g-contest-work"><strong>{{ services.t('作品编号：{n}', { n: String(work.number).padStart(3, '0') }) }}</strong><details v-if="work.description"><summary>{{ services.t('作品说明') }}</summary><p>{{ work.description }}</p></details><p v-else class="hint">{{ services.t('作品说明审核通过后展示，不影响图片展示与投票。') }}</p></div>
</div></article></template>
