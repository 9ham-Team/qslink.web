import type { CardPageVue3, LegacyQslVue3, ServicesVue3, SpaceResponseVue3 } from './contracts-vue3';

export function createServicesVue3(qsl: LegacyQslVue3): ServicesVue3 {
  return {
    t: qsl.t,
    user: () => qsl.state.user,
    onAuth: fn => qsl.on('auth', fn),
    getSpace: (uid, sort, page, signal) => qsl.api.get<SpaceResponseVue3>(
      '/api/public/spaces/' + encodeURIComponent(uid) + '?' + new URLSearchParams({ sort, page: String(page), limit: '12' }),
      { signal },
    ),
    listCards: (filters, page, signal) => {
      const query = new URLSearchParams({ sort: filters.sort, page: String(page), limit: '12' });
      if (filters.callSign) query.set('callSign', filters.callSign);
      return qsl.api.get<CardPageVue3>('/api/cards?' + query, { signal });
    },
    setQuery: patch => {
      try { qsl.setQuery(patch); } catch { /* History limits must not prevent filtering. */ }
    },
    celebrate: (x, y) => { qsl.fx?.confetti(x, y); },
    likeCard: id => qsl.api.cards.like(id),
    image: (img, src, width) => qsl.images.apply(img, src, width),
    placeholder: qsl.PLACEHOLDER_IMAGE,
    formatDate: qsl.formatDate,
    formatNumber: qsl.formatNumber,
    navigate: path => qsl.navigate(path),
    toast: (message, type) => qsl.toast(message, type),
    share(url) {
      const esc = qsl.escapeHtml;
      const modal = qsl.modal({
        title: qsl.t('分享主页'),
        content: '<p>' + esc(qsl.t('把你的卡片小站分享给朋友，任何人都可以直接访问。')) + '</p>' +
          '<label class="field"><span class="label">' + esc(qsl.t('主页链接')) + '</span>' +
          '<input class="input" type="text" readonly data-space-url value="' + esc(url) + '"></label>',
        actions: [{ label: qsl.t('复制链接'), type: 'primary', closeOnClick: false,
          onClick: () => qsl.copyText(url, qsl.t('主页链接已复制')) }],
      });
      const input = modal.body.querySelector<HTMLInputElement>('[data-space-url]');
      if (input) input.onclick = () => input.select();
      return modal;
    },
  };
}
