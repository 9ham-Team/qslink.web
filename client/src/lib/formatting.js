// Module-scoped implementation; no browser globals are registered.
export function createFormatting(i18n) {
  function safeNext(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const decoded = decodeURIComponent(raw);
      if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.startsWith('/\\')) return null;
      if (/[\r\n\t\0\\]/.test(decoded.split(/[?#]/)[0])) return null;
      const parsed = new URL(decoded, 'https://qsl.local');
      if (parsed.origin !== 'https://qsl.local') return null;
      if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return null;
      if (parsed.pathname === '/login' || parsed.pathname.startsWith('/login/') ||
          parsed.pathname === '/register' || parsed.pathname.startsWith('/register/')) return null;
      return decoded;
    } catch (e) { return null; }
  }
  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
  };
  const escapeAttr = escapeHtml;

  const dateFmt = new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const formatDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return dateFmt.format(d);
  };
  const formatDateTime = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return dateTimeFmt.format(d).replace(/\//g, '-');
  };
  const timeAgo = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso).getTime();
    if (isNaN(d)) return '—';
    const diff = Math.max(0, Date.now() - d);
    const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return i18n.t("刚刚");
    if (i18n.language === 'en') {
      const [size, unit] = diff < hour ? [min, 'minute'] : diff < day ? [hour, 'hour'] :
        diff < 30 * day ? [day, 'day'] : diff < 365 * day ? [30 * day, 'month'] : [365 * day, 'year'];
      return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-Math.floor(diff / size), unit);
    }
    if (diff < hour) return Math.floor(diff / min) + (" " + i18n.t("分钟前"));
    if (diff < day) return Math.floor(diff / hour) + (" " + i18n.t("小时前"));
    if (diff < 30 * day) return Math.floor(diff / day) + (" " + i18n.t("天前"));
    if (diff < 365 * day) return Math.floor(diff / (30 * day)) + (" " + i18n.t("个月前"));
    return Math.floor(diff / (365 * day)) + (" " + i18n.t("年前"));
  };
  const formatNumber = function (n) {
    const num = Number(n) || 0;
    if (i18n.language === 'en') return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
    if (num >= 10000) return (num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(num);
  };
  const debounce = function (fn, ms) {
    let timer = null;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), ms || 300);
    };
  };
  const ratioCss = function (ratio) {
    const w = (ratio && ratio.w) || 3, h = (ratio && ratio.h) || 2;
    return w + ' / ' + h;
  };
  const ratioLabel = function (ratio) {
    const w = (ratio && ratio.w) || 3, h = (ratio && ratio.h) || 2;
    return w + ' : ' + h;
  };
  const img = function (src) {
    return src || (PLACEHOLDER_IMAGE || '');
  };
  // 优雅的占位图（渐变 + QSL 字样）
  const PLACEHOLDER_IMAGE =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#d8f7ee"/><stop offset=".55" stop-color="#dbeefe"/><stop offset="1" stop-color="#ecdcfb"/></linearGradient></defs>' +
      '<rect width="600" height="400" fill="url(#g)"/>' +
      '<g fill="none" stroke="#0eaf8f" stroke-opacity=".28" stroke-width="2">' +
      '<circle cx="300" cy="200" r="86"/><circle cx="300" cy="200" r="54"/><circle cx="300" cy="200" r="122" stroke-dasharray="4 10"/></g>' +
      '<text x="300" y="214" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#0b8f77" fill-opacity=".55" letter-spacing="6">QSL</text></svg>'
    );

  /* ---------------- 页脚构建信息 ---------------- */
  const footerBuildText = function (build) {
    if (!build || typeof build.revision !== 'string' || typeof build.created !== 'string' ||
        !/^[a-f0-9]{40}$/.test(build.revision) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(build.created)) {
      return i18n.t("开发版 · 镜像构建时间未知");
    }
    const date = new Date(build.created);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== build.created.replace('Z', '.000Z')) {
      return i18n.t("开发版 · 镜像构建时间未知");
    }
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return (i18n.t("版本") + " ") + build.revision.slice(0, 7) + (" " + i18n.t("· 镜像构建于") + " ") + values.year + '-' + values.month + '-' +
      values.day + ' ' + values.hour + ':' + values.minute + ' HKT';
  };


return {safeNext,escapeHtml,escapeAttr,formatDate,formatDateTime,timeAgo,formatNumber,debounce,ratioCss,ratioLabel,img,PLACEHOLDER_IMAGE,footerBuildText};
}
