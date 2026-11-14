import { registerPageVue3 } from './bridge-vue3';
import type { LegacyQslVue3 } from './contracts-vue3';
import type { Component } from 'vue';

export function registerContestPagesVue3(qsl: LegacyQslVue3) {
  const pages: { name: string; title: string; kind: string; load: () => Promise<{ default: Component }> }[] = [
    { name: 'qsl-design-contest', title: '第一届QSLink杯QSL卡片设计大赛', kind: 'landing', load: () => import('./contest-vue3/pages/ContestLanding-vue3.vue') },
    { name: 'qsl-design-registration', title: '比赛报名', kind: 'registration', load: () => import('./contest-vue3/pages/ContestRegistration-vue3.vue') },
    { name: 'qsl-design-works', title: '参赛作品', kind: 'works', load: () => import('./contest-vue3/pages/ContestWorks-vue3.vue') },
    { name: 'qsl-design-work-detail', title: '参赛作品', kind: 'detail', load: () => import('./contest-vue3/pages/ContestWorkDetail-vue3.vue') },
    { name: 'qsl-design-judging', title: '评委工作台', kind: 'judging', load: () => import('./contest-vue3/pages/ContestJudging-vue3.vue') },
  ];
  for (const page of pages) registerPageVue3(qsl, { name: page.name, title: page.title, loading: '加载中…', error: '页面加载失败',
    load: () => Promise.all([import('./contest-vue3/mount-vue3'), page.load()]).then(([runtime, component]) =>
      (root, ctx, owner) => runtime.mountContestVue3(root, ctx, owner, component.default, page.kind)),
  });
}
