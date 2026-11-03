/* ============================================================
 * QSLink · 卡片编辑器（新建 / 编辑共用）（flows-ui）
 * 路由：/dashboard/cards/new 与 /dashboard/cards/:id/edit
 * 依赖：core.js / api.js / ui.js / card3d.js（可选）
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');

  const MAX_SIZE = 8 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const RATIO_PRESETS = [
    { w: 3, h: 2, label: '3 : 2', desc: '横版标准' },
    { w: 2, h: 3, label: '2 : 3', desc: '竖版标准' },
    { w: 4, h: 3, label: '4 : 3', desc: '横版方寸' },
    { w: 16, h: 9, label: '16 : 9', desc: '宽幅风景' }
  ];

  function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function ratioDescription(ratio) {
    if (ratio.w > ratio.h) return '横版';
    if (ratio.w < ratio.h) return '竖版';
    return '方形';
  }

  function isPreset(ratio) {
    return RATIO_PRESETS.findIndex((p) => p.w === ratio.w && p.h === ratio.h);
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    });
  }

  function validateFile(file) {
    if (!file) return '没有读取到文件';
    const typeOk = ALLOWED_TYPES.indexOf(file.type) >= 0 || /\.(png|jpe?g|webp)$/i.test(file.name || '');
    if (!typeOk) return '仅支持 PNG / JPG / WebP 格式的图片';
    if (file.size > MAX_SIZE) return '图片超过 8MB，请压缩后重新上传（当前 ' + formatSize(file.size) + '）';
    if (file.size === 0) return '图片文件为空，请重新选择';
    return '';
  }

  function uploadZoneHtml(side, title, desc) {
    return (
      '<div class="f-upload" data-upload-side="' + side + '" tabindex="0" role="button" aria-label="' + esc(title) + '，点击或拖拽上传">' +
      '<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file>' +
      '<div class="f-upload-empty">' +
      '<span class="f-upload-ico">' + ico('image', 26) + '</span>' +
      '<b>' + esc(title) + '</b>' +
      '<span class="f-upload-desc">' + esc(desc) + '</span>' +
      '<span class="f-upload-hint">点击选择 · 或拖拽图片到这里 · ≤ 8MB</span>' +
      '</div>' +
      '<div class="f-upload-preview" hidden>' +
      '<img alt="' + esc(title) + '预览" data-preview-img>' +
      '<span class="f-upload-meta"><b data-preview-name>已上传</b><span data-preview-size></span></span>' +
      '<span class="f-upload-replace">' + ico('refresh', 14) + ' 点击替换</span>' +
      '</div>' +
      '<span class="f-upload-loading">' + '<span class="spinner"></span><span>读取中…</span></span>' +
      '</div>'
    );
  }

  function render(container, ctx) {
    const user = QSL.state.user;
    if (!user) {
      QSL.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
      return function cleanup() {};
    }
    const cardId = ctx && ctx.params ? ctx.params.id : null;
    const isEdit = !!cardId;

    const defaultRatio = { w: 3, h: 2 };
    const state = {
      images: { front: null, back: null }, // { src, size, name, width, height, isNew }
      ratio: { w: defaultRatio.w, h: defaultRatio.h },
      dirty: false,
      submitting: false,
      leaving: false,
      alive: true
    };
    let viewer = null;
    let editorCard = null;
    let stockModal = null;

    const ratioChips = RATIO_PRESETS.map((preset) =>
      '<button class="f-ratio-chip" type="button" data-ratio="' + preset.w + 'x' + preset.h + '">' +
      '<span class="f-ratio-shape" style="aspect-ratio:' + preset.w + ' / ' + preset.h + '"></span>' +
      '<span class="f-ratio-text"><b>' + preset.label + '</b><small>' + preset.desc + '</small></span>' +
      '</button>'
    ).join('');

    container.innerHTML =
      '<div class="f-page f-editor-page container">' +
      QSL.pageHeader({
        eyebrow: isEdit ? 'EDIT QSL CARD' : 'UPLOAD QSL CARD',
        title: isEdit ? '编辑卡片' : '上传新卡片',
        desc: isEdit
          ? '修改卡片信息后需要重新提交审核，审核期间不会出现在卡片广场。'
          : '上传卡片的正反面图片，填写卡片信息；提交后由管理员审核，通过后展示在卡片广场。',
        actions:
          '<a class="btn btn-ghost" href="/dashboard/cards">' + ico('arrow-left', 16) + '<span>返回我的卡片</span></a>' +
          '<button class="btn btn-primary" type="button" data-submit>' + ico('check', 17) + '<span>提交审核</span></button>'
      }) +
      '<div class="f-editor-notice" id="fEditorNotice" hidden></div>' +
      '<div class="f-editor">' +
      '<div class="f-editor-form" id="fEditorForm">' +

      '<section class="f-form-card" data-reveal>' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">卡片图片</h2>' +
      '<p class="f-form-card-desc">正面作为卡片封面，背面用于 3D 翻面展示；支持 PNG / JPG / WebP，单张 ≤ 8MB。提交后转为 WebP，最长边不超过 3840 像素，不放大小图，不保留原图。</p></div>' +
      '<span class="f-form-step">01</span></header>' +
      '<div class="f-upload-grid">' +
      uploadZoneHtml('front', '上传卡片正面', '建议清晰、满幅的扫描或拍摄图') +
      uploadZoneHtml('back', '上传卡片背面', '可留空，3D 预览将显示精美占位') +
      '</div>' +
      '</section>' +

      '<section class="f-form-card" data-reveal data-reveal-delay="60">' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">卡片信息</h2>' +
      '<p class="f-form-card-desc">为卡片取一个名字、署上呼号，再写一段背后的故事。</p></div>' +
      '<span class="f-form-step">02</span></header>' +
      '<div class="f-form-grid">' +
      '<div class="f-field f-span-2" data-field="title">' +
      '<div class="f-field-row"><label class="label" for="fCardTitle">卡片标题<i class="req">*</i></label>' +
      '<span class="f-label-hint" data-counter="title">0 / 80</span></div>' +
      '<input id="fCardTitle" class="input" name="title" type="text" maxlength="80" placeholder="例如：雪线之上的守候" autocomplete="off">' +
      '<p class="f-error" data-error="title" role="alert" hidden></p>' +
      '</div>' +
      '<div class="f-field f-span-2" data-field="callSign">' +
      '<label class="label" for="fCardCallSign">呼号</label>' +
      '<input id="fCardCallSign" class="input" name="callSign" type="text" maxlength="20" autocomplete="off">' +
      '<p class="f-error" data-error="callSign" role="alert" hidden></p>' +
      '</div>' +
      '<div class="f-field f-span-2" data-field="notes">' +
      '<div class="f-field-row"><label class="label" for="fCardNotes">卡片简介<span class="f-optional">选填</span></label>' +
      '<span class="f-label-hint" data-counter="notes">0 / 500</span></div>' +
      '<textarea id="fCardNotes" class="textarea" name="notes" maxlength="500" rows="4" placeholder="记录这张卡片背后的通联故事，例如：海拔 4500 米的通联纪念。"></textarea>' +
      '<p class="f-error" data-error="notes" role="alert" hidden></p>' +
      '</div>' +
      '<div class="f-field f-span-2" data-field="stock">' +
      '<label class="label" for="fCardStock">卡片库存<span class="f-optional">选填</span></label>' +
      (isEdit
        ? '<button id="fCardStock" class="input f-stock-trigger" type="button" aria-haspopup="dialog" aria-label="调整卡片库存" disabled>加载中…</button>'
        : '<input id="fCardStock" class="input" name="stock" type="number" min="0" max="2147483647" step="1" placeholder="未设置">') +
      '<p class="hint">' + (isEdit ? '点击库存框打开调整弹窗，单独保存，无需重新审核。' : '留空不限制换卡；填 0 暂停换卡。同意一笔申请自动扣减 1 张。') + '</p>' +
      '<p class="f-error" data-error="stock" role="alert" hidden></p></div>' +
      '</div>' +
      '</section>' +

      '<section class="f-form-card" data-reveal data-reveal-delay="120">' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">卡片比例</h2>' +
      '<p class="f-form-card-desc">决定 3D 预览与卡片广场中的展示比例，可选预设或自定义宽高整数。</p></div>' +
      '<span class="f-form-step">03</span></header>' +
      '<div class="f-ratio-chips" data-ratio-chips>' + ratioChips + '</div>' +
      '<div class="f-ratio-custom">' +
      '<label class="f-ratio-input"><span class="label">宽</span><input class="input" type="number" min="1" max="1000" step="1" inputmode="numeric" id="fRatioW" name="ratioW" value="' + defaultRatio.w + '"></label>' +
      '<span class="f-ratio-colon">:</span>' +
      '<label class="f-ratio-input"><span class="label">高</span><input class="input" type="number" min="1" max="1000" step="1" inputmode="numeric" id="fRatioH" name="ratioH" value="' + defaultRatio.h + '"></label>' +
      '<span class="f-ratio-preview-label" data-ratio-label>3 : 2 · 横版</span>' +
      '</div>' +
      '<p class="f-error" data-error="ratio" role="alert" hidden></p>' +
      '<p class="f-form-tip">' + ico('info', 14) + ' 宽高取值 1 - 1000 的整数；横版卡片推荐 3:2，竖版推荐 2:3。</p>' +
      '</section>' +

      '<div class="f-form-card"><label class="f-consent"><input type="checkbox" name="contentConsent"><span>我确认拥有本次卡片内容的必要权利，同意<a href="/legal/terms.html" target="_blank" rel="noopener">用户条款及其中的内容授权</a>，并已阅读<a href="/legal/privacy.html" target="_blank" rel="noopener">隐私说明</a>。审核通过后卡片将公开展示，图片通过公开链接提供，请勿包含私人收件地址或电话。</span></label><p class="f-error" data-consent-error role="alert" hidden></p></div>' +
      '<div class="f-editor-actions">' +
      '<a class="btn btn-ghost" href="/dashboard/cards">取消</a>' +
      '<span class="f-unsaved" data-unsaved hidden>' + ico('alert', 14) + ' 有未保存的修改</span>' +
      '<button class="btn btn-primary btn-lg" type="button" data-submit>' + ico('check', 18) + '<span>提交审核</span></button>' +
      '</div>' +
      '</div>' +

      '<aside class="f-editor-preview">' +
      '<div class="f-preview-panel glass" data-reveal data-reveal-delay="90">' +
      '<header class="f-preview-head">' +
      '<div><h2 class="f-preview-title">实时预览</h2><p class="f-preview-sub">拖动旋转 · 双击翻面</p></div>' +
      '<span class="f-preview-live">' + '<i></i> LIVE</span>' +
      '</header>' +
      '<div class="f-preview-stage" id="fPreviewStage"></div>' +
      '<div class="f-preview-meta">' +
      '<span class="f-preview-ratio" data-preview-ratio>比例 3 : 2</span>' +
      '<span class="f-preview-sides" data-preview-sides>正面待上传</span>' +
      '</div>' +
      '<button class="btn btn-primary btn-block f-preview-submit" type="button" data-submit>' + ico('upload', 17) + '<span>提交审核</span></button>' +
      '<ul class="f-preview-tips">' +
      '<li>' + ico('check', 14) + ' 图片与比例变化会实时同步到 3D 预览</li>' +
      '<li>' + ico('check', 14) + ' 提交后进入人工审核，通过后展示在广场</li>' +
      '<li>' + ico('check', 14) + ' 背面留空时，3D 卡片背面显示占位图案</li>' +
      '</ul>' +
      '</div>' +
      '</aside>' +
      '</div>' +
      '</div>';

    /* ---------------- 元素引用 ---------------- */
    const formEl = container.querySelector('#fEditorForm');
    const noticeEl = container.querySelector('#fEditorNotice');
    const titleInput = container.querySelector('#fCardTitle');
    const callSignInput = container.querySelector('#fCardCallSign');
    const notesInput = container.querySelector('#fCardNotes');
    const stockInput = container.querySelector('#fCardStock');
    const ratioWInput = container.querySelector('#fRatioW');
    const ratioHInput = container.querySelector('#fRatioH');
    const ratioLabelEl = container.querySelector('[data-ratio-label]');
    const previewRatioEl = container.querySelector('[data-preview-ratio]');
    const previewSidesEl = container.querySelector('[data-preview-sides]');
    const unsavedEl = container.querySelector('[data-unsaved]');
    const stageEl = container.querySelector('#fPreviewStage');
    const submitButtons = Array.from(container.querySelectorAll('[data-submit]'));

    function paintStock() {
      stockInput.innerHTML = '<span>' + (editorCard.stock == null ? '未设置（不限制换卡）' : esc(editorCard.stock) + ' 张') + '</span>' + ico('edit', 16);
    }

    if (isEdit) stockInput.addEventListener('click', () => {
      if (!editorCard || stockModal || state.submitting) return;
      stockModal = QSL.openCardStock(editorCard, {
        isActive: () => state.alive,
        onSaved: paintStock,
        onClose: () => {
          stockModal = null;
          if (state.alive) stockInput.focus();
        }
      });
    });

    /* ---------------- 预览 ---------------- */
    function previewFront() { return state.images.front ? state.images.front.src : null; }
    function previewBack() { return state.images.back ? state.images.back.src : null; }

    function fallbackHtml() {
      const front = previewFront();
      const ratio = state.ratio;
      return (
        '<div class="f-preview-fallback">' +
        '<div class="f-preview-fallback-card" style="aspect-ratio:' + ratio.w + ' / ' + ratio.h + '">' +
        (front
          ? '<img src="' + esc(front) + '" alt="卡片正面预览">'
          : '<span class="f-preview-fallback-empty">' + ico('3d', 30) + '<b>3D 预览</b><span>上传正面图片后显示</span></span>') +
        '<span class="f-preview-fallback-badge">' + ico('3d', 13) + ' 预览占位</span>' +
        '</div>' +
        '<p class="f-preview-fallback-tip">' + ico('info', 14) + ' 3D 预览模块准备中，上传的图片仍会正常保存。</p>' +
        '</div>'
      );
    }

    function renderFallback() {
      if (!stageEl) return;
      stageEl.innerHTML = fallbackHtml();
    }

    function mountViewer() {
      if (!stageEl || !state.alive) return;
      const card3d = QSL.card3d;
      if (!card3d || typeof card3d.create !== 'function') {
        renderFallback();
        return;
      }
      try {
        viewer = card3d.create(stageEl, {
          front: previewFront(),
          back: previewBack(),
          ratio: { w: state.ratio.w, h: state.ratio.h },
          width: null,
          autoRotate: true,
          interactive: true,
          showControls: true,
          initialSide: 'front',
          ambient: true
        });
        stageEl.classList.add('is-3d');
      } catch (err) {
        console.error('[card-editor] 3D 预览初始化失败', err);
        viewer = null;
        renderFallback();
      }
    }

    function updateViewer() {
      if (viewer) {
        try {
          if (typeof viewer.setImages === 'function') viewer.setImages(previewFront(), previewBack());
          if (typeof viewer.setRatio === 'function') viewer.setRatio({ w: state.ratio.w, h: state.ratio.h });
          return;
        } catch (err) {
          console.error('[card-editor] 3D 预览更新失败', err);
        }
      }
      renderFallback();
    }

    function paintPreviewMeta() {
      const ratio = state.ratio;
      const text = '比例 ' + ratio.w + ' : ' + ratio.h + ' · ' + ratioDescription(ratio);
      if (ratioLabelEl) ratioLabelEl.textContent = text;
      if (previewRatioEl) previewRatioEl.textContent = text;
      if (previewSidesEl) {
        const parts = [];
        parts.push(state.images.front ? '正面已就绪' : '正面待上传');
        parts.push(state.images.back ? '背面已就绪' : '背面留空');
        previewSidesEl.textContent = parts.join(' · ');
        previewSidesEl.classList.toggle('is-ready', !!state.images.front);
      }
    }

    /* ---------------- 图片上传区 ---------------- */
    const zones = {};
    container.querySelectorAll('[data-upload-side]').forEach((zone) => {
      const side = zone.dataset.uploadSide;
      const input = zone.querySelector('[data-file]');
      const previewImg = zone.querySelector('[data-preview-img]');
      const previewWrap = zone.querySelector('.f-upload-preview');
      const emptyWrap = zone.querySelector('.f-upload-empty');
      const nameEl = zone.querySelector('[data-preview-name]');
      const sizeEl = zone.querySelector('[data-preview-size]');
      const zoneState = { zone, input, previewImg, previewWrap, emptyWrap, nameEl, sizeEl };
      zones[side] = zoneState;

      zone.addEventListener('click', () => {
        if (zone.classList.contains('is-reading')) return;
        input.click();
      });
      zone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!zone.classList.contains('is-reading')) input.click();
        }
      });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (file) handleFile(side, file);
      });
      ['dragenter', 'dragover'].forEach((evt) => {
        zone.addEventListener(evt, (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!zone.classList.contains('is-reading')) zone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend'].forEach((evt) => {
        zone.addEventListener(evt, (event) => {
          event.preventDefault();
          zone.classList.remove('is-dragover');
        });
      });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('is-dragover');
        if (zone.classList.contains('is-reading')) return;
        const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
        if (file) handleFile(side, file);
        else QSL.toast('没有检测到图片文件，请重试', 'error');
      });
    });

    function paintZone(side) {
      const zoneState = zones[side];
      const image = state.images[side];
      if (!zoneState) return;
      if (!image) {
        zoneState.previewWrap.hidden = true;
        zoneState.emptyWrap.hidden = false;
        zoneState.zone.classList.remove('has-image');
        return;
      }
      zoneState.zone.classList.add('has-image');
      zoneState.emptyWrap.hidden = true;
      zoneState.previewWrap.hidden = false;
      zoneState.previewImg.src = image.src;
      zoneState.nameEl.textContent = image.isNew ? (image.name || '已选择的图片') : '已保存的图片';
      const dimension = image.width && image.height ? image.width + ' × ' + image.height : '';
      const sizeText = image.size ? formatSize(image.size) : '';
      zoneState.sizeEl.textContent = [dimension, sizeText].filter(Boolean).join(' · ');
    }

    async function handleFile(side, file) {
      const zoneState = zones[side];
      const error = validateFile(file);
      if (error) {
        QSL.toast(error, 'error');
        if (zoneState) {
          zoneState.zone.classList.add('is-shake');
          setTimeout(() => zoneState.zone.classList.remove('is-shake'), 520);
        }
        return;
      }
      if (zoneState) zoneState.zone.classList.add('is-reading');
      try {
        const dataUrl = await readFileAsDataURL(file);
        const dimensions = await loadImageDimensions(dataUrl);
        if (!state.alive) return;
        state.images[side] = {
          src: dataUrl,
          size: file.size,
          name: file.name,
          width: dimensions ? dimensions.w : null,
          height: dimensions ? dimensions.h : null,
          isNew: true
        };
        paintZone(side);
        paintPreviewMeta();
        updateViewer();
        markDirty();
        QSL.toast((side === 'front' ? '卡片正面' : '卡片背面') + '已选择，记得提交审核', 'success');
      } catch (err) {
        console.error('[card-editor] 图片读取失败', err);
        QSL.toast('图片读取失败，请重新选择', 'error');
      } finally {
        if (zoneState) zoneState.zone.classList.remove('is-reading');
      }
    }

    /* 拖到页面其它地方时不要让浏览器打开图片 */
    function preventWindowDrop(event) {
      event.preventDefault();
    }
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);

    /* ---------------- 比例 ---------------- */
    function sanitizeRatioValue(raw) {
      const num = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(num)) return null;
      if (num < 1 || num > 1000) return null;
      return num;
    }

    function syncRatioChips() {
      const presetIndex = isPreset(state.ratio);
      container.querySelectorAll('.f-ratio-chip').forEach((chip) => {
        const parts = chip.dataset.ratio.split('x').map((v) => parseInt(v, 10));
        chip.classList.toggle('is-active', parts[0] === state.ratio.w && parts[1] === state.ratio.h);
      });
      if (presetIndex < 0) {
        container.querySelectorAll('.f-ratio-chip').forEach((chip) => chip.classList.remove('is-active'));
      }
    }

    function applyRatio(ratio, options) {
      const next = { w: ratio.w, h: ratio.h };
      if (!Number.isInteger(next.w) || !Number.isInteger(next.h) || next.w < 1 || next.h < 1 || next.w > 1000 || next.h > 1000) return;
      state.ratio = next;
      if (!options || options.syncInputs !== false) {
        ratioWInput.value = String(next.w);
        ratioHInput.value = String(next.h);
      }
      syncRatioChips();
      paintPreviewMeta();
      updateViewer();
      markDirty();
    }

    container.querySelectorAll('.f-ratio-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const parts = chip.dataset.ratio.split('x').map((v) => parseInt(v, 10));
        applyRatio({ w: parts[0], h: parts[1] });
      });
    });

    [ratioWInput, ratioHInput].forEach((input) => {
      input.addEventListener('input', () => {
        const w = sanitizeRatioValue(ratioWInput.value);
        const h = sanitizeRatioValue(ratioHInput.value);
        if (w === null || h === null) {
          syncRatioChips();
          return;
        }
        applyRatio({ w, h }, { syncInputs: false });
      });
      input.addEventListener('blur', () => {
        const w = sanitizeRatioValue(ratioWInput.value);
        const h = sanitizeRatioValue(ratioHInput.value);
        if (w === null) { ratioWInput.value = String(state.ratio.w); }
        if (h === null) { ratioHInput.value = String(state.ratio.h); }
      });
    });

    /* ---------------- 表单状态 ---------------- */
    function markDirty() {
      if (state.dirty) return;
      state.dirty = true;
      if (unsavedEl) unsavedEl.hidden = false;
    }

    function updateCounter(name, max) {
      const counter = container.querySelector('[data-counter="' + name + '"]');
      const input = name === 'title' ? titleInput : notesInput;
      if (counter && input) counter.textContent = input.value.length + ' / ' + max;
    }

    function clearErrors() {
      container.querySelectorAll('.f-field[data-field]').forEach((field) => {
        field.classList.remove('has-error');
        const err = field.querySelector('.f-error');
        if (err) {
          err.hidden = true;
          err.textContent = '';
        }
      });
    }

    function showFieldError(field, message) {
      const wrap = container.querySelector('.f-field[data-field="' + field + '"]');
      if (!wrap) return;
      wrap.classList.add('has-error');
      const err = wrap.querySelector('.f-error');
      if (err) {
        err.hidden = false;
        err.textContent = message || '';
      }
    }

    function mapServerFields(fields) {
      if (!fields) return;
      const aliases = { frontImage: 'front', backImage: 'back', 'ratio.w': 'ratioW', 'ratio.h': 'ratioH' };
      let mapped = 0;
      Object.keys(fields).forEach((key) => {
        const short = String(key).split('.').pop();
        const field = aliases[key] || aliases[short] || short;
        if (field === 'ratioW' || field === 'ratioH') {
          showFieldError('ratio', fields[key]);
          mapped++;
          return;
        }
        if (['title', 'callSign', 'notes', 'stock', 'front', 'back'].indexOf(field) >= 0) {
          if (field === 'front' || field === 'back') {
            showFieldError('title', fields[key]);
          } else {
            showFieldError(field, fields[key]);
          }
          mapped++;
        }
      });
      if (!mapped && fields.ratio) showFieldError('ratio', fields.ratio);
    }

    function collectValues() {
      return {
        title: titleInput.value.trim(),
        callSign: callSignInput.value.trim().toUpperCase(),
        notes: notesInput.value.trim(),
        stock: isEdit || stockInput.value.trim() === '' ? null : Number(stockInput.value),
        ratio: { w: state.ratio.w, h: state.ratio.h },
        frontImage: state.images.front ? state.images.front.src : '',
        backImage: state.images.back ? state.images.back.src : ''
      };
    }

    function validate(values) {
      clearErrors();
      const errors = [];
      if (!isEdit && (stockInput.validity.badInput || (values.stock !== null &&
          (!Number.isInteger(values.stock) || values.stock < 0 || values.stock > 2147483647)))) {
        showFieldError('stock', '库存需为 0–2147483647 的整数，或留空');
        errors.push('stock');
      }
      if (!values.title) {
        showFieldError('title', '请填写卡片标题');
        errors.push('title');
      } else if (values.title.length > 80) {
        showFieldError('title', '标题不能超过 80 个字符');
        errors.push('title');
      }
      const ratioOk = Number.isInteger(values.ratio.w) && Number.isInteger(values.ratio.h) &&
        values.ratio.w >= 1 && values.ratio.h >= 1 && values.ratio.w <= 1000 && values.ratio.h <= 1000;
      if (!ratioOk) {
        showFieldError('ratio', '宽高需为 1 - 1000 的整数');
        errors.push('ratio');
      }
      if (!values.frontImage) {
        QSL.toast('请先上传卡片正面图片', 'error');
        errors.push('frontImage');
      }
      return errors;
    }

    function setSubmitting(busy) {
      state.submitting = busy;
      if (isEdit) stockInput.disabled = busy || !editorCard;
      submitButtons.forEach((btn) => QSL.setBusy(btn, busy, busy ? '提交中…' : ''));
    }

    function showNotice(html, tone) {
      if (!noticeEl) return;
      noticeEl.hidden = false;
      noticeEl.className = 'f-editor-notice ' + (tone || 'info');
      noticeEl.innerHTML = html;
    }

    async function onSubmit() {
      if (state.submitting || stockModal) return;
      const consent = container.querySelector('[name="contentConsent"]');
      const consentError = container.querySelector('[data-consent-error]');
      consentError.hidden = consent.checked;
      if (!consent.checked) {
        consentError.textContent = '请确认内容权利及授权后再提交';
        consent.focus();
        return;
      }
      const values = collectValues();
      const errors = validate(values);
      if (errors.length) {
        if (errors[0] !== 'frontImage') {
          const firstWrap = container.querySelector('.f-field[data-field="' + errors[0] + '"]');
          if (firstWrap) firstWrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else {
          const frontZone = zones.front && zones.front.zone;
          if (frontZone) {
            frontZone.scrollIntoView({ block: 'center', behavior: 'smooth' });
            frontZone.classList.add('is-shake');
            setTimeout(() => frontZone.classList.remove('is-shake'), 520);
          }
        }
        return;
      }
      setSubmitting(true);
      try {
        const payload = {
          acceptTerms: true,
          termsVersion: '2026-10-25',
          acceptContentLicense: true,
          title: values.title,
          callSign: values.callSign,
          notes: values.notes,
          ratio: { w: values.ratio.w, h: values.ratio.h },
          frontImage: values.frontImage
        };
        if (values.backImage) payload.backImage = values.backImage;
        if (!isEdit) payload.stock = values.stock;
        let result;
        if (isEdit) result = await QSL.api.cards.update(cardId, payload);
        else result = await QSL.api.cards.create(payload);
        if (!state.alive) return;
        state.dirty = false;
        if (unsavedEl) unsavedEl.hidden = true;
        if (result && result.card && result.card.status) {
          // 新建默认 pending；编辑后同样回到待审核
        }
        QSL.toast(isEdit ? '修改已提交，需重新审核' : '已提交审核，通过后将出现在卡片广场', 'success');
        if (QSL.fx && typeof QSL.fx.confetti === 'function') {
          try { QSL.fx.confetti(); } catch (e) { /* ignore */ }
        }
        QSL.navigate('/dashboard/cards');
      } catch (err) {
        if (!state.alive) return;
        setSubmitting(false);
        if (err && err.fields) mapServerFields(err.fields);
        if (err && err.isNetwork) {
          showNotice(ico('alert', 16) + ' 网络连接失败，请确认服务已启动后重试。', 'danger');
        }
        QSL.toast((err && err.message) || '提交失败，请稍后重试', 'error');
      }
    }

    submitButtons.forEach((btn) => btn.addEventListener('click', onSubmit));

    [titleInput, callSignInput, notesInput].concat(isEdit ? [] : [stockInput]).forEach((input) => {
      input.addEventListener('input', () => {
        if (input === callSignInput) {
          const pos = callSignInput.selectionStart;
          callSignInput.value = callSignInput.value.toUpperCase();
          try { callSignInput.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
        }
        updateCounter('title', 80);
        updateCounter('notes', 500);
        markDirty();
      });
      input.addEventListener('change', markDirty);
    });

    /* ---------------- 编辑模式：回填 ---------------- */
    function fillForm(card) {
      titleInput.value = card.title || '';
      callSignInput.value = card.callSign || '';
      notesInput.value = card.notes || '';
      editorCard = card;
      paintStock();
      stockInput.disabled = false;
      updateCounter('title', 80);
      updateCounter('notes', 500);
      const ratio = card.ratio && card.ratio.w && card.ratio.h ? card.ratio : { w: 3, h: 2 };
      state.ratio = { w: ratio.w, h: ratio.h };
      ratioWInput.value = String(state.ratio.w);
      ratioHInput.value = String(state.ratio.h);
      syncRatioChips();
      paintPreviewMeta();
      if (card.frontImage) {
        state.images.front = { src: card.frontImage, size: null, name: '', width: null, height: null, isNew: false };
        paintZone('front');
      }
      if (card.backImage) {
        state.images.back = { src: card.backImage, size: null, name: '', width: null, height: null, isNew: false };
        paintZone('back');
      }
      updateViewer();

      if (card.status === 'rejected') {
        showNotice(
          ico('alert', 16) + ' <b>审核未通过</b>' +
          (card.rejectReason ? '：' + esc(card.rejectReason) : '。') +
          ' 请根据提示修改后重新提交审核。',
          'danger'
        );
      } else if (card.status === 'pending') {
        showNotice(ico('clock', 16) + ' <b>这张卡片正在审核中</b>，修改并提交后会重新进入审核队列。', 'warn');
      } else {
        showNotice(ico('info', 16) + ' <b>修改已通过的卡片后需要重新审核</b>，审核期间不会出现在卡片广场。', 'warn');
      }
      if (card.id) {
        state.cardStatus = card.status;
      }
    }

    async function loadCard() {
      try {
        const res = await QSL.api.cards.get(cardId);
        if (!state.alive) return;
        const card = res && res.card;
        if (!card) throw new Error('卡片不存在');
        if (res.owner && QSL.state.user && res.owner.id && QSL.state.user.id && res.owner.id !== QSL.state.user.id) {
          QSL.toast('只能编辑自己的卡片', 'error');
          QSL.navigate('/dashboard/cards');
          return;
        }
        fillForm(card);
      } catch (err) {
        if (!state.alive) return;
        console.error('[card-editor] 加载卡片失败', err);
        QSL.toast((err && err.message) || '卡片加载失败', 'error');
        QSL.navigate('/dashboard/cards');
      }
    }

    /* ---------------- 默认值 / 初始化 ---------------- */
    if (!isEdit) {
      callSignInput.value = user.callSign || '';
      paintPreviewMeta();
      syncRatioChips();
      mountViewer();
    } else {
      paintPreviewMeta();
      syncRatioChips();
      mountViewer();
      loadCard();
    }

    /* ---------------- 未保存内容守卫 ---------------- */
    function onBeforeUnload(event) {
      if (!state.dirty || state.submitting) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    const originalNavigate = QSL.navigate;
    function guardedNavigate(to, options) {
      if (!state.dirty || state.submitting || state.leaving) {
        return originalNavigate.call(QSL, to, options);
      }
      state.leaving = true;
      QSL.confirm({
        title: '离开此页面？',
        message: '你还有未保存的卡片内容，离开后本次修改将丢失。',
        confirmText: '放弃修改并离开',
        cancelText: '继续编辑',
        danger: true
      }).then((ok) => {
        state.leaving = false;
        if (ok) {
          state.dirty = false;
          originalNavigate.call(QSL, to, options);
        }
      }).catch(() => { state.leaving = false; });
    }
    QSL.navigate = guardedNavigate;

    return function cleanup() {
      state.alive = false;
      if (stockModal) stockModal.close();
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
      if (QSL.navigate === guardedNavigate) QSL.navigate = originalNavigate;
      if (viewer && typeof viewer.destroy === 'function') {
        try { viewer.destroy(); } catch (err) { console.error('[card-editor] viewer destroy', err); }
      }
      viewer = null;
    };
  }

  QSL.registerPage('card-editor', { title: '上传卡片', render: render });
})();
