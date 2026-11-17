export function createEffects() {
const win=window,doc=document,TAU=Math.PI*2,fx={};
const state={heartTimers:new Map(),pageTimers:new Map()};
const timers=new Set(),layers=new Set();
const reduced=()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isEl=value=>value instanceof HTMLElement;
const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
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
        try { if (layer.parentNode) layer.parentNode.removeChild(layer); layers.delete(layer); } catch (e) { /* ignore */ }
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


fx.dispose=()=>{timers.forEach(clearTimeout);layers.forEach(layer=>layer.remove());state.heartTimers.forEach((id,el)=>{clearTimeout(id);el.classList.remove('fx-heartbeat');});state.pageTimers.forEach((id,el)=>{clearTimeout(id);el.classList.remove('fx-page-enter');});timers.clear();layers.clear();state.heartTimers.clear();state.pageTimers.clear();};
return fx;
}
