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
        QSL.t('实物奖品共十名，前五名领奖时须核验操作证号、执照号与呼号一致，并提供相关证明材料供人工审核；报名阶段不收集这些证照资料。领奖时间、寄送方式及其他发放安排待公布。')
      ] }
    ];
    return sections.map((section, index) => '<article class="f-contest-rule"><div class="f-contest-rule-head">' +
      '<span class="f-contest-rule-icon">' + QSL.icon(section.icon, 24) + '</span><span class="eyebrow">0' + (index + 1) +
      '</span></div><h3>' + esc(section.title) + '</h3><ul>' + section.items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul></article>').join('');
  }

  function prizes() {
    return '<section class="f-contest-prizes" aria-labelledby="contest-prizes-title">' +
      '<h3 id="contest-prizes-title">' + text('十强好礼，等你来赢') + '</h3>' +
      '<article class="f-contest-prizes-champion"><h4>' + QSL.icon('trophy', 26) + text('第一名 · 冠军大奖') + '</h4>' +
      '<div class="f-contest-prizes-milestones"><div class="f-contest-prizes-bubble"><span>' + text('0 进度 · 起步即解锁') + '</span><strong>' + text('森海克斯 8650') + '</strong></div>' +
      '<div class="f-contest-prizes-bubble f-contest-prizes-upgrade"><span>' + text('100 进度 · 大奖升级') + '</span><strong>' + text('拓竹 A1 mini') + '</strong><span>' + text('或') + '</span><strong>' + text('威诺 VR-N76') + '</strong><b>' + text('二选一哦') + '</b></div></div>' +
      '<div class="f-contest-prizes-stat" data-prize-progress aria-live="polite"></div>' +
      '<p class="f-contest-prizes-note">' + text('每个审核通过的报名账号 +1 进度；达到 100 人后升级为二选一，不叠加领取森海克斯 8650。进度随当前审核通过人数实时变化。') + '</p></article>' +
      '<div class="f-contest-prizes-runners"><article><h4>' + text('第二至第五名') + '</h4><p class="f-contest-prizes-items">' + text('SDR / 键盘 / 耳机 /《孤独摇滚！》喜多郁代玩偶') + '</p><p>' + text('按获奖排名顺序选择，名次靠前优先挑选。') + '</p></article>' +
      '<article><h4>' + text('第六至第十名') + '</h4><p class="f-contest-prizes-items">' + text('771 天线') + '</p><p>' + text('五席好礼，为你的下一次通联加油。') + '</p></article></div></section>';
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
    let editing = false;
    let entryBusy = false;
    let transitionId = 0;
    let animations = [];
    let outgoing = null;
    let selected = [];
    let picker = null;
    let pickerCheck = null;
    const events = new AbortController();
    container.innerHTML = '<div class="f-contest container">' +
      '<header class="f-contest-hero"><div class="f-contest-hero-copy">' +
      '<h1>' + text('第一届QSLink QSL 卡片设计大赛') + '</h1>' +
      '<div class="f-contest-actions"><a class="btn btn-soft btn-lg" href="' + path + '#rules" data-link>' + text('参赛须知') + '</a>' +
      '<a class="btn btn-primary btn-lg" href="' + path + '#registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 18) + '</a></div></div>' +
      '<figure class="f-contest-hero-figure"><img class="f-contest-hero-image" src="/assets/contest-trophy.webp" width="1600" height="2000" alt="' + text('QSL 卡片设计大赛') + '" decoding="async">' +
      '<figcaption>' + text('此为奖杯样式图，真实的奖杯中的图片背景会用参赛的卡片制成哦') + '</figcaption></figure></header>' +
      '<section class="f-contest-section" aria-labelledby="contest-news-title"><div class="f-contest-section-head"><span class="eyebrow">01</span>' +
      '<h2 id="contest-news-title">' + text('赛事动态') + '</h2></div>' + prizes() + '<div data-news aria-live="polite"></div>' +
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

    let prizeRequest = 0;
    const prizeProgress = container.querySelector('[data-prize-progress]');
    async function loadPrizeProgress() {
      const request = ++prizeRequest;
      prizeProgress.setAttribute('aria-busy', 'true');
      prizeProgress.innerHTML = '<p>' + text('正在加载奖品进度…') + '</p>';
      try {
        const data = await QSL.api.get('/api/contests/' + eventKey);
        if (!alive || request !== prizeRequest) return;
        const count = data.contest.approvedRegistrationCount;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error(QSL.t('奖品进度加载失败'));
        prizeProgress.innerHTML = '<progress max="100" value="' + Math.min(count, 100) + '" aria-label="' + text('冠军奖品解锁进度') + '"></progress>' +
          '<div class="f-contest-prizes-scale" aria-hidden="true"><span>0</span><span>100</span></div>' +
          '<div class="f-contest-prizes-count"><span>' + esc(QSL.t('已通过审核：{n} 人', { n: count })) + '</span><span>' +
          (count >= 100 ? text('升级大奖已解锁，冠军二选一！') : esc(QSL.t('再有 {n} 人即可升级大奖', { n: 100 - count }))) + '</span></div>';
      } catch (err) {
        if (!alive || request !== prizeRequest) return;
        prizeProgress.innerHTML = errorHtml(QSL.t('奖品进度加载失败'), 'prize-progress');
      } finally {
        if (alive && request === prizeRequest) prizeProgress.removeAttribute('aria-busy');
      }
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

    function stopTransition() {
      transitionId++;
      animations.forEach((animation) => animation.cancel());
      animations = [];
      if (outgoing) outgoing.remove();
      outgoing = null;
      registration.classList.remove('is-transitioning');
    }

    function showPanel(html, animate, focus, setup) {
      const startHeight = registration.getBoundingClientRect().height;
      stopTransition();
      const previous = registration.firstElementChild;
      const moveFocus = focus || registration.contains(document.activeElement);
      const panel = document.createElement('div');
      panel.className = 'f-contest-panel';
      panel.innerHTML = html;
      const motion = animate && previous && typeof registration.animate === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (motion) {
        const padding = getComputedStyle(registration);
        previous.inert = true;
        previous.setAttribute('aria-hidden', 'true');
        previous.classList.add('f-contest-panel-out');
        previous.style.top = padding.paddingTop;
        previous.style.left = padding.paddingLeft;
        previous.style.right = padding.paddingRight;
        outgoing = previous;
      } else registration.replaceChildren();
      registration.append(panel);
      if (setup) setup(panel);
      if (moveFocus) {
        const target = panel.querySelector('[data-result-title], textarea, [data-action="entry"], a');
        if (target) target.focus({ preventScroll: true });
      }
      if (!motion) return;
      const endHeight = registration.getBoundingClientRect().height;
      const id = transitionId;
      const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
      registration.classList.add('is-transitioning');
      animations = [
        registration.animate([{ height: startHeight + 'px' }, { height: endHeight + 'px' }], { duration: 520, easing }),
        previous.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }], { duration: 160, fill: 'forwards', easing }),
        panel.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 400, delay: 100, fill: 'backwards', easing })
      ];
      const icon = panel.querySelector('.f-contest-result-icon');
      if (icon) animations.push(icon.animate([
        { transform: 'scale(.65) rotate(-12deg)', opacity: 0 },
        { transform: 'scale(1.06) rotate(2deg)', opacity: 1, offset: .7 },
        { transform: 'scale(1) rotate(0)', opacity: 1 }
      ], { duration: 420, delay: 100, fill: 'backwards', easing }));
      panel.querySelectorAll('.f-contest-result .btn').forEach((button, index) => {
        animations.push(button.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 260, delay: 180 + index * 60, fill: 'backwards', easing }));
      });
      animations[0].onfinish = () => { if (alive && id === transitionId) stopTransition(); };
    }

    function renderEntry(animate, focus) {
      const status = entry && entry.status;
      const missing = entry && (entry.cardIds || []).some((id) => !cards.some((card) => card.id === id));
      selected = entry ? (entry.cardIds || []).filter((id) => cards.some((card) => card.id === id)) : [];
      const statusHtml = entry ? '<div class="f-contest-status"><h3>' + text('我的报名') + '</h3>' +
        (status === 'pending' ? QSL.badge(QSL.t('待审核'), 'amber') : QSL.statusBadge(status)) + '</div>' +
        (status === 'rejected' ? '<p class="f-contest-review" role="status">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
        (missing ? '<p class="f-contest-review">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') : '';
      if (entry && !editing) {
        const state = status === 'approved' ? { label: '已通过', icon: 'check-circle' } :
          status === 'rejected' ? { label: '未通过', icon: 'alert' } : { label: '审核中', icon: 'clock' };
        showPanel('<div class="f-contest-result f-contest-result--' + esc(status) + '">' +
          '<span class="f-contest-result-icon" aria-hidden="true">' + QSL.icon(state.icon, 88) + '</span>' +
          '<p class="f-contest-result-label">' + text('我的报名') + '</p><h3 tabindex="-1" data-result-title>' + text(state.label) + '</h3>' +
          (status === 'rejected' ? '<p class="f-contest-result-note">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
          (missing ? '<p class="f-contest-result-note">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') +
          '<div class="f-contest-actions"><button class="btn btn-soft" type="button" data-action="entry">' + QSL.icon('refresh', 18) + text('刷新状态') + '</button>' +
          '<button class="btn btn-primary" type="button" data-action="edit-entry">' + QSL.icon('edit', 18) + text('修改报名信息') + '</button></div></div>', animate, focus);
        return;
      }
      const links = '<div class="f-contest-actions"><a class="btn btn-soft" href="/dashboard/cards/new" data-link>' + text('上传卡片') +
        '</a><a class="btn btn-ghost" href="/dashboard/cards" data-link>' + text('我的卡片') + '</a></div>';
      if (!cards.length) {
        showPanel(statusHtml + '<p>' + text('暂无可参赛卡片。请先上传卡片并通过广场审核，再回来报名。') + '</p>' + links, animate, focus);
        return;
      }
      showPanel(statusHtml + '<p class="f-contest-form-intro">' + text('每个账号一份报名。待审核时可更新；已通过的报名如修改作品或报名资料，将重新审核。') + '</p>' +
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
        '<button class="btn btn-ghost" type="button" data-action="entry">' + text('刷新报名状态') + '</button></div></form>', animate, focus, paintSelected);
    }

    function paintSelected(panel) {
      const root = panel || registration.querySelector('.f-contest-panel:not(.f-contest-panel-out)') || registration;
      const target = root.querySelector('[data-selected-cards]');
      const count = root.querySelector('[data-card-count]');
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

    async function loadEntry(refresh) {
      if (refresh && (entryBusy || saving)) return;
      const request = ++entryRequest;
      const user = QSL.state.user;
      const preserve = refresh && !!registration.querySelector('.f-contest-panel');
      entryBusy = true;
      if (!refresh) { entry = null; cards = []; editing = false; }
      if (!user) {
        entryBusy = false;
        registration.removeAttribute('aria-busy');
        showPanel('<div class="f-contest-guest">' + QSL.icon('lock', 30) + '<h3>' + text('登录后报名') + '</h3><p>' +
          text('登录后选择自己的卡片，提交作品说明和联系邮箱。') + '</p><a class="btn btn-primary" href="/login?next=' +
          encodeURIComponent(path + '#registration') + '" data-link>' + text('登录并返回报名') + '</a></div>');
        return;
      }
      if (!preserve) { stopTransition(); QSL.loading(registration); }
      registration.setAttribute('aria-busy', 'true');
      const controls = Array.from(registration.querySelectorAll('input, select, textarea, button'));
      const disabled = controls.map((control) => control.disabled);
      controls.forEach((control) => { control.disabled = true; });
      const refreshButton = registration.querySelector('[data-action="entry"]');
      if (refreshButton) QSL.setBusy(refreshButton, true);
      try {
        const [entryData, cardData] = await Promise.all([QSL.api.get(entryUrl), QSL.api.cards.mine()]);
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        entry = entryData.entry;
        cards = cardData.items.filter((card) => card.status === 'approved');
        editing = false;
        QSL.i18n.resetEdits();
        renderEntry(preserve);
      } catch (err) {
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        if (!preserve) showPanel(errorHtml(err.message || QSL.t('加载失败'), 'entry'));
        QSL.toast(err.message || QSL.t('加载失败'), 'error');
      } finally {
        if (alive && request === entryRequest) {
          entryBusy = false;
          registration.removeAttribute('aria-busy');
          if (refreshButton) QSL.setBusy(refreshButton, false);
          controls.forEach((control, index) => { control.disabled = disabled[index]; });
        }
      }
    }

    async function submit(event) {
      const form = event.target.closest('[data-entry-form]');
      if (!form) return;
      event.preventDefault();
      if (saving || entryBusy || form.closest('[inert]') || !form.reportValidity()) return;
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
        editing = false;
        renderEntry(true, true);
        QSL.i18n.resetEdits();
        QSL.toast(QSL.t('报名已保存'), 'success');
        loadPrizeProgress();
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
      if (!button || button.disabled || button.closest('[inert]')) return;
      if (button.dataset.action === 'edit-entry' && entry && !entryBusy && !saving) {
        editing = true;
        renderEntry(true, true);
      }
      if (button.dataset.action === 'news') loadNews();
      if (button.dataset.action === 'prize-progress') loadPrizeProgress();
      if (button.dataset.action === 'pick-cards') openPicker();
      if (button.dataset.action === 'remove-card') {
        updateSelected(selected.filter((id) => id !== button.dataset.id));
      }
      if (button.dataset.action === 'entry') {
        if (entryBusy || saving) return;
        const form = registration.querySelector('.f-contest-panel:not(.f-contest-panel-out) form');
        if (form && !await QSL.confirm({ message: QSL.t('刷新会丢弃尚未保存的报名修改，是否继续？') })) return;
        if (alive && !saving) loadEntry(true);
      }
    }, { signal: events.signal });
    const offAuth = QSL.on('auth', () => { if (alive) loadEntry(); });
    loadNews();
    loadPrizeProgress();
    loadEntry();
    const frame = requestAnimationFrame(() => { if (alive) QSL.scrollToHash(); });
    return function cleanup() {
      alive = false;
      entryRequest++;
      stopTransition();
      events.abort();
      offAuth();
      cancelAnimationFrame(frame);
      if (pickerCheck) pickerCheck.close();
      if (picker) picker.close();
    };
  }

  QSL.registerPage('qsl-design-contest', { title: QSL.t('QSL设计大赛-2026.11'), render });
})();
