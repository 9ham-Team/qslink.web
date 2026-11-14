<script setup lang="ts">
import { computed } from 'vue';
import IconVue3 from './Icon.vue';

const props = defineProps<{
  mode: 'login' | 'register';
  t: (source: string, values?: Record<string, unknown>) => string;
}>();

const markGradId = computed(() => (props.mode === 'login' ? 'fLoginMarkGrad' : 'fRegMarkGrad'));
const waveGradId = computed(() => (props.mode === 'login' ? 'fLoginWaveLogin' : 'fRegWaveGrad'));
</script>

<template>
  <aside class="f-auth-visual" :class="{ 'f-auth-visual-reg': mode === 'register' }">
    <div class="f-auth-aurora" aria-hidden="true">
      <span class="f-orb f-orb-1"></span>
      <span class="f-orb f-orb-2"></span>
      <span class="f-orb f-orb-3"></span>
      <span class="f-dots"></span>
    </div>

    <svg class="f-waves" viewBox="0 0 560 560" aria-hidden="true">
      <defs>
        <linearGradient :id="waveGradId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0eaf8f" stop-opacity=".55" />
          <stop offset=".6" stop-color="#38bdf8" stop-opacity=".42" />
          <stop offset="1" stop-color="#8b5cf6" stop-opacity=".16" />
        </linearGradient>
      </defs>
      <g fill="none" :stroke="`url(#${waveGradId})`" stroke-linecap="round">
        <circle class="f-wave-ring f-wave-1" cx="128" cy="132" r="58" stroke-width="1.6" />
        <circle class="f-wave-ring f-wave-2" cx="128" cy="132" r="104" stroke-width="1.4" stroke-dasharray="2 9" />
        <circle class="f-wave-ring f-wave-3" cx="128" cy="132" r="154" stroke-width="1.2" stroke-dasharray="3 12" />
        <circle class="f-wave-ring f-wave-4" cx="128" cy="132" r="208" stroke-width="1" stroke-dasharray="2 16" />
        <path d="M128 132 L128 74" stroke-width="1.6" />
        <path class="f-wave-ping" d="M128 132 L128 74" stroke-width="2.6" />
        <circle cx="128" cy="132" r="4.5" fill="#0eaf8f" stroke="none" />
        <path class="f-wave-line" d="M18 470 Q 128 404 240 470 T 462 470" stroke-width="1.6" />
        <path class="f-wave-line f-wave-line-2" d="M18 502 Q 128 436 240 502 T 462 502" stroke-width="1.2" />
      </g>
    </svg>

    <div class="f-auth-visual-inner">
      <a class="f-brand" href="/" :aria-label="t('QSLink 首页')">
        <span class="f-brand-mark">
          <svg class="f-mark" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
            <defs>
              <linearGradient :id="markGradId" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#0eaf8f" />
                <stop offset=".55" stop-color="#38bdf8" />
                <stop offset="1" stop-color="#8b5cf6" />
              </linearGradient>
            </defs>
            <rect x="5" y="8" width="26" height="19" rx="5" :fill="`url(#${markGradId})`" opacity=".92" />
            <rect x="13" y="15" width="26" height="19" rx="5" fill="#ffffff" opacity=".88" />
            <rect x="13" y="15" width="26" height="19" rx="5" fill="none" :stroke="`url(#${markGradId})`" stroke-width="1.6" opacity=".7" />
            <path d="M18 27.5c2.2-2.6 3.4-4 5.6-4s3.4 1.4 5.6 4" fill="none" stroke="#0eaf8f" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="23.6" cy="20.6" r="1.5" fill="#38bdf8" />
          </svg>
        </span>
        <span class="f-brand-name">QS<em>Link</em></span>
      </a>

      <template v-if="mode === 'login'">
        <span class="f-eyebrow f-eyebrow-light">
          <IconVue3 name="radio" :size="15" /> QSL CARD EXCHANGE
        </span>
        <h1 class="f-visual-title">
          {{ t('让每一次通联，') }}<br>{{ t('都留下') }}<span class="f-grad-text">{{ t('可触摸') }}</span>{{ t('的回响。') }}
        </h1>
        <p class="f-visual-desc">{{ t('上传你的双面 QSL 卡片，以 3D 视角欣赏它；与全球火腿申请换卡，把电波里的相遇寄到彼此手中。') }}</p>
        <ul class="f-visual-points">
          <li><IconVue3 name="cards" :size="18" /><span><b>{{ t('双面卡片') }}</b> {{ t('· 正面背面，3D 立体展示') }}</span></li>
          <li><IconVue3 name="globe" :size="18" /><span><b>{{ t('真实交换') }}</b> {{ t('· 地址仅对达成交换的双方可见') }}</span></li>
          <li><IconVue3 name="shield" :size="18" /><span><b>{{ t('人工审核') }}</b> {{ t('· 让每一张卡片都值得收藏') }}</span></li>
        </ul>
        <div class="f-visual-card" aria-hidden="true">
          <div class="f-mini-card f-mini-front"><span class="f-mini-sign">QSL</span><span class="f-mini-line"></span></div>
          <div class="f-mini-card f-mini-back"><span class="f-mini-back-line"></span><span class="f-mini-back-line short"></span><span class="f-mini-stamp">QSL</span></div>
        </div>
      </template>

      <template v-else>
        <span class="f-eyebrow f-eyebrow-light">
          <IconVue3 name="sparkles" :size="15" /> JOIN THE AIRWAVES
        </span>
        <h1 class="f-visual-title">
          {{ t('把你收到的') }}<br>{{ t('每一份') }}<span class="f-grad-text"> 73 </span>，<br>{{ t('变成看得见的收藏。') }}
        </h1>
        <p class="f-visual-desc">{{ t('创建一个账号只需要一分钟。上传双面 QSL 卡片、等待审核通过，就能在广场被同好发现，并开始交换实体卡片。') }}</p>
        <ol class="f-visual-steps">
          <li><span class="f-step-num">01</span><span><b>{{ t('创建账号') }}</b><small>{{ t('填写呼号，完善资料') }}</small></span></li>
          <li><span class="f-step-num">02</span><span><b>{{ t('上传卡片') }}</b><small>{{ t('正面 · 背面，等待审核') }}</small></span></li>
          <li><span class="f-step-num">03</span><span><b>{{ t('开始换卡') }}</b><small>{{ t('申请 · 同意 · 互寄') }}</small></span></li>
        </ol>
        <div class="f-visual-card f-visual-card-sm" aria-hidden="true">
          <div class="f-mini-card f-mini-front"><span class="f-mini-sign">QSL</span><span class="f-mini-call">BH4XYZ</span><span class="f-mini-line"></span></div>
          <div class="f-mini-card f-mini-back"><span class="f-mini-back-line"></span><span class="f-mini-back-line short"></span><span class="f-mini-stamp">QSL</span></div>
        </div>
      </template>

      <p class="f-visual-foot">
        <IconVue3 name="antenna" :size="15" /> {{ t('73 · 电波永不消逝，卡片永远抵达。') }}
      </p>
    </div>
  </aside>
</template>
