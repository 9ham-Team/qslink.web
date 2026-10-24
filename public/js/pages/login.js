/* ============================================================
 * QSLink · 登录页（flows-ui）
 * 依赖：core.js / api.js / ui.js。契约：docs/CONTRACT.md §3/§4。
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;

  /* ---------- 小工具 ---------- */
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle('f-loading', !!busy);
    const label = btn.querySelector('.f-btn-label');
    if (label) label.textContent = busy ? busyText || '请稍候…' : btn.dataset.label || '登录';
  }

  function setAlert(box, message, tone) {
    if (!box) return;
    box.hidden = !message;
    box.classList.toggle('is-error', tone !== 'info');
    box.innerHTML = message
      ? '<span class="f-alert-ico">' + ico('alert', 18) + '</span><span>' + esc(message) + '</span>'
      : '';
  }

  function setFieldError(wrap, message) {
    if (!wrap) return;
    const err = wrap.querySelector('.f-error');
    wrap.classList.toggle('has-error', !!message);
    if (err) {
      err.textContent = message || '';
      err.hidden = !message;
    }
  }

  /* 服务端 fields 可能是 "address.name" / "identifier" 等，取末段匹配页面字段 */
  function applyFieldErrors(form, fields) {
    if (!form || !fields) return;
    const normalized = {};
    Object.keys(fields).forEach((key) => {
      const short = String(key).split('.').pop();
      if (!(short in normalized)) normalized[short] = fields[key];
    });
    let first = null;
    form.querySelectorAll('.f-field[data-field]').forEach((wrap) => {
      const msg = normalized[wrap.dataset.field];
      setFieldError(wrap, msg);
      if (msg && !first) first = wrap;
    });
    if (first) {
      const input = first.querySelector('input, textarea, select');
      if (input) {
        try { input.focus(); } catch (e) { /* ignore */ }
        const rect = first.getBoundingClientRect();
        if (rect.top < 90 || rect.bottom > window.innerHeight - 40) {
          first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  }

  function clearFieldErrors(form) {
    if (!form) return;
    form.querySelectorAll('.f-field[data-field]').forEach((wrap) => setFieldError(wrap, ''));
  }

  /* ---------- 品牌视觉区 ---------- */
  function brandMark() {
    return (
      '<svg class="f-mark" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">' +
      '<defs><linearGradient id="fLoginMarkGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0eaf8f"/><stop offset=".55" stop-color="#38bdf8"/><stop offset="1" stop-color="#8b5cf6"/>' +
      '</linearGradient></defs>' +
      '<rect x="5" y="8" width="26" height="19" rx="5" fill="url(#fLoginMarkGrad)" opacity=".92"/>' +
      '<rect x="13" y="15" width="26" height="19" rx="5" fill="#ffffff" opacity=".88"/>' +
      '<rect x="13" y="15" width="26" height="19" rx="5" fill="none" stroke="url(#fLoginMarkGrad)" stroke-width="1.6" opacity=".7"/>' +
      '<path d="M18 27.5c2.2-2.6 3.4-4 5.6-4s3.4 1.4 5.6 4" fill="none" stroke="#0eaf8f" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="23.6" cy="20.6" r="1.5" fill="#38bdf8"/>' +
      '</svg>'
    );
  }

  function wavesSvg(idSuffix) {
    return (
      '<svg class="f-waves" viewBox="0 0 560 560" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="fLoginWave' + idSuffix + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0eaf8f" stop-opacity=".55"/>' +
      '<stop offset=".6" stop-color="#38bdf8" stop-opacity=".42"/>' +
      '<stop offset="1" stop-color="#8b5cf6" stop-opacity=".16"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<g fill="none" stroke="url(#fLoginWave' + idSuffix + ')" stroke-linecap="round">' +
      '<circle class="f-wave-ring f-wave-1" cx="128" cy="132" r="58" stroke-width="1.6"/>' +
      '<circle class="f-wave-ring f-wave-2" cx="128" cy="132" r="104" stroke-width="1.4" stroke-dasharray="2 9"/>' +
      '<circle class="f-wave-ring f-wave-3" cx="128" cy="132" r="154" stroke-width="1.2" stroke-dasharray="3 12"/>' +
      '<circle class="f-wave-ring f-wave-4" cx="128" cy="132" r="208" stroke-width="1" stroke-dasharray="2 16"/>' +
      '<path d="M128 132 L128 74" stroke-width="1.6"/>' +
      '<path class="f-wave-ping" d="M128 132 L128 74" stroke-width="2.6"/>' +
      '<circle cx="128" cy="132" r="4.5" fill="#0eaf8f" stroke="none"/>' +
      '<path class="f-wave-line" d="M18 470 Q 128 404 240 470 T 462 470" stroke-width="1.6"/>' +
      '<path class="f-wave-line f-wave-line-2" d="M18 502 Q 128 436 240 502 T 462 502" stroke-width="1.2"/>' +
      '</g></svg>'
    );
  }

  function brandVisual() {
    return (
      '<aside class="f-auth-visual">' +
      '<div class="f-auth-aurora" aria-hidden="true">' +
      '<span class="f-orb f-orb-1"></span><span class="f-orb f-orb-2"></span><span class="f-orb f-orb-3"></span>' +
      '<span class="f-dots"></span>' +
      '</div>' +
      wavesSvg('Login') +
      '<div class="f-auth-visual-inner">' +
      '<a class="f-brand" href="/" aria-label="QSLink 首页">' +
      '<span class="f-brand-mark">' + brandMark() + '</span>' +
      '<span class="f-brand-name">QS<em>Link</em></span>' +
      '</a>' +
      '<span class="f-eyebrow f-eyebrow-light">' + ico('radio', 15) + ' QSL CARD EXCHANGE</span>' +
      '<h1 class="f-visual-title">让每一次通联，<br>都留下<span class="f-grad-text">可触摸</span>的回响。</h1>' +
      '<p class="f-visual-desc">上传你的双面 QSL 卡片，以 3D 视角欣赏它；与全球火腿申请换卡，把电波里的相遇寄到彼此手中。</p>' +
      '<ul class="f-visual-points">' +
      '<li>' + ico('cards', 18) + '<span><b>双面卡片</b> · 正面背面，3D 立体展示</span></li>' +
      '<li>' + ico('globe', 18) + '<span><b>真实交换</b> · 地址仅对达成交换的双方可见</span></li>' +
      '<li>' + ico('shield', 18) + '<span><b>人工审核</b> · 让每一张卡片都值得收藏</span></li>' +
      '</ul>' +
      '<div class="f-visual-card" aria-hidden="true">' +
      '<div class="f-mini-card f-mini-front"><span class="f-mini-sign">QSL</span><span class="f-mini-call">BG7MOM</span><span class="f-mini-line"></span></div>' +
      '<div class="f-mini-card f-mini-back"><span class="f-mini-back-line"></span><span class="f-mini-back-line short"></span><span class="f-mini-stamp">QSL</span></div>' +
      '</div>' +
      '<p class="f-visual-foot">' + ico('antenna', 15) + ' 73 · 电波永不消逝，卡片永远抵达。</p>' +
      '</div>' +
      '</aside>'
    );
  }

  /* ---------- 表单字段 ---------- */
  function textField(opts) {
    const o = opts || {};
    return (
      '<div class="f-field" data-field="' + esc(o.name) + '">' +
      '<div class="f-field-row"><label class="label" for="' + esc(o.id) + '">' + esc(o.label) + '</label>' +
      (o.hint ? '<span class="f-label-hint">' + esc(o.hint) + '</span>' : '') + '</div>' +
      '<div class="f-input-wrap">' +
      '<span class="f-input-ico">' + ico(o.icon || 'user', 18) + '</span>' +
      '<input id="' + esc(o.id) + '" class="input f-input f-input-has-ico' + (o.eye ? ' f-input-has-eye' : '') + '"' +
      ' name="' + esc(o.name) + '" type="' + esc(o.type || 'text') + '"' +
      ' value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || '') + '"' +
      ' autocomplete="' + esc(o.autocomplete || 'off') + '"' +
      (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') +
      (o.maxlength ? ' maxlength="' + esc(o.maxlength) + '"' : '') +
      (o.required ? ' required' : '') + '>' +
      (o.eye
        ? '<button type="button" class="f-eye" aria-label="显示密码" aria-pressed="false" data-eye>' + ico('eye', 18) + '</button>'
        : '') +
      '</div>' +
      '<p class="f-error" data-error="' + esc(o.name) + '" role="alert" hidden></p>' +
      '</div>'
    );
  }

  /* ---------- 演示账号 ---------- */
  function demoBlock() {
    const config = QSL.state.config || {};
    if (!config.demo) return '';
    const items = (config.demoAccounts || []).map((acc) => {
      return (
        '<button type="button" class="f-demo-item" data-demo-user="' + esc(acc.id) + '" data-demo-pass="' + esc(acc.pass) + '">' +
        '<span class="f-demo-ava" style="--f-ava:#0eaf8f">' + esc(acc.callSign.slice(0, 2)) + '</span>' +
        '<span class="f-demo-info"><b>' + esc(acc.id) + '</b><span>' + esc(acc.name) + ' · ' + esc(acc.role) + '</span></span>' +
        '<span class="f-demo-fill">填入' + ico('arrow-right', 14) + '</span>' +
        '</button>'
      );
    }).join('');
    return (
      '<div class="f-demo">' +
      '<div class="f-demo-head"><span class="f-demo-tag">演示账号</span><span class="f-demo-tip">点击一键填入，无需注册</span></div>' +
      '<div class="f-demo-list">' + items + '</div>' +
      '</div>'
    );
  }

  /* ---------- 页面渲染 ---------- */
  function render(container, ctx) {
    const rawNext = ctx && ctx.query ? ctx.query.get('next') : null;
    const next = QSL.safeNext(rawNext) || '';
    const safeNext = next && next.startsWith('/') ? next : '';
    const registerHref = '/register' + (safeNext ? '?next=' + encodeURIComponent(safeNext) : '');

    container.innerHTML =
      '<section class="f-auth-page" aria-labelledby="fLoginTitle">' +
      '<div class="container f-auth">' +
      brandVisual() +
      '<div class="f-auth-panel">' +
      '<form class="f-auth-card glass" id="fLoginForm" novalidate>' +
      '<div class="f-auth-card-head">' +
      '<span class="f-auth-chip">' + ico('radio', 15) + ' MEMBER LOGIN</span>' +
      '<h2 id="fLoginTitle">欢迎回来</h2>' +
      '<p>登录后即可管理卡片、处理换卡申请。</p>' +
      '</div>' +
      '<div class="f-form-alert" role="alert" hidden></div>' +
      textField({ id: 'fLoginIdentifier', name: 'identifier', label: '用户名或邮箱', icon: 'user', placeholder: '用户名或 you@example.com', autocomplete: 'username', required: true, maxlength: 120 }) +
      textField({ id: 'fLoginPassword', name: 'password', label: '密码', icon: 'lock', type: 'password', placeholder: '输入登录密码', autocomplete: 'current-password', required: true, eye: true, hint: '区分大小写' }) +
      '<button class="btn btn-primary btn-lg f-submit" type="submit" data-label="登录">' +
      '<span class="f-btn-label">登录</span>' + ico('arrow-right', 18) +
      '</button>' +
      demoBlock() +
      '<p class="f-auth-alt">还没有账号？<a class="f-link" href="' + esc(registerHref) + '">立即注册</a></p>' +
      '</form>' +
      '<p class="f-auth-legal">' + ico('shield', 14) + ' 登录即代表你同意以真实身份参与卡片交换</p>' +
      '</div>' +
      '</div>' +
      '</section>';

    const form = container.querySelector('#fLoginForm');
    const alertBox = form.querySelector('.f-form-alert');
    const submitBtn = form.querySelector('.f-submit');
    const identifierInput = form.querySelector('[name="identifier"]');
    const passwordInput = form.querySelector('[name="password"]');
    let busy = false;

    /* 密码可见 */
    form.querySelector('[data-eye]').addEventListener('click', function () {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      this.classList.toggle('is-on', !showing);
      this.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      this.setAttribute('aria-pressed', showing ? 'false' : 'true');
      passwordInput.focus({ preventScroll: true });
    });

    /* 演示账号一键填入 */
    form.querySelectorAll('[data-demo-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        identifierInput.value = btn.dataset.demoUser;
        passwordInput.value = btn.dataset.demoPass;
        clearFieldErrors(form);
        setAlert(alertBox, '');
        form.querySelectorAll('.f-demo-item').forEach((el) => el.classList.remove('is-active'));
        btn.classList.add('is-active');
        identifierInput.classList.add('f-pulse-once');
        setTimeout(() => identifierInput.classList.remove('f-pulse-once'), 700);
        submitBtn.focus({ preventScroll: true });
        if (QSL.toast) QSL.toast('已填入演示账号「' + btn.dataset.demoUser + '」，点击登录即可', 'info');
      });
    });

    function collect() {
      return {
        identifier: identifierInput.value.trim(),
        password: passwordInput.value
      };
    }

    function validate(values) {
      const errors = {};
      if (!values.identifier) errors.identifier = '请输入用户名或邮箱';
      else if (values.identifier.length > 120) errors.identifier = '用户名或邮箱过长';
      if (!values.password) errors.password = '请输入密码';
      else if (values.password.length > 128) errors.password = '密码过长';
      return errors;
    }

    function showFieldErrors(errors) {
      let first = null;
      Object.keys(errors || {}).forEach((key) => {
        const wrap = form.querySelector('.f-field[data-field="' + key + '"]');
        setFieldError(wrap, errors[key]);
        if (!first) first = wrap;
      });
      if (first) {
        const input = first.querySelector('input');
        if (input) {
          try { input.focus(); } catch (e) { /* ignore */ }
        }
      }
    }

    async function onSubmit(event) {
      event.preventDefault();
      if (busy) return;
      setAlert(alertBox, '');
      clearFieldErrors(form);
      const values = collect();
      const errors = validate(values);
      if (Object.keys(errors).length) {
        showFieldErrors(errors);
        return;
      }
      busy = true;
      setBusy(submitBtn, true, '登录中…');
      try {
        const res = await QSL.api.auth.login({ identifier: values.identifier, password: values.password });
        if (res && res.token) QSL.api.setToken(res.token);
        if (res && res.user) QSL.setUser(res.user);
        else await QSL.refreshUser();
        const user = res && res.user;
        const name = user ? (user.displayName || user.username) : values.identifier;
        if (QSL.toast) QSL.toast('欢迎回来，' + name + '！', 'success');
        QSL.navigate(safeNext || '/');
      } catch (err) {
        busy = false;
        setBusy(submitBtn, false);
        if (err && err.fields) applyFieldErrors(form, err.fields);
        let message = '';
        if (err && err.code === 'INVALID_CREDENTIALS') message = '用户名/邮箱或密码不正确，请检查后重试';
        else if (err && err.code === 'BANNED') message = '该账号已被禁用，请联系站点管理员';
        else if (err && err.isNetwork) message = '无法连接服务器，请确认服务已启动后重试';
        else if (!err || !err.fields || !Object.keys(err.fields).length) message = (err && err.message) || '登录失败，请稍后重试';
        setAlert(alertBox, message, 'error');
        if (err && err.status !== 401) console.error('[login]', err);
      }
    }

    form.addEventListener('submit', onSubmit);

    if (window.innerWidth >= 860) {
      setTimeout(() => {
        if (document.body.contains(identifierInput)) identifierInput.focus({ preventScroll: true });
      }, 60);
    }

    return function cleanup() { /* 无全局监听，无需清理 */ };
  }

  QSL.registerPage('login', { title: '登录', render: render });
})();
