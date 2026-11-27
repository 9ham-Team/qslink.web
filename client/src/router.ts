import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type Component,
  type InjectionKey,
  type Ref,
} from 'vue';
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalizedLoaded,
  type RouteRecordRaw,
  type Router,
} from 'vue-router';
import AdminRouteVue3 from './components/AdminRoute.vue';
import NotFoundVue3 from './components/NotFound.vue';
import RoutePageVue3, {
  type RoutePagePropsVue3,
  type RoutePageScopeVue3,
} from './components/RoutePage.vue';
import type {
  ApplicationContext,
  RouteContextVue3,
} from './contracts';
import { createExploreVisitVue3 } from './explore-memory';
import {
  createAccountServicesVue3,
  createAuthServicesVue3,
  createCardDetailServicesVue3,
  createCardManageServicesVue3,
  createExchangeServicesVue3,
  createHomeServicesVue3,
  createLogbookServicesVue3,
  createServicesVue3,
} from './services';
import { createContestServicesVue3 } from './contest/services';
import type { ContestRuntime } from './contest/contracts';
import type { RuntimeStoreVue3 } from './state';

type NavigationKindVue3 = RouteContextVue3['navigation'];
type LoadedPageVue3 = () => Promise<{ default: Component }>;

export const ROUTER_RUNTIME_VUE3: InjectionKey<RouterRuntimeVue3> = Symbol('qsl-router-runtime');

export interface RouterRuntimeVue3 {
  router: Router;
  renderVersion: Ref<number>;
  currentNavigation: Ref<NavigationKindVue3>;
  fromPath: Ref<string | null>;
  requestedNavigation: NavigationKindVue3 | null;
  skipNextScroll: boolean;
  leaveGuard: ((context: { type: 'navigate' | 'pop'; to: string }) => boolean | Promise<boolean>) | null;
  navigationVersion: number;
  lastHistoryPosition: number | null;
  hashCleanup: (() => void) | null;
  clickCleanup: (() => void) | null;
  markRendered(context: RouteContextVue3): Promise<void>;
  context(route: RouteLocationNormalizedLoaded): RouteContextVue3;
  navigationKind(): NavigationKindVue3;
  scrollToHash(): boolean;
  dispose(): void;
}

function paramsFromRouteVue3(route: RouteLocationNormalizedLoaded): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.params)) {
    params[key] = Array.isArray(value) ? value[0] || '' : String(value || '');
  }
  return params;
}

function queryFromRouteVue3(route: RouteLocationNormalizedLoaded): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(route.query)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value !== null && value !== undefined) query.append(key, String(value));
    }
  }
  return query;
}

function contextFromRouteVue3(
  route: RouteLocationNormalizedLoaded,
  navigation: NavigationKindVue3,
  fromPath: string | null,
): RouteContextVue3 {
  return {
    path: route.path,
    params: paramsFromRouteVue3(route),
    query: queryFromRouteVue3(route),
    hash: route.hash,
    fromPath,
    navigation,
  };
}

function cachedVue3<T>(
  scope: RoutePageScopeVue3,
  key: string,
  create: () => T,
): T {
  if (!(key in scope)) scope[key] = create();
  return scope[key] as T;
}

function pageComponentVue3(
  platform: ApplicationContext,
  runtime: RouterRuntimeVue3,
  load: LoadedPageVue3,
  buildProps: RoutePagePropsVue3,
) {
  return defineComponent({
    name: 'QslRoutePageVue3',
    setup() {
      return () => h(RoutePageVue3, {
        platform,
        load,
        buildProps,
        buildContext: (route: RouteLocationNormalizedLoaded) => runtime.context(route),
        onReady: (context: RouteContextVue3) => { void runtime.markRendered(context); },
      });
    },
  });
}

function pageRecordVue3(
  platform: ApplicationContext,
  runtime: RouterRuntimeVue3,
  path: string,
  name: string,
  title: string,
  load: LoadedPageVue3,
  buildProps: RoutePagePropsVue3,
  meta: RouteRecordRaw['meta'] = {},
): RouteRecordRaw {
  const dataName = name === 'share-short'
    ? 'share'
    : name === 'qsl-design-contest-alternate'
      ? 'qsl-design-contest'
    : name === 'card-editor-new' || name === 'card-editor-edit'
      ? 'card-editor'
      : name;
  return {
    path,
    name,
    component: pageComponentVue3(platform, runtime, load, (route, owner, scope) => ({
      ...buildProps(route, owner, scope),
      'data-vue3': dataName,
    })),
    meta: { title, ...meta },
  };
}

