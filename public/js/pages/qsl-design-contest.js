/* QSLink · QSL 设计大赛 2026.11 */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;
  const text = (source) => esc(QSL.t(source));
  const path = '/events/qsl-design-2026-11';
  const eventKey = 'qsl-design-2026-11';

  function rules() {
    const sections = [
      { title: QSL.t('参赛规则'), icon: 'cards', items: [
        QSL.t('参赛卡片须先上传至卡片广场供大家换卡，通过广场审核后，再选择本人卡片提交比赛报名。每个账号保留一份报名，最多选择 2 件作品，可修改后重新提交。'),
        QSL.t('比赛采用一轮投票制：每个账号全赛期累计最多投 5 票，可投给五个不同作品，无每日限制；对每件作品最多投 1 票，投出后不可撤回，允许投给自己的作品。每个呼号仅可获得其最高名次的一项奖。'),
        QSL.t('账号正常可用即可投票，无需拥有广场卡片，也无需报名参赛。投票起止时间以赛事公布的安排为准，请从参赛作品列表进入作品详情投票，列表不提供快捷投票。'),
        QSL.t('报名开始、截止日期及完整赛程待公布。当前可提交报名，后续安排请关注赛事动态。')
      ] },
      { title: QSL.t('评分规则'), icon: 'star', items: [
        QSL.t('评分采用机器评分与人工评分相结合的方式：机器评分50分，人工评分30分。'),
        QSL.t('人工评分去掉一个最高分和一个最低分后，取其余评分的平均分。'),
        QSL.t('总分、公众投票权重、评分维度及完整评分细则待公布。作品票数不等于最终得分或获奖结果，页面不提供自动评分或获奖计算。')
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

  function alternateHero() {
    return '<div class="f-contest-alt-intro"><header class="f-contest-alt-copy">' +
      '<p class="f-contest-alt-eyebrow"><b>2026.11</b> · FIRST EDITION · QSL CARD DESIGN CONTEST</p>' +
      '<h1><span>' + text('第一届') + ' <span class="f-contest-brand">QSLink</span></span><span>' + text('QSL 卡片设计大赛') + '</span></h1>' +
      '<p class="f-contest-alt-subtitle">' + text('上传你的 QSL 卡片，参与评选，赢取十强好礼。') + '</p>' +
      '<div class="f-contest-alt-actions"><a class="btn btn-primary" href="' + path + '/registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 16) + '</a>' +
      '<a class="btn btn-soft" href="' + path + '/alternate#rules" data-link>' + '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v15M12 5C9 3 5 3 3 4v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 1Z"/></svg>' + text('参赛须知') + '</a></div>' +
      '<p class="f-contest-alt-status">' + text('报名通道开放中 · 截止日期待公布') + '</p>' +
      '<dl class="f-contest-alt-stats"><div><dt>10<small>' + text('名') + '</small></dt><dd>' + text('实物奖品') + '</dd></div>' +
      '<div><dt>50<small> + </small>30</dt><dd>' + text('机器 + 人工评分') + '</dd></div>' +
      '<div><dt>12.20</dt><dd>' + text('2026 颁奖日期') + '</dd></div></dl></header>' +
      '<figure class="f-contest-alt-figure"><div class="f-contest-alt-figure-head"><span class="f-contest-trophy-label">' + QSL.icon('trophy', 14) + text('冠军奖杯') + '</span><time datetime="2026-12-20">2026.12.20</time></div>' +
      '<div class="f-contest-alt-stage"><img src="/assets/contest-trophy.webp" width="1121" height="1403" alt="' + text('冠军奖杯') + '" decoding="async"></div>' +
      '<figcaption>' + text('奖杯示意图，真实奖杯的图片背景将由参赛卡片制成。') + '</figcaption></figure></div>';
  }

  function render(container, ctx) {
    let alive = true;
    let newsBusy = false;
    let newsPage = 0;
    let newsPages = 0;
    const events = new AbortController();
    const title = QSL.t('第一届QSLink杯QSL卡片设计大赛').split('QSLink').map(esc).join('<span class="f-contest-brand">QSLink</span>');
    const alternate = ctx.path === path + '/alternate';
    container.innerHTML = '<div class="f-contest container' + (alternate ? ' f-contest--alternate' : '') + '">' +
      (alternate ? alternateHero() : '<div class="f-contest-intro"><header class="f-contest-hero"><div class="f-contest-hero-copy">' +
      '<h1>' + title + '</h1>' +
      '<div class="f-contest-actions"><a class="btn btn-soft btn-lg" href="' + path + '#rules" data-link>' + text('参赛须知') + '</a>' +
      '<a class="btn btn-primary btn-lg" href="' + path + '/registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 18) + '</a></div></div></header>' +
      '<figure class="f-contest-hero-figure"><span class="f-contest-trophy-label">' + QSL.icon('trophy', 16) + text('冠军奖杯') + '</span>' +
      '<div class="f-contest-trophy-stage"><img class="f-contest-hero-image" src="/assets/contest-trophy.webp" width="1121" height="1403" alt="' + text('第一届QSLink杯QSL卡片设计大赛') + '" decoding="async"></div>' +
      '<figcaption>' + text('此为奖杯样式图，真实的奖杯中的图片背景会用参赛的卡片制成哦') + '</figcaption></figure></div>') +
      '<section class="f-contest-section" aria-labelledby="contest-news-title"><div class="f-contest-section-head"><span class="eyebrow">01</span>' +
      '<h2 id="contest-news-title">' + text('赛事动态') + '</h2></div>' + prizes() + '<div data-news aria-live="polite"></div>' +
      '<div class="f-contest-more"><button type="button" class="btn btn-soft" data-action="news" hidden>' + text('加载更多') + '</button></div></section>' +
      '<section class="f-contest-section" id="rules" aria-labelledby="contest-rules-title"><div class="f-contest-section-head"><span class="eyebrow">02</span>' +
      '<h2 id="contest-rules-title">' + text('参赛须知') + '</h2></div><div class="f-contest-rules">' + rules() + '</div></section></div>';
    const news = container.querySelector('[data-news]');
    const more = container.querySelector('[data-action="news"]');

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

    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'news') loadNews();
      if (button.dataset.action === 'prize-progress') loadPrizeProgress();
    }, { signal: events.signal });
    loadNews();
    loadPrizeProgress();
    const frame = requestAnimationFrame(() => { if (alive) QSL.scrollToHash(); });
    return function cleanup() {
      alive = false;
      events.abort();
      cancelAnimationFrame(frame);
    };
  }

  QSL.registerPage('qsl-design-contest', { title: QSL.t('第一届QSLink杯QSL卡片设计大赛'), render });
})();
