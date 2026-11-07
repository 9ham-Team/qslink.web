/* Card-detail sharing: hover/focus menu, touch dialog and local PNG poster. */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = QSL.escapeHtml;

  function image(src, signal) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Only use same-origin uploads so the canvas remains exportable.
      const url = new URL(src, location.origin);
      if (url.origin !== location.origin) return reject(new Error(QSL.t("无法导出站外图片")));
      if (signal.aborted) return reject(new Error(QSL.t("已取消生成")));
      function finish(err) {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        signal.removeEventListener('abort', cancel);
        if (err) { img.src = ''; reject(err); } else resolve(img);
      }
      function cancel() { finish(new Error(QSL.t("已取消生成"))); }
      const timer = setTimeout(() => finish(new Error(QSL.t("卡片图片加载超时，请重试"))), 15000);
      signal.addEventListener('abort', cancel, { once: true });
      img.onload = () => finish();
      img.onerror = () => finish(new Error(QSL.t("卡片图片加载失败，请重试")));
      img.src = url.href;
    });
  }

  async function poster(card, url, signal) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1320;
    const ctx = canvas.getContext('2d');
    const img = card.frontImage ? await image(card.frontImage, signal) : null;
    const palette = QSL.posterPalette.fromImage(img);
    const { ink, muted, accent: green } = palette;
    const sans = '"Microsoft YaHei", "PingFang SC", sans-serif';
    const serif = 'Georgia, "Songti SC", "SimSun", serif';
    const mono = 'Consolas, monospace';
    const owner = card.owner || {};
    const callSign = card.callSign || owner.callSign || '';
    const logo = await image('/assets/logo-mark.svg', signal);
    const background = ctx.createLinearGradient(0, 0, 1080, 1320);
    background.addColorStop(0, palette.backgroundTop); background.addColorStop(1, palette.backgroundBottom);
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1320);
    function rounded(x, y, w, h, radius, fill, shadow) {
      ctx.save();
      if (shadow) { ctx.shadowColor = palette.shadow; ctx.shadowBlur = 26; ctx.shadowOffsetY = 16; }
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    }
    function rule(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function small(text, x, y, color, align) {
      ctx.fillStyle = color || muted; ctx.font = '11px ' + mono;
      ctx.textAlign = align || 'left'; ctx.fillText(text, x, y); ctx.textAlign = 'left';
    }
    function line(text, x, y, width) {
      let value = Array.from(String(text || '')).slice(0, 160).join('');
      if (ctx.measureText(value).width > width) {
        while (value && ctx.measureText(value + '…').width > width) value = Array.from(value).slice(0, -1).join('');
        value += '…';
      }
      ctx.fillText(value, x, y);
    }
    // Stationery header and postmark stay outside the card image.
    ctx.drawImage(logo, 88, 36, 36, 36);
    ctx.fillStyle = green; ctx.font = 'bold 26px ' + sans; ctx.fillText('QSLink', 134, 63);
    ctx.fillStyle = muted; ctx.font = '24px ' + serif; ctx.fillText('/', 228, 63);
    ctx.fillStyle = ink; ctx.font = '14px ' + sans; ctx.fillText(QSL.t("QSL 卡片交换"), 251, 61);
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
    rule(88, 132, 992, 132);
    for (let row = 0; row < 4; row++) {
      ctx.beginPath();
      for (let x = 800; x <= 882; x++) {
        const y = 60 + row * 12 + Math.sin((x - 800) / 6) * 3;
        if (x === 800) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.save(); ctx.translate(948, 80); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.font = 'italic 22px ' + serif; ctx.fillText('73', 0, 1);
    ctx.font = '8px ' + mono; ctx.fillText('QSL CARD EXCHANGE', 0, 17); ctx.restore();
    // Print corner marks, with no badge or extra subtitle over the card.
    ctx.strokeStyle = palette.line;
    [[30, 30, 1, 1], [1050, 30, -1, 1], [30, 1290, 1, -1], [1050, 1290, -1, -1]].forEach(([x, y, dx, dy]) => {
      rule(x, y, x + dx * 13, y); rule(x, y, x, y + dy * 13);
    });
    ctx.save(); ctx.translate(30, 580); ctx.rotate(Math.PI / 2); small('Q S L   C A R D   E X C H A N G E', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(1045, 610); ctx.rotate(Math.PI / 2); small('P U B L I C   S H A R E  /  7 3', 0, 0); ctx.restore();
    const ratio = img ? img.naturalWidth / img.naturalHeight : Number(card.ratio && card.ratio.w) / Number(card.ratio && card.ratio.h);
    const imageRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5;
    const w = Math.min(858, 572 * imageRatio), h = w / imageRatio;
    const imageX = (1080 - w) / 2, imageY = 181 + (572 - h) / 2;
    rounded(imageX - 23, imageY - 21, w + 46, h + 44, 24, palette.surface, true);
    rounded(imageX - 12, imageY - 11, w + 24, h + 23, 17, palette.inset);
    if (img) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(imageX, imageY, w, h, 9); ctx.clip();
      ctx.drawImage(img, imageX, imageY, w, h); ctx.restore();
    } else {
      ctx.fillStyle = muted; ctx.font = '36px ' + serif; ctx.fillText(QSL.t("QSL 卡片"), 135, 490);
    }
    ctx.strokeStyle = palette.line; rule(88, 807, 112, 807);
    small(QSL.t("QSL CARD · FRONT · 正面"), 122, 812);
    small(QSL.t("PUBLIC SHARE · 公开分享"), 992, 812, muted, 'right');
    ctx.fillStyle = ink; ctx.font = 'bold 50px ' + serif;
    line(card.title || QSL.t("未命名卡片"), 88, 878, 660);
    ctx.fillStyle = muted; ctx.font = '14px ' + sans; ctx.fillText(QSL.t("双面 3D 卡片"), 88, 916);
    small(QSL.t("CALL SIGN · 呼号"), 992, 849, muted, 'right');
    ctx.textAlign = 'right'; ctx.fillStyle = green; ctx.font = 'bold 22px ' + mono;
    line(callSign || '—', 992, 878, 200); ctx.textAlign = 'left';
    // QR modules retain square geometry and a full four-module quiet zone.
    rounded(88, 946, 904, 296, 24, palette.surface, true);
    rounded(112, 972, 246, 246, 18, '#ffffff');
    const qr = QSL.qr.canvas(url, 5, 245);
    ctx.drawImage(qr, 112 + Math.floor((246 - qr.width) / 2), 972 + Math.floor((246 - qr.height) / 2));
    small('S C A N  T O  V I E W', 384, 1044, green);
    ctx.fillStyle = ink; ctx.font = '28px ' + serif; ctx.fillText(QSL.t("扫码欣赏双面 3D 卡片"), 384, 1085);
    ctx.fillStyle = muted; ctx.font = '14px ' + sans; ctx.fillText(QSL.t("申请换卡 · 地址仅在双方同意后可见"), 384, 1118);
    ctx.fillStyle = green; ctx.font = '14px ' + mono; line(new URL(url).host, 384, 1152, 470);
    ctx.strokeStyle = palette.line; ctx.setLineDash([2, 4]); rule(886, 976, 886, 1213); ctx.setLineDash([]);
    small('O P E N', 940, 1066, muted, 'center');
    ctx.save(); ctx.shadowColor = palette.shadow; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    ctx.beginPath(); ctx.arc(940, 1105, 26, 0, Math.PI * 2); ctx.fillStyle = green; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    rule(933, 1105, 947, 1105); rule(942, 1100, 947, 1105); rule(942, 1110, 947, 1105);
    ctx.strokeStyle = palette.line; ctx.lineWidth = 1; rule(88, 1275, 992, 1275);
    ctx.fillStyle = muted; ctx.font = '10px ' + mono;
    line('73 DE ' + (callSign || 'QSLink') + ' · QSL CARD EXCHANGE', 88, 1297, 700);
    small('QSLink', 948, 1297, muted, 'right'); ctx.drawImage(logo, 964, 1283, 28, 28);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(QSL.t("图片生成失败"))), 'image/png'));
  }

  async function contestPoster(card, work, url, signal) {
    const img = card.frontImage ? await image(card.frontImage, signal) : null;
    const palette = QSL.posterPalette.fromImage(img);
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    const sans = '"Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = palette.backgroundTop; ctx.fillRect(0, 0, 900, 1440);
    function line(value, y, size, color) {
      ctx.font = size + 'px ' + sans; ctx.fillStyle = color || palette.ink;
      let label = Array.from(String(value || '')).slice(0, 160).join('');
      while (label && ctx.measureText(label + '…').width > 764) label = Array.from(label).slice(0, -1).join('');
      if (label !== String(value || '')) label += '…';
      ctx.fillText(label, 68, y);
    }
    line('QSLink · QSL DESIGN CONTEST', 82, 22, palette.accent);
    line(QSL.t('QSL设计大赛-2026.11'), 143, 36);
    line(QSL.t('作品编号：{n}', { n: String(work.number).padStart(3, '0') }), 195, 25, palette.muted);
    if (img) {
      const scale = Math.min(764 / img.naturalWidth, 620 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (900 - w) / 2, 242 + (620 - h) / 2, w, h);
    }
    line(card.title || QSL.t('未命名卡片'), 938, 36);
    const owner = card.owner || {};
    line([owner.displayName || owner.username, card.callSign || owner.callSign].filter(Boolean).join(' · '), 990, 23, palette.muted);
    const qr = QSL.qr.canvas(url, 6, 240);
    ctx.fillStyle = '#fff'; ctx.fillRect(68, 1052, 256, 256);
    ctx.drawImage(qr, 68 + Math.floor((256 - qr.width) / 2), 1052 + Math.floor((256 - qr.height) / 2));
    ctx.fillStyle = palette.ink; ctx.font = '28px ' + sans;
    ctx.fillText(QSL.t('扫码欣赏作品'), 358, 1130);
    ctx.font = '23px ' + sans; ctx.fillStyle = palette.accent;
    ctx.fillText(QSL.t('为喜欢的设计投一票'), 358, 1180);
    ctx.font = '18px ' + sans; ctx.fillStyle = palette.muted;
    ctx.fillText(new URL(url).host, 358, 1230);
    line(QSL.t('每一张 QSL 卡片，都有自己的设计故事。'), 1370, 20, palette.muted);
    if (signal.aborted) throw new Error(QSL.t('已取消生成'));
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(QSL.t('图片生成失败'))), 'image/png'));
  }

  QSL.cardShare = {
    bind: function (button, card, options) {
      const contestWork = options && options.contestWork;
      const shareTitle = contestWork ? QSL.t('参赛作品 {n}：{title}', { n: String(contestWork.number).padStart(3, '0'), title: card.title || QSL.t('未命名卡片') }) : card.title || QSL.t('QSL 卡片');
      let disposed = false, modal = null, imageModal = null, menuOpen = false, imageBusy = false;
      const urls = new Set();
      const abort = new AbortController();
      const wrapper = document.createElement('div');
      wrapper.className = 'g-card-share';
      button.replaceWith(wrapper);
      wrapper.appendChild(button);
      button.setAttribute('aria-label', QSL.t(contestWork ? '分享作品' : '分享卡片'));
      button.title = QSL.t("点击复制链接，悬浮或按方向下键查看分享选项；触屏点击打开分享弹窗");
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'g-card-share-panel');
      const panel = document.createElement('div');
      panel.id = 'g-card-share-panel';
      panel.className = 'g-card-share__panel';
      panel.hidden = true;
      // Portal avoids transformed page layers making the fixed menu scroll or sit below the footer.
      document.body.appendChild(panel);
      let urlPromise;
      function getUrl() {
        return urlPromise || (urlPromise = contestWork ? Promise.resolve(location.origin + '/events/qsl-design-2026-11/works/' + encodeURIComponent(contestWork.id)) : QSL.cardShareUrl(card));
      }
      function listen(node, type, fn) { node.addEventListener(type, fn, { signal: abort.signal }); }
      function fail(err) { if (!disposed) QSL.toast(err.message || QSL.t("分享失败，请重试"), 'error'); }
      function revoke(url) { URL.revokeObjectURL(url); urls.delete(url); }
      function fitDialog(view) {
        view.el.classList.add('g-card-share-modal');
        const overlay = view.el.parentElement;
        overlay.classList.add('g-card-share-overlay');
        function fit() {
          const viewport = window.visualViewport;
          overlay.style.width = (viewport ? viewport.width : window.innerWidth) + 'px';
          overlay.style.height = (viewport ? viewport.height : window.innerHeight) + 'px';
        }
        fit();
        const viewport = window.visualViewport || window;
        viewport.addEventListener('resize', fit);
        // Keep keyboard navigation inside this dialog; close() removes both listeners.
        function trap(event) {
          if (event.key !== 'Tab') return;
          const nodes = Array.from(view.el.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)'));
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        view.el.addEventListener('keydown', trap);
        const focusFrame = requestAnimationFrame(() => view.el.querySelector('.modal-x').focus({ preventScroll: true }));
        return () => {
          cancelAnimationFrame(focusFrame);
          viewport.removeEventListener('resize', fit);
          view.el.removeEventListener('keydown', trap);
        };
      }
      async function generate() {
        if (imageBusy) return;
        imageBusy = true;
        const imageAbort = new AbortController();
        let closed = false, previewUrl, release = function () {};
        const view = QSL.modal({
          title: QSL.t("生成分享图"),
          content: ("<div class=\"g-card-share__poster\"><p role=\"status\">" + QSL.escapeHtml(QSL.t("正在生成分享图…")) + "</p></div>"),
          onClose: function () { closed = true; imageAbort.abort(); release(); if (previewUrl) revoke(previewUrl); if (imageModal === view) imageModal = null; if (!disposed) button.focus({ preventScroll: true }); }
        });
        release = fitDialog(view);
        imageModal = view;
        try {
          const url = await getUrl();
          const blob = contestWork ? await contestPoster(card, contestWork, url, imageAbort.signal) : await poster(card, url, imageAbort.signal);
          if (disposed || closed) return;
          previewUrl = URL.createObjectURL(blob); urls.add(previewUrl);
          const host = view.body.querySelector('.g-card-share__poster');
          host.innerHTML = ("<img alt=\"" + QSL.escapeHtml(QSL.t(contestWork ? '赛事作品分享图，含直达作品详情的二维码' : '卡片分享图，含直达分享页的二维码')) + "\">") +
            ("<p>" + QSL.escapeHtml(QSL.t("保存图片后发送给朋友；手机也可长按图片保存。")) + "</p><div class=\"btn-group\">") +
            '<a class="btn btn-primary" download="QSLink-card.png">' + QSL.icon('download', 17) + (QSL.escapeHtml(QSL.t("保存分享图")) + "</a></div>");
          host.querySelector('img').src = previewUrl;
          host.querySelector('a').href = previewUrl;
          const file = new File([blob], 'QSLink-card.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            const share = document.createElement('button');
            share.type = 'button'; share.className = 'btn btn-soft'; share.textContent = QSL.t("发送图片到…");
            share.addEventListener('click', () => navigator.share({ files: [file], title: shareTitle }).catch(err => { if (err.name !== 'AbortError') fail(err); }));
            host.querySelector('.btn-group').appendChild(share);
          }
        } catch (err) {
          if (!closed && !disposed) {
            view.body.querySelector('p').textContent = err.message || QSL.t("生成失败，请关闭后重试");
          }
        } finally { imageBusy = false; }
      }
      function content(host) {
        host.innerHTML = '<div class="g-card-share__summary"><div class="g-card-share__card">' +
          (card.frontImage ? ("<img alt=\"" + QSL.escapeHtml(QSL.t("卡片正面")) + "\" ") + QSL.images.attributes(card.frontImage, '220px') + '>' : '') +
          '<strong>' + esc(contestWork ? shareTitle : card.title || QSL.t("未命名卡片")) + ("</strong></div><div class=\"g-card-share__qr\"><span>" + QSL.escapeHtml(QSL.t("正在准备二维码…")) + "</span></div></div>") +
          '<div class="g-card-share__actions"><button type="button" class="btn btn-primary" data-poster>' + QSL.icon('image', 17) + (QSL.escapeHtml(QSL.t("生成分享图")) + "</button>") +
          '<button type="button" class="btn btn-soft" data-copy>' + QSL.icon('copy', 17) + (QSL.escapeHtml(QSL.t("复制分享链接")) + "</button></div>") +
          ("<input class=\"input g-card-share__url\" readonly aria-label=\"" + QSL.escapeHtml(QSL.t("分享链接")) + "\"><div class=\"g-card-share__social\" aria-label=\"" + QSL.escapeHtml(QSL.t("分享到社交平台")) + "\"></div>") +
          ("<p class=\"g-card-share__hint\" role=\"status\">" + QSL.escapeHtml(QSL.t(contestWork ? '扫码直达赛事作品详情，欣赏设计并参与投票。' : '扫码直达分享页。QQ / 微信需粘贴链接或发送已保存的分享图。')) + "</p>");
        const input = host.querySelector('input');
        listen(input, 'click', () => input.select());
        listen(host.querySelector('[data-poster]'), 'click', () => {
          if (modal) { modal.close(); modal = null; }
          setOpen(false); generate();
        });
        listen(host.querySelector('[data-copy]'), 'click', () => getUrl().then(url => !disposed && QSL.copyText(url, QSL.t("分享链接已复制"))).catch(fail));
        getUrl().then(url => {
          if (disposed || !host.isConnected) return;
          input.value = url;
          const qr = host.querySelector('.g-card-share__qr');
          qr.innerHTML = '';
          try {
            const canvas = QSL.qr.canvas(url, 4);
            canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', QSL.t(contestWork ? '扫码查看赛事作品详情' : '扫码查看卡片分享页'));
            qr.appendChild(canvas);
            const label = document.createElement('span'); label.textContent = QSL.t("扫码查看 / 分享"); qr.appendChild(label);
          } catch (err) { qr.textContent = err.message; }
          const social = host.querySelector('.g-card-share__social');
          const title = shareTitle;
          const items = [
            [QSL.t("微信"), QSL.t("微"), 'weixin://', 'wechat'],
            ['QQ', 'QQ', 'https://connect.qq.com/widget/shareqq/index.html?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title), 'qq'],
            ['X', '𝕏', 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title), 'x'],
            ['Threads', '@', 'https://www.threads.net/intent/post?text=' + encodeURIComponent(title + ' ' + url), 'threads']
          ];
          items.forEach(([label, mark, href, name]) => {
            const link = document.createElement('a');
            link.className = 'g-card-share__social-link is-' + name;
            link.href = href;
            if (name !== 'wechat') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
            link.innerHTML = '<span aria-hidden="true">' + mark + '</span>' + label;
            if (name === 'wechat') listen(link, 'click', () => {
              QSL.copyText(url, QSL.t("链接已复制，请在微信中粘贴发送"));
              host.querySelector('.g-card-share__hint').textContent = QSL.t("若未打开微信，请手动打开并粘贴链接，或保存分享图后发送。");
            });
            social.appendChild(link);
          });
          if (navigator.share) {
            const native = document.createElement('button');
            native.type = 'button'; native.className = 'g-card-share__social-link';
            native.innerHTML = '<span aria-hidden="true">' + QSL.icon('share', 22) + ("</span>" + QSL.escapeHtml(QSL.t("更多")));
            listen(native, 'click', () => navigator.share({ title, url }).catch(err => { if (err.name !== 'AbortError') fail(err); }));
            social.appendChild(native);
          }
          if (host === panel && menuOpen) placePanel();
        }).catch(fail);
      }
      let prepared = false, openTimer, hideTimer;
      function placePanel() {
        const rect = button.getBoundingClientRect();
        const head = document.getElementById('site-header');
        const minTop = Math.max(12, head ? head.getBoundingClientRect().bottom + 8 : 12);
        const above = Math.max(0, rect.top - minTop);
        const below = Math.max(0, window.innerHeight - rect.bottom - 12);
        panel.style.maxHeight = 'none';
        const preferAbove = above >= panel.offsetHeight || above > below;
        panel.style.maxHeight = Math.max(80, preferAbove ? above : below) + 'px';
        const height = panel.offsetHeight;
        panel.style.setProperty('--g-share-offset', preferAbove ? '8px' : '-8px');
        panel.style.top = (preferAbove ? rect.top - height : rect.bottom) + 'px';
        panel.style.left = Math.max(12, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 12)) + 'px';
      }
      function setOpen(open) {
        clearTimeout(openTimer);
        clearTimeout(hideTimer);
        menuOpen = open;
        button.setAttribute('aria-expanded', String(open));
        panel.inert = !open;
        if (open) panel.hidden = false;
        if (open && !prepared) { prepared = true; content(panel); }
        if (open) {
          // Measuring the visible panel establishes its initial style before transitioning.
          placePanel();
          panel.classList.add('is-open');
        } else {
          panel.classList.remove('is-open');
          const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
          hideTimer = setTimeout(() => { panel.hidden = true; }, delay);
        }
      }
      function desktop() { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
      let leaveTimer, pointerInside = false;
      function inside(node) { return !!node && (wrapper.contains(node) || panel.contains(node)); }
      function enter() { pointerInside = true; clearTimeout(leaveTimer); }
      function leave() {
        pointerInside = false;
        clearTimeout(openTimer);
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { if (!pointerInside) setOpen(false); }, 220);
      }
      listen(wrapper, 'pointerenter', event => {
        enter();
        if (event.pointerType === 'mouse' && desktop()) {
          clearTimeout(openTimer);
          openTimer = setTimeout(() => setOpen(true), 100);
        }
      });
      listen(panel, 'pointerenter', enter);
      listen(wrapper, 'pointerleave', leave);
      listen(panel, 'pointerleave', leave);
      function focusOut(event) {
        // Clipboard fallback temporarily focuses a textarea outside the menu.
        if (!pointerInside && !inside(event.relatedTarget)) setOpen(false);
      }
      listen(wrapper, 'focusout', focusOut);
      listen(panel, 'focusout', focusOut);
      function keyboard(event) {
        if (event.key === 'Escape') { setOpen(false); button.focus(); }
        if (event.key === 'ArrowDown' && event.target === button) {
          event.preventDefault(); setOpen(true); panel.querySelector('button').focus();
        }
      }
      listen(wrapper, 'keydown', keyboard);
      listen(panel, 'keydown', keyboard);
      listen(document, 'pointerdown', event => { if (menuOpen && !inside(event.target)) setOpen(false); });
      listen(window, 'resize', () => { if (menuOpen) placePanel(); });
      listen(window, 'scroll', () => { if (menuOpen) placePanel(); });
      listen(button, 'click', event => {
        if (!contestWork && desktop() && event.pointerType !== 'touch') {
          getUrl().then(url => !disposed && QSL.copyText(url, QSL.t("分享链接已复制，快发给朋友吧"))).catch(fail);
        } else {
          if (modal) return;
          const host = document.createElement('div'); host.className = 'g-card-share__dialog';
          let release = function () {};
          button.setAttribute('aria-expanded', 'true');
          modal = QSL.modal({ title: QSL.t(contestWork ? '分享参赛作品' : '分享这张卡片'), content: host, onClose: () => { release(); modal = null; button.setAttribute('aria-expanded', 'false'); if (!disposed) button.focus({ preventScroll: true }); } });
          release = fitDialog(modal);
          content(host);
        }
      });
      return function () {
        disposed = true; abort.abort();
        clearTimeout(leaveTimer);
        clearTimeout(openTimer);
        clearTimeout(hideTimer);
        panel.remove();
        if (modal) modal.close();
        if (imageModal) imageModal.close();
        urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
      };
    }
  };
})();
