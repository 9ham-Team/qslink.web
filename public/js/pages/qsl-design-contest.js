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
    let selected = [];
    let picker = null;
    let pickerCheck = null;
    const events = new AbortController();
    container.innerHTML = '<div class="f-contest container">' +
      '<header class="f-contest-hero"><div class="f-contest-hero-copy">' +
      '<h1>' + text('第一届QSLink QSL 卡片设计大赛') + '</h1>' +
      '<div class="f-contest-actions"><a class="btn btn-soft btn-lg" href="' + path + '#rules" data-link>' + text('参赛须知') + '</a>' +
      '<a class="btn btn-primary btn-lg" href="' + path + '#registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 18) + '</a></div></div>' +
      '<img class="f-contest-hero-image" src="/assets/contest-trophy.webp" width="1600" height="2000" alt="' + text('QSL 卡片设计大赛') + '" decoding="async"></header>' +
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
      const missing = entry && (entry.cardIds || []).some((id) => !cards.some((card) => card.id === id));
      selected = entry ? (entry.cardIds || []).filter((id) => cards.some((card) => card.id === id)) : [];
      const statusHtml = entry ? '<div class="f-contest-status"><h3>' + text('我的报名') + '</h3>' +
        (status === 'pending' ? QSL.badge(QSL.t('待审核'), 'amber') : QSL.statusBadge(status)) + '</div>' +
        (status === 'rejected' ? '<p class="f-contest-review" role="status">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
        (missing ? '<p class="f-contest-review">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') : '';
      const links = '<div class="f-contest-actions"><a class="btn btn-soft" href="/dashboard/cards/new" data-link>' + text('上传卡片') +
        '</a><a class="btn btn-ghost" href="/dashboard/cards" data-link>' + text('我的卡片') + '</a></div>';
      if (!cards.length) {
        registration.innerHTML = statusHtml + '<p>' + text('暂无可参赛卡片。请先上传卡片并通过广场审核，再回来报名。') + '</p>' + links;
        return;
      }
      registration.innerHTML = statusHtml + '<p class="f-contest-form-intro">' + text('每个账号一份报名。待审核时可更新；已通过的报名如修改作品或报名资料，将重新审核。') + '</p>' +
        '<form data-entry-form><div class="field" role="group" aria-label="' + esc(QSL.t('参赛卡片')) + '">' +
          '<span class="label">' + text('参赛卡片') + '<i class="req">*</i></span>' +
          '<div class="f-contest-cards"><div class="f-contest-selected" data-selected-cards></div>' +
            '<div class="f-contest-cards-foot"><button class="btn btn-soft" type="button" data-action="pick-cards">' + text('选择参赛卡片') + '</button>' +
            '<span class="hint" data-card-count role="status"></span></div></div>' +
          '<span class="hint">' + text('最多选择 3 张本人已通过广场审核的卡片。') + '</span></div>' +
        QSL.field({ label: QSL.t('作品说明'), required: true, input: '<textarea class="textarea" name="description" rows="6" maxlength="2000" required>' + esc(entry && entry.description) + '</textarea>' }) +
        QSL.field({ label: QSL.t('联系邮箱'), required: true, hint: QSL.t('邮箱仅供本人及管理员查看，用于赛事联系，不会修改账号邮箱。'),
          input: '<input class="input" type="email" name="contactEmail" autocomplete="email" maxlength="120" required value="' + esc(entry ? entry.contactEmail : QSL.state.user.email || '') + '">' }) +
        '<p class="f-contest-form-error" role="alert" data-entry-error hidden></p>' +
        '<div class="f-contest-actions"><button class="btn btn-primary" type="submit">' + text(entry ? '更新报名' : '提交报名') + '</button>' +
        '<button class="btn btn-ghost" type="button" data-action="entry">' + text('刷新报名状态') + '</button></div></form>';
      paintSelected();
    }

    function paintSelected() {
      const target = registration.querySelector('[data-selected-cards]');
      const count = registration.querySelector('[data-card-count]');
      if (!target) return;
      const chosen = cards.filter((card) => selected.includes(card.id));
      target.innerHTML = chosen.map((card) => '<div class="f-contest-selected-card">' +
        QSL.cardThumb(card, { height: 64 }) +
        '<div class="f-contest-selected-meta"><span title="' + esc(card.title || QSL.t('未命名卡片')) + '">' + esc(card.title || QSL.t('未命名卡片')) + '</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-action="remove-card" data-id="' + esc(card.id) + '">' + text('移除') + '</button></div></div>').join('');
      if (count) count.textContent = QSL.t('已选择 {n}/3 张', { n: chosen.length });
    }

    function updateSelected(ids) {
      const changed = ids.length !== selected.length || ids.some((id) => !selected.includes(id));
      selected = ids;
      paintSelected();
      const form = registration.querySelector('[data-entry-form]');
      if (changed && form) form.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function choiceHtml(card) {
      const checked = selected.includes(card.id) ? ' checked' : '';
      return '<label class="f-ex-choice"><input type="checkbox" name="contest-card" value="' + esc(card.id) + '"' + checked + '>' +
        '<span class="f-ex-choice__stage">' + (card.frontImage
          ? '<img alt="' + esc(card.title || QSL.t('未命名卡片')) + '" loading="lazy" decoding="async" ' + QSL.images.attributes(card.frontImage, '(max-width: 620px) calc((100vw - 96px) / 2), 220px') + '>'
          : QSL.icon('cards', 40)) + '</span><span class="f-ex-choice__name">' + esc(card.title || QSL.t('未命名卡片')) + '</span>' +
        '<span class="f-ex-choice__check" aria-hidden="true">' + QSL.icon('check', 16) + '</span></label>';
    }

    function openPicker() {
      if (!cards.length || picker) return;
      let pending = selected.filter((id) => cards.some((card) => card.id === id)).slice(0, 3);
      const options = {
        title: QSL.t('选择参赛卡片'), size: 'lg',
        content: '<p class="modal-text">' + text('最多选择 3 张本人已通过广场审核的卡片。') + '</p>' +
          '<p class="muted" data-picker-status role="status"></p><div class="f-ex-showcase" role="group" aria-label="' + esc(QSL.t('参赛卡片')) + '">' +
          cards.map(choiceHtml).join('') + '</div><p class="f-modal-error" data-picker-error hidden></p>',
        onClose: function () {
          picker = null;
          if (pickerCheck) pickerCheck.close();
        },
        actions: [
          { label: QSL.t('取消'), type: 'ghost' },
          { label: QSL.t('确认选择'), type: 'primary', closeOnClick: false, onClick: function (instance) {
            if (!pending.length) return false;
            confirmSelection(pending.slice(), instance);
            return false;
          } }
        ]
      };
      const modal = QSL.modal(options);
      picker = modal;
      const grid = modal.body.querySelector('.f-ex-showcase');
      const status = modal.body.querySelector('[data-picker-status]');
      const error = modal.body.querySelector('[data-picker-error]');
      const confirm = modal.el.querySelector('.modal-actions .btn-primary');

      function paint() {
        status.textContent = QSL.t('已选择 {n}/3 张', { n: pending.length });
        confirm.disabled = !pending.length;
        error.hidden = true;
      }
      paint();
      modal.body.addEventListener('change', function (event) {
        if (!event.target.matches('input[name="contest-card"]')) return;
        const ids = Array.from(grid.querySelectorAll('input[name="contest-card"]:checked')).map((input) => input.value);
        if (ids.length > 3) {
          event.target.checked = false;
          error.textContent = QSL.t('最多选择 3 张卡片');
          error.hidden = false;
          return;
        }
        pending = ids;
        paint();
      });
    }

    function confirmSelection(ids, modal) {
      const chosen = cards.filter((card) => ids.includes(card.id));
      if (pickerCheck) return;
      modal.el.inert = true;
      const check = QSL.modal({
        title: QSL.t('确认参赛卡片'), size: 'sm',
        content: '<p class="modal-text">' + esc(QSL.t('确认选择以下 {n} 张卡片作为参赛作品？确认后仍可修改并重新提交。', { n: chosen.length })) + '</p>' +
          '<ul class="f-contest-confirm-list">' + chosen.map((card) => '<li>' + esc(card.title || QSL.t('未命名卡片')) + '</li>').join('') + '</ul>',
        onClose: function () {
          pickerCheck = null;
          if (modal.el) modal.el.inert = false;
        },
        actions: [
          { label: QSL.t('返回修改'), type: 'ghost' },
          { label: QSL.t('确认'), type: 'primary', closeOnClick: false, onClick: function () {
            updateSelected(ids);
            check.close();
            modal.close();
          } }
        ]
      });
      pickerCheck = check;
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
      const error = form.querySelector('[data-entry-error]');
      error.hidden = true;
      if (!selected.length) {
        error.textContent = QSL.t('请选择 1–3 张参赛卡片');
        error.hidden = false;
        return;
      }
      const user = QSL.state.user;
      const request = entryRequest;
      const payload = QSL.formData(form);
      payload.cardIds = selected.slice();
      if (entry) payload.expectedRevision = entry.revision;
      const button = form.querySelector('[type="submit"]');
      QSL.clearFieldErrors(form);
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
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'news') loadNews();
      if (button.dataset.action === 'pick-cards') openPicker();
      if (button.dataset.action === 'remove-card') {
        updateSelected(selected.filter((id) => id !== button.dataset.id));
      }
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
      if (pickerCheck) pickerCheck.close();
      if (picker) picker.close();
    };
  }

  QSL.registerPage('qsl-design-contest', { title: QSL.t('QSL设计大赛-2026.11'), render });
})();
