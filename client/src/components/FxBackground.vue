<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { ApplicationContext } from '../contracts';

const props = defineProps<{ platform: ApplicationContext }>();

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  vy: number;
  sway: number;
  phase: number;
  sprite: number;
}

const TAU = Math.PI * 2;
const canvasRef = ref<HTMLCanvasElement>();
const target = typeof document !== 'undefined' && document.getElementById('fx-layer') ? '#fx-layer' : null;

let active = true;
let running = false;
let rafId = 0;
let lastTs = 0;
let dpr = 1;
let width = 0;
let height = 0;
let ctx: CanvasRenderingContext2D | null = null;
let sprites: HTMLCanvasElement[] | null = null;
let particles: Particle[] = [];
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

let mqReduce: MediaQueryList | null = null;
let mqCardScene: MediaQueryList | null = null;
let offRouteRendered: (() => void) | null = null;
let offRouteAfter: (() => void) | null = null;
let appObserver: MutationObserver | null = null;
let sceneSyncScheduled = false;
let lastHasCard3d: boolean | null = null;

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

function isReducedMotion(): boolean {
  return !!(mqReduce && mqReduce.matches);
}

function isStaticCardScene(): boolean {
  return !!(mqCardScene && mqCardScene.matches && typeof document !== 'undefined' && document.querySelector('.card3d'));
}

function makeSprites(): HTMLCanvasElement[] {
  const colors = [[14, 175, 143], [56, 189, 248], [251, 113, 133]];
  return colors.map(rgb => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g) return c;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const base = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    grad.addColorStop(0, 'rgba(' + base + ',0.85)');
    grad.addColorStop(0.35, 'rgba(' + base + ',0.28)');
    grad.addColorStop(1, 'rgba(' + base + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  });
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  width = Math.max(1, window.innerWidth || 1);
  height = Math.max(1, window.innerHeight || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx = ctx || canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seedParticles() {
  const count = width < 620 ? 10 : width < 1080 ? 16 : 24;
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 12 + Math.random() * 22,
      alpha: 0.1 + Math.random() * 0.22,
      vy: 0.05 + Math.random() * 0.14,
      sway: 0.25 + Math.random() * 0.55,
      phase: Math.random() * TAU,
      sprite: i % 3,
    });
  }
  particles = list;
}

function stopBackground() {
  running = false;
  if (rafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId);
  }
  rafId = 0;
}

function tickParticles(ts: number) {
  if (!active || !running || !ctx || !sprites) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(tickParticles);
  const dt = lastTs ? Math.min(48, ts - lastTs) : 16.7;
  lastTs = ts;
  const k = dt / 16.7;
  const t = ts * 0.001;
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += Math.sin(t * p.sway + p.phase) * 0.12 * k;
    p.y -= p.vy * k;
    if (p.y < -48) { p.y = height + 48; p.x = Math.random() * width; }
    if (p.x < -48) p.x = width + 48;
    else if (p.x > width + 48) p.x = -48;
    ctx.globalAlpha = p.alpha * (0.72 + 0.28 * Math.sin(t * 0.55 + p.phase));
    ctx.drawImage(sprites[p.sprite], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function syncBackground() {
  if (!active) return;
  lastHasCard3d = typeof document !== 'undefined' && !!document.querySelector('.card3d');
  const layer = document.getElementById('fx-layer');
  const cardScene = isStaticCardScene();
  if (layer) layer.classList.toggle('is-static-card-scene', cardScene);
  if (isReducedMotion() || document.hidden || cardScene) {
    stopBackground();
    return;
  }
  if (running) return;
  const canvas = canvasRef.value;
  if (!canvas || typeof canvas.getContext !== 'function') return;
  try {
    ctx = ctx || canvas.getContext('2d');
    if (!ctx) return;
    sprites = sprites || makeSprites();
    resizeCanvas();
    seedParticles();
    running = true;
    lastTs = 0;
    if (!rafId && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(tickParticles);
    }
  } catch {
    running = false;
  }
}

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    if (!active) return;
    syncBackground();
    if (!running) return;
    try {
      resizeCanvas();
      seedParticles();
    } catch { /* ignore */ }
  }, 180);
}

function onVisibilityChange() {
  if (document.hidden) stopBackground();
  else syncBackground();
}

function scheduleSceneSync() {
  if (!active || sceneSyncScheduled) return;
  sceneSyncScheduled = true;
  queueMicrotask(() => {
    sceneSyncScheduled = false;
    if (!active) return;
    const hasCard3d = typeof document !== 'undefined' && !!document.querySelector('.card3d');
    if (hasCard3d !== lastHasCard3d) {
      syncBackground();
    }
  });
}

onMounted(() => {
  const layer = document.getElementById('fx-layer');
  if (layer) layer.dataset.vue3 = 'fx';

  try {
    if (typeof window.matchMedia === 'function') {
      mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      mqCardScene = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
      mqReduce.addEventListener?.('change', syncBackground);
      mqCardScene.addEventListener?.('change', syncBackground);
    }
  } catch { /* ignore */ }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  offRouteRendered = props.platform.on('route:rendered', syncBackground);
  offRouteAfter = props.platform.on('route:after', syncBackground);

  const appEl = document.getElementById('app');
  if (appEl && typeof MutationObserver === 'function') {
    appObserver = new MutationObserver(scheduleSceneSync);
    appObserver.observe(appEl, { childList: true, subtree: true });
  }

  syncBackground();
});

onBeforeUnmount(() => {
  active = false;
  stopBackground();
  if (resizeTimer) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  mqReduce?.removeEventListener?.('change', syncBackground);
  mqCardScene?.removeEventListener?.('change', syncBackground);
  offRouteRendered?.();
  offRouteAfter?.();
  if (appObserver) {
    appObserver.disconnect();
    appObserver = null;
  }
  const layer = document.getElementById('fx-layer');
  if (layer) {
    layer.classList.remove('is-static-card-scene');
    delete layer.dataset.vue3;
  }
});
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div class="fx-aurora fx-aurora-a"></div>
    <div class="fx-aurora fx-aurora-b"></div>
    <div class="fx-grid"></div>
    <div class="fx-orb fx-orb-a"></div>
    <div class="fx-orb fx-orb-b"></div>
    <div class="fx-orb fx-orb-c"></div>
    <canvas ref="canvasRef" class="fx-particles" aria-hidden="true"></canvas>
    <div class="fx-vignette"></div>
  </Teleport>
</template>
