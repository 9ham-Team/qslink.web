<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AuthUserVue3, ApplicationContext } from '../contracts';
import AvatarVue3 from './Avatar.vue';
import IconVue3 from './Icon.vue';

const CONTEST_PATH = '/events/qsl-design-2026-11';

const props = defineProps<{
  platform: ApplicationContext;
  user: AuthUserVue3 | null;
  currentPath: string;
}>();

const t = props.platform.t;

function isContestRoute(path: string): boolean {
  return (
    path === CONTEST_PATH ||
    path === CONTEST_PATH + '/alternate' ||
    path === CONTEST_PATH + '/registration' ||
    path === CONTEST_PATH + '/works' ||
    path.startsWith(CONTEST_PATH + '/works/')
  );
}

function isContestLinkActive(href: string): boolean {
  return (
    props.currentPath === href ||
    (href === CONTEST_PATH + '/works' && props.currentPath.startsWith(href + '/'))
  );
}

const contestOpen = ref(isContestRoute(props.currentPath));
const userMenuOpen = ref(false);
const mobileMenuOpen = ref(false);
const logoutBusy = ref(false);
const scrolled = ref(false);
const menuAnchorRight = ref('32px');

const desktopPanelRef = ref<HTMLElement>();
const mobilePanelRef = ref<HTMLElement>();
const desktopToggleRef = ref<HTMLButtonElement>();
const mobileToggleRef = ref<HTMLButtonElement>();
const navLinksRef = ref<HTMLElement>();
const navUserRef = ref<HTMLElement>();
const navAvatarBtnRef = ref<HTMLButtonElement>();
const navToggleBtnRef = ref<HTMLButtonElement>();
const navMobileRef = ref<HTMLElement>();

const target = typeof document !== 'undefined' && document.getElementById('site-header') ? '#site-header' : null;
const isAdmin = computed(() => props.user?.role === 'admin');
const isEnglish = computed(() => props.platform.i18n?.language === 'en');
const langLabel = computed(() => (isEnglish.value ? '切换到中文' : 'Switch to English'));
const pendingCount = computed(() => props.user?.stats?.pendingExchanges || 0);
const pendingLabel = computed(() => (pendingCount.value > 99 ? '99+' : String(pendingCount.value)));

const contestLinks = [
  { href: CONTEST_PATH, label: '比赛信息' },
  { href: CONTEST_PATH + '/registration', label: '比赛报名' },
  { href: CONTEST_PATH + '/works', label: '参赛作品' },
];

let lastContestRoute = props.currentPath;
let resizeObserver: ResizeObserver | null = null;
let scrollRaf = 0;

function getHeaderEl(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.getElementById('site-header') : null;
}

function syncHeaderClasses() {
  const el = getHeaderEl();
  if (!el) return;
  el.dataset.vue3 = 'header';
  el.classList.toggle('is-scrolled', scrolled.value);
  el.classList.toggle('is-contest-open', contestOpen.value);
  el.classList.toggle('is-menu-open', mobileMenuOpen.value);
}

function alignContestPanel() {
  const headerEl = getHeaderEl();
  const button = desktopToggleRef.value;
  const panel = desktopPanelRef.value;
  if (!headerEl || !button || !panel || !button.offsetWidth) return;
  const linksEl = panel.querySelector<HTMLElement>('.nav-contest-links');
  if (!linksEl) return;
  const buttonRect = button.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const halfLinksWidth = linksEl.offsetWidth / 2;
  // Optical alignment: move the link group 5px left before applying edge limits.
  const anchor = buttonRect.left + buttonRect.width / 2 - panelRect.left - 5;
  panel.style.setProperty(
    '--contest-anchor',
    Math.max(halfLinksWidth, Math.min(panelRect.width - halfLinksWidth, anchor)) + 'px',
  );
}

