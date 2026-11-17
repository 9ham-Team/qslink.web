<script setup lang="ts">
import type { CardDetailServicesVue3, CardDetailVue3 } from '../contracts';
import CardShareControl from './CardShareControl.vue';
defineProps<{ card:CardDetailVue3;services:CardDetailServicesVue3;isOwner:boolean;userKey:string }>();
</script>
<template><CardShareControl :card="card" :sharing="services.sharing" :t="services.t" :image="services.image" :placeholder="services.placeholder" :copy-text="services.copyText" :toast="services.toast" :is-owner="isOwner" :user-key="userKey" /></template>
