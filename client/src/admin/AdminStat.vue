<script setup lang="ts">
import { computed } from 'vue';
import { useCountUpVue3 } from '../composables/use-count-up';
import Icon, { type IconNameVue3 } from '../components/Icon.vue';
const props=defineProps<{label:string;value:number;foot?:string;hero?:boolean;tone:string;icon:IconNameVue3;format:(value:number)=>string}>();
const count=useCountUpVue3(computed(()=>props.value),{format:props.format,duration:600});
</script>
<template><article class="stat-card a-stat" :class="['a-tone-'+tone,{'a-stat--hero':hero}]"><div class="stat-label"><span class="stat-icon"><Icon :name="icon" :size="18" /></span><span>{{ label }}</span></div><div class="stat-value" :class="{'fx-count-done':count.done.value}">{{ count.text.value }}</div><div class="stat-foot">{{ foot }}</div></article></template>
