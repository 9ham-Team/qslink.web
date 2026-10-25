/* ============================================================
 * QSLink effects.js — 全局动效系统（motion-ui）
 * 依赖：core.js（QSL 事件总线 / 工具函数），无第三方库、无构建。
 * 暴露：window.QSL.fx = { init, enhance, confetti, heartbeat, pageTransition }
 *
 * 设计原则：
 *  - 优雅克制、性能优先：CSS 负责视觉，JS 只加类 / 少量 canvas 粒子；
 *  - 容错：元素不存在、重复调用、QSL 未就绪均不抛错；
 *  - 尊重 prefers-reduced-motion，页面隐藏时暂停 RAF；
 *  - route 切换时清理上一场景的观察者与计时器，避免泄漏。
 * ============================================================ */
(function () {
  'use strict';

  var win = window;
  var doc = document;
  var QSL = (win.QSL = win.QSL || {});
  var fx = (QSL.fx = QSL.fx || {});

  /* ---------------- 环境探测 ---------------- */
  var mqReduce = null;
  var mqFine = null;
  var mqCardScene = null;
  try {
    if (typeof win.matchMedia === 'function') {
      mqReduce = win.matchMedia('(prefers-reduced-motion: reduce)');
      mqFine = win.matchMedia('(hover: hover) and (pointer: fine)');
      mqCardScene = win.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
    }
  } catch (e) { /* ignore */ }

  function reduced() {
    return !!(mqReduce && mqReduce.matches);
  }
  function finePointer() {
    return !!(mqFine && mqFine.matches);
  }

  /* ---------------- 工具 ---------------- */
  var TAU = Math.PI * 2;

  function clamp(n, min, max) {
    return n < min ? min : n > max ? max : n;
  }
  function now() {
    return win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now();
  }
  function raf(fn) {
    if (typeof win.requestAnimationFrame === 'function') return win.requestAnimationFrame(fn);
    return win.setTimeout(function () { fn(now()); }, 16);
  }
  function caf(id) {
    if (!id) return;
    try {
      if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(id);
      else win.clearTimeout(id);
    } catch (e) { /* ignore */ }
  }
  function isEl(node) {
    return !!(node && node.nodeType === 1 && typeof node.querySelectorAll === 'function');
  }
  function rectOf(el) {
    try {
      return el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    } catch (e) {
      return null;
    }
  }
  /* 元素当前是否在视口内（含余量）；用于首屏动效不依赖 IntersectionObserver 也能触发 */
  function inViewport(el, margin) {
    var r = rectOf(el);
    if (!r) return false;
    if (r.width <= 0 && r.height <= 0) return false;
    var m = margin || 0;
    var vh = win.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0;
    var vw = win.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0;
    return r.bottom > -m && r.top < vh + m && r.right > -m && r.left < vw + m;
  }
  function collect(root, selector) {
    var out = [];
    if (!root) return out;
    try {
      if (isEl(root) && typeof root.matches === 'function' && root.matches(selector)) out.push(root);
      var list = typeof root.querySelectorAll === 'function' ? root.querySelectorAll(selector) : [];
      for (var i = 0; i < list.length; i++) out.push(list[i]);
    } catch (e) { /* ignore */ }
    return out;
  }
  function qsa(selector) {
    try {
      return doc.querySelectorAll(selector);
    } catch (e) {
      return [];
    }
  }
  function onGlobal(evt, fn) {
    try {
      if (QSL && typeof QSL.on === 'function') QSL.on(evt, fn);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 运行状态 ---------------- */
  var state = {
    inited: false,
    booted: false,
    layer: null,
    canvas: null,
    ctx: null,
    sprites: null,
    particles: [],
    dpr: 1,
    w: 0,
    h: 0,
    raf: 0,
    running: false,
    lastTs: 0,
    /* 场景级清理 */
    io: null,
    ioHandlers: new WeakMap(),
    observed: new Set(),
    seenReveal: new WeakSet(),
    seenCount: new WeakSet(),
    countEls: new Set(),
    countInfo: new WeakMap(),
    timers: [],
    /* 指针交互 */
    tiltEl: null,
    magEl: null,
    tiltRect: null,
    magRect: null,
    pointerRaf: 0,
    px: 0,
    py: 0,
    heartTimers: new WeakMap(),
    pageTimers: new WeakMap(),
    /* 其它 */
    enhanceRaf: 0,
    scrollRaf: 0,
    revealSweepTimer: 0
  };

  function later(fn, ms) {
    var id = win.setTimeout(function () {
      for (var i = 0; i < state.timers.length; i++) {
        if (state.timers[i] === id) { state.timers.splice(i, 1); break; }
      }
      try { fn(); } catch (e) { /* ignore */ }
    }, ms);
    state.timers.push(id);
    return id;
  }
  function clearTimers() {
    for (var i = 0; i < state.timers.length; i++) {
      try { win.clearTimeout(state.timers[i]); } catch (e) { /* ignore */ }
    }
    state.timers.length = 0;
  }

  /* ============================================================
   * 一、背景层 #fx-layer（极光 / 光斑 / 微粒）
   * ============================================================ */
  function ensureLayer() {
    var layer = doc.getElementById('fx-layer');
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = 'fx-layer';
      layer.className = 'fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      var parent = doc.body || doc.documentElement;
      if (parent) parent.insertBefore(layer, parent.firstChild || null);
    }
    if (!layer) return null;
    if (layer.getAttribute('data-fx-built') !== '1') {
      layer.setAttribute('data-fx-built', '1');
      layer.classList.add('fx-layer');
      var aurora = doc.createElement('div');
      aurora.className = 'fx-aurora fx-aurora-a';
      var auroraB = doc.createElement('div');
      auroraB.className = 'fx-aurora fx-aurora-b';
      var grid = doc.createElement('div');
      grid.className = 'fx-grid';
      var orbA = doc.createElement('div');
      orbA.className = 'fx-orb fx-orb-a';
      var orbB = doc.createElement('div');
      orbB.className = 'fx-orb fx-orb-b';
      var orbC = doc.createElement('div');
      orbC.className = 'fx-orb fx-orb-c';
      var canvas = doc.createElement('canvas');
      canvas.className = 'fx-particles';
      canvas.setAttribute('aria-hidden', 'true');
      var vignette = doc.createElement('div');
      vignette.className = 'fx-vignette';
      layer.appendChild(aurora);
      layer.appendChild(auroraB);
      layer.appendChild(grid);
      layer.appendChild(orbA);
      layer.appendChild(orbB);
      layer.appendChild(orbC);
      layer.appendChild(canvas);
      layer.appendChild(vignette);
    }
    state.layer = layer;
    state.canvas = layer.querySelector('canvas.fx-particles');
    return layer;
  }

  function makeSprites() {
    var colors = [[14, 175, 143], [56, 189, 248], [251, 113, 133]];
    return colors.map(function (rgb) {
      var c = doc.createElement('canvas');
      c.width = 64;
      c.height = 64;
      var g = c.getContext('2d');
      if (!g) return c;
      var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      var base = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
      grad.addColorStop(0, 'rgba(' + base + ',0.85)');
      grad.addColorStop(0.35, 'rgba(' + base + ',0.28)');
      grad.addColorStop(1, 'rgba(' + base + ',0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return c;
    });
  }

  function resizeCanvas() {
    var canvas = state.canvas;
    if (!canvas) return;
    state.dpr = clamp(win.devicePixelRatio || 1, 1, 2);
    state.w = Math.max(1, win.innerWidth || 1);
    state.h = Math.max(1, win.innerHeight || 1);
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    var ctx = state.ctx || canvas.getContext('2d');
    state.ctx = ctx;
    if (ctx) ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function seedParticles() {
    var count = state.w < 620 ? 10 : state.w < 1080 ? 16 : 24;
    var list = [];
    for (var i = 0; i < count; i++) {
      list.push({
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        size: 12 + Math.random() * 22,
        alpha: 0.1 + Math.random() * 0.22,
        vy: 0.05 + Math.random() * 0.14,
        sway: 0.25 + Math.random() * 0.55,
        phase: Math.random() * TAU,
        sprite: i % 3
      });
    }
    state.particles = list;
  }

  function startBackground() {
    if (!state.inited) return;
    // 高 DPR 手机同时合成全屏动态背景和快速翻面的卡图时会耗尽瓦片预算。
    // 由组件挂载/卸载触发的 enhance 同步状态，不在每帧查询 DOM。
    var cardScene = !!(mqCardScene && mqCardScene.matches && doc.querySelector('.card3d'));
    if (state.layer) state.layer.classList.toggle('is-static-card-scene', cardScene);
    if (reduced() || doc.hidden || cardScene) { stopBackground(); return; }
    if (state.running) return;
    if (!state.canvas || !state.canvas.getContext) return;
    try {
      if (!state.ctx) state.ctx = state.canvas.getContext('2d');
      if (!state.ctx) return;
      if (!state.sprites) state.sprites = makeSprites();
      resizeCanvas();
      seedParticles();
      state.running = true;
      state.lastTs = 0;
      if (!state.raf) state.raf = raf(tickParticles);
    } catch (e) {
      state.running = false;
    }
  }

  function stopBackground() {
    state.running = false;
    if (state.raf) caf(state.raf);
    state.raf = 0;
  }

  function tickParticles(ts) {
    if (!state.running || !state.ctx) { state.raf = 0; return; }
    state.raf = raf(tickParticles);
    var ctx = state.ctx;
    var sprites = state.sprites;
    if (!sprites) return;
    var w = state.w;
    var h = state.h;
    var dt = state.lastTs ? Math.min(48, ts - state.lastTs) : 16.7;
    state.lastTs = ts;
    var k = dt / 16.7;
    var t = ts * 0.001;
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < state.particles.length; i++) {
      var p = state.particles[i];
      p.x += Math.sin(t * p.sway + p.phase) * 0.12 * k;
      p.y -= p.vy * k;
      if (p.y < -48) { p.y = h + 48; p.x = Math.random() * w; }
      if (p.x < -48) p.x = w + 48;
      else if (p.x > w + 48) p.x = -48;
      ctx.globalAlpha = p.alpha * (0.72 + 0.28 * Math.sin(t * 0.55 + p.phase));
      ctx.drawImage(sprites[p.sprite], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
   * 二、滚动进入观察器
   * ============================================================ */
  function ensureIO() {
    if (state.io) return state.io;
    if (typeof win.IntersectionObserver !== 'function') return null;
    try {
      state.io = new win.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var handler = state.ioHandlers.get(entry.target);
          if (!handler) continue;
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            state.ioHandlers.delete(entry.target);
            state.observed.delete(entry.target);
            try { state.io.unobserve(entry.target); } catch (e) { /* ignore */ }
            try { handler(entry); } catch (e) { /* ignore */ }
          }
        }
      }, { root: null, rootMargin: '0px 0px -4% 0px', threshold: 0.04 });
    } catch (e) {
      state.io = null;
    }
    return state.io;
  }

  function observe(el, handler) {
    if (!isEl(el) || typeof handler !== 'function') return;
    var io = ensureIO();
    if (!io) { try { handler({ target: el, isIntersecting: true }); } catch (e) { /* ignore */ } return; }
    state.ioHandlers.set(el, handler);
    state.observed.add(el);
    try { io.observe(el); } catch (e) { /* ignore */ }
  }

  function pruneObserver() {
    if (!state.observed.size) return;
    state.observed.forEach(function (el) {
      if (el && !el.isConnected) {
        try { if (state.io) state.io.unobserve(el); } catch (e) { /* ignore */ }
        state.observed.delete(el);
        state.ioHandlers.delete(el);
      }
    });
  }

  /* ============================================================
   * 三、增强器：reveal / stagger / count
   * ============================================================ */
  function revealEl(el) {
    if (!isEl(el) || !el.classList || !el.classList.contains('fx-will-reveal')) return;
    el.classList.add('is-revealed');
    var delay = 0;
    try {
      delay = parseFloat(el.style.getPropertyValue('--fx-reveal-delay')) || 0;
    } catch (e) { /* ignore */ }
    later(function () {
      if (!el.classList) return;
      el.classList.remove('fx-will-reveal');
      el.classList.remove('is-revealed');
      try { el.style.removeProperty('--fx-reveal-delay'); } catch (e) { /* ignore */ }
    }, 640 + delay);
  }

  function revealChildren(container) {
    if (!container) return;
    try {
      for (var n = 0; n < container.children.length; n++) {
        var child = container.children[n];
        if (child.nodeType === 1 && child.classList.contains('fx-will-reveal')) revealEl(child);
      }
    } catch (e) { /* ignore */ }
  }

  function setupStagger(root) {
    var boxes = collect(root, '[data-stagger]');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var kids = [];
      try {
        for (var j = 0; j < box.children.length; j++) {
          if (box.children[j].nodeType === 1) kids.push(box.children[j]);
        }
      } catch (e) { continue; }
      if (!kids.length) continue;
      var step = parseInt(box.getAttribute('data-stagger'), 10);
      if (!isFinite(step) || step < 16) step = 70;
      step = clamp(step, 16, 240);
      var prepared = 0;
      for (var k = 0; k < kids.length; k++) {
        var kid = kids[k];
        if (state.seenReveal.has(kid) || kid.classList.contains('fx-will-reveal')) continue;
        state.seenReveal.add(kid);
        kid.classList.add('fx-will-reveal');
        var delay = Math.min(k, 10) * step;
        if (delay) kid.style.setProperty('--fx-reveal-delay', delay + 'ms');
        prepared++;
      }
      if (!prepared) continue;
      if (inViewport(box, 60)) {
        (function (container) {
          raf(function () { revealChildren(container); });
        })(box);
      } else {
        (function (container) {
          observe(container, function (entry) { revealChildren(entry.target); });
        })(box);
      }
    }
  }

  function setupReveal(root) {
    var list = collect(root, '[data-reveal]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (state.seenReveal.has(el)) continue;
      if (el.classList.contains('fx-will-reveal')) continue;
      state.seenReveal.add(el);
      var delay = parseInt(el.getAttribute('data-reveal-delay'), 10);
      if (!isFinite(delay) || delay < 0) delay = 0;
      delay = clamp(delay, 0, 1200);
      el.classList.add('fx-will-reveal');
      if (delay) el.style.setProperty('--fx-reveal-delay', delay + 'ms');
      if (inViewport(el, 40)) {
        /* 首屏元素：下一帧即可进入，避免依赖观察器回调时序 */
        (function (target) {
          raf(function () { revealEl(target); });
        })(el);
      } else {
        (function (target) {
          observe(target, function () { revealEl(target); });
        })(el);
      }
    }
  }

  function formatCount(info, value) {
    var body;
    if (info.format === 'compact' && typeof QSL.formatNumber === 'function') {
      try { body = QSL.formatNumber(Math.round(value)); } catch (e) { body = String(Math.round(value)); }
    } else if (info.format === 'comma') {
      body = Math.round(value).toLocaleString('zh-CN');
    } else if (info.decimals > 0) {
      body = Number(value).toFixed(info.decimals);
    } else {
      body = String(Math.round(value));
    }
    return (info.prefix || '') + body + (info.suffix || '');
  }

  function finishCount(el) {
    var info = state.countInfo.get(el);
    if (!info) return;
    if (info.raf) { caf(info.raf); info.raf = 0; }
    info.started = true;
    if (el && el.isConnected) {
      try { el.textContent = formatCount(info, info.target); } catch (e) { /* ignore */ }
      try { if (el.classList) el.classList.add('fx-count-done'); } catch (e2) { /* ignore */ }
    }
  }

  function startCount(el) {
    var info = state.countInfo.get(el);
    if (!info || info.started) return;
    info.started = true;
    var startTime = now();
    function frame(t) {
      if (!el || !el.isConnected) { info.raf = 0; return; }
      var p = clamp((t - startTime) / info.duration, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatCount(info, info.from + (info.target - info.from) * eased);
      if (p < 1) {
        info.raf = raf(frame);
      } else {
        finishCount(el);
      }
    }
    info.raf = raf(frame);
    /* 兜底：极端情况下（后台标签、无头截图、rAF 被节流）也保证最终值落位 */
    later(function () { finishCount(el); }, info.duration + 240);
  }

  function setupCount(root) {
    var list = collect(root, '[data-count]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (state.seenCount.has(el)) continue;
      var raw = el.getAttribute('data-count');
      var target = parseFloat(raw);
      if (!isFinite(target)) { state.seenCount.add(el); continue; }
      state.seenCount.add(el);
      var text = String(raw);
      var dot = text.indexOf('.');
      var info = {
        target: target,
        decimals: dot >= 0 ? clamp(text.length - dot - 1, 0, 2) : 0,
        prefix: el.getAttribute('data-count-prefix') || '',
        suffix: el.getAttribute('data-count-suffix') || '',
        format: el.getAttribute('data-count-format') || '',
        duration: clamp(parseInt(el.getAttribute('data-count-duration'), 10) || 1000, 300, 2200),
        from: 0,
        started: false,
        raf: 0
      };
      var from = parseFloat(el.getAttribute('data-count-from'));
      if (isFinite(from)) info.from = from;
      state.countInfo.set(el, info);
      if (reduced()) {
        el.textContent = formatCount(info, info.target);
        continue;
      }
      el.textContent = formatCount(info, info.from);
      state.countEls.add(el);
      if (inViewport(el, 40)) {
        (function (targetEl) {
          raf(function () { startCount(targetEl); });
        })(el);
      } else {
        (function (targetEl) {
          observe(targetEl, function () { startCount(targetEl); });
        })(el);
      }
    }
  }

  function disarmAll(root) {
    var list = collect(root, '.fx-will-reveal');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      try {
        el.classList.remove('fx-will-reveal');
        el.classList.remove('is-revealed');
        el.style.removeProperty('--fx-reveal-delay');
      } catch (e) { /* ignore */ }
    }
    state.countEls.forEach(function (node) {
      var info = state.countInfo.get(node);
      if (!info) return;
      if (info.raf) { caf(info.raf); info.raf = 0; }
      info.started = true;
      try { node.textContent = formatCount(info, info.target); } catch (e) { /* ignore */ }
    });
    state.countEls.clear();
  }

  /* 兜底巡检：正常情况下 IntersectionObserver 负责触发；
     若某个元素已处于视口却因时序/无头环境没收到回调，1.1s 后补触发一次。 */
  function revealInViewport() {
    var list = qsa('.fx-will-reveal');
    for (var i = 0; i < list.length; i++) {
      if (inViewport(list[i], 80)) revealEl(list[i]);
    }
    state.countEls.forEach(function (el) {
      var info = state.countInfo.get(el);
      if (info && !info.started && inViewport(el, 80)) startCount(el);
    });
  }

  function scheduleRevealSweep() {
    if (state.revealSweepTimer) return;
    state.revealSweepTimer = later(function () {
      state.revealSweepTimer = 0;
      try { revealInViewport(); } catch (e) { /* ignore */ }
    }, 1100);
  }

  /* ============================================================
   * 四、指针增强：data-tilt / data-magnetic
   * ============================================================ */
  function detachTilt() {
    var el = state.tiltEl;
    if (el) {
      try {
        if (el.classList) el.classList.remove('fx-tilt-active');
        if (el.style) {
          el.style.removeProperty('--fx-tilt-x');
          el.style.removeProperty('--fx-tilt-y');
        }
      } catch (e) { /* ignore */ }
    }
    state.tiltEl = null;
    state.tiltRect = null;
  }

  function detachMagnetic() {
    var el = state.magEl;
    if (el) {
      try {
        if (el.classList) el.classList.remove('fx-mag-active');
        if (el.style) el.style.removeProperty('translate');
      } catch (e) { /* ignore */ }
    }
    state.magEl = null;
    state.magRect = null;
  }

  function resetPointer() {
    if (state.pointerRaf) { caf(state.pointerRaf); state.pointerRaf = 0; }
    detachTilt();
    detachMagnetic();
  }

  function schedulePointerFrame() {
    if (state.pointerRaf) return;
    state.pointerRaf = raf(pointerFrame);
  }

  function pointerFrame() {
    state.pointerRaf = 0;
    var tilt = state.tiltEl;
    if (tilt) {
      if (!tilt.isConnected) {
        detachTilt();
      } else {
        var tr = state.tiltRect || rectOf(tilt);
        if (tr && tr.width > 0 && tr.height > 0) {
          var nx = clamp(((state.px - tr.left) / tr.width - 0.5) * 2, -1, 1);
          var ny = clamp(((state.py - tr.top) / tr.height - 0.5) * 2, -1, 1);
          var max = parseFloat(tilt.getAttribute('data-tilt'));
          if (!isFinite(max) || max <= 0) max = 7;
          max = clamp(max, 2, 14);
          try {
            tilt.style.setProperty('--fx-tilt-x', (-ny * max).toFixed(2) + 'deg');
            tilt.style.setProperty('--fx-tilt-y', (nx * max).toFixed(2) + 'deg');
          } catch (e) { /* ignore */ }
        }
      }
    }
    var mag = state.magEl;
    if (mag) {
      if (!mag.isConnected) {
        detachMagnetic();
      } else {
        var mr = state.magRect || rectOf(mag);
        if (mr && mr.width > 0 && mr.height > 0) {
          var strength = parseFloat(mag.getAttribute('data-magnetic'));
          if (!isFinite(strength) || strength <= 0) strength = 6;
          strength = clamp(strength, 0, 20);
          var dx = clamp((state.px - (mr.left + mr.width / 2)) * 0.18, -strength, strength);
          var dy = clamp((state.py - (mr.top + mr.height / 2)) * 0.18, -strength, strength);
          try { mag.style.translate = dx.toFixed(2) + 'px ' + dy.toFixed(2) + 'px'; } catch (e) { /* ignore */ }
        }
      }
    }
  }

  function onPointerMove(e) {
    if (!finePointer() || reduced()) {
      if (state.tiltEl || state.magEl) resetPointer();
      return;
    }
    var target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    var tiltEl = null;
    var magEl = null;
    try {
      tiltEl = target.closest('[data-tilt]');
      magEl = target.closest('[data-magnetic]');
    } catch (err) {
      return;
    }
    if (tiltEl !== state.tiltEl) {
      detachTilt();
      if (tiltEl) {
        var tr = rectOf(tiltEl);
        if (tr && tr.width > 0) {
          state.tiltEl = tiltEl;
          state.tiltRect = tr;
          try { tiltEl.classList.add('fx-tilt-active'); } catch (err2) { /* ignore */ }
        }
      }
    }
    if (magEl !== state.magEl) {
      detachMagnetic();
      if (magEl) {
        var mr = rectOf(magEl);
        if (mr && mr.width > 0) {
          state.magEl = magEl;
          state.magRect = mr;
          try { magEl.classList.add('fx-mag-active'); } catch (err3) { /* ignore */ }
        }
      }
    }
    state.px = e.clientX;
    state.py = e.clientY;
    if (state.tiltEl || state.magEl) schedulePointerFrame();
  }

  function onScroll() {
    if (state.scrollRaf) return;
    state.scrollRaf = raf(function () {
      state.scrollRaf = 0;
      if (state.tiltEl) state.tiltRect = rectOf(state.tiltEl);
      if (state.magEl) state.magRect = rectOf(state.magEl);
      if (state.tiltEl || state.magEl) schedulePointerFrame();
    });
  }

  /* ============================================================
   * 五、点击水波纹：data-ripple（显式）+ .btn（全站按钮，轻量）
   * ============================================================ */
  function onPointerDown(e) {
    if (reduced()) return;
    var target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    var el = null;
    var explicit = false;
    try { el = target.closest('[data-ripple]'); } catch (err) { return; }
    if (el) explicit = true;
    if (!el) {
      try { el = target.closest('.btn'); } catch (err2) { return; }
    }
    if (!el) return;
    try {
      if (el.disabled || (el.matches && el.matches(':disabled, [aria-disabled="true"]'))) return;
    } catch (err3) { /* ignore */ }
    var rect = rectOf(el);
    if (!rect || !rect.width || !rect.height) return;
    var size = Math.max(rect.width, rect.height) * (explicit ? 2.2 : 1.7);
    var span = doc.createElement('span');
    span.className = 'fx-ripple' + (explicit ? '' : ' is-soft');
    span.setAttribute('aria-hidden', 'true');
    span.style.width = size.toFixed(1) + 'px';
    span.style.height = size.toFixed(1) + 'px';
    span.style.left = (e.clientX - rect.left - size / 2).toFixed(1) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2).toFixed(1) + 'px';
    if (!explicit) {
      try { el.classList.add('fx-ripple-host'); } catch (err4) { /* ignore */ }
    }
    try { el.appendChild(span); } catch (err5) { return; }
    later(function () {
      try { if (span.parentNode) span.parentNode.removeChild(span); } catch (e2) { /* ignore */ }
    }, explicit ? 780 : 520);
  }

  /* ============================================================
   * 六、场景生命周期
   * ============================================================ */
  function resetScene() {
    if (state.io) {
      try { state.io.disconnect(); } catch (e) { /* ignore */ }
    }
    state.ioHandlers = new WeakMap();
    state.observed = new Set();
    state.countEls.forEach(function (el) {
      var info = state.countInfo.get(el);
      if (info && info.raf) { caf(info.raf); info.raf = 0; }
    });
    state.countEls.clear();
    resetPointer();
    clearTimers();
    state.revealSweepTimer = 0;
  }

  function scheduleEnhance() {
    if (state.enhanceRaf) return;
    state.enhanceRaf = raf(function () {
      state.enhanceRaf = 0;
      fx.enhance(doc);
    });
  }

  function onRendered() {
    try {
      resetPointer();
      fx.enhance(doc);
      fx.pageTransition(doc.getElementById('app'));
    } catch (e) { /* ignore */ }
  }

  function bindMutationFallback() {
    if (typeof win.MutationObserver !== 'function') return;
    var target = doc.body;
    if (!target) return;
    var mo = new win.MutationObserver(function (mutations) {
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'childList') continue;
        if (!m.addedNodes.length && !m.removedNodes.length) continue;
        var node = m.target;
        if (isEl(node) && typeof node.closest === 'function') {
          try {
            if (node.closest('[data-count], [data-ripple], #fx-layer, .fx-confetti-layer, .fx-ripple')) continue;
          } catch (e) { /* ignore */ }
        }
        relevant = true;
      }
      if (relevant) scheduleEnhance();
    });
    try { mo.observe(target, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }

  function bindResizeAndVisibility() {
    var onResize = debounce(function () {
      startBackground();
      if (!state.running) return;
      try { resizeCanvas(); seedParticles(); } catch (e) { /* ignore */ }
    }, 180);
    try {
      win.addEventListener('resize', onResize, { passive: true });
      win.addEventListener('orientationchange', onResize, { passive: true });
    } catch (e) { /* ignore */ }
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) stopBackground();
      else startBackground();
    });
    if (mqCardScene) {
      try {
        if (typeof mqCardScene.addEventListener === 'function') mqCardScene.addEventListener('change', startBackground);
        else if (typeof mqCardScene.addListener === 'function') mqCardScene.addListener(startBackground);
      } catch (e) { /* ignore */ }
    }
  }

  function bindReduceChange() {
    if (!mqReduce) return;
    var handler = function () {
      if (reduced()) {
        stopBackground();
        resetPointer();
        disarmAll(doc);
      } else {
        startBackground();
      }
    };
    try {
      if (typeof mqReduce.addEventListener === 'function') mqReduce.addEventListener('change', handler);
      else if (typeof mqReduce.addListener === 'function') mqReduce.addListener(handler);
    } catch (e) { /* ignore */ }
  }

  function debounce(fn, ms) {
    var timer = 0;
    return function () {
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(function () {
        timer = 0;
        try { fn(); } catch (e) { /* ignore */ }
      }, ms || 200);
    };
  }

  /* ============================================================
   * 七、公开 API
   * ============================================================ */

  /** app.js 启动后调用一次：挂载背景层、绑定路由与全局交互。 */
  fx.init = function () {
    try {
      if (state.inited) return;
      state.inited = true;
      if (!doc.body) {
        doc.addEventListener('DOMContentLoaded', function () {
          try { boot(); } catch (e) { /* ignore */ }
        });
        return;
      }
      boot();
    } catch (e) { /* 静默兜底 */ }
  };

  function boot() {
    if (state.booted) return;
    state.booted = true;
    ensureLayer();
    startBackground();
    bindResizeAndVisibility();
    bindReduceChange();
    bindMutationFallback();
    try {
      doc.addEventListener('pointermove', onPointerMove, { passive: true });
      doc.addEventListener('pointerdown', onPointerDown, { passive: true });
      win.addEventListener('blur', resetPointer);
      win.addEventListener('scroll', onScroll, { passive: true, capture: true });
      if (doc.documentElement) {
        doc.documentElement.addEventListener('pointerleave', resetPointer);
      }
    } catch (e) { /* ignore */ }
    onGlobal('route:before', function () { resetScene(); });
    onGlobal('route:rendered', onRendered);
    /* 首屏兜底：若 init 晚于 route:rendered，也能完成增强 */
    fx.enhance(doc);
  }

  /** 每次路由渲染后（或动态插入内容后）调用：初始化 data-* 动效。 */
  fx.enhance = function (scope) {
    try {
      if (!state.inited) {
        fx.init();
        return;
      }
      startBackground();
      pruneObserver();
      var root = scope && typeof scope.querySelectorAll === 'function' ? scope : doc;
      if (reduced()) {
        disarmAll(root);
        setupCount(root);
        resetPointer();
        return;
      }
      setupStagger(root);
      setupReveal(root);
      setupCount(root);
      scheduleRevealSweep();
    } catch (e) { /* 静默兜底 */ }
  };

  /** 小型彩纸庆祝：默认落在视口中上部。 */
  fx.confetti = function (x, y) {
    try {
      if (reduced() || !doc.body) return;
      var cx = typeof x === 'number' && isFinite(x) ? x : win.innerWidth / 2;
      var cy = typeof y === 'number' && isFinite(y) ? y : win.innerHeight * 0.42;
      var layer = doc.createElement('div');
      layer.className = 'fx-confetti-layer';
      layer.setAttribute('aria-hidden', 'true');
      var colors = ['#0eaf8f', '#38bdf8', '#fb7185', '#f59e0b', '#8b5cf6', '#34d399'];
      var total = 24;
      var frag = doc.createDocumentFragment();
      for (var i = 0; i < total; i++) {
        var p = doc.createElement('i');
        p.className = 'fx-confetti-piece' + (i % 3 === 0 ? ' is-round' : '') + (i % 4 === 1 ? ' is-thin' : '');
        var angle = (TAU * i) / total + (Math.random() - 0.5) * 0.6;
        var dist = 64 + Math.random() * 150;
        var dx = Math.cos(angle) * dist;
        var dy = Math.sin(angle) * dist - 56 - Math.random() * 48;
        p.style.left = cx.toFixed(1) + 'px';
        p.style.top = cy.toFixed(1) + 'px';
        p.style.setProperty('--fx-dx', dx.toFixed(1) + 'px');
        p.style.setProperty('--fx-dy', dy.toFixed(1) + 'px');
        p.style.setProperty('--fx-rot', (Math.random() * 680 - 340).toFixed(0) + 'deg');
        p.style.setProperty('--fx-fall', (36 + Math.random() * 90).toFixed(0) + 'px');
        p.style.setProperty('--fx-delay', (Math.random() * 90).toFixed(0) + 'ms');
        p.style.setProperty('--fx-dur', (0.85 + Math.random() * 0.3).toFixed(2) + 's');
        p.style.setProperty('--fx-color', colors[i % colors.length]);
        p.style.setProperty('--fx-w', (5 + Math.random() * 5).toFixed(1) + 'px');
        p.style.setProperty('--fx-h', (4 + Math.random() * 7).toFixed(1) + 'px');
        frag.appendChild(p);
      }
      layer.appendChild(frag);
      doc.body.appendChild(layer);
      later(function () {
        try { if (layer.parentNode) layer.parentNode.removeChild(layer); } catch (e) { /* ignore */ }
      }, 1500);
    } catch (e) { /* 静默兜底 */ }
  };

  /** 点赞脉冲。 */
  fx.heartbeat = function (el) {
    try {
      if (reduced()) return;
      if (!isEl(el) || !el.classList) return;
      var prev = state.heartTimers.get(el);
      if (prev) win.clearTimeout(prev);
      el.classList.remove('fx-heartbeat');
      /* 强制回流以重启动画 */
      void el.offsetWidth;
      el.classList.add('fx-heartbeat');
      var id = win.setTimeout(function () {
        try { el.classList.remove('fx-heartbeat'); } catch (e) { /* ignore */ }
        state.heartTimers.delete(el);
      }, 760);
      state.heartTimers.set(el, id);
    } catch (e) { /* 静默兜底 */ }
  };

  /** 页面进入过渡。 */
  fx.pageTransition = function (el) {
    try {
      if (reduced()) return;
      var target = isEl(el) ? el : doc.getElementById('app');
      if (!target || !target.classList) return;
      var prev = state.pageTimers.get(target);
      if (prev) win.clearTimeout(prev);
      target.classList.remove('fx-page-enter');
      void target.offsetWidth;
      target.classList.add('fx-page-enter');
      var id = win.setTimeout(function () {
        try { target.classList.remove('fx-page-enter'); } catch (e) { /* ignore */ }
        state.pageTimers.delete(target);
      }, 620);
      state.pageTimers.set(target, id);
    } catch (e) { /* 静默兜底 */ }
  };

  /* 若 QSL 尚未就绪，等待 DOM 后自动尝试启动（app.js 尚未调用 init 时的兜底） */
  try {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () {
        if (state.inited) return;
        /* 只有页面已明确引入 app.js 时才由 app.js 调用，此处不自动 init，
           避免与 Lead 的启动顺序冲突；仅当 DOM 出现 #fx-layer 且 1.2s 后
           仍无人调用 init 时兜底启动。 */
        win.setTimeout(function () {
          try {
            if (state.inited) return;
            var app = doc.getElementById('app');
            if (app && app.children.length) fx.init();
          } catch (e) { /* ignore */ }
        }, 1200);
      });
    }
  } catch (e) { /* ignore */ }

  /* 便于调试 / 页面按需读取（非契约必需，不影响契约方法） */
  fx.version = '1.0.0';
})();