function setContestOpen(open: boolean) {
  if (!open && typeof document !== 'undefined') {
    const activeEl = document.activeElement;
    if (desktopPanelRef.value && activeEl && desktopPanelRef.value.contains(activeEl)) {
      desktopToggleRef.value?.focus();
    }
    if (mobilePanelRef.value && activeEl && mobilePanelRef.value.contains(activeEl)) {
      mobileToggleRef.value?.focus();
    }
  }
  contestOpen.value = open;
  syncHeaderClasses();
}

function closeNav() {
  mobileMenuOpen.value = false;
  userMenuOpen.value = false;
  syncHeaderClasses();
}

function onContestToggleClick() {
  const open = !contestOpen.value;
  setContestOpen(open);
  if (open && !isContestRoute(props.currentPath)) {
    props.platform.navigate(CONTEST_PATH);
  }
}

function onContestToggleKeydown(event: KeyboardEvent, mobile: boolean) {
  if (event.key !== 'ArrowDown') return;
  event.preventDefault();
  setContestOpen(true);
  void nextTick(() => {
    const panel = mobile ? mobilePanelRef.value : desktopPanelRef.value;
    panel?.querySelector<HTMLAnchorElement>('a')?.focus();
  });
}

function onLanguageClick() {
  props.platform.i18n?.switchLanguage?.();
}

function onUserBtnClick(event: MouseEvent) {
  event.stopPropagation();
  const btn = navAvatarBtnRef.value;
  const avatar = btn?.querySelector<HTMLElement>('.avatar');
  if (btn && avatar) {
    const buttonRect = btn.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    menuAnchorRight.value = (buttonRect.right - avatarRect.left - avatarRect.width / 2) + 'px';
  }
  userMenuOpen.value = !userMenuOpen.value;
}

function onMobileToggleClick() {
  mobileMenuOpen.value = !mobileMenuOpen.value;
  syncHeaderClasses();
}

async function handleLogout(event: Event) {
  event.preventDefault();
  if (logoutBusy.value) return;
  logoutBusy.value = true;
  const reqToken = props.platform.api.token?.() ?? null;
  const reqUserId = props.platform.store.user?.id ?? null;
  try {
    await props.platform.api.post('/api/auth/logout', {}, { skipAuthClear: true });
  } catch {
    /* 忽略网络错误 */
  } finally {
    logoutBusy.value = false;
  }
  const curToken = props.platform.api.token?.() ?? null;
  const curUserId = props.platform.store.user?.id ?? null;
  if (curToken !== reqToken || curUserId !== reqUserId) return;
  props.platform.api.setToken?.(null);
  props.platform.setUser?.(null);
  props.platform.toast(t('已退出登录，期待下次电波相遇'), 'success');
  props.platform.navigate('/');
}

function onDocumentClick(event: MouseEvent) {
  const node = event.target as HTMLElement | null;
  if (!node) return;
  if (navUserRef.value && !navUserRef.value.contains(node)) {
    userMenuOpen.value = false;
  }
  if (!node.closest('[data-contest-toggle], [data-contest-panel], .nav-toggle')) {
    setContestOpen(false);
  }
  if (!node.closest('.site-header')) {
    closeNav();
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const activeEl = document.activeElement as HTMLElement | null;
  const panel = activeEl?.closest('[data-contest-panel]');
  if (panel) {
    if (panel.id === 'nav-contest-desktop') desktopToggleRef.value?.focus();
    else if (panel.id === 'nav-contest-mobile') mobileToggleRef.value?.focus();
  }
  setContestOpen(false);
  if (navMobileRef.value && activeEl && navMobileRef.value.contains(activeEl)) {
    navToggleBtnRef.value?.focus();
  }
  closeNav();
}

function onWindowScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const next = window.scrollY > 8;
    if (scrolled.value !== next) {
      scrolled.value = next;
      syncHeaderClasses();
    }
  });
}

