/* ============================================================
 * public/js/pages/home.js — 首页（cards-ui）
 * Hero 使用公共卡片列表中点赞最高的已审核卡片（生成卡）作为 3D 主角。
 * 契约：QSL.registerPage('home', { title, render })，render 可返回 cleanup。
 * ============================================================ */
(function () {
  'use strict';

  const QSL = window.QSL;
  if (!QSL) return;
  const esc = QSL.escapeHtml;

  function ic(name, size) {
    return QSL.icon ? QSL.icon(name, size) : '';
  }

  /* ---------------- 静态内容 ---------------- */
  const FEATURES = [
    {
      icon: '3d',
      tone: '',
      title: '真正的 3D 展示',
      desc: '拖拽旋转、双击翻面，卡片的厚度、金属与全息光泽随指尖流动，像把收藏捧在手心。'
    },
    {
      icon: 'send',
      tone: 'sky',
      title: '双向换卡申请',
      desc: '在线发起换卡、留言与填写邮寄地址；对方同意后才交换地址，流程清晰又安心。'
    },
    {
      icon: 'shield',
      tone: 'violet',
      title: '人工审核与隐私',
      desc: '每张卡片都经过人工审核，拒绝垃圾内容；地址仅在双方达成交换后可见，守护信任。'
    },
    {
      icon: 'share',
      tone: 'amber',
      title: '一枚链接即可分享',
      desc: '自动生成公开分享页，无需登录也能欣赏 3D 卡片，让好作品抵达更远的地方。'
    }
  ];

  const STEPS = [
    {
      title: '上传双面卡片',
      href: '/dashboard/cards/new',
      desc: '准备卡片的正反面图片，写下这张卡片背后的故事，让它在 3D 中立体呈现。'
    },
    {
      title: '等待人工审核',
      href: '/dashboard/cards?status=pending',
      desc: '管理员会检查卡片内容；通过后亮相卡片广场，被更多火腿发现与点赞。'
    },
    {
      title: '发起换卡申请',
      href: '/explore',
      desc: '在喜欢的卡片下申请换卡，留下地址与想说的话，等待对方回应。'
    },
    {
      title: '互寄，完成交换',
      href: '/dashboard/exchanges',
      desc: '双方同意后即可查看地址、邮寄卡片，在电波之外留下可触的纪念。'
    }
  ];

  const FAQS = [
    {
      q: '什么是 QSL 卡片？',
      a: 'QSL 卡片是业余无线电爱好者用于确认通联的纸质卡片，通常记录双方呼号、通联时间与信号报告等信息。它既是通联凭证，也是一张可以交换与收藏的「电波明信片」。'
    },
    {
      q: '上传卡片需要审核吗？',
      a: '需要。为了让广场保持干净与可信，每张新上传的卡片都会进入人工审核队列；通过后才会公开展示。审核中的卡片仅你自己可见，可以随时编辑补充内容。'
    },
    {
      q: '换卡时我的地址会公开吗？',
      a: '不会。地址只会在换卡申请被同意后，对参与交换的双方可见；申请中、被拒绝或取消时都不会展示。请放心填写准确的收件信息，以便顺利寄卡。'
    },
    {
      q: '可以把卡片分享给朋友吗？',
      a: '可以。每张卡片都有独立的分享链接，朋友无需登录即可通过 3D 查看器欣赏；他们也可以注册账号，回过头来向你申请换卡。'
    },
    {
      q: 'QSLink 收费吗？',
      a: '不收费。QSLink 由业余无线电爱好者共同建设与维护，用于展示、收藏与交换 QSL 卡片。你只需要注册一个账号，就可以免费使用全部功能。'
    }
  ];

  function skeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html +=
        '<div class="g-skeleton-card">' +
        '<div class="g-skeleton g-skeleton-media"></div>' +
        '<div class="g-skeleton g-skeleton-line" style="width:70%"></div>' +
        '<div class="g-skeleton g-skeleton-line" style="width:46%"></div>' +
        '</div>';
    }
    return html;
  }

  function fallbackTile(card) {
    /* 共享组件缺失时的兜底（正常情况下始终使用 QSL.cardTile） */
    const el = document.createElement('article');
    el.className = 'qsl-tile';
    const href = '/card/' + encodeURIComponent(card.id || '');
    el.innerHTML =
      '<div class="qsl-tile-frame"><a class="qsl-tile-media" href="' + esc(href) + '" data-link>' +
      '<span class="qsl-tile-img" style="aspect-ratio:' + esc(QSL.ratioCss(card.ratio)) + '">' +
      '<img ' + QSL.images.attributes(card.frontImage || QSL.PLACEHOLDER_IMAGE) + ' alt="' + esc(card.title || '') + '" loading="lazy">' +
      '</span></a></div>' +
      '<div class="qsl-tile-info"><a class="qsl-tile-title" href="' + esc(href) + '" data-link>' +
      esc(card.title || '未命名卡片') + '</a><div class="qsl-tile-meta">' +
      (QSL.ownerLine ? QSL.ownerLine(card.owner) : '') + '</div></div>';
    return el;
  }

  /* ---------------- 页面骨架 ---------------- */
  function heroHtml(user) {
    const primaryHref = user ? '/dashboard/cards/new' : '/register';
    const primaryLabel = user ? '上传我的卡片' : '开始交换';
    const secondaryHref = user ? '/dashboard' : '/explore';
    const secondaryLabel = user ? '进入个人中心' : '逛逛卡片广场';
    return (
      '<section class="g-hero">' +
      '<div class="g-hero__bg" aria-hidden="true"></div>' +
      '<div class="container g-hero__grid">' +
      '<div class="g-hero__copy">' +
      '<p class="eyebrow" data-reveal>QSL CARD EXCHANGE · 业余无线电</p>' +
      '<h1 class="g-hero__title" data-reveal data-reveal-delay="60">让每一张 QSL 卡片<br>在指尖<span class="g-hero__title-em">立体发光</span></h1>' +
      '<p class="g-hero__lede" data-reveal data-reveal-delay="120">上传你的双面 QSL 卡片，生成可翻转的 3D 展示；和电波那端的火腿点赞、交换，让每一次通联都有迹可循。</p>' +
      '<div class="g-hero__actions" data-reveal data-reveal-delay="180">' +
      '<a class="btn btn-primary btn-lg" href="' + primaryHref + '" data-link data-magnetic="10">' +
      esc(primaryLabel) + ic('arrow-right', 18) + '</a>' +
      '<a class="btn btn-ghost btn-lg" href="' + secondaryHref + '" data-link>' + ic('grid', 17) +
      '<span>' + esc(secondaryLabel) + '</span></a>' +
      '</div>' +
      '<p class="g-hero__trust" data-reveal data-reveal-delay="220">' + ic('check-circle', 15) +
      '<span>已收录 <b data-g-stat-text="cards">—</b> 张 QSL 卡片 · 地址只在双方同意后可见</span></p>' +
      '<dl class="g-hero__stats" data-reveal data-reveal-delay="260">' +
      '<div class="g-stat"><dt>收录卡片</dt><dd><span data-g-stat="cards">—</span><small>张</small></dd></div>' +
      '<div class="g-stat"><dt>独立呼号</dt><dd><span data-g-stat="callsigns">—</span><small>位</small></dd></div>' +
      '<div class="g-stat"><dt>累计点赞</dt><dd><span data-g-stat="likes">—</span><small>次</small></dd></div>' +
      '</dl>' +
      '</div>' +
      '<div class="g-hero__stage" data-reveal data-reveal-delay="140">' +
      '<img class="g-hero__ornament" src="/assets/hero-ornament.svg" alt="" aria-hidden="true" width="600" height="600" loading="lazy">' +
      '<span class="g-hero__glow" aria-hidden="true"></span>' +
      '<span class="g-hero__orbit g-hero__orbit--a" aria-hidden="true"></span>' +
      '<span class="g-hero__orbit g-hero__orbit--b" aria-hidden="true"></span>' +
      '<div class="g-hero__stage-mount" data-g-hero-mount aria-label="QSL 卡片 3D 展示"></div>' +
      '<span class="g-float-tag g-float-tag--band" data-g-tag="type">' + ic('3d', 15) + '<span>QSL · 3D</span></span>' +
      '<span class="g-float-tag g-float-tag--like" data-g-tag="like">' + ic('heart', 15) + '<b>—</b><span>次点赞</span></span>' +
      '<span class="g-float-tag g-float-tag--owner" data-g-tag="owner">' + ic('user', 14) + '<span>呼号</span></span>' +
      '<span class="g-float-tag g-float-tag--73">73!</span>' +
      '<span class="g-hero__spark g-hero__spark--a" aria-hidden="true">' + ic('sparkles', 20) + '</span>' +
      '<span class="g-hero__spark g-hero__spark--b" aria-hidden="true">' + ic('sparkles', 16) + '</span>' +
      '<span class="g-hero__spark g-hero__spark--c" aria-hidden="true">' + ic('sparkles', 13) + '</span>' +
      '<p class="g-hero__hint">拖拽旋转 · 双击翻面</p>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function showcaseHtml() {
    return (
      '<section class="section g-showcase" id="showcase">' +
      '<div class="container">' +
      '<div class="g-sec-head" data-reveal>' +
      '<div><p class="eyebrow">SHOWCASE</p>' +
      '<h2 class="g-sec-title">近期精选卡片</h2>' +
      '<p class="g-sec-desc">来自各地火腿的 QSL 卡片，每一张都记录着一次跨越电波的相遇。</p></div>' +
      '<a class="g-sec-link" href="/explore" data-link>查看全部' + ic('arrow-right', 16) + '</a>' +
      '</div>' +
      '<div class="g-showcase__grid" data-g-showcase aria-live="polite">' + skeletonCards(8) + '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function featuresHtml() {
    const cards = FEATURES.map(function (item, i) {
      return (
        '<article class="g-feature' + (item.tone ? ' g-feature--' + item.tone : '') + '" data-reveal data-reveal-delay="' + i * 80 + '">' +
        '<span class="g-feature__icon">' + ic(item.icon, 24) + '</span>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p>' + esc(item.desc) + '</p>' +
        '</article>'
      );
    }).join('');
    return (
      '<section class="section g-features" id="features">' +
      '<div class="container">' +
      '<div class="g-sec-head g-sec-head--center" data-reveal>' +
      '<p class="eyebrow">WHY QSLINK</p>' +
      '<h2 class="g-sec-title">为 QSL 收藏而生的细节</h2>' +
      '<p class="g-sec-desc">从展示到交换，每个环节都认真对待 —— 就像你对待每一张卡片那样。</p>' +
      '</div>' +
      '<div class="g-features__grid">' + cards + '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function howHtml() {
    const steps = STEPS.map(function (step, i) {
      return (
        '<li class="g-step" data-reveal data-reveal-delay="' + i * 70 + '">' +
        '<span class="g-step__no">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="g-step__body"><h3><a class="g-step__link" href="' + QSL.escapeAttr(step.href) + '" data-link>' + esc(step.title) +
        (i === 1 ? '<span class="badge badge-amber">人工审核</span>' : '') +
        (i === 3 ? '<span class="badge badge-mint">73!</span>' : '') +
        '</a></h3><p>' + esc(step.desc) + '</p></div>' +
        '</li>'
      );
    }).join('');
    return (
      '<section class="section g-how" id="how-it-works">' +
      '<div class="container g-how__grid">' +
      '<div class="g-how__intro" data-reveal>' +
      '<p class="eyebrow">HOW IT WORKS</p>' +
      '<h2 class="g-sec-title">四步，让一张卡片<br>完成一次旅行</h2>' +
      '<p>从上传到互寄，QSLink 把换卡流程变得清晰可循；你只需要专注于挑选那张想交换的卡片。</p>' +
      '<a class="btn btn-primary" href="/register" data-link data-magnetic="8">' + ic('arrow-right', 17) + '<span>免费开始</span></a>' +
      '</div>' +
      '<ol class="g-steps">' + steps + '</ol>' +
      '</div>' +
      '</section>'
    );
  }

  function faqHtml() {
    const items = FAQS.map(function (item, i) {
      return (
        '<details class="g-faq__item" data-reveal data-reveal-delay="' + i * 50 + '"' + (i === 0 ? ' open' : '') + '>' +
        '<summary>' + esc(item.q) + '</summary>' +
        '<p class="g-faq__answer">' + esc(item.a) + '</p>' +
        '</details>'
      );
    }).join('');
    return (
      '<section class="section g-faq" id="faq">' +
      '<div class="container g-faq__layout">' +
      '<div class="g-how__intro" data-reveal>' +
      '<p class="eyebrow">FAQ</p>' +
      '<h2 class="g-sec-title">关于换卡，<br>你可能想知道</h2>' +
      '<p>还有其它疑问？欢迎在卡片留言里找到我们，或者在换卡申请中直接询问卡片的主人。</p>' +
      '</div>' +
      '<div class="g-faq__list">' + items + '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function joinHtml(user) {
    const primaryHref = user ? '/dashboard/cards/new' : '/register';
    const primaryLabel = user ? '上传一张新卡片' : '免费注册';
    const secondaryHref = user ? '/explore' : '/explore';
    const secondaryLabel = user ? '发现更多卡片' : '先逛逛广场';
    return (
      '<section class="section g-join" id="join">' +
      '<div class="container">' +
      '<div class="g-join__panel" data-reveal>' +
      '<div class="g-join__copy">' +
      '<p class="eyebrow">JOIN THE AIRWAVE</p>' +
      '<h2 class="g-join__title">下一张被收藏的卡片，<br>也许就是你的</h2>' +
      '<p class="g-join__desc">把抽屉里的 QSL 卡片分享给更多火腿，让它从一次私人的通联纪念，变成一段被看见的故事。</p>' +
      '<div class="g-join__actions">' +
      '<a class="btn btn-primary btn-lg" href="' + primaryHref + '" data-link data-magnetic="8">' +
      esc(primaryLabel) + ic('arrow-right', 17) + '</a>' +
      '<a class="btn btn-ghost btn-lg" href="' + secondaryHref + '" data-link>' + esc(secondaryLabel) + '</a>' +
      '</div>' +
      '</div>' +
      '<div class="g-join__art" data-g-art aria-hidden="true">' +
      '<figure class="g-join__card g-join__card--back"><img src="' + esc(QSL.PLACEHOLDER_IMAGE) + '" alt="" loading="lazy"></figure>' +
      '<figure class="g-join__card g-join__card--front"><img src="' + esc(QSL.PLACEHOLDER_IMAGE) + '" alt="" loading="lazy"></figure>' +
      '<span class="g-hero__spark g-hero__spark--a">' + ic('sparkles', 18) + '</span>' +
      '<span class="g-hero__spark g-hero__spark--b">' + ic('sparkles', 14) + '</span>' +
      '<span class="g-hero__spark g-hero__spark--c">' + ic('sparkles', 12) + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  /* ---------------- 数据与交互 ---------------- */
  function pageHtml(user) {
    return (
      '<div class="g-home">' +
      heroHtml(user) +
      showcaseHtml() +
      featuresHtml() +
      howHtml() +
      faqHtml() +
      joinHtml(user) +
      '</div>'
    );
  }

  function mountFaq(root) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cleanups = [];
    root.querySelectorAll('.g-faq__item').forEach(function (item) {
      const summary = item.querySelector('summary');
      let expanded = item.open;
      let animation = null;
      item.dataset.expanded = String(expanded);

      function toggle(event) {
        // Leave native details behavior available when animation is unsupported.
        if (typeof item.animate !== 'function') return;
        event.preventDefault();
        const startHeight = item.getBoundingClientRect().height;
        if (animation) animation.cancel();
        expanded = !expanded;
        item.dataset.expanded = String(expanded);
        item.style.height = '';

        if (reducedMotion.matches) {
          item.open = expanded;
          animation = null;
          return;
        }

        // Measure the natural target height, then keep the answer rendered
        // until the closing animation finishes. Rapid clicks reverse smoothly.
        item.open = expanded;
        const endHeight = item.getBoundingClientRect().height;
        item.open = true;
        animation = item.animate([
          { height: startHeight + 'px' },
          { height: endHeight + 'px' }
        ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        animation.onfinish = function () {
          item.open = expanded;
          animation = null;
        };
      }

      summary.addEventListener('click', toggle);
      cleanups.push(function () {
        summary.removeEventListener('click', toggle);
        if (animation) animation.cancel();
      });
    });
    return function () { cleanups.forEach(function (cleanup) { cleanup(); }); };
  }

  function setStat(root, key, value, compact) {
    const el = root.querySelector('[data-g-stat="' + key + '"]');
    if (!el) return;
    const num = Math.max(0, Math.round(Number(value) || 0));
    el.textContent = compact ? QSL.formatNumber(num) : String(num);
    el.setAttribute('data-count', String(num));
    el.setAttribute('data-count-duration', '900');
    if (compact) el.setAttribute('data-count-format', 'compact');
  }

  function applyStats(root, items, total) {
    const callSignSet = new Set();
    let likes = 0;
    items.forEach(function (card) {
      const call = (card.owner && card.owner.callSign) || card.callSign || '';
      if (call) callSignSet.add(String(call).toUpperCase());
      likes += Number(card.likeCount) || 0;
    });
    setStat(root, 'cards', total || items.length, true);
    setStat(root, 'callsigns', callSignSet.size, false);
    setStat(root, 'likes', likes, true);
    const textEl = root.querySelector('[data-g-stat-text="cards"]');
    if (textEl) textEl.textContent = QSL.formatNumber(total || items.length);
    if (QSL.fx && typeof QSL.fx.enhance === 'function') {
      try { QSL.fx.enhance(root.querySelector('.g-hero__stats')); } catch (err) { /* 动效失败不影响数据 */ }
    }
  }

  function updateFloatTags(root, hero) {
    const likeTag = root.querySelector('[data-g-tag="like"]');
    if (likeTag) {
      likeTag.innerHTML = ic('heart', 15) + '<b>' + esc(QSL.formatNumber(hero.likeCount || 0)) + '</b><span>次点赞</span>';
    }
    const ownerTag = root.querySelector('[data-g-tag="owner"]');
    const owner = hero.owner || {};
    if (ownerTag) {
      ownerTag.innerHTML = ic('user', 14) +
        '<span>' + esc(owner.callSign || owner.displayName || owner.username || 'HAM') + '</span>';
    }
  }

  function applyJoinArt(root, items) {
    const art = root.querySelector('[data-g-art]');
    if (!art || !items.length) return;
    const withImages = items.filter(function (card) {
      return card.frontImage;
    });
    if (!withImages.length) return;
    const imgs = art.querySelectorAll('img');
    imgs.forEach(function (img, index) {
      const card = withImages[index] || withImages[0];
      QSL.images.apply(img, card.frontImage, img.clientWidth || 240);
      img.alt = '';
    });
  }

  function renderShowcase(root, state, items) {
    const grid = root.querySelector('[data-g-showcase]');
    if (!grid) return;
    grid.innerHTML = '';
    grid.classList.toggle('is-3', items.length > 0 && items.length <= 6);
    grid.classList.toggle('is-2', items.length > 0 && items.length <= 2);
    if (!items.length) {
      const wrap = document.createElement('div');
      wrap.className = 'g-empty-wrap';
      if (typeof QSL.emptyState === 'function') {
        wrap.appendChild(QSL.emptyState({
          icon: 'cards',
          title: '广场还在等第一张卡片',
          desc: '成为第一个分享 QSL 卡片的人吧，让你的通联纪念被更多火腿看见。',
          actionLabel: '上传我的第一张卡片',
          onAction: function () {
            const user = QSL.state && QSL.state.user;
            QSL.navigate(user ? '/dashboard/cards/new' : '/login?next=' + encodeURIComponent('/dashboard/cards/new'));
          }
        }));
      }
      grid.appendChild(wrap);
      return;
    }
    items.forEach(function (card, i) {
      let tile = null;
      try {
        tile = typeof QSL.cardTile === 'function' ? QSL.cardTile(card) : fallbackTile(card);
      } catch (err) {
        tile = fallbackTile(card);
      }
      if (!tile) return;
      tile.setAttribute('data-reveal', '');
      tile.setAttribute('data-reveal-delay', String(Math.min(i * 60, 420)));
      grid.appendChild(tile);
    });
    if (QSL.fx && typeof QSL.fx.enhance === 'function') {
      try { QSL.fx.enhance(grid); } catch (err) { /* 忽略 */ }
    }
  }

  function renderShowcaseError(root, retry) {
    const grid = root.querySelector('[data-g-showcase]');
    if (!grid) return;
    grid.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'g-empty-wrap';
    wrap.innerHTML =
      '<div class="g-error-panel">' +
      '<span class="empty-state-icon">' + ic('alert', 30) + '</span>' +
      '<h3>卡片加载失败</h3>' +
      '<p>电波暂时有点杂音，请稍后重试。你仍然可以先去卡片广场看看。</p>' +
      '<div class="btn-group"><button class="btn btn-primary" type="button" data-retry>重新加载</button>' +
      '<a class="btn btn-ghost" href="/explore" data-link>前往广场</a></div>' +
      '</div>';
    grid.appendChild(wrap);
    const btn = wrap.querySelector('[data-retry]');
    if (btn) btn.addEventListener('click', retry);
  }

  function mountHero(root, state, hero) {
    const mount = root.querySelector('[data-g-hero-mount]');
    if (!mount || !QSL.card3d) return;
    if (state.viewer) {
      try { state.viewer.destroy(); } catch (err) { /* 忽略 */ }
      state.viewer = null;
    }
    const ratio = hero.ratio || { w: 104, h: 154 };
    const instance = QSL.card3d.create(mount, {
      front: hero.frontImage || '',
      back: hero.backImage || '',
      ratio: ratio,
      width: 470,
      autoRotate: true,
      autoRotateSpeed: 4.5,
      idleDelay: 2400,
      initialYaw: -24,
      initialPitch: 6,
      interactive: true,
      showControls: false,
      initialSide: 'front',
      ambient: true
    });
    state.viewer = instance;
    mount.setAttribute(
      'aria-label',
      'QSL 卡片 3D 展示：' + (hero.title || 'QSL 卡片') + (hero.owner && hero.owner.callSign ? '（' + hero.owner.callSign + '）' : '')
    );
  }

  function loadData(root, state) {
    const cardsApi = QSL.api && QSL.api.cards;
    if (!cardsApi || typeof cardsApi.list !== 'function') {
      renderShowcaseError(root, function () { loadData(root, state); });
      return;
    }
    return cardsApi.list({ sort: 'popular', limit: 48 }).then(function (res) {
      if (state.cancelled) return;
      const items = (res && res.items) || [];
      const total = (res && res.total) || items.length;
      // 取点赞最高且有正图的已审核生成卡（列表已按 popular 排序）
      let hero = items.find(function (card) { return !!card.frontImage; });
      if (!hero) hero = items[0];
      if (!hero) {
        renderShowcase(root, state, []);
        mountHero(root, state, { ratio: { w: 104, h: 154 } });
        applyStats(root, [], total);
        return;
      }
      mountHero(root, state, hero);
      updateFloatTags(root, hero);
      applyStats(root, items, total);
      const featured = items.filter(function (card) { return card.id !== hero.id; }).slice(0, 8);
      renderShowcase(root, state, featured.length >= 4 ? featured : items.slice(0, 8));
      applyJoinArt(root, items);
    }).catch(function (err) {
      if (state.cancelled) return;
      mountHero(root, state, { ratio: { w: 104, h: 154 } });
      renderShowcaseError(root, function () { loadData(root, state); });
      if (QSL.toast) QSL.toast((err && err.message) || '卡片加载失败，请稍后重试', 'error');
    });
  }

  function mountAnnouncements(root, state) {
    const entry = document.createElement('div');
    entry.className = 'container g-announcement-entry';
    entry.innerHTML = '<button class="btn btn-ghost btn-sm" type="button">' + ic('info', 16) + '公告板 · 查看全部</button>';
    root.querySelector('.g-hero').after(entry);
    let notice = null;
    let modal = null;
    let modalJob = 0;
    let modalClosed = false;
    const eventController = new AbortController();

    function closeModal() {
      modalClosed = true;
      modalJob++;
      if (!modal) return;
      const overlay = modal.el.closest('.modal-overlay');
      if (overlay && overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
      modal.close();
      if (overlay) overlay.remove();
      modal = null;
    }
    async function loadPage(page) {
      const job = ++modalJob;
      modal.body.innerHTML = '<p class="muted">正在加载公告…</p>';
      try {
        const res = await QSL.api.get('/api/announcements?page=' + page + '&limit=8');
        if (state.cancelled || modalClosed || job !== modalJob) return;
        modal.body.innerHTML = '<div class="g-announcement-list">' + (res.items.length ? res.items.map(function (item) {
          return '<article><h3>' + esc(item.title) + '</h3><time class="muted">' + esc(QSL.formatDateTime(item.publishedAt)) + '</time><p class="g-announcement-body">' + esc(item.body) + '</p></article>';
        }).join('') : '<p class="muted">暂无已发布公告</p>') + '</div><div class="g-announcement-pager"><button type="button" class="btn btn-ghost btn-sm" data-ann-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button><span>' + page + ' / ' + Math.max(1, res.pages) + '</span><button type="button" class="btn btn-ghost btn-sm" data-ann-page="' + (page + 1) + '"' + (page >= res.pages ? ' disabled' : '') + '>下一页</button></div>';
      } catch (err) {
        if (state.cancelled || modalClosed || job !== modalJob) return;
        modal.body.innerHTML = '<p>公告加载失败，请关闭后重试。</p>';
        QSL.toast(err.message || '公告加载失败', 'error');
      }
    }
    function openAll() {
      closeModal();
      modalClosed = false;
      modal = QSL.modal({ title: '公告板', size: 'lg', content: '', onClose: function () {
        modalClosed = true;
        modalJob++;
        const overlay = modal && modal.el.closest('.modal-overlay');
        if (overlay && overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
      } });
      modal.body.addEventListener('click', function (event) {
        const btn = event.target.closest('[data-ann-page]');
        if (btn && !btn.disabled) loadPage(Number(btn.dataset.annPage));
      }, { signal: eventController.signal });
      loadPage(1);
    }
    entry.querySelector('button').addEventListener('click', openAll, { signal: eventController.signal });
    QSL.api.get('/api/announcements?page=1&limit=1').then(function (res) {
      if (state.cancelled || !res.items.length) return;
      const item = res.items[0];
      notice = document.createElement('aside');
      notice.className = 'g-announcement-notice';
      notice.setAttribute('aria-label', '最新公告');
      notice.innerHTML = '<div class="g-announcement-head"><span class="eyebrow">最新公告</span><button class="btn btn-ghost btn-icon btn-sm" type="button" data-ann-close aria-label="关闭公告">' + ic('close', 16) + '</button></div><h2>' + esc(item.title) + '</h2><time class="muted">' + esc(QSL.formatDateTime(item.publishedAt)) + '</time><p class="g-announcement-body">' + esc(item.body) + '</p><button type="button" class="btn btn-soft btn-sm" data-ann-all>查看全部公告</button>';
      notice.querySelector('[data-ann-close]').addEventListener('click', function () { notice.remove(); }, { signal: eventController.signal });
      notice.querySelector('[data-ann-all]').addEventListener('click', openAll, { signal: eventController.signal });
      root.appendChild(notice);
    }).catch(function (err) {
      if (!state.cancelled) QSL.toast(err.message || '公告加载失败', 'error');
    });
    return function () {
      eventController.abort();
      closeModal();
      if (notice) notice.remove();
      entry.remove();
    };
  }

  /* ---------------- 页面注册 ---------------- */
  QSL.registerPage('home', {
    title: '首页',
    render: function (container) {
      const user = QSL.state ? QSL.state.user : null;
      const state = { viewer: null, cancelled: false };

      container.innerHTML = pageHtml(user);
      const cleanupFaq = mountFaq(container);
      const cleanupAnnouncements = mountAnnouncements(container, state);

      // 先创建 3D 卡片（使用品牌占位面），卡片图片到达后再替换，避免空白等待
      mountHero(container, state, { ratio: { w: 104, h: 154 } });

      // Card data changes the height of sections above the footer anchors.
      // Wait for that layout before positioning a direct or cross-page link.
      Promise.resolve(loadData(container, state)).then(function () {
        requestAnimationFrame(function () {
          if (!state.cancelled) QSL.scrollToHash();
        });
      });

      return function cleanup() {
        state.cancelled = true;
        cleanupFaq();
        cleanupAnnouncements();
        if (state.viewer) {
          try { state.viewer.destroy(); } catch (err) { /* 忽略 */ }
          state.viewer = null;
        }
      };
    }
  });
})();
