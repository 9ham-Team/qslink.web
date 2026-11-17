import { test as base, expect } from '@playwright/test';
// Browser tests obtain the normal module export explicitly. This test-only
// reference is not installed by the application or included in its bundle.
export const test = base.extend({
  page: async ({ page }, use) => {
    const evaluate = page.evaluate.bind(page);
    page.evaluate = async (fn, arg) => {
      await evaluate(async () => {
        if (!document.getElementById('app') || !document.querySelector('script[type="module"][src^="/build/"]')) return;
        const manifest = await (await fetch('/asset-manifest.json', { cache:'no-store' })).json();
        const module = await import(manifest.application);
        window.__appTest = module.application;
      });
      return evaluate(fn, arg);
    };
    await use(page);
  },
});
export { expect };
