<script setup lang="ts">
import type { LegacyQslVue3 } from '../contracts';
import type { AdminCard } from './contracts';
import ResponsiveImage from '../components/ResponsiveImage.vue';
defineProps<{ card: Partial<AdminCard>; qsl: LegacyQslVue3 }>();
</script>
<template><div class="a-thumbs"><figure v-for="side in ['frontImage', 'backImage'] as const" :key="side" class="a-thumb" :style="{ '--ar': (card.ratio?.w || 3) + ' / ' + (card.ratio?.h || 2) }"><ResponsiveImage v-if="card[side]" :src="card[side]!" :alt="(card.title || '') + ' ' + qsl.t(side === 'frontImage' ? '正面' : '背面')" :services="{ image: qsl.images.apply, placeholder: qsl.PLACEHOLDER_IMAGE }" /><span v-else class="a-thumb-none">{{ qsl.t(side === 'frontImage' ? '卡片已删除' : '无背面') }}</span><figcaption>{{ qsl.t(side === 'frontImage' ? '正面' : '背面') }}</figcaption></figure></div></template>
