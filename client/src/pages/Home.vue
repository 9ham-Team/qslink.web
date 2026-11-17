<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Card3DViewerVue3 from '../components/Card3DViewer.vue';
import CardTileVue3 from '../components/CardTile.vue';
import HomeAnnouncementsVue3 from '../components/HomeAnnouncements.vue';
import IconVue3, { type IconNameVue3 } from '../components/Icon.vue';
import { useCountUpVue3 } from '../composables/use-count-up';
import { useMagneticVue3 } from '../composables/use-magnetic';
import { useScrollRevealVue3 } from '../composables/use-scroll-reveal';
import type { CardVue3, HomeServicesVue3 } from '../contracts';

const props = defineProps<{ services: HomeServicesVue3 }>();
const t = props.services.t;

const rootEl = ref<HTMLElement>();
const heroCta = ref<HTMLElement>();
const howCta = ref<HTMLElement>();
const joinCta = ref<HTMLElement>();

const reveal = useScrollRevealVue3(rootEl);
useMagneticVue3(heroCta, 10);
useMagneticVue3(howCta, 8);
useMagneticVue3(joinCta, 8);

const currentUser = shallowRef(props.services.user());
const cards = ref<CardVue3[]>([]);
const cardsTotal = ref(0);
const cardsLoading = ref(true);
const cardsLoaded = ref(false);
const cardsError = ref(false);
const userCount = ref<number | null>(null);

const joinImg0 = ref<HTMLImageElement>();
const joinImg1 = ref<HTMLImageElement>();

const heroViewerOptions = {
  width: 470,
  autoRotateSpeed: 4.5,
  idleDelay: 2400,
  initialYaw: -24,
  initialPitch: 6,
  showControls: false,
  initialSide: 'front',
  ambient: true,
};

const hero = computed(() => {
  if (!cards.value.length) return null;
  return cards.value.find(card => !!card.frontImage) || cards.value[0] || null;
});
const heroFront = computed(() => hero.value?.frontImage || '');
const heroBack = computed(() => hero.value?.backImage || '');
const heroRatio = computed(() => hero.value?.ratio || { w: 104, h: 154 });
const heroAriaLabel = computed(() => {
  if (!hero.value) return t('QSL 卡片 3D 展示');
  const call = hero.value.owner?.callSign ? '（' + hero.value.owner.callSign + '）' : '';
  return t('QSL 卡片 3D 展示：') + (hero.value.title || t('QSL 卡片')) + call;
});
const heroOwnerLabel = computed(() => {
  if (!hero.value) return t('呼号');
  const owner = hero.value.owner;
  return owner?.callSign || owner?.displayName || owner?.username || 'HAM';
});

const showcaseCards = computed(() => {
  if (!hero.value) return [];
  const featured = cards.value.filter(card => card.id !== hero.value!.id).slice(0, 8);
  return featured.length >= 4 ? featured : cards.value.slice(0, 8);
});

const likesTotal = computed(() =>
  cards.value.reduce((sum, card) => sum + (Number(card.likeCount) || 0), 0),
);
const cardsTarget = computed(() => (cardsLoaded.value && !cardsError.value ? cardsTotal.value : null));
const usersTarget = computed(() => userCount.value);
const likesTarget = computed(() => (cardsLoaded.value && !cardsError.value ? likesTotal.value : null));

const cardsCount = useCountUpVue3(cardsTarget, { format: n => props.services.formatNumber(n), duration: 900 });
const usersCount = useCountUpVue3(usersTarget, { format: n => String(n), duration: 900 });
const likesCount = useCountUpVue3(likesTarget, { format: n => props.services.formatNumber(n), duration: 900 });

const cardsStatText = computed(() =>
  cardsLoaded.value && !cardsError.value ? props.services.formatNumber(cardsTotal.value) : '—',
);

const joinImageSources = computed(() => {
  const withImages = cards.value.filter(card => !!card.frontImage);
  if (!withImages.length) return ['', ''];
  return [
    withImages[0]?.frontImage || '',
    (withImages[1] || withImages[0])?.frontImage || '',
  ];
});

