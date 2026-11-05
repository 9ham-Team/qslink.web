/* QSLink · QSL 设计大赛 2026.11 */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const text = (source) => esc(QSL.t(source));
  const path = '/events/qsl-design-2026-11';
  const eventKey = 'qsl-design-2026-11';
  const entryUrl = '/api/contests/' + eventKey + '/entry';

  function rules() {
    const sections = [
      { title: QSL.t('参赛规则'), icon: 'cards', items: [
        QSL.t('参赛卡片须先上传至卡片广场供大家换卡，通过广场审核后，再选择本人卡片提交比赛报名。每个账号保留一份报名，可修改后重新提交。'),
        QSL.t('比赛采用一轮投票制，每个呼号最多投出三张票；每个呼号仅可获得其最高名次的一项奖。投票功能、投票安排及公开参赛作品展示将在后续阶段公布，本页赛事动态不是参赛作品流。'),
        QSL.t('报名开始、截止日期及完整赛程待公布。当前可提交报名，后续安排请关注赛事动态。')
      ] },
      { title: QSL.t('评分规则'), icon: 'star', items: [
        QSL.t('评分采用机器评分与人工评分相结合的方式：机器评分50分，人工评分30分。'),
        QSL.t('人工评分去掉一个最高分和一个最低分后，取其余评分的平均分。'),
        QSL.t('总分、公众投票权重、评分维度及完整评分细则待公布。本轮页面不提供投票、自动评分或获奖计算。')
      ] },
      { title: QSL.t('奖品发放规则'), icon: 'trophy', items: [
        QSL.t('前三名设置实物奖方向：一等奖候选为赛克斯等三选一，二等奖候选为SDR、键盘或耳机，由名次高者优先选择。候选品类不等于最终奖品承诺，具体型号及最终清单待公布。'),
        QSL.t('第4—5名为实物奖方向；目前已有四份实物奖品，第五份奖品仍待确定，最终清单待公布。'),
        QSL.t('第6—10名奖品为771天线，具体型号及发放细节待公布。电子奖状的覆盖范围存在待确认事项，以后续公告为准。'),
        QSL.t('前五名领奖时须核验操作证号、执照号与呼号一致，并提供相关证明材料供人工审核；报名阶段不收集这些证照资料。'),
        QSL.t('领奖时间、寄送方式及其他发放安排待公布。')
      ] }
    ];
    return sections.map((section, index) => '<article class="f-contest-rule"><div class="f-contest-rule-head">' +
      '<span class="f-contest-rule-icon">' + QSL.icon(section.icon, 24) + '</span><span class="eyebrow">0' + (index + 1) +
      '</span></div><h3>' + esc(section.title) + '</h3><ul>' + section.items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul></article>').join('');
  }

  function render(container) {
    let alive = true;
    let entry = null;
    let cards = [];
    let entryRequest = 0;
    let newsBusy = false;
    let newsPage = 0;
    let newsPages = 0;
    let saving = false;
    const events = new AbortController();
    container.innerHTML = '<div class="f-contest container">' +
      '<header class="f-contest-hero"><div class="f-contest-orbit" aria-hidden="true">' + QSL.icon('trophy', 100) + '</div>' +
      '<h1>' + text('第一届QSLink QSL 卡片设计大赛') + '</h1>' +
      '<div class="f-contest-actions"><a class="btn btn-soft btn-lg" href="' + path + '#rules" data-link>' + text('参赛须知') + '</a>' +
      '<a class="btn btn-primary btn-lg" href="' + path + '#registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 18) + '</a></div></header>' +
      '<section class="f-contest-section" aria-labelledby="contest-news-title"><div class="f-contest-section-head"><span class="eyebrow">01</span>' +
      '<h2 id="contest-news-title">' + text('赛事动态') + '</h2></div><div data-news aria-live="polite"></div>' +
      '<div class="f-contest-more"><button type="button" class="btn btn-soft" data-action="news" hidden>' + text('加载更多') + '</button></div></section>' +
      '<section class="f-contest-section" id="registration" aria-labelledby="contest-registration-title"><div class="f-contest-section-head"><span class="eyebrow">02</span>' +
      '<h2 id="contest-registration-title">' + text('比赛报名') + '</h2></div><div class="f-contest-registration" data-registration aria-live="polite"></div></section>' +
      '<section class="f-contest-section" id="rules" aria-labelledby="contest-rules-title"><div class="f-contest-section-head"><span class="eyebrow">03</span>' +
      '<h2 id="contest-rules-title">' + text('参赛须知') + '</h2></div><div class="f-contest-rules">' + rules() + '</div></section></div>';
    const news = container.querySelector('[data-news]');
    const more = container.querySelector('[data-action="news"]');
    const registration = container.querySelector('[data-registration]');

    function errorHtml(message, action) {
      return '<div class="f-contest-notice" role="alert"><p>' + esc(message) + '</p><button class="btn btn-soft" type="button" data-action="' + action + '">' + text('重试') + '</button></div>';
    }

    async function loadNews() {
      if (newsBusy) return;
      newsBusy = true;
      if (!newsPage) QSL.loading(news);
      news.setAttribute('aria-busy', 'true');
      more.hidden = false;
      QSL.setBusy(more, true);
      try {
        const data = await QSL.api.get('/api/announcements?eventKey=' + eventKey + '&page=' + (newsPage + 1) + '&limit=6');
        if (!alive) return;
        const html = data.items.map((item) => '<article class="f-contest-news"><time datetime="' + esc(item.publishedAt) + '">' +
          esc(QSL.formatDateTime(item.publishedAt)) + '</time><h3>' + esc(item.title) + '</h3><p>' + esc(item.body) + '</p></article>').join('');
        if (!newsPage) news.innerHTML = html || '<p class="f-contest-notice">' + text('暂无赛事动态，后续安排将在这里公布。') + '</p>';
        else news.insertAdjacentHTML('beforeend', html);
        newsPage = data.page;
        newsPages = data.pages;
        more.hidden = newsPage >= newsPages;
      } catch (err) {
        if (!alive) return;
        QSL.toast(err.message || QSL.t('加载失败'), 'error');
        if (!newsPage) { news.innerHTML = errorHtml(err.message || QSL.t('加载失败'), 'news'); more.hidden = true; }
        else more.hidden = false;
      } finally {
        newsBusy = false;
        if (alive) { news.removeAttribute('aria-busy'); QSL.setBusy(more, false); }
      }
    }

    function renderEntry() {
      const status = entry && entry.status;
      const statusHtml = entry ? '<div class="f-contest-status"><h3>' + text('我的报名') + '</h3>' +
        (status === 'pending' ? QSL.badge(QSL.t('待审核'), 'amber') : QSL.statusBadge(status)) + '</div>' +
        (status === 'rejected' ? '<p class="f-contest-review" role="status">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
        (!cards.some((card) => card.id === entry.cardId) ? '<p class="f-contest-review">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') : '';
      const links = '<div class="f-contest-actions"><a class="btn btn-soft" href="/dashboard/cards/new" data-link>' + text('上传卡片') +
        '</a><a class="btn btn-ghost" href="/dashboard/cards" data-link>' + text('我的卡片') + '</a></div>';
      if (!cards.length) {
        registration.innerHTML = statusHtml + '<p>' + text('暂无可参赛卡片。请先上传卡片并通过广场审核，再回来报名。') + '</p>' + links;
        return;
      }
      registration.innerHTML = statusHtml + '<p class="f-contest-form-intro">' + text('每个账号一份报名。待审核时可更新；已通过的报名如修改作品或报名资料，将重新审核。') + '</p>' +
        '<form data-entry-form>' + QSL.field({ label: QSL.t('参赛卡片'), required: true,
          hint: QSL.t('仅可选择本人已通过广场审核的卡片。'),
          input: '<select class="select" name="cardId" required><option value="">' + text('请选择参赛卡片') + '</option>' + cards.map((card) =>
            '<option value="' + esc(card.id) + '"' + (entry && entry.cardId === card.id ? ' selected' : '') + '>' + esc(card.title || QSL.t('未命名卡片')) + '</option>').join('') + '</select>' }) +
        '<div class="f-contest-preview" data-preview></div>' +
        QSL.field({ label: QSL.t('作品说明'), required: true, input: '<textarea class="textarea" name="description" rows="6" maxlength="2000" required>' + esc(entry && entry.description) + '</textarea>' }) +
        QSL.field({ label: QSL.t('联系邮箱'), required: true, hint: QSL.t('邮箱仅供本人及管理员查看，用于赛事联系，不会修改账号邮箱。'),
          input: '<input class="input" type="email" name="contactEmail" autocomplete="email" maxlength="120" required value="' + esc(entry ? entry.contactEmail : QSL.state.user.email || '') + '">' }) +
        '<p class="f-contest-form-error" role="alert" data-entry-error hidden></p>' +
        '<div class="f-contest-actions"><button class="btn btn-primary" type="submit">' + text(entry ? '更新报名' : '提交报名') + '</button>' +
        '<button class="btn btn-ghost" type="button" data-action="entry">' + text('刷新报名状态') + '</button></div></form>';
      preview();
    }

    function preview() {
      const select = registration.querySelector('[name="cardId"]');
      const target = registration.querySelector('[data-preview]');
      if (!select || !target) return;
      const card = cards.find((item) => item.id === select.value);
      target.innerHTML = card ? QSL.cardThumb(card, { height: 92 }) + '<span>' + esc(card.title || QSL.t('未命名卡片')) + '</span>' : '';
    }

    async function loadEntry() {
      const request = ++entryRequest;
      const user = QSL.state.user;
      entry = null;
      cards = [];
      if (!user) {
        registration.innerHTML = '<div class="f-contest-guest">' + QSL.icon('lock', 30) + '<h3>' + text('登录后报名') + '</h3><p>' +
          text('登录后选择自己的卡片，提交作品说明和联系邮箱。') + '</p><a class="btn btn-primary" href="/login?next=' +
          encodeURIComponent(path + '#registration') + '" data-link>' + text('登录并返回报名') + '</a></div>';
        return;
      }
      QSL.loading(registration);
      try {
        const [entryData, cardData] = await Promise.all([QSL.api.get(entryUrl), QSL.api.cards.mine()]);
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        entry = entryData.entry;
        cards = cardData.items.filter((card) => card.status === 'approved');
        renderEntry();
      } catch (err) {
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        registration.innerHTML = errorHtml(err.message || QSL.t('加载失败'), 'entry');
        QSL.toast(err.message || QSL.t('加载失败'), 'error');
      }
    }

    async function submit(event) {
      const form = event.target.closest('[data-entry-form]');
      if (!form) return;
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      const user = QSL.state.user;
      const request = entryRequest;
      const payload = QSL.formData(form);
      if (entry) payload.expectedRevision = entry.revision;
      const button = form.querySelector('[type="submit"]');
      const error = form.querySelector('[data-entry-error]');
      QSL.clearFieldErrors(form);
      error.hidden = true;
      saving = true;
      QSL.setBusy(button, true);
      form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });
      try {
        const result = await QSL.api.put(entryUrl, payload);
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        entry = result.entry;
        renderEntry();
        QSL.i18n.resetEdits();
        QSL.toast(QSL.t('报名已保存'), 'success');
      } catch (err) {
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        QSL.showFieldErrors(form, err.fields);
        error.textContent = err.status === 409 ? QSL.t('报名状态已变化。请先复制保留当前填写内容，再刷新报名状态后重试。') : err.message || QSL.t('保存失败，请重试');
        error.hidden = false;
        QSL.toast(error.textContent, 'error');
      } finally {
        saving = false;
        if (alive && form.isConnected) {
          form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = false; });
          QSL.setBusy(button, false);
        }
      }
    }

    container.addEventListener('submit', submit, { signal: events.signal });
    container.addEventListener('change', (event) => { if (event.target.name === 'cardId') preview(); }, { signal: events.signal });
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'news') loadNews();
      if (button.dataset.action === 'entry') {
        const form = registration.querySelector('form');
        if (form && !await QSL.confirm({ message: QSL.t('刷新会丢弃尚未保存的报名修改，是否继续？') })) return;
        if (alive && !saving) { QSL.i18n.resetEdits(); loadEntry(); }
      }
    }, { signal: events.signal });
    const offAuth = QSL.on('auth', () => { if (alive) loadEntry(); });
    loadNews();
    loadEntry();
    const frame = requestAnimationFrame(() => { if (alive) QSL.scrollToHash(); });
    return function cleanup() {
      alive = false;
      entryRequest++;
      events.abort();
      offAuth();
      cancelAnimationFrame(frame);
    };
  }

  QSL.registerPage('qsl-design-contest', { title: QSL.t('QSL设计大赛-2026.11'), render });
})();