function immediatePageVue3(
  platform: ApplicationContext,
  runtime: RouterRuntimeVue3,
  component: Component,
  props: Record<string, unknown>,
) {
  return defineComponent({
    name: 'QslImmediatePageVue3',
    setup() {
      onMounted(() => { void runtime.markRendered(runtime.context(runtime.router.currentRoute.value)); });
      return () => h(component, { platform, ...props });
    },
  });
}

export function createRouterRuntimeVue3(
  platform: ApplicationContext,
  store: RuntimeStoreVue3,
): RouterRuntimeVue3 {
  let runtime!: RouterRuntimeVue3;

  function scrollToHashElementVue3(target: HTMLElement) {
    let top = 0;
    for (let node: HTMLElement | null = target; node; node = node.offsetParent as HTMLElement | null) {
      top += node.offsetTop;
    }
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: Math.max(0, top - padding),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  function scheduleHashScrollVue3() {
    runtime.hashCleanup?.();
    runtime.hashCleanup = null;
    const route = runtime.router.currentRoute.value;
    if (!route.hash) return;
    let id = '';
    try {
      id = decodeURIComponent(route.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;

    let cancelled = false;
    let frame = 0;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let fallbackTimer = 0;
    const clean = () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      resizeObserver?.disconnect();
      observer = null;
      resizeObserver = null;
      clearTimeout(fallbackTimer);
      window.removeEventListener('wheel', cancel, true);
      window.removeEventListener('touchmove', cancel, true);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
      if (runtime.hashCleanup === clean) runtime.hashCleanup = null;
    };
    const cancel = () => clean();
    const find = () => {
      if (cancelled) return;
      const target = document.getElementById(id);
      if (!target) return;
      clean();
      scrollToHashElementVue3(target);
    };
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    window.addEventListener('touchmove', cancel, { capture: true, passive: true });
    window.addEventListener('pointerdown', cancel, { capture: true, passive: true });
    window.addEventListener('keydown', cancel, true);
    observer = new MutationObserver(find);
    observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(find);
      resizeObserver.observe(document.body);
    }
    fallbackTimer = window.setTimeout(clean, 10000);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(find);
    });
    runtime.hashCleanup = clean;
  }

  function scrollToHashVue3(): boolean {
    const hash = runtime.router.currentRoute.value.hash;
    if (!hash) return false;
    let id = '';
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return false;
    }
    const target = id ? document.getElementById(id) : null;
    if (target) scrollToHashElementVue3(target);
    else scheduleHashScrollVue3();
    return !!target;
  }

  function inferNavigationVue3(): NavigationKindVue3 {
    if (runtime.requestedNavigation) return runtime.requestedNavigation;
    const statePosition = typeof window.history.state?.position === 'number'
      ? window.history.state.position
      : null;
    if (
      statePosition !== null &&
      runtime.lastHistoryPosition !== null &&
      statePosition !== runtime.lastHistoryPosition
    ) {
      return 'pop';
    }
    return 'push';
  }

  async function commitRenderedVue3(context: RouteContextVue3) {
    const router = runtime.router;
    const version = runtime.navigationVersion;
    const fullPath = router.currentRoute.value.fullPath;
    await nextTick();
    if (version !== runtime.navigationVersion || router.currentRoute.value.fullPath !== fullPath) return;
    platform.emit?.('route:rendered', context);
    platform.emit?.('route:after', context);
    scheduleHashScrollVue3();
  }

  function buildRoutesVue3(): RouteRecordRaw[] {
    const home = pageRecordVue3(
      platform, runtime, '/', 'home', '首页', () => import('./pages/Home.vue'),
      (_route, owner, scope) => ({
        services: cachedVue3(scope, 'services', () => createHomeServicesVue3(owner)),
      }),
    );
    const explore = pageRecordVue3(
      platform, runtime, '/explore', 'explore', '卡片广场', () => import('./pages/Explore.vue'),
      (route, owner, scope) => ({
        query: queryFromRouteVue3(route),
        services: cachedVue3(scope, 'services', () => createServicesVue3(owner)),
        visit: cachedVue3(scope, 'visit', () =>
          createExploreVisitVue3(runtime.context(route), () => owner.store.user?.uid || null)),
      }),
    );
    const contest = (path: string, name: string, title: string, alternate: boolean, kind: string): RouteRecordRaw =>
      pageRecordVue3(
        platform, runtime, path, name, title,
        {
          landing: () => import('./contest/pages/ContestLanding.vue'),
          registration: () => import('./contest/pages/ContestRegistration.vue'),
          works: () => import('./contest/pages/ContestWorks.vue'),
          detail: () => import('./contest/pages/ContestWorkDetail.vue'),
          judging: () => import('./contest/pages/ContestJudging.vue'),
        }[kind]!,
        (route, owner, scope) => {
          const services = cachedVue3(scope, 'contestServices', () =>
            createContestServicesVue3(owner as unknown as ContestRuntime));
          if (kind === 'landing') return { services, alternate };
          if (kind === 'works') return { services, query: queryFromRouteVue3(route) };
          if (kind === 'detail') return { services, id: String(route.params.id || '') };
          return { services };
        },
        kind === 'judging' ? { auth: true } : {},
      );

    const space = pageRecordVue3(
      platform, runtime, '/space/:uid', 'space', '个人主页', () => import('./pages/Space.vue'),
      (route, owner, scope) => ({
        uid: String(route.params.uid || ''),
        services: cachedVue3(scope, 'services', () => createServicesVue3(owner)),
      }),
    );
    const cardDetail = pageRecordVue3(
      platform, runtime, '/card/:id', 'card-detail', '卡片详情', () => import('./pages/CardDetail.vue'),
      (route, owner, scope) => ({
        cardId: String(route.params.id || ''),
        services: cachedVue3(scope, 'services', () => createCardDetailServicesVue3(owner)),
      }),
    );
    const share = pageRecordVue3(
      platform, runtime, '/share/:token', 'share', 'QSL 卡片分享', () => import('./pages/Share.vue'),
      (route, owner, scope) => ({
        token: String(route.params.token || ''),
        services: cachedVue3(scope, 'services', () => createCardDetailServicesVue3(owner)),
      }),
    );
    const shortShare = pageRecordVue3(
      platform, runtime, '/s/:token', 'share-short', 'QSL 卡片分享', () => import('./pages/Share.vue'),
      (route, owner, scope) => ({
        token: String(route.params.token || ''),
        services: cachedVue3(scope, 'services', () => createCardDetailServicesVue3(owner)),
      }),
    );
    const login = pageRecordVue3(
      platform, runtime, '/login', 'login', '登录', () => import('./pages/Login.vue'),
      (route, owner, scope) => ({
        nextRaw: typeof route.query.next === 'string' ? route.query.next : null,
        services: cachedVue3(scope, 'services', () => createAuthServicesVue3(owner)),
      }),
      { guest: true },
    );
    const register = pageRecordVue3(
      platform, runtime, '/register', 'register', '注册', () => import('./pages/Register.vue'),
      (route, owner, scope) => ({
        nextRaw: typeof route.query.next === 'string' ? route.query.next : null,
        services: cachedVue3(scope, 'services', () => createAuthServicesVue3(owner)),
      }),
      { guest: true },
    );
    const passwordReset = pageRecordVue3(
      platform, runtime, '/password-reset', 'password-reset', '找回密码', () => import('./pages/PasswordReset.vue'),
      (route, owner, scope) => ({
        nextRaw: typeof route.query.next === 'string' ? route.query.next : null,
        services: cachedVue3(scope, 'services', () => createAuthServicesVue3(owner)),
      }),
      { guest: true },
    );
    const dashboard = pageRecordVue3(
      platform, runtime, '/dashboard', 'dashboard', '个人中心', () => import('./pages/Dashboard.vue'),
      (_route, owner, scope) => ({
        services: cachedVue3(scope, 'services', () => createAccountServicesVue3(owner)),
      }),
      { auth: true },
    );
    const profile = pageRecordVue3(
      platform, runtime, '/dashboard/profile', 'profile', '个人资料', () => import('./pages/Profile.vue'),
      (_route, owner, scope) => ({
        services: cachedVue3(scope, 'services', () => createAccountServicesVue3(owner)),
      }),
      { auth: true },
    );
    const myCards = pageRecordVue3(
      platform, runtime, '/dashboard/cards', 'my-cards', '我的卡片', () => import('./pages/MyCards.vue'),
      (route, owner, scope) => ({
        ctx: runtime.context(route),
        services: cachedVue3(scope, 'services', () => createCardManageServicesVue3(owner)),
      }),
      { auth: true },
    );
    const cardEditorNew = pageRecordVue3(
      platform, runtime, '/dashboard/cards/new', 'card-editor-new', '上传卡片', () => import('./pages/CardEditor.vue'),
      (route, owner, scope) => ({
        ctx: runtime.context(route),
        services: cachedVue3(scope, 'services', () => createCardManageServicesVue3(owner)),
      }),
      { auth: true },
    );
    const cardEditorEdit = pageRecordVue3(
      platform, runtime, '/dashboard/cards/:id/edit', 'card-editor-edit', '上传卡片', () => import('./pages/CardEditor.vue'),
      (route, owner, scope) => ({
        ctx: runtime.context(route),
        services: cachedVue3(scope, 'services', () => createCardManageServicesVue3(owner)),
      }),
      { auth: true },
    );
    const exchanges = pageRecordVue3(
      platform, runtime, '/dashboard/exchanges', 'exchanges', '换卡申请', () => import('./pages/Exchanges.vue'),
      (route, owner, scope) => ({
        ctx: runtime.context(route),
        services: cachedVue3(scope, 'services', () => createExchangeServicesVue3(owner)),
      }),
      { auth: true },
    );
    const logbook = pageRecordVue3(
      platform, runtime, '/dashboard/logbook', 'logbook', '通联日志', () => import('./pages/Logbook.vue'),
      (_route, owner, scope) => ({
        services: cachedVue3(scope, 'services', () => createLogbookServicesVue3(owner)),
      }),
      { auth: true },
    );
    const admin = defineComponent({
      name: 'QslAdminPageVue3',
      setup() {
        return () => h(AdminRouteVue3, {
          platform,
          buildContext: (route: RouteLocationNormalizedLoaded) => runtime.context(route),
          onReady: (context: RouteContextVue3) => { void runtime.markRendered(context); },
        });
      },
    });

    return [
      home,
      explore,
      contest('/events/qsl-design-2026-11', 'qsl-design-contest', '第一届QSLink杯QSL卡片设计大赛', false, 'landing'),
      contest('/events/qsl-design-2026-11/alternate', 'qsl-design-contest-alternate', '第一届QSLink杯QSL卡片设计大赛', true, 'landing'),
      contest('/events/qsl-design-2026-11/registration', 'qsl-design-registration', '比赛报名', false, 'registration'),
      contest('/events/qsl-design-2026-11/judging', 'qsl-design-judging', '评委工作台', false, 'judging'),
      contest('/events/qsl-design-2026-11/works', 'qsl-design-works', '参赛作品', false, 'works'),
      contest('/events/qsl-design-2026-11/works/:id', 'qsl-design-work-detail', '参赛作品', false, 'detail'),
      space,
      cardDetail,
      share,
      shortShare,
      login,
      register,
      passwordReset,
      dashboard,
      myCards,
      cardEditorNew,
      cardEditorEdit,
      exchanges,
      logbook,
      profile,
      {
        path: '/admin',
        name: 'admin',
        component: admin,
        meta: { title: '管理后台', auth: true, admin: true },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: immediatePageVue3(platform, runtime, NotFoundVue3, { 'data-vue3': 'not-found' }),
        meta: { title: '页面不存在' },
      },
    ];
  }

  runtime = {
    router: null as unknown as Router,
    renderVersion: ref(0),
    currentNavigation: ref<NavigationKindVue3>('render'),
    fromPath: ref<string | null>(null),
    requestedNavigation: null,
    skipNextScroll: false,
    leaveGuard: null,
    navigationVersion: 0,
    lastHistoryPosition: typeof window.history.state?.position === 'number'
      ? window.history.state.position
      : null,
    hashCleanup: null,
    clickCleanup: null,
    async markRendered(context) {
      await commitRenderedVue3(context);
    },
    context(route) {
      return contextFromRouteVue3(
        route,
        runtime.currentNavigation.value,
        runtime.fromPath.value,
      );
    },
    navigationKind: inferNavigationVue3,
    scrollToHash: scrollToHashVue3,
    dispose() {
      runtime.hashCleanup?.();
      runtime.hashCleanup = null;
      runtime.clickCleanup?.();
      runtime.clickCleanup = null;
    },
  };

  const router = createRouter({
    history: createWebHistory(),
    stringifyQuery(query) {
      const params = new URLSearchParams();
      for (const [key, raw] of Object.entries(query || {})) {
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
          if (value !== null && value !== undefined) params.append(key, String(value));
        }
      }
      return params.toString();
    },
    routes: buildRoutesVue3(),
    scrollBehavior(to, from, savedPosition) {
      if (runtime.skipNextScroll) {
        runtime.skipNextScroll = false;
        return false;
      }
      if (to.hash || (to.path === from.path && to.name === from.name)) return false;
      if (to.name === 'explore') return false;
      return savedPosition || { left: 0, top: 0 };
    },
  });
  runtime.router = router;
  return runtime;
}

