/* ============================================================
 * public/js/card3d.js — QSLink 3D 双面 QSL 卡片查看器（cards-ui）
 * 契约 docs/CONTRACT.md §4.5
 *
 *   const viewer = QSL.card3d.create(container, {
 *     front, back, ratio: { w, h }, width: 520,
 *     autoRotate: true, interactive: true, showControls: false,
 *     initialSide: 'front', ambient: true
 *   });
 *   viewer = { el, flip(), showFront(), showBack(), reset(),
 *              setImages(front, back), setRatio(ratio),
 *              setAutoRotate(bool), destroy() }
 *
 * 纯原生 CSS 3D：显示层不使用任何第三方依赖。
 * 额外可选参数（向后兼容，不传即默认）：
 *   autoRotateSpeed / idleDelay / initialYaw / initialPitch / onSideChange
 * ============================================================ */
(function () {
  'use strict';

  const QSL = (window.QSL = window.QSL || {});

  /* ---------------- 小工具 ---------------- */
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp((-lambda * dt) / 1000));
  const nowMs = () => (window.performance && performance.now ? performance.now() : Date.now());
  const PITCH_LIMIT = 20;

  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReduced = () => !!(mqReduce && mqReduce.matches);

  function normalizeRatio(ratio) {
    const w = Number(ratio && ratio.w);
    const h = Number(ratio && ratio.h);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { w: 3, h: 2 };
    return { w: Math.round(w), h: Math.round(h) };
  }

  function iconHtml(name, size) {
    if (typeof QSL.icon === 'function') {
      try {
        const out = QSL.icon(name, size);
        if (out) return out;
      } catch (err) { /* 图标库异常不影响查看器 */ }
    }
    return '';
  }

  /* ---------------- 结构模板（全部为静态字符串，无用户数据） ---------------- */
  function emblemSvg() {
    return (
      '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="23" stroke-opacity=".26"/>' +
      '<circle cx="32" cy="32" r="15" stroke-opacity=".42" stroke-dasharray="2 5"/>' +
      '<path d="M32 52V33"/><circle cx="32" cy="29" r="3.2"/>' +
      '<path d="M22.5 36.5a13.4 13.4 0 0 1 19 0" stroke-opacity=".55"/>' +
      '<path d="M17.5 32a20 20 0 0 1 29 0" stroke-opacity=".3"/>' +
      '<path d="M44 18.5l2.2 2.2M47.5 15l1.4 1.4" stroke-opacity=".5"/>' +
      '</svg>'
    );
  }

  function faceHtml(kind) {
    const isBack = kind === 'back';
    return (
      '<div class="card3d-face card3d-face--' + kind + '">' +
      '<img class="card3d-img" alt="" draggable="false" decoding="async">' +
      '<div class="card3d-fallback" aria-hidden="true">' +
      '<span class="card3d-emblem">' + emblemSvg() + '</span>' +
      '<span class="card3d-fallback-title">' + (isBack ? '73' : 'QSL') + '</span>' +
      '<span class="card3d-fallback-sub">' + (isBack ? 'RADIO CARD EXCHANGE' : 'QSLink · HAM RADIO') + '</span>' +
      '</div>' +
      '<span class="card3d-sheen" aria-hidden="true"></span>' +
      '<span class="card3d-holo" aria-hidden="true"></span>' +
      '<span class="card3d-glass-ring" aria-hidden="true"></span>' +
      '</div>'
    );
  }

  function controlsHtml() {
    return (
      '<div class="card3d-controls" role="toolbar" aria-label="3D 卡片视角控制">' +
      '<button class="card3d-ctrl" type="button" data-c3-act="flip" aria-label="翻转卡片">' +
      iconHtml('flip', 16) + '<span>翻转</span></button>' +
      '<button class="card3d-ctrl" type="button" data-c3-act="spin" aria-label="切换自动旋转" aria-pressed="true">' +
      iconHtml('refresh', 16) + '<span>旋转</span></button>' +
      '<button class="card3d-ctrl" type="button" data-c3-act="reset" aria-label="重置视角">' +
      iconHtml('compass', 16) + '<span>复位</span></button>' +
      '</div>'
    );
  }

  /* ---------------- create ---------------- */
  function create(container, options) {
    if (!container || container.nodeType !== 1) {
      throw new Error('QSL.card3d.create：container 必须是有效的 DOM 元素');
    }
    const opts = options || {};

    /* ---- 初始状态 ---- */
    const initialState = {
      ratio: normalizeRatio(opts.ratio),
      width: opts.width === null || opts.width === undefined ? null : Number(opts.width),
      autoRotate: opts.autoRotate !== false,
      interactive: opts.interactive !== false,
      showControls: !!opts.showControls,
      initialSide: opts.initialSide === 'back' ? 'back' : 'front',
      initialYaw: isFinite(Number(opts.initialYaw)) ? Number(opts.initialYaw) : 0,
      initialPitch: isFinite(Number(opts.initialPitch)) ? clamp(Number(opts.initialPitch), -PITCH_LIMIT, PITCH_LIMIT) : 0,
      ambient: opts.ambient !== false,
      autoRotateSpeed: isFinite(Number(opts.autoRotateSpeed)) ? clamp(Number(opts.autoRotateSpeed), 0, 40) : 7,
      idleDelay: isFinite(Number(opts.idleDelay)) ? clamp(Number(opts.idleDelay), 800, 15000) : 2600
    };

    const state = {
      ratio: initialState.ratio,
      width: isFinite(initialState.width) && initialState.width > 0 ? initialState.width : null,
      autoRotate: initialState.autoRotate,
      interactive: initialState.interactive,
      showControls: initialState.showControls,
      ambient: initialState.ambient,
      autoRotateSpeed: initialState.autoRotateSpeed,
      idleDelay: initialState.idleDelay,
      onSideChange: typeof opts.onSideChange === 'function' ? opts.onSideChange : null
    };

    const ratio = () => state.ratio;
    let isBack = initialState.initialSide === 'back';

    let targetYaw = (isBack ? 180 : 0) + initialState.initialYaw;
    let targetPitch = initialState.initialPitch;
    let renderYaw = targetYaw;
    let renderPitch = targetPitch;
    let velYaw = 0;
    let velPitch = 0;
    let dragging = false;
    let activePointer = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    let touchLock = '';
    let pointerDownAt = 0;
    let lastInteract = nowMs();
    let lastFlipAt = 0;
    let lastTapAt = 0;
    let rafId = 0;
    let glossRaf = 0;
    let glossEvent = null;
    let lastFrame = 0;
    let idleTimer = 0;
    let destroyed = false;
    let visible = true;
    let cssWidth = 0;
    let cssHeight = 0;
    let lastW = 0;
    let lastH = 0;

    /* ---- DOM ---- */
    const root = document.createElement('div');
    root.className = 'card3d' + (state.ambient ? ' has-ambient' : '') + (state.showControls ? ' has-controls' : '');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'QSL 卡片 3D 查看器：拖拽旋转，双击翻转');
    root.style.setProperty('--mx', '50%');
    root.style.setProperty('--my', '50%');

    let thicknessHtml = '';
    // 卡纸厚度：5 层薄片即可形成细腻的侧边挤出（层数过多会显得像厚泡沫板）
    for (let i = 0; i < 5; i++) {
      thicknessHtml += '<i class="card3d-sheet" style="--p:' + (i / 4).toFixed(3) + '"></i>';
    }

    root.innerHTML =
      '<div class="card3d-stage">' +
      '<span class="card3d-aurora" aria-hidden="true"></span>' +
      '<div class="card3d-float">' +
      '<div class="card3d-scene">' +
      '<div class="card3d-card' + (state.interactive ? ' is-interactive' : '') + '"' +
      (state.interactive ? ' tabindex="0"' : '') + '>' +
      '<div class="card3d-thickness" aria-hidden="true">' + thicknessHtml + '</div>' +
      faceHtml('front') +
      faceHtml('back') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<span class="card3d-floor" aria-hidden="true"></span>' +
      '</div>' +
      (state.showControls ? controlsHtml() : '') +
      '<span class="card3d-sr" aria-live="polite"></span>';

    const stageEl = root.querySelector('.card3d-stage');
    const sceneEl = root.querySelector('.card3d-scene');
    const cardEl = root.querySelector('.card3d-card');
    const liveEl = root.querySelector('.card3d-sr');
    const controlsEl = root.querySelector('.card3d-controls');
    const frontFace = root.querySelector('.card3d-face--front');
    const backFace = root.querySelector('.card3d-face--back');
    const frontImg = frontFace.querySelector('.card3d-img');
    const backImg = backFace.querySelector('.card3d-img');
    const spinBtn = controlsEl ? controlsEl.querySelector('[data-c3-act="spin"]') : null;

    container.appendChild(root);

    /* ---------------- 尺寸 / 比例自适应 ---------------- */
    function relayout() {
      if (destroyed) return;
      const cw = container.clientWidth || root.clientWidth || 0;
      const ch = container.clientHeight || 0;
      const fallbackW = 340;
      const controlsH = state.showControls ? 60 : 0;
      const padX = 16;
      let availW = Math.max(120, (cw > 24 ? cw : fallbackW) - padX * 2);
      if (state.width) availW = Math.min(availW, state.width);
      const r = ratio();
      const hr = r.h / r.w;
      let w = availW;
      let h = w * hr;

      // 容器有显式高度时收敛，保证不溢出；auto 高度（首帧 ch≈0）时按宽度展开
      const availH = ch - controlsH;
      if (ch > 0 && availH > 80 && h > availH) {
        h = availH;
        w = h / hr;
      }
      w = Math.max(72, Math.floor(w));
      h = Math.max(48, Math.floor(h));

      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      cssWidth = w;
      cssHeight = h;

      stageEl.style.width = w + 'px';
      stageEl.style.height = h + 'px';
      root.style.setProperty('--card3d-w', w + 'px');
      root.style.setProperty('--card3d-h', h + 'px');

      // 真实卡纸厚度：约为卡片短边的 0.8%（104mm 宽的卡 ≈ 0.3-0.5mm 厚），并限制在 2-4px
      const depth = clamp(Math.round(Math.min(w, h) * 0.008 * 10) / 10, 2, 4);
      root.style.setProperty('--card3d-depth', depth + 'px');
      root.style.setProperty('--card3d-half', (depth / 2).toFixed(2) + 'px');
      root.style.setProperty('--card3d-radius', Math.round(clamp(w * 0.045, 10, 26)) + 'px');
      root.style.setProperty('--card3d-persp', Math.round(clamp(w * 2.15, 860, 1900)) + 'px');
      root.style.setProperty('--card3d-title-size', Math.round(clamp(w * 0.11, 22, 58)) + 'px');
      root.style.setProperty('--card3d-sub-size', Math.round(clamp(w * 0.021, 9, 14)) + 'px');
    }

    /* ---------------- 图片 ---------------- */
    function paintFace(faceEl, imgEl, url, label) {
      if (!faceEl || !imgEl) return;
      if (!url) {
        faceEl.classList.remove('is-loaded');
        faceEl.classList.add('is-empty');
        imgEl.removeAttribute('src');
        return;
      }
      faceEl.classList.remove('is-empty', 'is-loaded');
      imgEl.onload = function () {
        if (destroyed) return;
        faceEl.classList.add('is-loaded');
      };
      imgEl.onerror = function () {
        if (destroyed) return;
        faceEl.classList.add('is-empty');
      };
      imgEl.alt = label === 'back' ? '卡片背面' : '卡片正面';
      imgEl.src = url;
    }

    function paintImages() {
      paintFace(frontFace, frontImg, opts.front, 'front');
      paintFace(backFace, backImg, opts.back, 'back');
      // 更新 alt 之外的语义信息：给根节点补充卡片描述由调用方 aria-label 负责
    }

    /* ---------------- 变换应用 ---------------- */
    function applyTransform() {
      cardEl.style.transform =
        'translate3d(0, 0, 0) rotateX(' + renderPitch.toFixed(2) + 'deg) rotateY(' + renderYaw.toFixed(2) + 'deg)';
    }

    function announce(side) {
      if (!liveEl) return;
      liveEl.textContent = '当前展示：卡片' + (side === 'back' ? '背面' : '正面');
    }

    /* ---------------- 角度工具 ---------------- */
    function nearestAngle(current, base) {
      return base + Math.round((current - base) / 360) * 360;
    }

    function moveToSide(side) {
      isBack = side === 'back';
      targetYaw = nearestAngle(targetYaw, isBack ? 180 : 0);
      velYaw = 0;
      velPitch = 0;
      lastInteract = nowMs();
      lastFlipAt = Date.now();
      announce(isBack ? 'back' : 'front');
      if (state.onSideChange) {
        try { state.onSideChange(isBack ? 'back' : 'front', viewer); } catch (err) { /* 回调异常不影响渲染 */ }
      }
      ensureLoop();
    }

    function flip() {
      if (destroyed) return;
      if (Date.now() - lastFlipAt < 320) return;
      moveToSide(isBack ? 'front' : 'back');
    }

    /* ---------------- 帧循环 ---------------- */
    function frame(now) {
      rafId = 0;
      if (destroyed) return;
      if (!lastFrame) lastFrame = now;
      const dt = clamp(now - lastFrame, 1, 50);
      lastFrame = now;
      const idle = now - lastInteract;

      if (!dragging) {
        // 惯性
        if (Math.abs(velYaw) > 0.004 || Math.abs(velPitch) > 0.004) {
          targetYaw += velYaw * (dt / 16.67);
          targetPitch = clamp(targetPitch + velPitch * (dt / 16.67), -PITCH_LIMIT, PITCH_LIMIT);
          const decay = Math.pow(0.915, dt / 16.67);
          velYaw *= decay;
          velPitch *= decay;
        }
        // 空闲缓慢自转
        if (state.autoRotate && !prefersReduced() && idle > state.idleDelay) {
          targetYaw += (state.autoRotateSpeed * dt) / 1000;
        }
        // 空闲后俯仰回正
        if (idle > 1500 && Math.abs(targetPitch) > 0.05) {
          targetPitch = damp(targetPitch, 0, 2.4, dt);
        }
      }

      renderYaw = damp(renderYaw, targetYaw, 11, dt);
      renderPitch = damp(renderPitch, targetPitch, 11, dt);

      if (Math.abs(renderYaw - targetYaw) < 0.005) renderYaw = targetYaw;
      if (Math.abs(renderPitch - targetPitch) < 0.005) renderPitch = targetPitch;

      applyTransform();

      if (shouldContinue(now)) {
        rafId = requestAnimationFrame(frame);
      } else {
        lastFrame = 0;
        scheduleIdle(now);
      }
    }

    function shouldContinue(now) {
      if (dragging) return true;
      if (Math.abs(targetYaw - renderYaw) > 0.02) return true;
      if (Math.abs(targetPitch - renderPitch) > 0.02) return true;
      if (Math.abs(velYaw) > 0.01 || Math.abs(velPitch) > 0.01) return true;
      if (state.autoRotate && !prefersReduced() && now - lastInteract > state.idleDelay) return true;
      return false;
    }

    function scheduleIdle(now) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = 0;
      if (destroyed || !visible) return;
      const idle = now - lastInteract;
      let wait = Infinity;
      if (state.autoRotate && !prefersReduced()) wait = Math.min(wait, state.idleDelay - idle);
      if (Math.abs(targetPitch) > 0.1) wait = Math.min(wait, 1500 - idle);
      if (!isFinite(wait)) return;
      idleTimer = setTimeout(function () {
        idleTimer = 0;
        if (destroyed) return;
        lastFrame = 0;
        ensureLoop();
      }, Math.max(60, wait + 30));
    }

    function ensureLoop() {
      if (destroyed || rafId) return;
      if (!visible) return;
      if (!lastFrame) lastFrame = nowMs();
      rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      lastFrame = 0;
    }

    /* ---------------- 指针交互 ---------------- */
    function pointerPosNormalized(e) {
      const rect = cardEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0.5, y: 0.5 };
      return {
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1)
      };
    }

    // 光泽跟随指针：每帧最多写一次 CSS 变量。逐事件写会让整张卡片的渐变/混合层反复重绘，
    // 在手机 WebView 上会拖垮合成器（整页卡顿、卡面闪烁甚至纹理丢失）。
    function flushGloss() {
      glossRaf = 0;
      if (destroyed || !glossEvent) return;
      const pos = pointerPosNormalized(glossEvent);
      glossEvent = null;
      root.style.setProperty('--mx', (pos.x * 100).toFixed(1) + '%');
      root.style.setProperty('--my', (pos.y * 100).toFixed(1) + '%');
      root.style.setProperty('--holo-x', (pos.x * 160 - 30).toFixed(0) + 'deg');
      root.style.setProperty('--holo-y', (pos.y * 160 - 30).toFixed(0) + 'deg');
    }

    function onPointerMove(e) {
      if (destroyed) return;
      // 触摸没有悬停态，光泽保持居中，避免拖拽时逐帧重绘卡面
      if (e.pointerType !== 'touch') {
        glossEvent = { clientX: e.clientX, clientY: e.clientY };
        if (!glossRaf) glossRaf = requestAnimationFrame(flushGloss);
      }

      if (!dragging || e.pointerId !== activePointer) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      if (e.pointerType === 'touch' && !touchLock) {
        const totalX = e.clientX - startX;
        const totalY = e.clientY - startY;
        if (Math.abs(totalX) < 7 && Math.abs(totalY) < 7) return;
        touchLock = Math.abs(totalX) >= Math.abs(totalY) ? 'rotate' : 'scroll';
        if (touchLock === 'scroll') {
          endDrag(false, true);
          return;
        }
      }
      if (touchLock === 'scroll') return;
      if (e.cancelable) e.preventDefault();

      moved += Math.abs(dx) + Math.abs(dy);
      targetYaw += dx * 0.42;
      targetPitch = clamp(targetPitch - dy * 0.3, -PITCH_LIMIT, PITCH_LIMIT);
      velYaw = clamp(velYaw * 0.45 + dx * 0.42 * 0.55, -16, 16);
      velPitch = clamp(velPitch * 0.45 + dy * 0.3 * 0.55, -10, 10);

      lastX = e.clientX;
      lastY = e.clientY;
    }

    function onPointerDown(e) {
      if (destroyed) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.card3d-controls')) return;
      lastInteract = nowMs();
      if (!state.interactive) {
        ensureLoop();
        return;
      }
      activePointer = e.pointerId;
      dragging = true;
      touchLock = '';
      moved = 0;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      pointerDownAt = Date.now();
      velYaw = 0;
      velPitch = 0;
      root.classList.add('is-dragging');
      root.classList.remove('is-idle');
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* 部分环境不支持指针捕获 */ }
      try { cardEl.focus({ preventScroll: true }); } catch (err) { /* 忽略 */ }
      ensureLoop();
    }

    function onPointerUp(e) {
      if (destroyed) return;
      if (!dragging || e.pointerId !== activePointer) return;
      const duration = Date.now() - pointerDownAt;
      const isTap = moved < 9 && duration < 380;
      endDrag(true, false);

      if (!isTap) return;
      if (e.pointerType === 'mouse') return; // 鼠标双击走 dblclick
      const now = Date.now();
      if (now - lastTapAt < 340) {
        lastTapAt = 0;
        flip();
      } else {
        lastTapAt = now;
      }
    }

    function endDrag(keepInertia, scroll) {
      dragging = false;
      activePointer = null;
      touchLock = '';
      root.classList.remove('is-dragging');
      lastInteract = nowMs();
      if (!keepInertia) {
        velYaw = 0;
        velPitch = 0;
      }
      if (scroll) {
        // 触摸竖向滚动：浏览器接管，不继续旋转
        targetPitch = clamp(targetPitch, -PITCH_LIMIT, PITCH_LIMIT);
      }
      ensureLoop();
      scheduleIdle(nowMs());
    }

    function onPointerCancel() {
      if (!dragging) return;
      endDrag(false, true);
    }

    function onPointerLeave() {
      if (glossRaf) { cancelAnimationFrame(glossRaf); glossRaf = 0; }
      glossEvent = null;
      root.style.setProperty('--mx', '50%');
      root.style.setProperty('--my', '50%');
      root.style.setProperty('--holo-x', '50deg');
      root.style.setProperty('--holo-y', '50deg');
      root.classList.remove('is-hover');
    }

    function onPointerEnter(e) {
      if (e.pointerType !== 'touch') root.classList.add('is-hover');
      lastInteract = nowMs();
    }

    function onDoubleClick(e) {
      if (!state.interactive) return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.card3d-controls')) return;
      flip();
    }

    function onKeyDown(e) {
      if (!state.interactive) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        flip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        targetYaw -= 15;
        lastInteract = nowMs();
        ensureLoop();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        targetYaw += 15;
        lastInteract = nowMs();
        ensureLoop();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetPitch = clamp(targetPitch + 6, -PITCH_LIMIT, PITCH_LIMIT);
        lastInteract = nowMs();
        ensureLoop();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        targetPitch = clamp(targetPitch - 6, -PITCH_LIMIT, PITCH_LIMIT);
        lastInteract = nowMs();
        ensureLoop();
      } else if (e.key === 'Home') {
        e.preventDefault();
        reset();
      }
    }

    /* ---------------- 控件 ---------------- */
    function syncSpinButton() {
      if (!spinBtn) return;
      spinBtn.classList.toggle('is-on', state.autoRotate);
      spinBtn.setAttribute('aria-pressed', state.autoRotate ? 'true' : 'false');
    }

    function onControlsClick(e) {
      const btn = e.target && e.target.closest ? e.target.closest('[data-c3-act]') : null;
      if (!btn) return;
      e.preventDefault();
      const act = btn.getAttribute('data-c3-act');
      if (act === 'flip') flip();
      else if (act === 'spin') setAutoRotate(!state.autoRotate);
      else if (act === 'reset') reset();
    }

    /* ---------------- 公开 API ---------------- */
    function flipPublic() { flip(); }
    function showFront() { if (!destroyed) moveToSide('front'); }
    function showBack() { if (!destroyed) moveToSide('back'); }

    function reset() {
      if (destroyed) return;
      state.autoRotate = initialState.autoRotate;
      syncSpinButton();
      isBack = initialState.initialSide === 'back';
      targetYaw = nearestAngle(targetYaw, (isBack ? 180 : 0) + initialState.initialYaw);
      targetPitch = initialState.initialPitch;
      velYaw = 0;
      velPitch = 0;
      lastInteract = nowMs();
      announce(isBack ? 'back' : 'front');
      ensureLoop();
    }

    function setImages(front, back) {
      if (destroyed) return;
      opts.front = front;
      opts.back = back;
      paintImages();
    }

    function setRatio(nextRatio) {
      if (destroyed) return;
      state.ratio = normalizeRatio(nextRatio);
      lastW = lastH = 0;
      relayout();
      ensureLoop();
    }

    function setAutoRotate(next) {
      if (destroyed) return;
      state.autoRotate = !!next;
      lastInteract = nowMs();
      syncSpinButton();
      ensureLoop();
    }

    function setWidth(nextWidth) {
      if (destroyed) return;
      const n = Number(nextWidth);
      state.width = isFinite(n) && n > 0 ? n : null;
      lastW = lastH = 0;
      relayout();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      if (glossRaf) { cancelAnimationFrame(glossRaf); glossRaf = 0; }
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (intersectionObserver) { intersectionObserver.disconnect(); intersectionObserver = null; }
      window.removeEventListener('resize', relayout);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      cardEl.removeEventListener('dblclick', onDoubleClick);
      cardEl.removeEventListener('keydown', onKeyDown);
      if (controlsEl) controlsEl.removeEventListener('click', onControlsClick);
      if (frontImg) { frontImg.onload = null; frontImg.onerror = null; }
      if (backImg) { backImg.onload = null; backImg.onerror = null; }
      if (root.parentNode) root.parentNode.removeChild(root);
      if (container.classList) container.classList.remove('card3d-mounted');
    }

    const viewer = {
      el: root,
      flip: flipPublic,
      showFront,
      showBack,
      reset,
      setImages,
      setRatio,
      setAutoRotate,
      setWidth,
      getSide: function () { return isBack ? 'back' : 'front'; },
      destroy
    };

    /* ---------------- 事件绑定 ---------------- */
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);
    cardEl.addEventListener('dblclick', onDoubleClick);
    cardEl.addEventListener('keydown', onKeyDown);
    if (controlsEl) controlsEl.addEventListener('click', onControlsClick);

    /* ---------------- 自适应观察 ---------------- */
    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(function () { relayout(); });
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', relayout);

    let intersectionObserver = null;
    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver(
        function (entries) {
          const entry = entries[0];
          visible = !!(entry && entry.isIntersecting);
          if (visible) {
            ensureLoop();
          } else {
            stopLoop();
          }
        },
        { threshold: 0.01 }
      );
      intersectionObserver.observe(root);
    }

    /* ---------------- 首帧 ---------------- */
    if (container.classList) container.classList.add('card3d-mounted');
    paintImages();
    syncSpinButton();
    applyTransform();
    // 立即量一次，再等一帧（字体/父级布局就绪后）复量
    relayout();
    requestAnimationFrame(function () {
      if (destroyed) return;
      relayout();
      ensureLoop();
    });

    announce(isBack ? 'back' : 'front');
    if (!state.autoRotate) scheduleIdle(nowMs());

    return viewer;
  }

  QSL.card3d = { create: create };
})();