function setupResizeObserver() {
  if (typeof ResizeObserver !== 'function') return;
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(alignContestPanel);
  const headerEl = getHeaderEl();
  if (!headerEl) return;
  ['.nav-main-row', '.nav-links', '.nav-actions', '.brand', '.nav-links [data-contest-toggle]'].forEach(selector => {
    const el = headerEl.querySelector(selector);
    if (el) resizeObserver?.observe(el);
  });
}

watch(
  () => props.currentPath,
  nextPath => {
    const changed = lastContestRoute !== nextPath;
    lastContestRoute = nextPath;
    if (changed) setContestOpen(isContestRoute(nextPath));
    closeNav();
  },
);

watch(
  () => props.user,
  () => {
    logoutBusy.value = false;
    void nextTick(() => {
      setupResizeObserver();
      alignContestPanel();
    });
  },
);

watch([contestOpen, mobileMenuOpen], syncHeaderClasses);

onMounted(() => {
  scrolled.value = window.scrollY > 8;
  syncHeaderClasses();
  setupResizeObserver();
  alignContestPanel();
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('scroll', onWindowScroll, { passive: true });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (scrollRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
  }
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
  window.removeEventListener('scroll', onWindowScroll);
  const el = getHeaderEl();
  if (el) {
    el.classList.remove('is-scrolled', 'is-contest-open', 'is-menu-open');
    delete el.dataset.vue3;
  }
});
</script>

