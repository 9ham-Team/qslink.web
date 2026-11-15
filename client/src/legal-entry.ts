import { createI18n } from './lib/i18n.js';
const i18n = createI18n();
const english = i18n.language === 'en';
const currentEnglish = location.pathname.endsWith('.en.html');
const url = new URL(location.href);
const translatedPath = (en: boolean) => location.pathname.replace(/(?:\.en)?\.html$/, en ? '.en.html' : '.html');
if (english !== currentEnglish) location.replace(translatedPath(english) + url.search + url.hash);
else {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = english ? '中文' : 'EN';
  button.lang = english ? 'zh-CN' : 'en';
  button.setAttribute('aria-label', english ? '切换到中文' : 'Switch to English');
  button.addEventListener('click', () => {
    url.searchParams.set('lang', english ? 'zh-CN' : 'en');
    location.replace(translatedPath(!english) + url.search + url.hash);
  });
  document.querySelector('nav')?.append(' · ', button);
}
window.addEventListener('pagehide', () => i18n.dispose(), { once: true });
