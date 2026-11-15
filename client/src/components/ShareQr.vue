<script setup lang="ts">
import { nextTick,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import type { SharingService } from '../sharing';
const props=defineProps<{url:string;service:SharingService;label:string}>();
const canvas=ref<HTMLCanvasElement>(),error=ref('');
let active=true;
async function draw(){
  error.value='';await nextTick();
  if(!active || !canvas.value || !props.url)return;
  try {
    const source=props.service.qr(props.url,4);
    canvas.value.width=source.width;canvas.value.height=source.height;
    canvas.value.getContext('2d')?.drawImage(source,0,0);
  }catch(err){if(active)error.value=(err as Error).message;}
}
onMounted(draw);watch(()=>props.url,draw);onBeforeUnmount(()=>{active=false;});
</script>
<template><span v-if="error" role="status">{{ error }}</span><canvas v-else ref="canvas" role="img" :aria-label="label"></canvas></template>
