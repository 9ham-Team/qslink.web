import translations from '../locales/en.js';
export function createI18n() {
  const key = 'qsl_language';
  const url = new URL(location.href);
  const requested = url.searchParams.get('lang');
  function browserLanguage() {
    if (typeof navigator === 'undefined') return 'zh-CN';
    const preferences = Array.from(navigator.languages || []);
    if (navigator.language) preferences.push(navigator.language);
    for (const preference of preferences) {
      if (typeof preference !== 'string') continue;
      if (/^zh(?:-|$)/i.test(preference)) return 'zh-CN';
      if (/^en(?:-|$)/i.test(preference)) return 'en';
    }
    return 'zh-CN';
  }
  let saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch (err) { /* Storage may be disabled. */ }
  let language = saved === 'en' || saved === 'zh-CN' ? saved : browserLanguage();
  // A direct English legal-page link selects that version without recording
  // an automatic redirect as a manual language preference.
  if (url.pathname.endsWith('.en.html')) language = 'en';
  if (requested === 'en' || requested === 'zh-CN') {
    language = requested;
    // Commit the preference only after navigation, so canceling beforeunload
    // keeps both the current interface and its saved language unchanged.
    try {
      localStorage.setItem(key, language);
      url.searchParams.delete('lang');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (err) { /* Keep the URL preference when storage is unavailable. */ }
  }
  const t = function (source, values) {
    const catalog = translations;
    const text = language === 'en' && catalog && Object.prototype.hasOwnProperty.call(catalog, source)
      ? catalog[source] : source;
    return values ? text.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match) : text;
  };
  document.documentElement.lang = language;
  let edited = false;
  const markEdited = event => { if(event.target.closest('form')) edited = true; };
  document.addEventListener('input',markEdited);
  document.addEventListener('change',markEdited);
  const i18n = {
    language,
    resetEdits: function () { edited = false; },
    error: function (source) {
      const translated = t(source);
      if (language !== 'en' || translated !== source || typeof source !== 'string') return translated;
      let match;
      if ((match = source.match(/^密码不能超过 (\d+) 位$/)))
        return t('密码不能超过 {max} 位', { max: match[1] });
      if ((match = source.match(/^(.+?)需为 (\d+)-(\d+) 个字符$/)))
        return t('{label}需为 {min}-{max} 个字符', { label: t(match[1]), min: match[2], max: match[3] });
      if ((match = source.match(/^(.+?)不能超过 (\d+) 个字符$/)))
        return t('{label}不能超过 {max} 个字符', { label: t(match[1]), max: match[2] });
      if ((match = source.match(/^宽高比需为 \{ w, h \}，取 (\d+)-(\d+) 的整数$/)))
        return t('宽高比需为 { w, h }，取 {min}-{max} 的整数', { min: match[1], max: match[2] });
      return source;
    },
    switchLanguage: function () {
      // Reloading also refreshes module-level labels and releases page resources.
      if (edited && !window.confirm(t('切换语言将重新载入页面，未保存的内容可能丢失。继续？'))) return;
      i18n.switching = edited;
      const next = new URL(location.href);
      next.searchParams.set('lang', language === 'en' ? 'zh-CN' : 'en');
      location.replace(next.href);
    }
  };

i18n.t=t;
i18n.dispose=()=>{document.removeEventListener('input',markEdited);document.removeEventListener('change',markEdited);};
return i18n;
}
