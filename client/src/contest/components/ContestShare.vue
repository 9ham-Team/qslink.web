<script setup lang="ts">
import type { ContestServicesVue3,WorkVue3 } from '../contracts';
import CardShareControl from '../../components/CardShareControl.vue';
defineProps<{ work:WorkVue3;services:ContestServicesVue3 }>();
</script>
<template><CardShareControl :card="work.card" :work="work" :sharing="services.sharing" :t="services.t" :image="services.image" :placeholder="services.placeholder" :copy-text="services.copyText" :toast="services.toast" :user-key="services.user()?.uid || 'guest'" /></template>
