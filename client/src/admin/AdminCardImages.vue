<script setup lang="ts">
import type { ApplicationContext } from '../contracts';
import type { AdminCard } from './contracts';
import ResponsiveImage from '../components/ResponsiveImage.vue';
defineProps<{ card: Partial<AdminCard>; platform: ApplicationContext }>();
</script>
<template><div class="a-thumbs"><figure v-for="side in ['frontImage', 'backImage'] as const" :key="side" class="a-thumb" :style="{ '--ar': (card.ratio?.w || 3) + ' / ' + (card.ratio?.h || 2) }"><ResponsiveImage v-if="card[side]" :src="card[side]!" :alt="(card.title || '') + ' ' + platform.t(side === 'frontImage' ? '正面' : '背面')" :services="{ image: platform.images.apply, placeholder: platform.PLACEHOLDER_IMAGE }" /><span v-else class="a-thumb-none">{{ platform.t(side === 'frontImage' ? '卡片已删除' : '无背面') }}</span><figcaption>{{ platform.t(side === 'frontImage' ? '正面' : '背面') }}</figcaption></figure></div></template>
