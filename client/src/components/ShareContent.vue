<script setup lang="ts">
import { computed,ref } from 'vue';
import type { CardDetailVue3 } from '../contracts';
import type { SharingService } from '../sharing';
import ResponsiveImage from './ResponsiveImage.vue';
import ShareQr from './ShareQr.vue';
const props = defineProps<{ card: Partial<CardDetailVue3>; title: string; url: string; error: string; contest?: boolean; sharing: SharingService; t: (source: string) => string; images: { image: (img: HTMLImageElement,src:string,width:number)=>void;placeholder:string }; copy: () => void }>();
const emit = defineEmits<{ poster: []; failure:[error:unknown] }>();
const links = computed(() => [
  { name: 'qq', label:'QQ', mark:'QQ', href:'https://connect.qq.com/widget/shareqq/index.html?url='+encodeURIComponent(props.url)+'&title='+encodeURIComponent(props.title) },
  { name: 'x', label:'X', mark:'𝕏', href:'https://twitter.com/intent/tweet?url='+encodeURIComponent(props.url)+'&text='+encodeURIComponent(props.title) },
  { name: 'threads', label:'Threads', mark:'@', href:'https://www.threads.net/intent/post?text='+encodeURIComponent(props.title+' '+props.url) },
]);
const hint=ref('');
function wechat(){props.copy();hint.value=props.t('若未打开微信，请手动打开并粘贴链接，或保存分享图后发送。');}
function nativeShare() { void navigator.share?.({title:props.title,url:props.url}).catch(error=>{if(error.name!=='AbortError')emit('failure',error);}); }
const canShare = typeof navigator.share === 'function';
</script>
<template>
<div class="g-card-share__summary"><div class="g-card-share__card"><ResponsiveImage v-if="card.frontImage" :src="card.frontImage" :alt="t('卡片正面')" :services="images" /><strong>{{ title }}</strong></div><div class="g-card-share__qr"><ShareQr v-if="url" :url="url" :service="sharing" :label="t(contest ? '扫码查看赛事作品详情' : '扫码查看卡片分享页')" /><span>{{ t(url ? '扫码查看 / 分享' : '正在准备二维码…') }}</span></div></div>
<div class="g-card-share__actions"><button type="button" class="btn btn-primary" data-poster @click="emit('poster')">{{ t('生成分享图') }}</button><button type="button" class="btn btn-soft" data-copy @click="copy">{{ t('复制分享链接') }}</button></div>
<input class="input g-card-share__url" readonly :aria-label="t('分享链接')" :value="url" @click="($event.target as HTMLInputElement).select()">
<div v-if="url" class="g-card-share__social" :aria-label="t('分享到社交平台')"><a class="g-card-share__social-link is-wechat" href="weixin://" @click="wechat"><span aria-hidden="true">{{ t('微') }}</span>{{ t('微信') }}</a><a v-for="link in links" :key="link.name" :class="'g-card-share__social-link is-'+link.name" :href="link.href" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">{{ link.mark }}</span>{{ link.label }}</a><button v-if="canShare" type="button" class="g-card-share__social-link" @click="nativeShare">{{ t('更多') }}</button></div>
<p class="g-card-share__hint" role="status">{{ error || hint || t(contest ? '扫码直达赛事作品详情，欣赏设计并参与投票。' : '扫码直达分享页。QQ / 微信需粘贴链接或发送已保存的分享图。') }}</p>
</template>
