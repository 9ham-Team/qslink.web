/* QSLink · 赛事作品详情与投票 */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const text = (source) => esc(QSL.t(source));
  const worksPath = '/events/qsl-design-2026-11/works';

  async function fingerprint() {
    try {
      if (!window.crypto || !window.crypto.subtle) return '';
      const source = JSON.stringify([navigator.userAgent, navigator.language, navigator.hardwareConcurrency || 0]);
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (_) { return ''; }
  }

  QSL.registerPage('qsl-design-work-detail', {
    title: QSL.t('参赛作品'),
    render(container, ctx) {
      const endpoint = '/api/contests/qsl-design-2026-11/works/' + encodeURIComponent(ctx.params.id);
      let alive = true, request = 0, viewer = null, shareCleanup = null, confirmation = null, busy = false;
      let work, voting;
      const events = new AbortController();
      container.innerHTML = '<div class="g-contest-detail container"><nav class="g-crumbs" aria-label="' + text('面包屑') + '">' +
        '<a href="/events/qsl-design-2026-11" data-link>' + text('比赛信息') + '</a><span>/</span>' +
        '<a href="' + worksPath + '" data-link>' + text('参赛作品') + '</a></nav><div data-content></div></div>';
      const content = container.querySelector('[data-content]');

      function release() {
        if (viewer) { viewer.destroy(); viewer = null; }
        if (shareCleanup) { shareCleanup(); shareCleanup = null; }
        if (confirmation) { confirmation.close(); confirmation = null; }
      }
      function voteState() {
        const button = content.querySelector('[data-vote]');
        if (!button) return;
        const voted = voting.votedWorkIds.some((id) => String(id) === String(work.id));
        let label = '为这件作品投票', reason = '';
        if (!voting.isOpen) { label = '当前不在投票时间'; reason = '请在赛事投票时间内参与。'; }
        else if (!QSL.state.user) { label = '登录后投票'; reason = '登录后即可参与赛事投票。'; }
        else if (voted) { label = '已投票'; reason = '你已经支持过这件作品。'; }
        else if (voting.votesUsed >= 3) { label = '赛事票数已用完'; reason = '本赛事的 3 票已全部使用。'; }
        else if (voting.votedToday) { label = '今日已投票'; reason = '今天已使用 1 票，请明天再来。'; }
        else if (!voting.eligible) { label = '暂不可投票'; reason = '当前账号暂不符合投票条件。'; }
        button.innerHTML = QSL.icon('ballot', 18) + '<span>' + text(label) + '</span>';
        button.disabled = busy || !voting.isOpen || (!!QSL.state.user && (voted || voting.votesUsed >= 3 || voting.votedToday || !voting.eligible));
        content.querySelector('[data-vote-count]').textContent = QSL.t('{n} 票', { n: work.voteCount });
        content.querySelector('[data-vote-status]').textContent = QSL.t(reason);
        content.querySelector('[data-vote-used]').textContent = QSL.state.user ? QSL.t('本赛事已用 {n} / 3 票', { n: voting.votesUsed }) : '';
      }
      function render() {
        release();
        const card = work.card;
        const number = String(work.number).padStart(3, '0');
        document.title = (card.title || QSL.t('参赛作品')) + ' · QSLink';
        content.innerHTML = '<div class="g-contest-detail__grid"><section class="g-contest-detail__viewer g-panel">' +
          '<div class="g-contest-detail__stage" data-viewer aria-label="' + text('3D 卡片查看器') + '"></div>' +
          '<p class="hint">' + text('拖拽旋转 · 双击翻面') + '</p></section><section class="g-contest-detail__info">' +
          '<p class="eyebrow">' + esc(QSL.t('作品编号：{n}', { n: number })) + '</p><h1>' + esc(card.title || QSL.t('未命名卡片')) + '</h1>' +
          '<div class="g-contest-detail__author">' + QSL.ownerLine(card.owner) + '</div>' +
          '<p class="hint">' + text('上传时间') + ' · ' + esc(QSL.formatDateTime(card.createdAt)) + '</p>' +
          '<h2>' + text('作品说明') + '</h2><p class="g-contest-detail__description">' + esc(work.description) + '</p>' +
          '<section class="g-contest-detail__voting" aria-label="' + text('赛事投票') + '"><strong data-vote-count aria-live="polite"></strong>' +
          '<p class="hint">' + text('每账号按北京时间每天 1 票，本赛事共 3 票；同一作品只能投 1 次，允许为自己投票。投票后不可撤回。') + '</p>' +
          '<p class="hint">' + text('须当前至少有一张已通过广场审核的卡片才能投票。') + '</p>' +
          '<p class="hint">' + text('投票时间') + ' · ' + esc(QSL.formatDateTime(voting.startsAt)) + ' — ' + esc(QSL.formatDateTime(voting.endsAt)) + '</p>' +
          '<p class="hint" data-vote-used></p><div class="g-contest-detail__actions"><button type="button" class="btn btn-primary" data-vote></button>' +
          '<button type="button" class="btn btn-soft" data-share>' + QSL.icon('share', 18) + text('分享作品') + '</button></div>' +
          '<p class="hint" data-vote-status role="status"></p></section></section></div>';
        viewer = QSL.card3d.create(content.querySelector('[data-viewer]'), {
          front: card.frontImage || '', back: card.backImage || '', ratio: card.ratio || { w: 3, h: 2 }, width: 430,
          autoRotate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          interactive: true, showControls: true, ambient: true
        });
        shareCleanup = QSL.cardShare.bind(content.querySelector('[data-share]'), card, { contestWork: work });
        voteState();
      }
      async function load() {
        const serial = ++request;
        release();
        QSL.loading(content);
        try {
          const data = await QSL.api.get(endpoint);
          if (!alive || serial !== request) return;
          work = data.work; voting = data.voting;
          render();
        } catch (err) {
          if (alive && serial === request) QSL.renderError(content, err, load);
        }
      }
      async function submitVote() {
        if (!alive || busy) return;
        busy = true;
        voteState();
        const serial = request;
        try {
          const summary = await fingerprint();
          if (!alive || serial !== request) return;
          const data = await QSL.api.post(endpoint + '/vote', { fingerprint: summary });
          if (!alive || serial !== request) return;
          work = data.work; voting = data.voting;
          QSL.toast(QSL.t('投票成功，感谢你的支持！'));
        } catch (err) {
          if (!alive || serial !== request) return;
          QSL.toast(err.message || QSL.t('投票失败，请稍后重试'), 'error');
          try {
            const data = await QSL.api.get(endpoint);
            if (!alive || serial !== request) return;
            work = data.work; voting = data.voting;
          } catch (_) { /* 保留当前视图，允许重试。 */ }
        } finally {
          busy = false;
          if (alive && serial === request) voteState();
        }
      }
      content.addEventListener('click', (event) => {
        const button = event.target.closest('[data-vote]');
        if (!button || button.disabled || busy || confirmation) return;
        if (!QSL.state.user) {
          QSL.navigate('/login?next=' + encodeURIComponent(worksPath + '/' + encodeURIComponent(ctx.params.id)));
          return;
        }
        confirmation = QSL.modal({
          title: QSL.t('确认投票'),
          content: '<p>' + esc(QSL.t('确定为作品 {n} 投出 1 票吗？投票后不可撤回。', { n: String(work.number).padStart(3, '0') })) + '</p>',
          actions: [{ label: QSL.t('取消'), type: 'ghost' }, { label: QSL.t('确认投票'), type: 'primary', onClick: (modal) => { modal.close(); submitVote(); } }],
          onClose: () => { confirmation = null; }
        });
      }, { signal: events.signal });
      load();
      return () => { alive = false; request++; events.abort(); release(); };
    }
  });
})();
