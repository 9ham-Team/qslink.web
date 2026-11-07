/* Responsive card images: CSS layout width × browser DPR, never the rotating bounding box. */
(function () {
  'use strict';
  const QSL = window.QSL;
  const widths = [160, 320, 480, 640, 960, 1280, 1600, 1920, 2560, 3840];
  const raster = /^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i;
  function candidates(src, minWidth) {
    if (!raster.test(src || '')) return '';
    const minimum = Math.min(3840, Math.max(0, Number(minWidth) || 0));
    return widths.filter(w => w >= minimum).map(w => src + '?w=' + w + ' ' + w + 'w').join(', ');
  }
  function attributes(src, sizes) {
    const set = candidates(src);
    const esc = QSL.escapeHtml;
    return 'src="' + esc(set ? src + '?w=320' : src) + '"' +
      (set ? ' data-qsl-responsive srcset="' + esc(set) + '" sizes="auto, ' + esc(sizes || '(max-width: 860px) calc((100vw - 64px) / 2), 400px') + '"' : '');
  }
  function apply(img, src, width, minWidth) {
    const set = candidates(src, minWidth);
    // Set sizes before srcset/src, so the first request already has the measured width.
    if (set) {
      img.sizes = Math.max(1, Math.ceil(width)) + 'px';
      img.srcset = set;
      const fallback = minWidth ? widths.find(w => w >= Math.min(3840, Math.max(0, Number(minWidth) || 0))) : 320;
      img.src = src + '?w=' + fallback;
    } else {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = src;
    }
  }
  // Grid rows, tiny exchange thumbnails and home-page artwork use their own actual
  // layout size, including on browsers without native sizes="auto" support.
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    entries.forEach(entry => {
      if (entry.contentRect.width > 0) entry.target.sizes = Math.ceil(entry.contentRect.width) + 'px';
    });
  }) : null;
  function observe(root, remove) {
    if (!resize || !root || root.nodeType !== 1) return;
    const images = Array.from(root.querySelectorAll('img[data-qsl-responsive]'));
    if (root.matches('img[data-qsl-responsive]')) images.push(root);
    images.forEach(img => remove ? resize.unobserve(img) : resize.observe(img));
  }
  if (typeof MutationObserver === 'function' && resize) {
    new MutationObserver(records => records.forEach(record => {
      record.removedNodes.forEach(node => observe(node, true));
      record.addedNodes.forEach(node => observe(node, false));
    })).observe(document.documentElement, { childList: true, subtree: true });
  }
  QSL.images = { attributes, apply };
})();
