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
        QSL.t('禁止多账号刷票、脚本投票及付费买票。同一浏览器跨账号合计最多 5 票，系统限制高频请求；共用浏览器请注意共享额度，遇到误拦请联系管理员。'),
        QSL.t('账号正常可用即可投票，无需拥有广场卡片，也无需报名参赛。投票起止时间以赛事公布的安排为准，请从参赛作品列表进入作品详情投票，列表不提供快捷投票。'),
        QSL.t('报名开始、截止日期及完整赛程待公布。当前可提交报名，后续安排请关注赛事动态。')
      ] },
      { title: QSL.t('评分规则'), icon: 'star', items: [
        QSL.t('总分 100 分：机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分。'),
        QSL.t('机器评分由 3 个 AI 智能体分别打分（每个 0–10 分）后合计。'),
        QSL.t('人工评分由 5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人平均分 × 5。'),
        QSL.t('投票评分：作品前 5 票每票 2 分；再按有效得票数排名分为 10 段，分段赋 1–10 分。'),
        QSL.t('完整细则与算例见下方「评分细则」。作品票数不等于最终得分，页面不提供自动评分或获奖计算。')
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
    return '<section class="f-contest-prize f-contest-prizes" aria-labelledby="contest-prizes-title"> <div class="f-contest-prize-head"> <div class="f-contest-prize-head-main"> <p class="f-contest-prize-kicker">' + text('PRIZES · 奖品设置') +
      '</p> <h3 id="contest-prizes-title">' + text('十强好礼，等你来赢') +
      '</h3> </div> <p class="f-contest-prize-lead">' + text('十件实物奖品，按最终名次依次发放；冠军大奖将随审核通过的报名人数解锁升级。') +
      '</p> </div> <article class="f-contest-prize-champion" aria-labelledby="f-contest-prize-champion-title"> <div class="f-contest-prize-champion-top"> <div class="f-contest-prize-champion-copy"> <p class="f-contest-prize-rank"><span class="f-contest-prize-rank-no">01</span>' + text('第一名 · 冠军大奖') +
      '</p> <h4 class="f-contest-prize-champion-title" id="f-contest-prize-champion-title">' + text('森海克斯 8650') +
      '</h4> <p class="f-contest-prize-champion-sub">' + text('双段手持对讲机，冠军奖品起步即解锁。') +
      '</p> <ul class="f-contest-prize-champion-tags"> <li>' + text('双段手持对讲机') +
      '</li> <li>' + text('起步即解锁') +
      '</li> <li>' + text('100 人升级二选一') +
      '</li> <li>' + text('实体奖杯 + 奖状') +
      '</li> </ul> </div> <figure class="f-contest-prize-champion-media"> <span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span> <img src="/assets/contest-2026-11/senhai-8650.webp" width="800" height="800" loading="lazy" decoding="async" alt="' + text('森海克斯 8650 双段手持对讲机') +
      '"> <figcaption>' + text('冠军奖品 · 森海克斯 8650') +
      '</figcaption> </figure> </div> <div class="f-contest-prize-progress"><div class="f-contest-prizes-stat" data-prize-progress aria-live="polite"></div><p class="f-contest-prize-progress-note">' + text('每个审核通过的报名账号 +1 进度；达到 100 人后升级为二选一，不叠加领取森海克斯 8650。进度随当前审核通过人数实时变化。') +
      '</p></div> <div class="f-contest-prize-upgrade"> <div class="f-contest-prize-upgrade-copy"> <span class="f-contest-prize-flag">' + text('100 进度 · 大奖升级') +
      '</span> <h5 class="f-contest-prize-upgrade-title">' + text('拓竹 A1 mini') +
      '<em>' + text('或') +
      '</em>' + text('威诺 VR-N76') +
      '</h5> <p class="f-contest-prize-upgrade-desc">' + text('达到 100 名审核通过的报名者后，冠军奖品在以下两件中二选一领取，不与森海克斯 8650 叠加。') +
      '</p> </div> <div class="f-contest-prize-upgrade-items"> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span> <img src="/assets/contest-2026-11/a1-mini.webp" width="800" height="800" loading="lazy" decoding="async" alt="' + text('拓竹 A1 mini 桌面 3D 打印机') +
      '"> <figcaption><strong>' + text('拓竹 A1 mini') +
      '</strong><span>' + text('桌面 3D 打印机') +
      '</span></figcaption> </figure> <span class="f-contest-prize-or" aria-hidden="true">' + text('或') +
      '</span> <figure class="f-contest-prize-upgrade-item"> <span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span> <img src="/assets/contest-2026-11/vr-n76.webp" width="800" height="800" loading="lazy" decoding="async" alt="' + text('威诺 VR-N76 手持对讲机') +
      '"> <figcaption><strong>' + text('威诺 VR-N76') +
      '</strong><span>' + text('手持对讲机') +
      '</span></figcaption> </figure> </div> </div> </article> <div class="f-contest-prize-runners-head"> <div class="f-contest-prize-runners-heading"> <h4>' + text('第二至第五名') +
      '<span class="f-contest-prize-runners-chip">' + text('四件奖品 · 每人选一件') +
      '</span></h4> <p class="f-contest-prize-runners-note">' + text('四项奖品按获奖名次依次挑选，名次靠前者优先挑选。') +
      '</p> </div> </div> <div class="f-contest-prize-order" role="list" aria-label="' + text('奖品挑选顺序：按获奖名次依次挑选，名次靠前者优先') +
      '"> <span class="f-contest-prize-order-label">' + text('挑选顺序') +
      '</span> <span class="f-contest-prize-order-step is-first" role="listitem"><b>02</b><span>' + text('第 1 顺位') +
      '</span></span> <span class="f-contest-prize-order-arrow" aria-hidden="true"></span> <span class="f-contest-prize-order-step" role="listitem"><b>03</b><span>' + text('第 2 顺位') +
      '</span></span> <span class="f-contest-prize-order-arrow" aria-hidden="true"></span> <span class="f-contest-prize-order-step" role="listitem"><b>04</b><span>' + text('第 3 顺位') +
      '</span></span> <span class="f-contest-prize-order-arrow" aria-hidden="true"></span> <span class="f-contest-prize-order-step" role="listitem"><b>05</b><span>' + text('第 4 顺位') +
      '</span></span> <span class="f-contest-prize-order-hint">' + text('名次靠前者先选') +
      '</span> </div> <div class="f-contest-prize-runners"> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head"><span class="f-contest-prize-card-rank">01</span><span class="f-contest-prize-card-rank-label">' + text('奖品备选') +
      '</span><span class="f-contest-prize-card-pick">' + text('含实体奖状') +
      '</span></div> <figure class="f-contest-prize-card-media"><img src="/assets/contest-2026-11/rsp1.webp" width="646" height="342" loading="lazy" decoding="async" alt="' + text('晨科创 RSP1 SDR 软件无线电接收机') +
      '"></figure> <h4>' + text('晨科创 RSP1（自用款）') +
      '</h4> <p class="f-contest-prize-card-desc">' + text('SDR 软件无线电接收机 · 含实体奖状') +
      '</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head"><span class="f-contest-prize-card-rank">02</span><span class="f-contest-prize-card-rank-label">' + text('奖品备选') +
      '</span><span class="f-contest-prize-card-pick">' + text('含实体奖状') +
      '</span></div> <figure class="f-contest-prize-card-media"><span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span><img src="/assets/contest-2026-11/keyboard.webp" width="800" height="268" loading="lazy" decoding="async" alt="' + text('微星 FORGE GK300 W 红轴机械键盘') +
      '"></figure> <h4>' + text('微星 FORGE GK300 W') +
      '</h4> <p class="f-contest-prize-card-desc">' + text('红轴机械键盘 · 含实体奖状') +
      '</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head"><span class="f-contest-prize-card-rank">03</span><span class="f-contest-prize-card-rank-label">' + text('奖品备选') +
      '</span><span class="f-contest-prize-card-pick">' + text('含实体奖状') +
      '</span></div> <figure class="f-contest-prize-card-media"><span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span><img src="/assets/contest-2026-11/earphones.webp" width="800" height="800" loading="lazy" decoding="async" alt="' + text('水月雨 GM01 PRO 游戏耳机') +
      '"></figure> <h4>' + text('水月雨 GM01 PRO') +
      '</h4> <p class="f-contest-prize-card-desc">' + text('游戏耳机 · 含实体奖状') +
      '</p> </article> <article class="f-contest-prize-card"> <div class="f-contest-prize-card-head"><span class="f-contest-prize-card-rank">04</span><span class="f-contest-prize-card-rank-label">' + text('奖品备选') +
      '</span><span class="f-contest-prize-card-pick">' + text('含实体奖状') +
      '</span></div> <figure class="f-contest-prize-card-media"><span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span><img src="/assets/contest-2026-11/kita-plush.webp" width="800" height="800" loading="lazy" decoding="async" alt="' + text('《孤独摇滚！》喜多郁代毛绒玩偶') +
      '"></figure> <h4>' + text('《孤独摇滚！》喜多郁代') +
      '</h4> <p class="f-contest-prize-card-desc">' + text('毛绒玩偶 · 含实体奖状') +
      '</p> </article> </div> <article class="f-contest-prize-consolation"> <div class="f-contest-prize-consolation-copy"> <p class="f-contest-prize-rank"><span class="f-contest-prize-rank-no">06–10</span>' + text('第六至第十名') +
      '</p> <h4>' + text('771 天线') +
      '</h4> <p class="f-contest-prize-consolation-desc">' + text('五席好礼，为你的下一次通联加油；同时颁发电子奖状。') +
      '</p> </div> <figure class="f-contest-prize-consolation-media"> <span class="f-contest-prize-note">' + text('颜色/样式随机') +
      '</span> <img src="/assets/contest-2026-11/antenna-771.webp" width="320" height="800" loading="lazy" decoding="async" alt="' + text('771 双段天线') +
      '"> </figure> </article> <div class="f-contest-prize-badge" role="note" aria-label="' + text('赛事前三名永久铭牌标识说明') +
      '"> <span class="f-contest-prize-badge-icon" aria-hidden="true"> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"> <circle cx="12" cy="9" r="5.2"/> <path d="M8.6 13.3 7 21l5-2.4L17 21l-1.6-7.7"/> <path d="m10.2 9 1.3 1.3 2.3-2.6"/> </svg> </span> <div class="f-contest-prize-badge-main"> <p class="f-contest-prize-kicker">' + text('RANK BADGE · 铭牌标识') +
      '</p> <h4>' + text('赛事前三名 · 换卡界面永久铭牌') +
      '</h4> <p class="f-contest-prize-badge-desc">' + text('赛事前三名（冠军、亚军、季军）的作品将在「换卡界面」获得永久网站铭牌标识：展示赛事名称、届次与最终名次，长期保留，作为官方荣誉认证。') +
      '</p> </div> <ul class="f-contest-prize-badge-tags"> <li>' + text('永久展示') +
      '</li> <li>' + text('换卡界面可见') +
      '</li> <li>' + text('标注赛事与名次') +
      '</li> </ul> </div></section>';
  }

  function scoringDetails() {
    return '<div class="f-contest-scoring"> <div class="f-contest-score-head"> <div class="f-contest-score-head-main"> <p class="f-contest-prize-kicker">' + text('SCORING · 评分细则') +
      '</p> <h3 id="contest-scoring-title">' + text('总分 100 分怎么算') +
      '</h3> </div> <p class="f-contest-score-lead">' + text('机器评分 30 分 + 人工评分 50 分 + 投票评分 20 分，三项相加即作品最终得分（满分 100 分）。') +
      '</p> </div> <div class="f-contest-score-weights" role="img" aria-label="' + text('评分构成：机器评分 30 分、人工评分 50 分、投票评分 20 分') +
      '"> <div class="f-contest-score-weight-bar"> <span class="is-machine" style="flex:30"></span> <span class="is-human" style="flex:50"></span> <span class="is-vote" style="flex:20"></span> </div> <ul class="f-contest-score-weight-legend"> <li class="is-machine"><b>30</b><span>' + text('机器评分') +
      '</span></li> <li class="is-human"><b>50</b><span>' + text('人工评分') +
      '</span></li> <li class="is-vote"><b>20</b><span>' + text('投票评分') +
      '</span></li> </ul> </div> <div class="f-contest-score-grid"> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">01</span> <h4>' + text('机器评分') +
      '</h4> <span class="f-contest-score-card-pts">' + text('30 分') +
      '</span> </div> <p class="f-contest-score-card-desc">' + text('由 3 个 AI 智能体分别独立打分，每个智能体满分 10 分，三者合计为机器得分。') +
      '</p> <p class="f-contest-score-formula">' + text('AI ① + AI ② + AI ③（各 0–10 分）') +
      '</p> <ul class="f-contest-score-list"> <li>' + text('3 个智能体独立评分、互不影响；') +
      '</li> <li>' + text('单个智能体按 0–10 分打分，可保留 0.5 分；') +
      '</li> <li>' + text('三项相加即机器得分，满分 30 分。') +
      '</li> </ul> <p class="f-contest-score-example"><b>' + text('示例') +
      '</b>' + text('三个智能体分别打 8.5 / 9 / 8 分 → 机器得分 25.5 分。') +
      '</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">02</span> <h4>' + text('人工评分') +
      '</h4> <span class="f-contest-score-card-pts">' + text('50 分') +
      '</span> </div> <p class="f-contest-score-card-desc">' + text('5 位评委按 10 分制打分，去掉一个最高分和一个最低分，取剩余 3 人的平均分，再乘以 5 折算为 50 分制。') +
      '</p> <p class="f-contest-score-formula">' + text('剩余 3 人平均分 × 5（满分 50 分）') +
      '</p> <ul class="f-contest-score-list"> <li>' + text('5 位评委独立打分，每人满分 10 分；') +
      '</li> <li>' + text('去掉一个最高分、一个最低分；') +
      '</li> <li>' + text('剩余 3 人取平均后乘 5，满分 50 分。') +
      '</li> </ul> <p class="f-contest-score-example"><b>' + text('示例') +
      '</b>' + text('评委打分 8 / 7.5 / 7 / 6.5 / 6 分 → 去掉 8、6 → (7.5+7+6.5)÷3 = 7 → 7 × 5 = 35 分。') +
      '</p> </article> <article class="f-contest-score-card"> <div class="f-contest-score-card-head"> <span class="f-contest-score-card-no">03</span> <h4>' + text('投票评分') +
      '</h4> <span class="f-contest-score-card-pts">' + text('20 分') +
      '</span> </div> <p class="f-contest-score-card-desc">' + text('由「票数分 10 分」和「排名分 10 分」两部分组成。') +
      '</p> <p class="f-contest-score-formula">' + text('前 5 票 × 2 分 + 得票排名分段分') +
      '</p> <ul class="f-contest-score-list"> <li><b>' + text('票数分') +
      '</b>' + text('：作品前 5 票每票 2 分，满 5 票得 10 分；第 6 票起不再累加。') +
      '</li> <li><b>' + text('排名分') +
      '</b>' + text('：全部作品按有效得票数从高到低排名，平均分为 10 段（第 1 段票数最高），分段赋 10 至 1 分；同票同段同分。') +
      '</li> <li>' + text('投票分 = 票数分 + 排名分，满分 20 分。') +
      '</li> </ul> <p class="f-contest-score-example"><b>' + text('示例') +
      '</b>' + text('7 票、票数排名第 1 段 → 5×2+10 = 20 分；2 票、排名第 3 段 → 2×2+8 = 12 分。') +
      '</p> </article> </div> <div class="f-contest-score-total"> <p class="f-contest-score-total-title">' + text('算一笔总分：25.5 + 35 + 14 = 74.5') +
      '</p> <div class="f-contest-score-total-calc"> <span class="f-contest-score-total-item is-machine"><b>25.5</b><span>' + text('机器') +
      '</span></span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-human"><b>35</b><span>' + text('人工') +
      '</span></span> <span class="f-contest-score-total-op" aria-hidden="true">+</span> <span class="f-contest-score-total-item is-vote"><b>14</b><span>' + text('投票') +
      '</span></span> <span class="f-contest-score-total-op" aria-hidden="true">=</span> <span class="f-contest-score-total-item is-total"><b>74.5</b><span>' + text('总分') +
      '</span></span> </div> <p class="f-contest-score-total-note">' + text('示例作品：机器 25.5 分（8.5+9+8）；人工 35 分（去掉最高最低后剩余 3 人均分 7，×5）；投票 14 分（7 票 → 10 分；得票排名第 7 段 → 4 分），总分 74.5 分。') +
      '</p> </div> <p class="f-contest-score-tiebreak"><b>' + text('同分排名') +
      '</b>' + text('作品总分相同时，按人工评分得分高低进行排名；如人工评分也一致，交由赛事举办方做最终排名。') +
      '</p> <p class="f-contest-score-footnote">' + text('作品票数不等于最终得分；完整评分维度与争议处理以赛事方公布为准，页面不提供自动评分或获奖计算。') +
      '</p> </div>';
  }

  function alternateHero() {
    return '<div class="f-contest-alt-intro"><header class="f-contest-alt-copy">' +
      '<p class="f-contest-alt-eyebrow"><b>2026.11</b> · FIRST EDITION · QSL CARD DESIGN CONTEST</p>' +
      '<h1><span>' + text('第一届') + ' <span class="f-contest-brand">QSLink</span> ' + text('杯') + '</span><span>' + text('QSL 卡片设计大赛') + '</span></h1>' +
      '<p class="f-contest-alt-subtitle">' + text('上传你的 QSL 卡片，参与评选，赢取十强好礼。') + '</p>' +
      '<div class="f-contest-alt-actions"><a class="btn btn-primary" href="' + path + '/registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 16) + '</a>' +
      '<a class="btn btn-soft" href="' + path + '#rules" data-link>' + '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v15M12 5C9 3 5 3 3 4v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 1Z"/></svg>' + text('参赛须知') + '</a></div>' +
      '<p class="f-contest-alt-status">' + text('报名通道开放中 · 截止日期待公布') + '</p>' +
      '<dl class="f-contest-alt-stats"><div><dt>10<small>' + text('名') + '</small></dt><dd>' + text('实物奖品') + '</dd></div>' +
      '<div><dt>30<small> + </small>50<small> + </small>20</dt><dd>' + text('机器 + 人工 + 投票') + '</dd></div>' +
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
    const alternate = ctx.path !== path + '/alternate';
    container.innerHTML = '<div class="f-contest container' + (alternate ? ' f-contest--alternate' : '') + '">' +
      (alternate ? alternateHero() : '<div class="f-contest-intro"><header class="f-contest-hero"><div class="f-contest-hero-copy">' +
      '<h1>' + title + '</h1>' +
      '<div class="f-contest-actions"><a class="btn btn-soft btn-lg" href="' + path + '/alternate#rules" data-link>' + text('参赛须知') + '</a>' +
      '<a class="btn btn-primary btn-lg" href="' + path + '/registration" data-link>' + text('比赛报名') + QSL.icon('arrow-right', 18) + '</a></div></div></header>' +
      '<figure class="f-contest-hero-figure"><span class="f-contest-trophy-label">' + QSL.icon('trophy', 16) + text('冠军奖杯') + '</span>' +
      '<div class="f-contest-trophy-stage"><img class="f-contest-hero-image" src="/assets/contest-trophy.webp" width="1121" height="1403" alt="' + text('第一届QSLink杯QSL卡片设计大赛') + '" decoding="async"></div>' +
      '<figcaption>' + text('此为奖杯样式图，真实的奖杯中的图片背景会用参赛的卡片制成哦') + '</figcaption></figure></div>') +
      '<section class="f-contest-section" aria-labelledby="contest-news-title"><div class="f-contest-section-head"><span class="eyebrow">01</span>' +
      '<h2 id="contest-news-title">' + text('赛事动态') + '</h2></div><div data-news aria-live="polite"></div>' +
      '<div class="f-contest-more"><button type="button" class="btn btn-soft" data-action="news" hidden>' + text('加载更多') + '</button></div></section>' + prizes() +
      '<section class="f-contest-section" id="rules" aria-labelledby="contest-rules-title"><div class="f-contest-section-head"><span class="eyebrow">02</span>' +
      '<h2 id="contest-rules-title">' + text('参赛须知') + '</h2></div><div class="f-contest-rules">' + rules() + '</div>' + scoringDetails() + '</section></div>';
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
        prizeProgress.innerHTML = '<div class="f-contest-prize-progress-head"><span>' + esc(QSL.t('已通过审核：{n} 人', { n: count })) + '</span><span>' +
          (count >= 100 ? text('升级大奖已解锁，冠军二选一！') : esc(QSL.t('再有 {n} 人即可升级大奖', { n: 100 - count }))) + '</span></div>' +
          '<progress max="100" value="' + Math.min(count, 100) + '" aria-label="' + text('冠军奖品解锁进度') + '"></progress>';
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
