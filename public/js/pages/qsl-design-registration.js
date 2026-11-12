/* QSLink · QSL 设计大赛报名 */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const text = (source) => esc(QSL.t(source));
  const path = '/events/qsl-design-2026-11/registration';
  const entryUrl = '/api/contests/qsl-design-2026-11/entry';
  const lengthOf = (value) => Array.from(value.trim()).length;
  const validDescription = (value) => lengthOf(value) >= 1 && lengthOf(value) <= 2000;
  const workNumber = (work) => work && work.number != null ? String(work.number).padStart(3, '0') : '';

  function render(container) {
    let alive = true;
    let entry = null;
    let cards = [];
    let entryRequest = 0;
    let saving = false;
    let editing = false;
    let entryBusy = false;
    let transitionId = 0;
    let animations = [];
    let outgoing = null;
    let selected = [];
    const drafts = new Map();
    let picker = null;
    let pickerCheck = null;
    let descriptionModal = null;
    let refreshModal = null;
    const events = new AbortController();
    container.innerHTML = '<div class="f-contest container">' + QSL.pageHeader({
      title: QSL.t('比赛报名'), desc: QSL.t('第一届QSLink杯QSL卡片设计大赛'),
      actions: '<a class="btn btn-soft" href="/events/qsl-design-2026-11" data-link>' + text('比赛信息') + '</a>'
    }) + '<section class="f-contest-registration" data-registration aria-live="polite"></section></div>';
    const registration = container.querySelector('[data-registration]');

    function errorHtml(message) {
      return '<div class="f-contest-notice" role="alert"><p>' + esc(message) + '</p><button class="btn btn-soft" type="button" data-action="entry">' + text('重试') + '</button></div>';
    }

    function closeModals() {
      if (descriptionModal) descriptionModal.close();
      if (pickerCheck) pickerCheck.close();
      if (picker) picker.close();
      if (refreshModal) refreshModal.close();
    }

    function resetDrafts() {
      drafts.clear();
      (entry && entry.works || []).forEach((work) => drafts.set(work.cardId, work.description || ''));
    }

    function workFor(id) {
      return (entry && entry.works || []).find((work) => work.cardId === id);
    }

    function submittedWorksHtml() {
      return '<div class="f-contest-submitted-works">' + (entry.works || []).map((work) =>
        '<article class="f-contest-submitted-work"><strong>' + esc(QSL.t('作品编号：{number}', { number: workNumber(work) })) + '</strong>' +
        '<h4>' + esc(work.card && work.card.title || QSL.t('未命名卡片')) + '</h4><p>' + esc(work.description) + '</p></article>'
      ).join('') + '</div>';
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
        const target = panel.querySelector('[data-result-title], input, [data-action="entry"], a');
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
      selected = entry ? (entry.cardIds || []).slice() : [];
      const statusHtml = entry ? '<div class="f-contest-status"><h3>' + text('我的报名') + '</h3>' +
        '<span>' + text('作品说明审核') + '</span>' + (status === 'pending' ? QSL.badge(QSL.t('待审核'), 'amber') : QSL.statusBadge(status)) + '</div>' +
        (status === 'rejected' ? '<p class="f-contest-review" role="status">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
        (missing ? '<p class="f-contest-review">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') : '';
      if (entry && !editing) {
        const state = status === 'approved' ? { label: '作品说明已通过审核', icon: 'check-circle' } :
          status === 'rejected' ? { label: '作品说明未通过审核', icon: 'alert' } : { label: '作品说明审核中', icon: 'clock' };
        showPanel('<div class="f-contest-result f-contest-result--' + esc(status) + '">' +
          '<span class="f-contest-result-icon" aria-hidden="true">' + QSL.icon(state.icon, 88) + '</span>' +
          '<p class="f-contest-result-label">' + text('我的报名') + '</p><h3 tabindex="-1" data-result-title>' + text(state.label) + '</h3>' +
          (status === 'rejected' ? '<p class="f-contest-result-note">' + text('驳回原因') + '：' + esc(entry.reviewReason || QSL.t('请修改后重新提交。')) + '</p>' : '') +
          (missing ? '<p class="f-contest-result-note">' + text('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') + '</p>' : '') +
          '<p class="f-contest-result-note">' + text('已通过广场审核的图片在报名后即可展示和接受投票；作品说明审核通过后公开，待审核或驳回不影响图片投票。') + '</p>' + submittedWorksHtml() + '<div class="f-contest-actions"><button class="btn btn-soft" type="button" data-action="entry">' + QSL.icon('refresh', 18) + text('刷新状态') + '</button>' +
          '<button class="btn btn-primary" type="button" data-action="edit-entry">' + QSL.icon('edit', 18) + text('修改报名信息') + '</button></div></div>', animate, focus);
        return;
      }
      const links = '<div class="f-contest-actions"><a class="btn btn-soft" href="/dashboard/cards/new" data-link>' + text('上传卡片') +
        '</a><a class="btn btn-ghost" href="/dashboard/cards" data-link>' + text('我的卡片') + '</a></div>';
      if (!cards.length && !selected.length) {
        showPanel(statusHtml + '<p>' + text('暂无可参赛卡片。请先上传卡片并通过广场审核，再回来报名。') + '</p>' + links, animate, focus);
        return;
      }
      showPanel(statusHtml + '<p class="f-contest-form-intro">' + text('每个账号一份报名，最多选择 2 件作品。已通过广场审核的图片提交报名后即可展示和接受投票；作品说明审核通过后公开，修改报名资料需重新审核说明。') + '</p>' +
        '<form data-entry-form><div class="field" role="group" aria-label="' + text('参赛卡片') + '">' +
          '<span class="label">' + text('参赛卡片') + '<i class="req">*</i></span>' +
          '<div class="f-contest-cards"><div class="f-contest-selected" data-selected-cards></div>' +
            '<div class="f-contest-cards-foot"><button class="btn btn-soft" type="button" data-action="pick-cards">' + text('选择参赛卡片') + '</button>' +
            '<span class="hint" data-card-count role="status"></span></div></div>' +
          '<span class="hint">' + text('最多选择 2 张本人已通过广场审核的卡片。') + '</span>' +
          '<span class="hint">' + text('请为每张参赛作品填写 1–2000 字说明，最终提交报名时统一保存。') + '</span></div>' +
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
      const chosen = selected.map((id) => cards.find((card) => card.id === id) || (workFor(id) || {}).card || { id });
      target.innerHTML = chosen.map((card) => {
        const description = drafts.get(card.id) || '';
        const number = workNumber(workFor(card.id));
        return '<div class="f-contest-selected-card">' + QSL.cardThumb(card, { height: 64 }) +
          '<div class="f-contest-selected-meta"><span title="' + esc(card.title || QSL.t('未命名卡片')) + '">' + esc(card.title || QSL.t('未命名卡片')) + '</span></div>' +
          '<p class="f-contest-work-number">' + (number ? esc(QSL.t('作品编号：{number}', { number })) : text('提交后分配作品编号')) + '</p>' +
          '<p class="f-contest-description-state' + (validDescription(description) ? ' is-complete' : '') + '">' + text(validDescription(description) ? '作品说明已填写' : '作品说明必填') + '</p>' +
          (description ? '<p class="f-contest-description-preview">' + esc(description) + '</p>' : '') +
          '<div class="f-contest-work-actions"><button class="btn btn-ghost btn-sm" type="button" data-action="description" data-id="' + esc(card.id) + '" aria-label="' + esc(QSL.t('编辑作品说明：{title}', { title: card.title || QSL.t('未命名卡片') })) + '">' + text('作品说明') + '</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="remove-card" data-id="' + esc(card.id) + '">' + text('移除') + '</button></div></div>';
      }).join('');
      if (count) count.textContent = QSL.t('已选择 {n}/2 张', { n: chosen.length });
    }

    function updateSelected(ids) {
      const changed = ids.length !== selected.length || ids.some((id) => !selected.includes(id));
      selected = ids;
      paintSelected();
      const form = registration.querySelector('[data-entry-form]');
      if (changed && form) form.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openDescription(id) {
      if (descriptionModal || saving || entryBusy) return;
      const card = cards.find((item) => item.id === id) || (workFor(id) || {}).card;
      if (!card || !selected.includes(id)) return;
      const modalEvents = new AbortController();
      const number = workNumber(workFor(id));
      const modal = QSL.modal({
        title: QSL.t('作品说明'),
        content: '<div class="f-contest-description-editor"><h3>' + esc(card.title || QSL.t('未命名卡片')) + '</h3>' +
          '<p class="hint">' + (number ? esc(QSL.t('作品编号：{number}', { number })) : text('提交后分配作品编号')) + '</p>' +
          '<label class="field"><span class="label">' + text('作品说明') + '<i class="req">*</i></span>' +
          '<textarea class="textarea" rows="8" required data-description aria-describedby="contest-description-hint contest-description-count contest-description-error">' + esc(drafts.get(id) || '') + '</textarea></label>' +
          '<p class="hint" id="contest-description-hint">' + text('请填写 1–2000 字作品说明。保存仅更新当前草稿，提交报名后才会保存到服务器。') + '</p>' +
          '<p class="hint" id="contest-description-count" data-description-count role="status"></p>' +
          '<p class="f-modal-error" id="contest-description-error" data-description-error role="alert" hidden></p></div>',
        onClose: function () {
          modalEvents.abort();
          descriptionModal = null;
          if (alive) {
            const button = Array.from(registration.querySelectorAll('[data-action="description"]')).find((item) => item.dataset.id === id);
            if (button) button.focus({ preventScroll: true });
          }
        },
        actions: [
          { label: QSL.t('取消'), type: 'ghost' },
          { label: QSL.t('保存草稿'), type: 'primary', closeOnClick: false, onClick: function () {
            const value = input.value.trim();
            if (!validDescription(value)) {
              error.textContent = QSL.t('作品说明须为 1–2000 字');
              error.hidden = false;
              input.setAttribute('aria-invalid', 'true');
              input.focus();
              return false;
            }
            drafts.set(id, value);
            paintSelected();
            const form = registration.querySelector('[data-entry-form]');
            if (form) form.dispatchEvent(new Event('change', { bubbles: true }));
            modal.close();
            return false;
          } }
        ]
      });
      descriptionModal = modal;
      const input = modal.body.querySelector('[data-description]');
      const count = modal.body.querySelector('[data-description-count]');
      const error = modal.body.querySelector('[data-description-error]');
      function paintCount() {
        const length = lengthOf(input.value);
        count.textContent = QSL.t('{n} / 2000 字', { n: length });
        count.classList.toggle('is-invalid', length > 2000);
        input.removeAttribute('aria-invalid');
        error.hidden = true;
      }
      input.addEventListener('input', paintCount, { signal: modalEvents.signal });
      paintCount();
      input.focus();
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
      if (!cards.length || picker || saving || entryBusy) return;
      let pending = selected.slice();
      const modalEvents = new AbortController();
      const modal = QSL.modal({
        title: QSL.t('选择参赛卡片'), size: 'lg',
        content: '<p class="modal-text">' + text('最多选择 2 张本人已通过广场审核的卡片。') + '</p>' +
          '<p class="muted" data-picker-status role="status"></p><div class="f-ex-showcase" role="group" aria-label="' + text('参赛卡片') + '">' +
          cards.map(choiceHtml).join('') + '</div><p class="f-modal-error" data-picker-error hidden></p>',
        onClose: function () {
          modalEvents.abort();
          picker = null;
          if (pickerCheck) pickerCheck.close();
        },
        actions: [
          { label: QSL.t('取消'), type: 'ghost' },
          { label: QSL.t('确认选择'), type: 'primary', closeOnClick: false, onClick: function (instance) {
            if (!pending.length || pending.length > 2) return false;
            confirmSelection(pending.slice(), instance);
            return false;
          } }
        ]
      });
      picker = modal;
      const grid = modal.body.querySelector('.f-ex-showcase');
      const status = modal.body.querySelector('[data-picker-status]');
      const error = modal.body.querySelector('[data-picker-error]');
      const confirm = modal.el.querySelector('.modal-actions .btn-primary');
      function paint() {
        status.textContent = QSL.t('已选择 {n}/2 张', { n: pending.length });
        confirm.disabled = !pending.length || pending.length > 2;
        error.hidden = true;
      }
      paint();
      modal.body.addEventListener('change', function (event) {
        if (!event.target.matches('input[name="contest-card"]')) return;
        const ids = pending.filter((id) => !cards.some((card) => card.id === id)).concat(
          Array.from(grid.querySelectorAll('input[name="contest-card"]:checked')).map((input) => input.value));
        if (ids.length > 2 && event.target.checked) {
          event.target.checked = false;
          error.textContent = QSL.t('最多选择 2 张卡片');
          error.hidden = false;
          return;
        }
        pending = ids;
        paint();
      }, { signal: modalEvents.signal });
    }

    function confirmSelection(ids, modal) {
      const chosen = ids.map((id) => cards.find((card) => card.id === id) || (workFor(id) || {}).card || { id });
      if (pickerCheck) return;
      modal.el.inert = true;
      const check = QSL.modal({
        title: QSL.t('确认参赛卡片'), size: 'sm',
        content: '<p class="modal-text">' + esc(QSL.t('确认选择以下 {n} 张卡片作为参赛作品？确认后仍可修改并重新提交。', { n: chosen.length })) + '</p>' +
          '<ul class="f-contest-confirm-list">' + chosen.map((card) => '<li>' + esc(card.title || QSL.t('未命名卡片')) + '</li>').join('') + '</ul>',
        onClose: function () { pickerCheck = null; if (modal.el) modal.el.inert = false; },
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
      closeModals();
      const request = ++entryRequest;
      const user = QSL.state.user;
      const preserve = refresh && !!registration.querySelector('.f-contest-panel');
      entryBusy = true;
      if (!refresh) { entry = null; cards = []; editing = false; drafts.clear(); }
      if (!user) {
        entryBusy = false;
        registration.removeAttribute('aria-busy');
        showPanel('<div class="f-contest-guest">' + QSL.icon('lock', 30) + '<h3>' + text('登录后报名') + '</h3><p>' +
          text('登录后选择自己的卡片，提交作品说明和联系邮箱。') + '</p><a class="btn btn-primary" href="/login?next=' +
          encodeURIComponent(path) + '" data-link>' + text('登录并返回报名') + '</a></div>');
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
        resetDrafts();
        QSL.i18n.resetEdits();
        renderEntry(preserve);
      } catch (err) {
        if (!alive || request !== entryRequest || QSL.state.user !== user) return;
        if (!preserve) showPanel(errorHtml(err.message || QSL.t('加载失败')));
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
      if (!selected.length || selected.length > 2) {
        error.textContent = QSL.t('请选择 1–2 张参赛卡片');
        error.hidden = false;
        return;
      }
      const missing = selected.find((id) => !validDescription(drafts.get(id) || ''));
      if (missing) {
        error.textContent = QSL.t('请为每张参赛作品填写 1–2000 字说明');
        error.hidden = false;
        openDescription(missing);
        return;
      }
      const user = QSL.state.user;
      const request = entryRequest;
      const payload = QSL.formData(form);
      payload.works = selected.map((id) => ({ cardId: id, description: drafts.get(id).trim() }));
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
        resetDrafts();
        renderEntry(true, true);
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
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled || button.closest('[inert]') || entryBusy || saving) return;
      if (button.dataset.action === 'edit-entry' && entry) { editing = true; renderEntry(true, true); }
      if (button.dataset.action === 'pick-cards') openPicker();
      if (button.dataset.action === 'description') openDescription(button.dataset.id);
      if (button.dataset.action === 'remove-card') updateSelected(selected.filter((id) => id !== button.dataset.id));
      if (button.dataset.action === 'entry') {
        const form = registration.querySelector('.f-contest-panel:not(.f-contest-panel-out) form');
        if (!form) { loadEntry(true); return; }
        if (refreshModal) return;
        refreshModal = QSL.modal({
          title: QSL.t('请确认'), size: 'sm',
          content: '<p class="modal-text">' + text('刷新会丢弃尚未保存的报名修改，是否继续？') + '</p>',
          onClose: function () { refreshModal = null; },
          actions: [
            { label: QSL.t('取消'), type: 'ghost' },
            { label: QSL.t('确认'), type: 'primary', onClick: function () { if (alive && !saving) loadEntry(true); } }
          ]
        });
      }
    }, { signal: events.signal });
    const offAuth = QSL.on('auth', () => { if (alive) loadEntry(); });
    loadEntry();
    return function cleanup() {
      alive = false;
      entryRequest++;
      stopTransition();
      events.abort();
      offAuth();
      closeModals();
      drafts.clear();
    };
  }

  QSL.registerPage('qsl-design-registration', { title: QSL.t('比赛报名'), render });
})();
