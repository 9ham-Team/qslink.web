<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CardDetailServicesVue3, CardDetailVue3 } from '../contracts';

const props = defineProps<{
  card: CardDetailVue3;
  services: CardDetailServicesVue3;
  isOwner: boolean;
  userKey: string;
}>();

const host = ref<HTMLElement>();
let release: (() => void) | undefined;

function cleanup() {
  if (release) {
    try { release(); } catch { /* Ignore cleanup errors from third-party/legacy DOM. */ }
    release = undefined;
  }
  host.value?.replaceChildren();
}

function mountShare() {
  cleanup();
  if (!host.value) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost';
  btn.type = 'button';
  btn.setAttribute('data-share', '');
  btn.setAttribute('aria-label', props.services.t('复制分享链接'));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [cx, cy] of [['18', '5'], ['6', '12'], ['18', '19']]) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', '3');
    svg.appendChild(circle);
  }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8.6 10.6l6.8-4.2M8.6 13.4l6.8 4.2');
  svg.appendChild(path);

  const label = document.createElement('span');
  if (!props.isOwner) label.className = 'hide-sm';
  label.textContent = props.services.t('分享');

  btn.append(svg, label);
  host.value.appendChild(btn);
  release = props.services.bindShare(btn, props.card);
}

onMounted(mountShare);

watch(
  [
    () => props.card.id,
    () => props.card.shareToken,
    () => props.card.canShare,
    () => props.card.title,
    () => props.card.callSign,
    () => props.card.frontImage,
    () => props.card.ratio?.w,
    () => props.card.ratio?.h,
    () => props.card.owner?.callSign,
    () => props.isOwner,
    () => props.userKey,
  ],
  mountShare,
);

onBeforeUnmount(cleanup);
</script>

<template>
  <span ref="host" class="g-card-share-island-vue3" style="display:contents"></span>
</template>
