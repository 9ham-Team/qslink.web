import { registerPageVue3 } from './bridge';
import type { LegacyQslVue3 } from './contracts';
import type { Component } from 'vue';

export function registerContestPagesVue3(qsl: LegacyQslVue3) {
  const pages: { name: string; title: string; kind: string; load: () => Promise<{ default: Component }> }[] = [
    { name: 'qsl-design-contest', title: '第一届QSLink杯QSL卡片设计大赛', kind: 'landing', load: () => import('./contest/pages/ContestLanding.vue') },
    { name: 'qsl-design-registration', title: '比赛报名', kind: 'registration', load: () => import('./contest/pages/ContestRegistration.vue') },
    { name: 'qsl-design-works', title: '参赛作品', kind: 'works', load: () => import('./contest/pages/ContestWorks.vue') },
    { name: 'qsl-design-work-detail', title: '参赛作品', kind: 'detail', load: () => import('./contest/pages/ContestWorkDetail.vue') },
    { name: 'qsl-design-judging', title: '评委工作台', kind: 'judging', load: () => import('./contest/pages/ContestJudging.vue') },
  ];
  for (const page of pages) registerPageVue3(qsl, { name: page.name, title: page.title, loading: '加载中…', error: '页面加载失败',
    load: () => Promise.all([import('./contest/mount'), page.load()]).then(([runtime, component]) =>
      (root, ctx, owner) => runtime.mountContestVue3(root, ctx, owner, component.default, page.kind)),
  });
}