<template>
  <Teleport v-if="target" :to="target">
    <div class="nav-shell container">
      <div class="nav-main-row">
        <a class="brand" href="/" data-link :aria-label="t('QSLink 首页')">
          <img class="brand-mark" :src="'/assets/logo-mark.svg'" alt="" width="38" height="38" />
          <span class="brand-text">
            <b>QSLink</b>
            <small>{{ t('QSL 卡片交换站') }}</small>
          </span>
        </a>

        <nav ref="navLinksRef" class="nav-links" :aria-label="t('主导航')" @scroll.passive="alignContestPanel">
          <a
            href="/"
            data-link
            :class="{ 'is-active': currentPath === '/' }"
            :aria-current="currentPath === '/' ? 'page' : undefined"
          >
            <IconVue3 name="sparkles" :size="17" /><span>{{ t('首页') }}</span>
          </a>
          <a
            href="/explore"
            data-link
            :class="{ 'is-active': currentPath.startsWith('/explore') }"
            :aria-current="currentPath.startsWith('/explore') ? 'page' : undefined"
          >
            <IconVue3 name="grid" :size="17" /><span>{{ t('卡片广场') }}</span>
          </a>
          <template v-if="user">
            <a
              href="/dashboard/exchanges"
              data-link
              :class="{ 'is-active': currentPath.startsWith('/dashboard/exchanges') }"
              :aria-current="currentPath.startsWith('/dashboard/exchanges') ? 'page' : undefined"
            >
              <IconVue3 name="send" :size="17" /><span>{{ t('换卡申请') }}</span>
            </a>
            <a
              href="/dashboard/logbook"
              data-link
              :class="{ 'is-active': currentPath === '/dashboard/logbook' }"
              :aria-current="currentPath === '/dashboard/logbook' ? 'page' : undefined"
            >
              <IconVue3 name="list" :size="17" /><span>{{ t('通联日志') }}</span>
            </a>
          </template>
          <button
            ref="desktopToggleRef"
            type="button"
            class="nav-contest-toggle"
            :class="{ 'is-active': isContestRoute(currentPath) }"
            data-contest-toggle
            :aria-expanded="contestOpen ? 'true' : 'false'"
            aria-controls="nav-contest-desktop"
            @click="onContestToggleClick"
            @keydown="onContestToggleKeydown($event, false)"
          >
            <IconVue3 name="trophy" :size="17" />
            <span>{{ t('第一届QSLink杯QSL卡片设计大赛') }}</span>
            <IconVue3 name="chevron-down" :size="14" />
          </button>
        </nav>

        <div class="nav-actions">
          <button
            class="btn btn-ghost btn-sm nav-language"
            type="button"
            data-language
            :aria-label="langLabel"
            :title="langLabel"
            @click="onLanguageClick"
          >
            <span :lang="isEnglish ? 'zh-CN' : 'en'">{{ isEnglish ? '中文' : 'EN' }}</span>
          </button>

          <template v-if="user">
            <a class="btn btn-soft btn-sm nav-upload-btn" href="/dashboard/cards/new" data-link>
              <IconVue3 name="plus" :size="16" /><span class="hide-sm">{{ t('上传卡片') }}</span>
            </a>
            <div
              id="nav-user"
              ref="navUserRef"
              class="nav-user dropdown"
              :class="{ 'is-open': userMenuOpen }"
              :style="{ '--nav-menu-anchor-right': menuAnchorRight }"
            >
              <button
                ref="navAvatarBtnRef"
                class="nav-avatar-btn"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="userMenuOpen ? 'true' : 'false'"
                @click="onUserBtnClick"
              >
                <AvatarVue3 :user="user" :size="30" />
                <span class="nav-user-name">{{ user.displayName || user.username }}</span>
                <IconVue3 name="chevron-down" :size="15" />
              </button>
              <div class="nav-user-menu nav-menu" role="menu">
                <div class="nav-menu-head">
                  <AvatarVue3 :user="user" :size="38" />
                  <span class="who">
                    <b>{{ user.displayName || user.username }}</b>
                    <small>{{ user.callSign ? user.callSign : '@' + user.username }}</small>
                  </span>
                </div>
                <a href="/dashboard" data-link :class="{ 'is-active': currentPath === '/dashboard' }" :aria-current="currentPath === '/dashboard' ? 'page' : undefined">
                  <IconVue3 name="layout" :size="17" />{{ t('个人中心') }}
                </a>
                <a href="/dashboard/cards" data-link :class="{ 'is-active': currentPath === '/dashboard/cards' }" :aria-current="currentPath === '/dashboard/cards' ? 'page' : undefined">
                  <IconVue3 name="cards" :size="17" />{{ t('我的卡片') }}
                </a>
                <a href="/dashboard/exchanges" data-link :class="{ 'is-active': currentPath === '/dashboard/exchanges' }" :aria-current="currentPath === '/dashboard/exchanges' ? 'page' : undefined">
                  <IconVue3 name="send" :size="17" />{{ t('换卡申请') }}
                  <span v-if="pendingCount > 0" class="nav-badge" :title="t('待处理的换卡申请')">{{ pendingLabel }}</span>
                </a>
                <a href="/dashboard/logbook" data-link :class="{ 'is-active': currentPath === '/dashboard/logbook' }" :aria-current="currentPath === '/dashboard/logbook' ? 'page' : undefined">
                  <IconVue3 name="list" :size="17" />{{ t('通联日志') }}
                </a>
                <a :href="CONTEST_PATH" data-link class="nav-contest" :class="{ 'is-active': currentPath === CONTEST_PATH }" :aria-current="currentPath === CONTEST_PATH ? 'page' : undefined">
                  <IconVue3 name="trophy" :size="17" /><span>{{ t('第一届QSLink杯QSL卡片设计大赛') }}</span>
                </a>
                <a href="/dashboard/profile" data-link :class="{ 'is-active': currentPath === '/dashboard/profile' }" :aria-current="currentPath === '/dashboard/profile' ? 'page' : undefined">
                  <IconVue3 name="user" :size="17" />{{ t('个人资料') }}
                </a>
                <template v-if="isAdmin">
                  <div class="menu-sep"></div>
                  <a class="menu-admin" href="/admin" data-link :class="{ 'is-active': currentPath === '/admin' }" :aria-current="currentPath === '/admin' ? 'page' : undefined">
                    <IconVue3 name="shield" :size="17" />{{ t('管理后台') }}
                  </a>
                </template>
                <div class="menu-sep"></div>
                <button type="button" class="menu-danger" data-logout :disabled="logoutBusy" @click="handleLogout">
                  <IconVue3 name="logout" :size="17" />{{ t('退出登录') }}
                </button>
              </div>
            </div>
          </template>

          <div v-else class="nav-guest">
            <a class="btn btn-ghost btn-sm" href="/login" data-link>{{ t('登录') }}</a>
            <a class="btn btn-primary btn-sm" href="/register" data-link>{{ t('免费注册') }}</a>
          </div>
        </div>

        <button
          ref="navToggleBtnRef"
          class="nav-toggle"
          type="button"
          :aria-label="t('打开菜单')"
          :aria-expanded="mobileMenuOpen ? 'true' : 'false'"
          @click="onMobileToggleClick"
        >
          <IconVue3 name="menu" :size="21" />
        </button>
      </div>

      <div
        id="nav-contest-desktop"
        ref="desktopPanelRef"
        class="nav-contest-panel"
        data-contest-panel
        :inert="!contestOpen || undefined"
        :aria-hidden="contestOpen ? 'false' : 'true'"
      >
        <div class="nav-contest-clip">
          <nav class="nav-contest-links" :aria-label="t('第一届QSLink杯QSL卡片设计大赛')">
            <a
              v-for="link in contestLinks"
              :key="link.href"
              :href="link.href"
              data-link
              :class="{ 'is-active': isContestLinkActive(link.href) }"
              :aria-current="isContestLinkActive(link.href) ? 'page' : undefined"
            >
              {{ t(link.label) }}
            </a>
          </nav>
        </div>
      </div>
    </div>

    <div
      id="nav-mobile"
      ref="navMobileRef"
      class="nav-mobile"
      :class="{ 'is-open': mobileMenuOpen }"
      :inert="!mobileMenuOpen || undefined"
      :aria-hidden="mobileMenuOpen ? 'false' : 'true'"
    >
      <a href="/" data-link :class="{ 'is-active': currentPath === '/' }" :aria-current="currentPath === '/' ? 'page' : undefined">
        <IconVue3 name="sparkles" :size="18" />{{ t('首页') }}
      </a>
      <a href="/explore" data-link :class="{ 'is-active': currentPath.startsWith('/explore') }" :aria-current="currentPath.startsWith('/explore') ? 'page' : undefined">
        <IconVue3 name="grid" :size="18" />{{ t('卡片广场') }}
      </a>

      <template v-if="user">
        <a href="/dashboard" data-link :class="{ 'is-active': currentPath === '/dashboard' }" :aria-current="currentPath === '/dashboard' ? 'page' : undefined">
          <IconVue3 name="layout" :size="18" />{{ t('个人中心') }}
        </a>
        <a href="/dashboard/cards" data-link :class="{ 'is-active': currentPath === '/dashboard/cards' }" :aria-current="currentPath === '/dashboard/cards' ? 'page' : undefined">
          <IconVue3 name="cards" :size="18" />{{ t('我的卡片') }}
        </a>
        <a href="/dashboard/exchanges" data-link :class="{ 'is-active': currentPath === '/dashboard/exchanges' }" :aria-current="currentPath === '/dashboard/exchanges' ? 'page' : undefined">
          <IconVue3 name="send" :size="18" />{{ t('换卡申请') }}
          <span v-if="pendingCount > 0" class="nav-badge" :title="t('待处理的换卡申请')">{{ pendingLabel }}</span>
        </a>
        <a href="/dashboard/logbook" data-link :class="{ 'is-active': currentPath === '/dashboard/logbook' }" :aria-current="currentPath === '/dashboard/logbook' ? 'page' : undefined">
          <IconVue3 name="list" :size="18" />{{ t('通联日志') }}
        </a>

        <div class="nav-contest-group">
          <button
            ref="mobileToggleRef"
            type="button"
            class="nav-contest-toggle"
            :class="{ 'is-active': isContestRoute(currentPath) }"
            data-contest-toggle
            :aria-expanded="contestOpen ? 'true' : 'false'"
            aria-controls="nav-contest-mobile"
            @click="onContestToggleClick"
            @keydown="onContestToggleKeydown($event, true)"
          >
            <IconVue3 name="trophy" :size="18" />
            <span>{{ t('第一届QSLink杯QSL卡片设计大赛') }}</span>
            <IconVue3 name="chevron-down" :size="14" />
          </button>
          <div
            id="nav-contest-mobile"
            ref="mobilePanelRef"
            class="nav-contest-panel"
            data-contest-panel
            :inert="!contestOpen || undefined"
            :aria-hidden="contestOpen ? 'false' : 'true'"
          >
            <div class="nav-contest-clip">
              <nav class="nav-contest-links" :aria-label="t('第一届QSLink杯QSL卡片设计大赛')">
                <a
                  v-for="link in contestLinks"
                  :key="link.href"
                  :href="link.href"
                  data-link
                  :class="{ 'is-active': isContestLinkActive(link.href) }"
                  :aria-current="isContestLinkActive(link.href) ? 'page' : undefined"
                >
                  {{ t(link.label) }}
                </a>
              </nav>
            </div>
          </div>
        </div>

        <a href="/dashboard/profile" data-link :class="{ 'is-active': currentPath === '/dashboard/profile' }" :aria-current="currentPath === '/dashboard/profile' ? 'page' : undefined">
          <IconVue3 name="user" :size="18" />{{ t('个人资料') }}
        </a>
        <a v-if="isAdmin" href="/admin" data-link :class="{ 'is-active': currentPath === '/admin' }" :aria-current="currentPath === '/admin' ? 'page' : undefined">
          <IconVue3 name="shield" :size="18" />{{ t('管理后台') }}
        </a>
        <button type="button" class="btn btn-ghost btn-block" data-logout :disabled="logoutBusy" @click="handleLogout">
          <IconVue3 name="logout" :size="18" />{{ t('退出登录') }}
        </button>
      </template>

      <template v-else>
        <div class="nav-contest-group">
          <button
            ref="mobileToggleRef"
            type="button"
            class="nav-contest-toggle"
            :class="{ 'is-active': isContestRoute(currentPath) }"
            data-contest-toggle
            :aria-expanded="contestOpen ? 'true' : 'false'"
            aria-controls="nav-contest-mobile"
            @click="onContestToggleClick"
            @keydown="onContestToggleKeydown($event, true)"
          >
            <IconVue3 name="trophy" :size="18" />
            <span>{{ t('第一届QSLink杯QSL卡片设计大赛') }}</span>
            <IconVue3 name="chevron-down" :size="14" />
          </button>
          <div
            id="nav-contest-mobile"
            ref="mobilePanelRef"
            class="nav-contest-panel"
            data-contest-panel
            :inert="!contestOpen || undefined"
            :aria-hidden="contestOpen ? 'false' : 'true'"
          >
            <div class="nav-contest-clip">
              <nav class="nav-contest-links" :aria-label="t('第一届QSLink杯QSL卡片设计大赛')">
                <a
                  v-for="link in contestLinks"
                  :key="link.href"
                  :href="link.href"
                  data-link
                  :class="{ 'is-active': isContestLinkActive(link.href) }"
                  :aria-current="isContestLinkActive(link.href) ? 'page' : undefined"
                >
                  {{ t(link.label) }}
                </a>
              </nav>
            </div>
          </div>
        </div>
        <a href="/login" data-link :class="{ 'is-active': currentPath === '/login' }" :aria-current="currentPath === '/login' ? 'page' : undefined">
          <IconVue3 name="log-in" :size="18" />{{ t('登录') }}
        </a>
      </template>
    </div>
  </Teleport>
</template>
