<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { CardDetailVue3 } from '../contracts';
import type { SharingService, ShareWork } from '../sharing';
import ShareContent from './ShareContent.vue';
import PosterPreview from './PosterPreview.vue';
import Dialog from './Dialog.vue';
import Icon from './Icon.vue';
const props = defineProps<{
  card: Partial<CardDetailVue3>; work?: ShareWork; sharing: SharingService; t:(source:string,values?:Record<string,unknown>)=>string;
  image:(img:HTMLImageElement,src:string,width:number)=>void; placeholder:string; copyText:(url:string,message:string)=>Promise<unknown>;
  toast:(message:string,type:string)=>void; isOwner?:boolean; userKey:string;
}>();
const root=ref<HTMLElement>(),button=ref<HTMLButtonElement>(),panel=ref<HTMLElement>();
const opened=ref(false),visible=ref(false),dialog=ref(false),poster=ref(false),url=ref(''),error=ref('');
const panelId=useId();
const title=computed(()=>props.work ? props.t('参赛作品 {n}：{title}',{n:String(props.work.number).padStart(3,'0'),title:props.card.title || props.t('未命名卡片')}) : props.card.title || props.t('QSL 卡片'));
const imageServices=computed(()=>({image:props.image,placeholder:props.placeholder}));
let scope=new AbortController(),generation=0,active=true,promise:Promise<string>|undefined;
let enterTimer:ReturnType<typeof setTimeout>,leaveTimer:ReturnType<typeof setTimeout>,hideTimer:ReturnType<typeof setTimeout>;
let pointerInside=false;
function desktop(){return window.matchMedia('(hover: hover) and (pointer: fine)').matches;}
function fail(err:unknown){if(active && (err as Error).name!=='AbortError'){error.value=(err as Error).message || props.t('分享失败，请重试');props.toast(error.value,'error');}}
async function prepare():Promise<string>{
  if(!active || scope.signal.aborted)throw new DOMException("Cancelled","AbortError");
  if(promise)return promise;
  const gen=generation,signal=scope.signal;
  promise=props.sharing.getUrl(props.card,props.work,signal).then(value=>{
    if(!active || gen!==generation || signal.aborted)throw new DOMException('Cancelled','AbortError');
    url.value=value;return value;
  }).catch(err=>{if(gen===generation)promise=undefined;throw err;});
  return promise;
}
async function copy(){try{const value=await prepare();if(active)await props.copyText(value,props.t('分享链接已复制，快发给朋友吧'));}catch(err){fail(err);}}
function place(){
  if(!panel.value || !button.value || !opened.value)return;
  const rect=button.value.getBoundingClientRect(),head=document.getElementById('site-header');
  const top=Math.max(12,head ? head.getBoundingClientRect().bottom+8:12),above=Math.max(0,rect.top-top),below=Math.max(0,innerHeight-rect.bottom-12);
  panel.value.style.maxHeight='none';
  const upwards=above>=panel.value.offsetHeight || above>below;
  panel.value.style.maxHeight=Math.max(80,upwards?above:below)+'px';
  panel.value.style.setProperty('--g-share-offset',upwards?'8px':'-8px');
  panel.value.style.top=(upwards?rect.top-panel.value.offsetHeight:rect.bottom)+'px';
  panel.value.style.left=Math.max(12,Math.min(rect.right-panel.value.offsetWidth,innerWidth-panel.value.offsetWidth-12))+'px';
}
function open(value:boolean){
  if(!active)return;
  clearTimeout(enterTimer);clearTimeout(hideTimer);opened.value=value;
  if(value){visible.value=true;void prepare().then(()=>nextTick(place)).catch(fail);void nextTick(place);}
  else hideTimer=setTimeout(()=>{visible.value=false;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);
}
function enter(event?:PointerEvent){clearTimeout(enterTimer);pointerInside=true;clearTimeout(leaveTimer);if(event?.pointerType==='mouse' && desktop())enterTimer=setTimeout(()=>open(true),100);}
function leave(){pointerInside=false;clearTimeout(enterTimer);leaveTimer=setTimeout(()=>{if(!pointerInside)open(false);},220);}
function inside(node:EventTarget|null){return node instanceof Node && !!(root.value?.contains(node)||panel.value?.contains(node));}
function focusOut(event:FocusEvent){if(!pointerInside && !inside(event.relatedTarget))open(false);}
function keyboard(event:KeyboardEvent){if(event.key==='Escape'){open(false);button.value?.focus();}if(event.key==='ArrowDown' && event.target===button.value){event.preventDefault();open(true);void nextTick(()=>panel.value?.querySelector('button')?.focus());}}
function click(event:MouseEvent){if(!props.work && desktop() && (event as PointerEvent).pointerType!=='touch')void copy();else{dialog.value=true;void prepare().catch(fail);}}
function showPoster(){open(false);dialog.value=false;poster.value=true;}
function reset(){generation++;scope.abort();scope=new AbortController();clearTimeout(enterTimer);clearTimeout(leaveTimer);clearTimeout(hideTimer);opened.value=visible.value=dialog.value=poster.value=false;url.value=error.value='';promise=undefined;}
watch(()=>JSON.stringify([props.card.id,props.card.shareToken,props.card.canShare,props.card.title,props.card.callSign,props.card.frontImage,props.card.ratio?.w,props.card.ratio?.h,props.card.owner?.callSign,props.userKey,props.isOwner,props.work?.id,props.work?.number,props.work?.description]),reset);
const listeners=new AbortController();
onMounted(()=>{
  document.addEventListener('pointerdown',event=>{if(opened.value&&!inside(event.target))open(false);},{signal:listeners.signal});
  window.addEventListener('resize',place,{signal:listeners.signal});
  window.addEventListener('scroll',place,{signal:listeners.signal,passive:true});
});
onBeforeUnmount(()=>{active=false;reset();listeners.abort();});
</script>
<template>
<span ref="root" class="g-card-share" @pointerenter="enter" @pointerleave="leave" @focusout="focusOut" @keydown="keyboard">
<button ref="button" type="button" class="btn" :class="work?'btn-soft':'btn-ghost'" data-share :aria-label="t(work?'分享作品':'分享卡片')" :aria-expanded="opened || dialog" :aria-controls="panelId" :title="t('点击复制链接，悬浮或按方向下键查看分享选项；触屏点击打开分享弹窗')" @click="click"><Icon name="share" :size="17" /><span :class="{'hide-sm':!isOwner&&!work}">{{ t(work?'分享作品':'分享') }}</span></button>
</span>
<Teleport to="body"><div v-show="visible" :id="panelId" ref="panel" class="g-card-share__panel" :class="{'is-open':opened}" :inert="!opened" :hidden="!visible" @pointerenter="enter()" @pointerleave="leave" @focusout="focusOut" @keydown="keyboard"><ShareContent v-if="visible" :card="card" :title="title" :url="url" :error="error" :contest="!!work" :sharing="sharing" :t="t" :images="imageServices" :copy="copy" @poster="showPoster" @failure="fail" /></div></Teleport>
<Dialog v-if="dialog" :title="t(work?'分享参赛作品':'分享这张卡片')" :t="t" modal-class="g-card-share-modal" overlay-class="g-card-share-overlay" viewport-fit @close="dialog=false"><div class="g-card-share__dialog"><ShareContent :card="card" :title="title" :url="url" :error="error" :contest="!!work" :sharing="sharing" :t="t" :images="imageServices" :copy="copy" @poster="showPoster" @failure="fail" /></div></Dialog>
<PosterPreview v-if="poster" :card="card" :work="work" :title="title" :url="prepare" :sharing="sharing" :t="t" @close="poster=false" />
</template>
