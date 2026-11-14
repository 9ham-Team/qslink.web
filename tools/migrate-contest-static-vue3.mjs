// One-time conversion aid: preserve source-owned contest copy/assets as Vue
// template bindings. No legacy renderer is shipped or invoked by the new page.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
const messages = [];
let page;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const QSL = { escapeHtml, t(source, values) { const id = messages.push({ source, values }) - 1; return '__I18N_' + id + '__'; },
  registerPage(_, definition) { page = definition; }, api: { get: () => new Promise(() => {}) }, loading() {}, setBusy() {}, toast() {}, scrollToHash() {} };
const context = vm.createContext({ QSL, window: { QSL }, AbortController, requestAnimationFrame: () => 0, cancelAnimationFrame() {} });
const ui = await fs.readFile('public/js/ui.js', 'utf8');
vm.runInContext('(function(){const esc=QSL.escapeHtml;' + ui.slice(ui.indexOf('  const ICONS ='), ui.indexOf('  const icon = QSL.icon;')) + '})();', context);
vm.runInContext(await fs.readFile('public/js/pages/qsl-design-contest.js', 'utf8'), context);
const expression = marker => { const item = messages[Number(marker.match(/__I18N_(\d+)__/)[1])]; return 't(' + JSON.stringify(item.source) + (item.values ? ', ' + JSON.stringify(item.values) : '') + ')'; };
function convert(route) {
  const dummy = { innerHTML: '', hidden: false, setAttribute() {}, removeAttribute() {}, addEventListener() {} };
  const container = { innerHTML: '', querySelector: () => dummy, addEventListener() {} };
  const cleanup = page.render(container, { path: route }); cleanup();
  const dom = new JSDOM('<body>' + container.innerHTML + '</body>');
  const body = dom.window.document.body;
  body.querySelector('[data-news]').textContent = '__NEWS_SLOT__';
  body.querySelector('[data-action="news"]').parentElement.remove();
  body.querySelector('[data-prize-progress]').textContent = '__PRIZE_SLOT__';
  for (const element of body.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (attr.name === 'src' && attr.value.startsWith('/assets/')) { element.removeAttribute('src'); element.setAttribute(':src', JSON.stringify(attr.value)); continue; }
      if (/^data-(?:reveal|count)/.test(attr.name)) { element.removeAttribute(attr.name); continue; }
      if (/__I18N_\d+__/.test(attr.value)) {
        const parts = attr.value.split(/(__I18N_\d+__)/).filter(Boolean).map(part => /^__I18N_\d+__$/.test(part) ? expression(part) : JSON.stringify(part));
        element.removeAttribute(attr.name); element.setAttribute(':' + attr.name, parts.join(' + '));
      }
    }
  }
  let html = body.innerHTML.replace(/__I18N_\d+__/g, marker => '{{ ' + expression(marker) + ' }}');
  html = html.replace(/(:[\w-]+)="([^"]*)"/g, (_, name, value) => name + "='" + value.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll("'", '\\u0027') + "'");
  html = html.replace('__NEWS_SLOT__', '<ContestNewsVue3 :services="services" @ready="alignHash" />').replace('__PRIZE_SLOT__', '<ContestProgressVue3 :services="services" @ready="alignHash" />');
  return html.replace(/></g, '>\n<');
}
const normal = convert('/events/qsl-design-2026-11');
const alternate = convert('/events/qsl-design-2026-11/alternate');
const script = '<script setup lang="ts">\nimport type { ContestServicesVue3 } from "../contracts-vue3";\nimport ContestNewsVue3 from "../components/ContestNews-vue3.vue";\nimport ContestProgressVue3 from "../components/ContestProgress-vue3.vue";\nimport { useContestAnchorVue3 } from "../../composables/use-contest-anchor-vue3";\nconst props = defineProps<{ services: ContestServicesVue3; alternate: boolean }>();\nconst t = props.services.t;\nconst alignHash = useContestAnchorVue3(() => props.services.scrollHash());\n</script>\n';
await fs.mkdir('client-vue3/src/contest-vue3/pages', { recursive: true });
await fs.writeFile('client-vue3/src/contest-vue3/pages/ContestLanding-vue3.vue', script + '<template>\n<template v-if="!alternate">' + normal + '</template>\n<template v-else>' + alternate + '</template>\n</template>\n');
console.log('Converted both contest layouts to Vue templates; retained translated copy and local assets.');
