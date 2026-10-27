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
      if (url.origin !== location.origin) return reject(new Error('无法导出站外图片'));
      if (signal.aborted) return reject(new Error('已取消生成'));
      function finish(err) {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        signal.removeEventListener('abort', cancel);
        if (err) { img.src = ''; reject(err); } else resolve(img);
      }
      function cancel() { finish(new Error('已取消生成')); }
      const timer = setTimeout(() => finish(new Error('卡片图片加载超时，请重试')), 15000);
      signal.addEventListener('abort', cancel, { once: true });
      img.onload = () => finish();
      img.onerror = () => finish(new Error('卡片图片加载失败，请重试'));
      img.src = url.href;
    });
  }

  async function poster(card, url, signal) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#edf7f5'; ctx.fillRect(0, 0, 1080, 1320);
    ctx.fillStyle = '#0a816e'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('QSLink / QSL 卡片交换', 64, 86);
    ctx.fillStyle = '#fff'; ctx.fillRect(48, 124, 984, 700);
    if (card.frontImage) {
      const img = await image(card.frontImage, signal);
      const scale = Math.min(920 / img.naturalWidth, 636 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, 80 + (920 - w) / 2, 156 + (636 - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#647b80'; ctx.font = '36px sans-serif'; ctx.fillText('QSL 卡片', 80, 480);
    }
    function line(text, x, y, width) {
      let value = Array.from(String(text || '')).slice(0, 160).join('');
      if (ctx.measureText(value).width > width) {
        while (value && ctx.measureText(value + '…').width > width) value = Array.from(value).slice(0, -1).join('');
        value += '…';
      }
      ctx.fillText(value, x, y);
    }
    ctx.fillStyle = '#102b32'; ctx.font = 'bold 44px sans-serif';
    line(card.title || '未命名卡片', 64, 902, 952);
    const owner = card.owner || {};
    ctx.fillStyle = '#52716e'; ctx.font = '28px sans-serif';
    line(card.callSign || owner.callSign || owner.displayName || '来自 QSLink 的 QSL 卡片', 64, 956, 952);
    ctx.drawImage(QSL.qr.canvas(url, 5), 64, 1000);
    ctx.fillStyle = '#52716e'; ctx.font = '27px sans-serif'; ctx.fillText('扫码欣赏双面 3D 卡片 · 申请换卡', 344, 1092);
    line(new URL(url).host, 344, 1152, 540);
    const logo = await image('/assets/logo-mark.svg', signal);
    ctx.drawImage(logo, 920, 1160, 96, 96);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'));
  }

  QSL.cardShare = {
    bind: function (button, card) {
      let disposed = false, modal = null, imageModal = null, menuOpen = false, imageBusy = false;
      const urls = new Set();
      const abort = new AbortController();
      const wrapper = document.createElement('div');
      wrapper.className = 'g-card-share';
      button.replaceWith(wrapper);
      wrapper.appendChild(button);
      button.setAttribute('aria-label', '分享卡片');
      button.title = '点击复制链接，悬浮或按方向下键查看分享选项；触屏点击打开分享弹窗';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'g-card-share-panel');
      const panel = document.createElement('div');
      panel.id = 'g-card-share-panel';
      panel.className = 'g-card-share__panel';
      panel.hidden = true;
      // Portal avoids transformed page layers making the fixed menu scroll or sit below the footer.
      document.body.appendChild(panel);
      let urlPromise;
      function getUrl() { return urlPromise || (urlPromise = QSL.cardShareUrl(card)); }
      function listen(node, type, fn) { node.addEventListener(type, fn, { signal: abort.signal }); }
      function fail(err) { if (!disposed) QSL.toast(err.message || '分享失败，请重试', 'error'); }
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
          title: '生成分享图',
          content: '<div class="g-card-share__poster"><p role="status">正在生成分享图…</p></div>',
          onClose: function () { closed = true; imageAbort.abort(); release(); if (previewUrl) revoke(previewUrl); if (imageModal === view) imageModal = null; if (!disposed) button.focus({ preventScroll: true }); }
        });
        release = fitDialog(view);
        imageModal = view;
        try {
          const blob = await poster(card, await getUrl(), imageAbort.signal);
          if (disposed || closed) return;
          previewUrl = URL.createObjectURL(blob); urls.add(previewUrl);
          const host = view.body.querySelector('.g-card-share__poster');
          host.innerHTML = '<img alt="卡片分享图，含直达分享页的二维码">' +
            '<p>保存图片后发送给朋友；手机也可长按图片保存。</p><div class="btn-group">' +
            '<a class="btn btn-primary" download="QSLink-card.png">' + QSL.icon('download', 17) + '保存分享图</a></div>';
          host.querySelector('img').src = previewUrl;
          host.querySelector('a').href = previewUrl;
          const file = new File([blob], 'QSLink-card.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            const share = document.createElement('button');
            share.type = 'button'; share.className = 'btn btn-soft'; share.textContent = '发送图片到…';
            share.addEventListener('click', () => navigator.share({ files: [file], title: card.title || 'QSL 卡片' }).catch(err => { if (err.name !== 'AbortError') fail(err); }));
            host.querySelector('.btn-group').appendChild(share);
          }
        } catch (err) {
          if (!closed && !disposed) {
            view.body.querySelector('p').textContent = err.message || '生成失败，请关闭后重试';
          }
        } finally { imageBusy = false; }
      }
      function content(host) {
        host.innerHTML = '<div class="g-card-share__summary"><div class="g-card-share__card">' +
          (card.frontImage ? '<img alt="卡片正面" ' + QSL.images.attributes(card.frontImage, '220px') + '>' : '') +
          '<strong>' + esc(card.title || '未命名卡片') + '</strong></div><div class="g-card-share__qr"><span>正在准备二维码…</span></div></div>' +
          '<div class="g-card-share__actions"><button type="button" class="btn btn-primary" data-poster>' + QSL.icon('image', 17) + '生成分享图</button>' +
          '<button type="button" class="btn btn-soft" data-copy>' + QSL.icon('copy', 17) + '复制分享链接</button></div>' +
          '<input class="input g-card-share__url" readonly aria-label="分享链接"><div class="g-card-share__social" aria-label="分享到社交平台"></div>' +
          '<p class="g-card-share__hint" role="status">扫码直达分享页。QQ / 微信需粘贴链接或发送已保存的分享图。</p>';
        const input = host.querySelector('input');
        listen(input, 'click', () => input.select());
        listen(host.querySelector('[data-poster]'), 'click', () => {
          if (modal) { modal.close(); modal = null; }
          setOpen(false); generate();
        });
        listen(host.querySelector('[data-copy]'), 'click', () => getUrl().then(url => !disposed && QSL.copyText(url, '分享链接已复制')).catch(fail));
        getUrl().then(url => {
          if (disposed || !host.isConnected) return;
          input.value = url;
          const qr = host.querySelector('.g-card-share__qr');
          qr.innerHTML = '';
          try {
            const canvas = QSL.qr.canvas(url, 4);
            canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '扫码查看卡片分享页');
            qr.appendChild(canvas);
            const label = document.createElement('span'); label.textContent = '扫码查看 / 分享'; qr.appendChild(label);
          } catch (err) { qr.textContent = err.message; }
          const social = host.querySelector('.g-card-share__social');
          const title = card.title || 'QSL 卡片';
          const items = [
            ['微信', '微', 'weixin://', 'wechat'],
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
              QSL.copyText(url, '链接已复制，请在微信中粘贴发送');
              host.querySelector('.g-card-share__hint').textContent = '若未打开微信，请手动打开并粘贴链接，或保存分享图后发送。';
            });
            social.appendChild(link);
          });
          if (navigator.share) {
            const native = document.createElement('button');
            native.type = 'button'; native.className = 'g-card-share__social-link';
            native.innerHTML = '<span aria-hidden="true">' + QSL.icon('share', 22) + '</span>更多';
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
      let leaveTimer;
      function inside(node) { return !!node && (wrapper.contains(node) || panel.contains(node)); }
      function enter() { clearTimeout(leaveTimer); }
      function leave() {
        clearTimeout(openTimer);
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { if (!inside(document.activeElement)) setOpen(false); }, 220);
      }
      listen(wrapper, 'pointerenter', event => {
        enter();
        if (event.pointerType === 'mouse' && desktop()) {
          clearTimeout(openTimer);
          openTimer = setTimeout(() => setOpen(true), 350);
        }
      });
      listen(panel, 'pointerenter', enter);
      listen(wrapper, 'pointerleave', leave);
      listen(panel, 'pointerleave', leave);
      function focusOut(event) { if (!inside(event.relatedTarget)) setOpen(false); }
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
        if (desktop() && event.pointerType !== 'touch') {
          getUrl().then(url => !disposed && QSL.copyText(url, '分享链接已复制，快发给朋友吧')).catch(fail);
        } else {
          if (modal) return;
          const host = document.createElement('div'); host.className = 'g-card-share__dialog';
          let release = function () {};
          button.setAttribute('aria-expanded', 'true');
          modal = QSL.modal({ title: '分享这张卡片', content: host, onClose: () => { release(); modal = null; button.setAttribute('aria-expanded', 'false'); if (!disposed) button.focus({ preventScroll: true }); } });
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