function applyJoinImages() {
  const [src0, src1] = joinImageSources.value;
  if (joinImg0.value) {
    if (src0) props.services.image(joinImg0.value, src0, joinImg0.value.clientWidth || 240);
    else joinImg0.value.src = props.services.placeholder;
  }
  if (joinImg1.value) {
    if (src1) props.services.image(joinImg1.value, src1, joinImg1.value.clientWidth || 240);
    else joinImg1.value.src = props.services.placeholder;
  }
}

watch(joinImageSources, () => {
  void nextTick().then(() => {
    if (active) applyJoinImages();
  });
});

const features: { icon: IconNameVue3; tone: string; title: string; desc: string }[] = [
  {
    icon: '3d',
    tone: '',
    title: '真正的 3D 展示',
    desc: '拖拽旋转、双击翻面，卡片的厚度、金属与全息光泽随指尖流动，像把收藏捧在手心。',
  },
  {
    icon: 'send',
    tone: 'sky',
    title: '双向换卡申请',
    desc: '在线发起换卡、留言与填写邮寄地址；对方同意后才交换地址，流程清晰又安心。',
  },
  {
    icon: 'shield',
    tone: 'violet',
    title: '人工审核与隐私',
    desc: '每张卡片都经过人工审核，拒绝垃圾内容；地址仅在双方达成交换后可见，守护信任。',
  },
  {
    icon: 'share',
    tone: 'amber',
    title: '一枚链接即可分享',
    desc: '自动生成公开分享页，无需登录也能欣赏 3D 卡片，让好作品抵达更远的地方。',
  },
];

const steps = [
  {
    title: '上传双面卡片',
    href: '/dashboard/cards/new',
    desc: '准备卡片的正反面图片，写下这张卡片背后的故事，让它在 3D 中立体呈现。',
    badge: '',
    badgeTone: '',
  },
  {
    title: '等待人工审核',
    href: '/dashboard/cards?status=pending',
    desc: '管理员会检查卡片内容；通过后亮相卡片广场，被更多火腿发现与点赞。',
    badge: '人工审核',
    badgeTone: 'badge-amber',
  },
  {
    title: '发起换卡申请',
    href: '/explore',
    desc: '在喜欢的卡片下申请换卡，留下地址与想说的话，等待对方回应。',
    badge: '',
    badgeTone: '',
  },
  {
    title: '互寄，完成交换',
    href: '/dashboard/exchanges',
    desc: '双方同意后即可查看地址、邮寄卡片，在电波之外留下可触的纪念。',
    badge: '73!',
    badgeTone: 'badge-mint',
  },
];

const faqs = [
  {
    q: '什么是 QSL 卡片？',
    a: 'QSL 卡片是业余无线电爱好者用于确认通联的纸质卡片，通常记录双方呼号、通联时间与信号报告等信息。它既是通联凭证，也是一张可以交换与收藏的「电波明信片」。',
  },
  {
    q: '上传卡片需要审核吗？',
    a: '需要。为了让广场保持干净与可信，每张新上传的卡片都会进入人工审核队列；通过后才会公开展示。审核中的卡片仅你自己可见，可以随时编辑补充内容。',
  },
  {
    q: '换卡时我的地址会公开吗？',
    a: '不会。地址只会在换卡申请被同意后，对参与交换的双方可见；申请中、被拒绝或取消时都不会展示。请放心填写准确的收件信息，以便顺利寄卡。',
  },
  {
    q: '可以把卡片分享给朋友吗？',
    a: '可以。每张卡片都有独立的分享链接，朋友无需登录即可通过 3D 查看器欣赏；他们也可以注册账号，回过头来向你申请换卡。',
  },
  {
    q: 'QSLink 收费吗？',
    a: '不收费。QSLink 由业余无线电爱好者共同建设与维护，用于展示、收藏与交换 QSL 卡片。你只需要注册一个账号，就可以免费使用全部功能。',
  },
];

const faqExpanded = ref<boolean[]>(faqs.map((_, i) => i === 0));
const faqAnimations = new Map<number, Animation>();