export function installNavigation(
  platform: ApplicationContext,
  store: RuntimeStoreVue3,
  runtime: RouterRuntimeVue3,
) {
  const router = runtime.router;
  let navigationSequence = 0;
  let started = false;
  let readyEmitted = false;

  function emitReady() {
    if (readyEmitted) return;
    readyEmitted = true;
    platform.emit?.('router:ready');
  }

  router.beforeEach(async (to, from) => {
    await store.ready;
    const sequence = ++navigationSequence;
    const kind: NavigationKindVue3 = runtime.navigationKind();
    runtime.requestedNavigation = null;

    if (from.matched.length && from.path !== to.path && runtime.leaveGuard) {
      const guard = runtime.leaveGuard;
      const decision = await guard({
        type: kind === 'pop' ? 'pop' : 'navigate',
        to: to.fullPath,
      });
      if (sequence !== navigationSequence) return false;
      if (decision !== true) return false;
      if (runtime.leaveGuard === guard) runtime.leaveGuard = null;
    }

    if (to.meta.auth && !store.user) {
      runtime.requestedNavigation = 'replace';
      return '/login?next=' + encodeURIComponent(to.fullPath);
    }
    if (to.meta.guest && store.user) {
      const next = typeof to.query.next === 'string' ? platform.safeNext?.(to.query.next) : null;
      runtime.requestedNavigation = 'replace';
      return next || '/';
    }

    runtime.currentNavigation.value = kind;
    runtime.fromPath.value = from.path || null;
    runtime.navigationVersion += 1;
    platform.emit?.('route:before', contextFromRouteVue3(
      to,
      kind,
      from.path || null,
    ));
    return true;
  });

  router.afterEach((to, from, failure) => {
    runtime.lastHistoryPosition = typeof window.history.state?.position === 'number'
      ? window.history.state.position
      : null;
    runtime.requestedNavigation = null;
    if (failure) return;
    runtime.fromPath.value = from.path || null;
    const context = contextFromRouteVue3(to, runtime.currentNavigation.value, from.path || null);
    const title = typeof to.meta.title === 'string' ? platform.t(to.meta.title) : '';
    if (title) document.title = title + ' · QSLink';
    platform.emit?.('route', context);
  });

  router.onError(err => {
    console.error('[QSL] router error:', err);
  });

  const rawNavigate = async (
    to: string,
    options: { replace?: boolean; keepScroll?: boolean } = {},
  ): Promise<boolean> => {
    const resolved = router.resolve(to);
    if (resolved.fullPath === router.currentRoute.value.fullPath) {
      if (resolved.meta.auth && !store.user) {
        runtime.requestedNavigation = 'replace';
        return rawNavigate('/login?next=' + encodeURIComponent(resolved.fullPath), { replace: true });
      }
      if (resolved.meta.guest && store.user) {
        const next = typeof resolved.query.next === 'string' ? platform.safeNext?.(resolved.query.next) : null;
        runtime.requestedNavigation = 'replace';
        return rawNavigate(next || '/', { replace: true });
      }
      const guard = runtime.leaveGuard;
      if (guard) {
        const allowed = await guard({
          type: 'navigate',
          to: resolved.fullPath,
        });
        if (!allowed) return false;
        if (runtime.leaveGuard === guard) runtime.leaveGuard = null;
      }
      const kind: NavigationKindVue3 = options.replace ? 'replace' : 'push';
      runtime.currentNavigation.value = kind;
      runtime.navigationVersion += 1;
      const current = router.currentRoute.value;
      const context = contextFromRouteVue3(current, kind, current.path);
      platform.emit?.('route:before', context);
      platform.emit?.('route', context);
      runtime.renderVersion.value += 1;
      return true;
    }
    runtime.requestedNavigation = options.replace ? 'replace' : 'push';
    runtime.skipNextScroll = !!options.keepScroll;
    try {
      const failure = await (options.replace ? router.replace(to) : router.push(to));
      return !failure;
    } catch (err) {
      runtime.requestedNavigation = null;
      runtime.skipNextScroll = false;
      console.error('[QSL] navigation error:', err);
      platform.toast?.(platform.t('页面加载失败'), 'error');
      return false;
    }
  };

  function currentContext(): RouteContextVue3 {
    return contextFromRouteVue3(
      router.currentRoute.value,
      runtime.currentNavigation.value,
      runtime.fromPath.value,
    );
  }

  function setQuery(
    patch: Record<string, unknown>,
    _options?: { navigate?: boolean },
  ): string {
    const route = router.currentRoute.value;
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(route.query)) {
      if (value !== null && value !== undefined) {
        query[key] = Array.isArray(value) ? value.map(String) : String(value);
      }
    }
    for (const [key, value] of Object.entries(patch || {})) {
      if (value === null || value === undefined || value === '') delete query[key];
      else query[key] = String(value);
    }
    const target = router.resolve({ path: route.path, query, hash: route.hash });
    if (target.fullPath !== route.fullPath) {
      runtime.requestedNavigation = 'replace';
      runtime.skipNextScroll = true;
      void router.replace({ path: route.path, query, hash: route.hash }).catch(err => {
        console.error('[QSL] query navigation error:', err);
      });
    }
    const targetPath = target.fullPath.split('#')[0];
    return targetPath;
  }

  const navigation = {
    start() {
      if (!started) {
        started = true;
        void router.isReady().then(emitReady);
      }
      return router.isReady();
    },
    render() {
      runtime.renderVersion.value += 1;
      return rawNavigate(router.currentRoute.value.fullPath, { replace: true, keepScroll: true });
    },
    setLeaveGuard(fn: typeof runtime.leaveGuard) {
      runtime.leaveGuard = typeof fn === 'function' ? fn : null;
      return () => {
        if (runtime.leaveGuard === fn) runtime.leaveGuard = null;
      };
    },
    get current() {
      return currentContext();
    },
    instance: router,
  };
  platform.navigation = navigation;

  platform.navigate = rawNavigate;
  platform.currentPath = () => {
    const route = router.currentRoute.value;
    return route.fullPath.split('#')[0];
  };
  platform.goBack = (fallback?: string) => {
    const back = router.options.history.state.back;
    if (back) router.back();
    else void rawNavigate(fallback || '/', { replace: true });
  };
  platform.setQuery = setQuery;
  platform.scrollToHash = () => runtime.scrollToHash();

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    if (anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.hasAttribute('data-native')) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname.endsWith('.html')) return;
    event.preventDefault();
    void rawNavigate(url.pathname + url.search + url.hash);
  };
  document.addEventListener('click', onClick);
  runtime.clickCleanup = () => document.removeEventListener('click', onClick);

  return {
    router,
    emitReady,
    dispose() {
      runtime.dispose();
      navigationSequence += 1;
      const history = router.options.history as typeof router.options.history & { destroy?(): void };
      history.destroy?.();
    },
  };
}
