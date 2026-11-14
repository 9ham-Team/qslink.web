<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ContestServicesVue3, WorkVue3 } from '../contracts-vue3';
const props = defineProps<{ work: WorkVue3; services: ContestServicesVue3 }>();
const host = ref<HTMLElement>(); let release: (() => void) | undefined;
function mount() { release?.(); if (host.value) release = props.services.bindShare(host.value, props.work.card, props.work); }
onMounted(mount); watch(() => props.work, mount); onBeforeUnmount(() => release?.());
</script>
<template><span ref="host"></span></template>