function toggleFaq(index: number, event: MouseEvent) {
  const summary = event.currentTarget as HTMLElement | null;
  const item = summary?.closest('details') as HTMLDetailsElement | null;
  if (!item || typeof item.animate !== 'function') {
    faqExpanded.value[index] = item ? !item.open : !faqExpanded.value[index];
    return;
  }
  event.preventDefault();
  const startHeight = item.getBoundingClientRect().height;
  const running = faqAnimations.get(index);
  if (running) running.cancel();
  const nextExpanded = !faqExpanded.value[index];
  faqExpanded.value[index] = nextExpanded;
  item.style.height = '';

  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    item.open = nextExpanded;
    faqAnimations.delete(index);
    return;
  }

  item.open = nextExpanded;
  const endHeight = item.getBoundingClientRect().height;
  item.open = true;
  const animation = item.animate(
    [{ height: startHeight + 'px' }, { height: endHeight + 'px' }],
    { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  faqAnimations.set(index, animation);
  animation.onfinish = () => {
    item.open = nextExpanded;
    faqAnimations.delete(index);
  };
}

let active = true;
let cardsGeneration = 0;
let statsGeneration = 0;
let cardsController: AbortController | null = null;
let statsController: AbortController | null = null;
let hashFrame = 0;

function scheduleHashScroll() {
  cancelAnimationFrame(hashFrame);
  hashFrame = requestAnimationFrame(() => {
    hashFrame = 0;
    if (active) props.services.scrollToHash();
  });
}

async function loadData(alignHash = false) {
  const gen = ++cardsGeneration;
  cardsController?.abort();
  cardsController = new AbortController();
  cardsLoading.value = true;
  cardsError.value = false;
  try {
    const res = await props.services.getHomeCards(cardsController.signal);
    if (!active || gen !== cardsGeneration) return;
    const items = res.items || [];
    cards.value = items;
    cardsTotal.value = res.total || items.length;
    cardsLoaded.value = true;
    void nextTick().then(() => {
      if (active) reveal.scan();
    });
  } catch (err) {
    if (!active || gen !== cardsGeneration) return;
    if ((err as Error)?.name === 'AbortError') return;
    cards.value = [];
    cardsTotal.value = 0;
    cardsError.value = true;
    props.services.toast((err as Error)?.message || t('卡片加载失败，请稍后重试'), 'error');
  } finally {
    if (active && gen === cardsGeneration) {
      cardsLoading.value = false;
      if (alignHash) scheduleHashScroll();
    }
  }
}

async function loadUserCount() {
  const gen = ++statsGeneration;
  statsController?.abort();
  statsController = new AbortController();
  try {
    const res = await props.services.getStats(statsController.signal);
    if (!active || gen !== statsGeneration) return;
    if (res && Number.isInteger(res.userCount) && res.userCount >= 0) {
      userCount.value = res.userCount;
    }
  } catch {
    // Keep the unknown count as a dash; stats failures must not block cards.
  }
}

function onCardLiked(id: string, result: { liked: boolean; likeCount: number }) {
  cards.value = cards.value.map(card =>
    card.id === id ? { ...card, liked: result.liked, likeCount: result.likeCount } : card,
  );
}

function openFirstUpload() {
  const user = props.services.user();
  props.services.navigate(user ? '/dashboard/cards/new' : '/login?next=' + encodeURIComponent('/dashboard/cards/new'));
}

const offAuth = props.services.onAuth(user => {
  currentUser.value = user;
  void loadData();
});

onMounted(() => {
  applyJoinImages();
  void loadUserCount();
  void loadData(true);
});

onBeforeUnmount(() => {
  active = false;
  cardsGeneration++;
  statsGeneration++;
  offAuth();
  cardsController?.abort();
  statsController?.abort();
  cancelAnimationFrame(hashFrame);
  faqAnimations.forEach(animation => animation.cancel());
  faqAnimations.clear();
});
</script>

<template>
  <div ref="rootEl" class="g-home">
    <section class="g-hero">
      <div class="g-hero__bg" aria-hidden="true"></div>
      <div class="container g-hero__grid">
        <div class="g-hero__copy">
          <p class="eyebrow" data-vue-reveal>{{ t('QSL CARD EXCHANGE · 业余无线电') }}</p>
          <h1 class="g-hero__title" data-vue-reveal data-vue-reveal-delay="60">
            {{ t('让每一张 QSL 卡片') }}<br>{{ t('在指尖') }}<span class="g-hero__title-em">{{ t('立体发光') }}</span>
          </h1>
          <p class="g-hero__lede" data-vue-reveal data-vue-reveal-delay="120">
            {{ t('上传你的双面 QSL 卡片，生成可翻转的 3D 展示；和电波那端的火腿点赞、交换，让每一次通联都有迹可循。') }}
          </p>
          <div class="g-hero__actions" data-vue-reveal data-vue-reveal-delay="180">
            <a ref="heroCta" class="btn btn-primary btn-lg" :href="currentUser ? '/dashboard/cards/new' : '/register'" data-link data-magnetic="10">
              {{ currentUser ? t('上传我的卡片') : t('开始交换') }}<IconVue3 name="arrow-right" :size="18" />
            </a>
            <a class="btn btn-ghost btn-lg" :href="currentUser ? '/dashboard' : '/explore'" data-link>
              <IconVue3 name="grid" :size="17" />
              <span>{{ currentUser ? t('进入个人中心') : t('逛逛卡片广场') }}</span>
            </a>
          </div>
          <p class="g-hero__trust" data-vue-reveal data-vue-reveal-delay="220">
            <IconVue3 name="check-circle" :size="15" />
            <span>{{ t('已收录') }} <b>{{ cardsCount.text.value }}</b> {{ t('张 QSL 卡片 · 地址只在双方同意后可见') }}</span>
          </p>
          <dl class="g-hero__stats" data-vue-reveal data-vue-reveal-delay="260">
            <div class="g-stat">
              <dt>{{ t('收录卡片') }}</dt>
              <dd><span :class="{ 'fx-count-done': cardsCount.done.value }">{{ cardsCount.text.value }}</span><small>{{ t('张') }}</small></dd>
            </div>
            <div class="g-stat">
              <dt>{{ t('用户数') }}</dt>
              <dd><span :class="{ 'fx-count-done': usersCount.done.value }">{{ usersCount.text.value }}</span><small>{{ t('位') }}</small></dd>
            </div>
            <div class="g-stat">
              <dt>{{ t('累计点赞') }}</dt>
              <dd><span :class="{ 'fx-count-done': likesCount.done.value }">{{ likesCount.text.value }}</span><small>{{ t('次') }}</small></dd>
            </div>
          </dl>
        </div>

        <div class="g-hero__stage">
          <img class="g-hero__ornament" :src="'/assets/hero-ornament.svg'" alt="" aria-hidden="true" width="600" height="600" loading="lazy">
          <span class="g-hero__glow" aria-hidden="true"></span>
          <span class="g-hero__orbit g-hero__orbit--a" aria-hidden="true"></span>
          <span class="g-hero__orbit g-hero__orbit--b" aria-hidden="true"></span>
          <Card3DViewerVue3
            class="g-hero__stage-mount"
            :front="heroFront"
            :back="heroBack"
            :ratio="heroRatio"
            :create="services.createViewer"
            :options="heroViewerOptions"
            :aria-label="heroAriaLabel"
          />
          <span class="g-float-tag g-float-tag--band" data-g-tag="type">
            <IconVue3 name="3d" :size="15" /><span>QSL · 3D</span>
          </span>
          <span class="g-float-tag g-float-tag--like" data-g-tag="like">
            <IconVue3 name="heart" :size="15" />
            <b>{{ hero ? services.formatNumber(hero.likeCount || 0) : '—' }}</b>
            <span>{{ t('次点赞') }}</span>
          </span>
          <span class="g-float-tag g-float-tag--owner" data-g-tag="owner">
            <IconVue3 name="user" :size="14" />
            <span>{{ heroOwnerLabel }}</span>
          </span>
          <span class="g-float-tag g-float-tag--73">73!</span>
          <span class="g-hero__spark g-hero__spark--a" aria-hidden="true"><IconVue3 name="sparkles" :size="20" /></span>
          <span class="g-hero__spark g-hero__spark--b" aria-hidden="true"><IconVue3 name="sparkles" :size="16" /></span>
          <span class="g-hero__spark g-hero__spark--c" aria-hidden="true"><IconVue3 name="sparkles" :size="13" /></span>
          <p class="g-hero__hint">{{ t('拖拽旋转 · 双击翻面') }}</p>
        </div>
      </div>
    </section>

    <HomeAnnouncementsVue3 :services="services" />

    <section id="showcase" class="section g-showcase">
      <div class="container">
        <div class="g-sec-head" data-vue-reveal>
          <div>
            <p class="eyebrow">SHOWCASE</p>
            <h2 class="g-sec-title">{{ t('近期精选卡片') }}</h2>
            <p class="g-sec-desc">{{ t('来自各地火腿的 QSL 卡片，每一张都记录着一次跨越电波的相遇。') }}</p>
          </div>
          <a class="g-sec-link" href="/explore" data-link>{{ t('查看全部') }}<IconVue3 name="arrow-right" :size="16" /></a>
        </div>

        <div
          class="g-showcase__grid"
          :class="{
            'is-3': !cardsError && showcaseCards.length > 0 && showcaseCards.length <= 6,
            'is-2': !cardsError && showcaseCards.length > 0 && showcaseCards.length <= 2,
          }"
          aria-live="polite"
        >
          <template v-if="cardsLoading && !cardsLoaded && !cardsError">
            <div v-for="i in 8" :key="'skeleton-' + i" class="g-skeleton-card">
              <div class="g-skeleton g-skeleton-media"></div>
              <div class="g-skeleton g-skeleton-line" style="width:70%"></div>
              <div class="g-skeleton g-skeleton-line" style="width:46%"></div>
            </div>
          </template>

          <div v-else-if="cardsError" class="g-empty-wrap">
            <div class="g-error-panel">
              <span class="empty-state-icon"><IconVue3 name="alert" :size="30" /></span>
              <h3>{{ t('卡片加载失败') }}</h3>
              <p>{{ t('电波暂时有点杂音，请稍后重试。你仍然可以先去卡片广场看看。') }}</p>
              <div class="btn-group">
                <button class="btn btn-primary" type="button" data-retry @click="loadData()">{{ t('重新加载') }}</button>
                <a class="btn btn-ghost" href="/explore" data-link>{{ t('前往广场') }}</a>
              </div>
            </div>
          </div>

          <div v-else-if="cardsLoaded && !cards.length" class="g-empty-wrap">
            <div class="empty-state">
              <div class="empty-state-icon"><IconVue3 name="cards" :size="32" /></div>
              <h3 class="empty-state-title">{{ t('广场还在等第一张卡片') }}</h3>
              <p class="empty-state-desc">{{ t('成为第一个分享 QSL 卡片的人吧，让你的通联纪念被更多火腿看见。') }}</p>
              <button class="btn btn-primary" type="button" @click="openFirstUpload">{{ t('上传我的第一张卡片') }}</button>
            </div>
          </div>

          <template v-else>
            <CardTileVue3
              v-for="(card, i) in showcaseCards"
              :key="card.id"
              :card="card"
              :services="services"
              data-vue-reveal
              :data-vue-reveal-delay="Math.min(i * 60, 420)"
              @liked="onCardLiked"
            />
          </template>
        </div>
      </div>
    </section>

    <section id="features" class="section g-features">
      <div class="container">
        <div class="g-sec-head g-sec-head--center" data-vue-reveal>
          <p class="eyebrow">WHY QSLINK</p>
          <h2 class="g-sec-title">{{ t('为 QSL 收藏而生的细节') }}</h2>
          <p class="g-sec-desc">{{ t('从展示到交换，每个环节都认真对待 —— 就像你对待每一张卡片那样。') }}</p>
        </div>
        <div class="g-features__grid">
          <article
            v-for="(item, i) in features"
            :key="item.title"
            class="g-feature"
            :class="item.tone ? 'g-feature--' + item.tone : ''"
            data-vue-reveal
            :data-vue-reveal-delay="i * 80"
          >
            <span class="g-feature__icon"><IconVue3 :name="item.icon" :size="24" /></span>
            <h3>{{ t(item.title) }}</h3>
            <p>{{ t(item.desc) }}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="how-it-works" class="section g-how">
      <div class="container g-how__grid">
        <div class="g-how__intro" data-vue-reveal>
          <p class="eyebrow">HOW IT WORKS</p>
          <h2 class="g-sec-title">{{ t('四步，让一张卡片') }}<br>{{ t('完成一次旅行') }}</h2>
          <p>{{ t('从上传到互寄，QSLink 把换卡流程变得清晰可循；你只需要专注于挑选那张想交换的卡片。') }}</p>
          <a ref="howCta" class="btn btn-primary" href="/register" data-link data-magnetic="8">
            <IconVue3 name="arrow-right" :size="17" /><span>{{ t('免费开始') }}</span>
          </a>
        </div>
        <ol class="g-steps">
          <li v-for="(step, i) in steps" :key="step.href" class="g-step" data-vue-reveal :data-vue-reveal-delay="i * 70">
            <span class="g-step__no">{{ String(i + 1).padStart(2, '0') }}</span>
            <div class="g-step__body">
              <h3>
                <a class="g-step__link" :href="step.href" data-link>
                  {{ t(step.title) }}
                  <span v-if="step.badge" class="badge" :class="step.badgeTone">{{ step.badge === '73!' ? '73!' : t(step.badge) }}</span>
                </a>
              </h3>
              <p>{{ t(step.desc) }}</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section id="faq" class="section g-faq">
      <div class="container g-faq__layout">
        <div class="g-how__intro" data-vue-reveal>
          <p class="eyebrow">FAQ</p>
          <h2 class="g-sec-title">{{ t('关于换卡，') }}<br>{{ t('你可能想知道') }}</h2>
          <p>{{ t('还有其它疑问？欢迎在卡片留言里找到我们，或者在换卡申请中直接询问卡片的主人。') }}</p>
        </div>
        <div class="g-faq__list">
          <details
            v-for="(item, i) in faqs"
            :key="item.q"
            class="g-faq__item"
            :open="i === 0"
            :data-expanded="String(faqExpanded[i])"
            data-vue-reveal
            :data-vue-reveal-delay="i * 50"
          >
            <summary @click="toggleFaq(i, $event)">{{ t(item.q) }}</summary>
            <p class="g-faq__answer">{{ t(item.a) }}</p>
          </details>
        </div>
      </div>
    </section>

    <section id="join" class="section g-join">
      <div class="container">
        <div class="g-join__panel" data-vue-reveal>
          <div class="g-join__copy">
            <p class="eyebrow">JOIN THE AIRWAVE</p>
            <h2 class="g-join__title">{{ t('下一张被收藏的卡片，') }}<br>{{ t('也许就是你的') }}</h2>
            <p class="g-join__desc">{{ t('把抽屉里的 QSL 卡片分享给更多火腿，让它从一次私人的通联纪念，变成一段被看见的故事。') }}</p>
            <div class="g-join__actions">
              <a ref="joinCta" class="btn btn-primary btn-lg" :href="currentUser ? '/dashboard/cards/new' : '/register'" data-link data-magnetic="8">
                {{ currentUser ? t('上传一张新卡片') : t('免费注册') }}<IconVue3 name="arrow-right" :size="17" />
              </a>
              <a class="btn btn-ghost btn-lg" href="/explore" data-link>
                {{ currentUser ? t('发现更多卡片') : t('先逛逛广场') }}
              </a>
            </div>
          </div>
          <div class="g-join__art" data-g-art aria-hidden="true">
            <figure class="g-join__card g-join__card--back">
              <img ref="joinImg0" :src="services.placeholder" alt="" loading="lazy">
            </figure>
            <figure class="g-join__card g-join__card--front">
              <img ref="joinImg1" :src="services.placeholder" alt="" loading="lazy">
            </figure>
            <span class="g-hero__spark g-hero__spark--a"><IconVue3 name="sparkles" :size="18" /></span>
            <span class="g-hero__spark g-hero__spark--b"><IconVue3 name="sparkles" :size="14" /></span>
            <span class="g-hero__spark g-hero__spark--c"><IconVue3 name="sparkles" :size="12" /></span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
