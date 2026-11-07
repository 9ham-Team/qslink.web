/* These pages contain only publisher-owned legal text, in static translations. */
(function () {
  'use strict';
  const english = window.QSL.i18n.language === 'en';
  const currentEnglish = location.pathname.endsWith('.en.html');
  const url = new URL(location.href);
  function path(en) {
    return location.pathname.replace(/(?:\.en)?\.html$/, en ? '.en.html' : '.html');
  }
  if (english !== currentEnglish) {
    location.replace(path(english) + url.search + url.hash);
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = english ? '中文' : 'EN';
  button.lang = english ? 'zh-CN' : 'en';
  button.setAttribute('aria-label', english ? '切换到中文' : 'Switch to English');
  button.addEventListener('click', function () {
    url.searchParams.set('lang', english ? 'zh-CN' : 'en');
    location.replace(path(!english) + url.search + url.hash);
  });
  document.querySelector('nav').append(' · ', button);
})();
