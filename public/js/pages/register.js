/* ============================================================
 * QSLink · 注册页（flows-ui）
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
    if (label) label.textContent = busy ? busyText || '请稍候…' : btn.dataset.label || '创建账号';
  }

  function setAlert(box, message) {
    if (!box) return;
    box.hidden = !message;
    box.innerHTML = message
      ? '<span class="f-alert-ico">' + ico('alert', 18) + '</span><span>' + esc(message) + '</span>'
      : '';
  }

  function paintEmailState(wrap, state, message) {
    const badge = wrap.querySelector('.f-reg-email-check');
    badge.classList.toggle('is-visible', !!state);
    badge.classList.toggle('is-error', state === 'error');
    badge.setAttribute('aria-hidden', state ? 'false' : 'true');
    badge.setAttribute('aria-label', message || '邮箱格式正确');
    badge.title = message || '邮箱格式正确';
    wrap.querySelector('.f-input-wrap').classList.toggle('is-valid', state === 'valid');
  }

  function setFieldError(wrap, message) {
    if (!wrap) return;
    const err = wrap.querySelector(':scope > .f-error, :scope > .f-reg-code-feedback .f-error');
    const errorTarget = wrap.dataset.field === 'email' ? wrap.querySelector('.f-input-wrap') : wrap;
    errorTarget.classList.toggle('has-error', !!message);
    const input = wrap.querySelector('input');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (wrap.dataset.field === 'email') paintEmailState(wrap, message ? 'error' : '', message);
    if (err) {
      err.textContent = message || '';
      err.hidden = !message;
    }
  }

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
    form.querySelectorAll('.f-field[data-field]').forEach((wrap) => setFieldError(wrap, ''));
  }

  /* ---------- 品牌视觉区 ---------- */
  function brandMark() {
    return (
      '<svg class="f-mark" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">' +
      '<defs><linearGradient id="fRegMarkGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0eaf8f"/><stop offset=".55" stop-color="#38bdf8"/><stop offset="1" stop-color="#8b5cf6"/>' +
      '</linearGradient></defs>' +
      '<rect x="5" y="8" width="26" height="19" rx="5" fill="url(#fRegMarkGrad)" opacity=".92"/>' +
      '<rect x="13" y="15" width="26" height="19" rx="5" fill="#ffffff" opacity=".88"/>' +
      '<rect x="13" y="15" width="26" height="19" rx="5" fill="none" stroke="url(#fRegMarkGrad)" stroke-width="1.6" opacity=".7"/>' +
      '<path d="M18 27.5c2.2-2.6 3.4-4 5.6-4s3.4 1.4 5.6 4" fill="none" stroke="#0eaf8f" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="23.6" cy="20.6" r="1.5" fill="#38bdf8"/>' +
      '</svg>'
    );
  }

  function wavesSvg() {
    return (
      '<svg class="f-waves" viewBox="0 0 560 560" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="fRegWaveGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0eaf8f" stop-opacity=".55"/>' +
      '<stop offset=".6" stop-color="#38bdf8" stop-opacity=".42"/>' +
      '<stop offset="1" stop-color="#8b5cf6" stop-opacity=".16"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<g fill="none" stroke="url(#fRegWaveGrad)" stroke-linecap="round">' +
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
      '<aside class="f-auth-visual f-auth-visual-reg">' +
      '<div class="f-auth-aurora" aria-hidden="true">' +
      '<span class="f-orb f-orb-1"></span><span class="f-orb f-orb-2"></span><span class="f-orb f-orb-3"></span>' +
      '<span class="f-dots"></span>' +
      '</div>' +
      wavesSvg() +
      '<div class="f-auth-visual-inner">' +
      '<a class="f-brand" href="/" aria-label="QSLink 首页">' +
      '<span class="f-brand-mark">' + brandMark() + '</span>' +
      '<span class="f-brand-name">QS<em>Link</em></span>' +
      '</a>' +
      '<span class="f-eyebrow f-eyebrow-light">' + ico('sparkles', 15) + ' JOIN THE AIRWAVES</span>' +
      '<h1 class="f-visual-title">把你收到的<br>每一份<span class="f-grad-text"> 73 </span>，<br>变成看得见的收藏。</h1>' +
      '<p class="f-visual-desc">创建一个账号只需要一分钟。上传双面 QSL 卡片、等待审核通过，就能在广场被同好发现，并开始交换实体卡片。</p>' +
      '<ol class="f-visual-steps">' +
      '<li><span class="f-step-num">01</span><span><b>创建账号</b><small>填写呼号，完善资料</small></span></li>' +
      '<li><span class="f-step-num">02</span><span><b>上传卡片</b><small>正面 · 背面，等待审核</small></span></li>' +
      '<li><span class="f-step-num">03</span><span><b>开始换卡</b><small>申请 · 同意 · 互寄</small></span></li>' +
      '</ol>' +
      '<div class="f-visual-card f-visual-card-sm" aria-hidden="true">' +
      '<div class="f-mini-card f-mini-front"><span class="f-mini-sign">QSL</span><span class="f-mini-call">BH4XYZ</span><span class="f-mini-line"></span></div>' +
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
      '<div class="f-field' + (o.half ? ' f-field-half' : '') + '" data-field="' + esc(o.name) + '">' +
      '<div class="f-field-row"><label class="label" for="' + esc(o.id) + '">' + esc(o.label) +
      (o.optional ? '<span class="f-optional">选填</span>' : '') + '</label>' +
      (o.hint ? '<span class="f-label-hint">' + esc(o.hint) + '</span>' : '') + '</div>' +
      '<div class="f-input-wrap">' +
      '<span class="f-input-ico">' + ico(o.icon || 'user', 18) + '</span>' +
      '<input id="' + esc(o.id) + '" class="input f-input f-input-has-ico' + (o.eye ? ' f-input-has-eye' : '') + '"' +
      ' name="' + esc(o.name) + '" type="' + esc(o.type || 'text') + '"' +
      ' placeholder="' + esc(o.placeholder || '') + '"' +
      ' autocomplete="' + esc(o.autocomplete || 'off') + '"' +
      (o.name === 'email' ? ' aria-describedby="fRegEmailError"' : '') +
      (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') +
      (o.maxlength ? ' maxlength="' + esc(o.maxlength) + '"' : '') +
      (o.required ? ' required' : '') + '>' +
      (o.eye
        ? '<button type="button" class="f-eye" aria-label="显示密码" aria-pressed="false" data-eye>' + ico('eye', 18) + '</button>'
        : '') +
      (o.name === 'email' ? '<span class="f-reg-email-check" role="img" aria-label="邮箱格式正确" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="f-reg-email-tick" d="m6 10 2.5 2.5 5-5"/><path class="f-reg-email-cross" d="m7 7 6 6m0-6-6 6"/></g></svg></span>' : '') +
      '</div>' +
      '<p class="f-error"' + (o.name === 'email' ? ' id="fRegEmailError"' : '') + ' data-error="' + esc(o.name) + '" role="alert" hidden></p>' +
      (o.name === 'email' ? '<div class="f-reg-code-reveal" aria-hidden="true" inert><div class="f-reg-code-inner"><div class="f-field" data-field="emailCode">' +
        '<label class="label" for="fRegEmailCode">邮箱验证码</label><div class="f-reg-code-row">' +
        '<input id="fRegEmailCode" class="input f-input" name="emailCode" type="text" placeholder="6 位数字" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required aria-describedby="fRegCodeStatus">' +
        '<button type="button" class="btn f-reg-code-send" disabled>发送验证码</button></div>' +
        '<div class="f-reg-code-feedback"><div class="f-reg-code-feedback-inner"><p class="f-error" data-error="emailCode" role="alert" hidden></p>' +
        '<p class="f-reg-code-status" id="fRegCodeStatus" role="status" aria-live="polite"></p>' +
        '</div></div></div></div></div>' : '') +
      '</div>'
    );
  }

  function render(container, ctx) {
    const rawNext = ctx && ctx.query ? ctx.query.get('next') : null;
    const next = QSL.safeNext(rawNext) || '';
    const safeNext = next && next.startsWith('/') ? next : '';
    const loginHref = '/login' + (safeNext ? '?next=' + encodeURIComponent(safeNext) : '');

    container.innerHTML =
      '<section class="f-auth-page f-auth-page-reg" aria-labelledby="fRegTitle">' +
      '<div class="container f-auth f-auth-wide">' +
      brandVisual() +
      '<div class="f-auth-panel">' +
      '<form class="f-auth-card glass f-auth-card-reg" id="fRegisterForm" novalidate>' +
      '<div class="f-auth-card-head">' +
      '<span class="f-auth-chip">' + ico('sparkles', 15) + ' CREATE ACCOUNT</span>' +
      '<h2 id="fRegTitle">加入 QSLink</h2>' +
      '<p>创建你的账号，开始收集与交换 QSL 卡片。</p>' +
      '</div>' +
      '<div class="f-form-alert" role="alert" hidden></div>' +
      '<div class="f-form-grid f-form-grid-2">' +
      textField({ id: 'fRegUsername', name: 'username', label: '用户名', icon: 'user', placeholder: '3-20 位字母/数字/下划线', autocomplete: 'username', required: true, maxlength: 20 }) +
      textField({ id: 'fRegEmail', name: 'email', label: '邮箱', icon: 'mail', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', required: true, maxlength: 120, inputmode: 'email' }) +
      textField({ id: 'fRegDisplayName', name: 'displayName', label: '昵称', icon: 'sparkles', placeholder: '展示给其他火腿的名字', autocomplete: 'nickname', maxlength: 40, optional: true }) +
      textField({ id: 'fRegCallSign', name: 'callSign', label: '呼号', icon: 'radio', placeholder: '如 BG7MOM', autocomplete: 'off', maxlength: 20, optional: true, hint: '大写字母+数字' }) +
      '</div>' +
      '<div class="f-form-grid f-form-grid-2">' +
      textField({ id: 'fRegPassword', name: 'password', label: '密码', icon: 'lock', type: 'password', placeholder: '至少 8 位，含字母与数字', autocomplete: 'new-password', required: true, maxlength: 128, eye: true }) +
      textField({ id: 'fRegConfirm', name: 'confirmPassword', label: '确认密码', icon: 'lock', type: 'password', placeholder: '再次输入密码', autocomplete: 'new-password', required: true, maxlength: 128, eye: true }) +
      '</div>' +
      '<div class="f-strength" data-strength hidden aria-hidden="true">' +
      '<span class="f-strength-bar"><i></i></span><span class="f-strength-bar"><i></i></span><span class="f-strength-bar"><i></i></span>' +
      '<span class="f-strength-text">密码强度</span>' +
      '</div>' +
      '<div class="f-field" data-field="legalConsent"><label class="f-consent"><input type="checkbox" name="legalConsent" required><span>我已阅读并同意<a href="/legal/terms.html" target="_blank" rel="noopener">用户条款</a>，并已阅读<a href="/legal/privacy.html" target="_blank" rel="noopener">隐私说明</a>。</span></label><p class="f-error" role="alert" hidden></p></div>' +
      '<button class="btn btn-primary btn-lg f-submit" type="submit" data-label="创建账号">' +
      '<span class="f-btn-label">创建账号</span>' + ico('arrow-right', 18) +
      '</button>' +
      '<p class="f-auth-alt">已经有账号了？<a class="f-link" href="' + esc(loginHref) + '">直接登录</a></p>' +
      '</form>' +
      '<p class="f-auth-legal">' + ico('shield', 14) + ' 请保护收件信息，上传卡片时需另行确认内容授权。</p>' +
      '</div>' +
      '</div>' +
      '</section>';

    const form = container.querySelector('#fRegisterForm');
    const alertBox = form.querySelector('.f-form-alert');
    const submitBtn = form.querySelector('.f-submit');
    const strengthEl = form.querySelector('[data-strength]');
    const strengthBars = strengthEl ? strengthEl.querySelectorAll('.f-strength-bar i') : [];
    const strengthText = strengthEl ? strengthEl.querySelector('.f-strength-text') : null;
    const passwordInput = form.querySelector('[name="password"]');
    let busy = false;
    let disposed = false;
    let emailTimer = null;
    let cooldownTimer = null;
    let focusTimer = null;
    let sending = false;
    let emailValid = false;
    let emailRevision = 0;
    let retryAt = 0;
    const emailInput = form.querySelector('[name="email"]');
    const emailField = emailInput.closest('[data-field]');
    const codeReveal = form.querySelector('.f-reg-code-reveal');
    const codeInput = form.querySelector('[name="emailCode"]');
    const codeField = codeInput.closest('[data-field]');
    const sendBtn = form.querySelector('.f-reg-code-send');
    const codeStatus = form.querySelector('.f-reg-code-status');
    const codeFeedback = form.querySelector('.f-reg-code-feedback');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let feedbackAnimation = null;

    function showCodeFeedback(message, error) {
      const previousHeight = codeFeedback.getBoundingClientRect().height;
      if (feedbackAnimation) feedbackAnimation.cancel();
      setFieldError(codeField, error ? message : '');
      codeStatus.textContent = error ? '' : message;
      const nextHeight = message ? codeFeedback.firstElementChild.scrollHeight : 0;
      if (!reducedMotion.matches && typeof codeFeedback.animate === 'function') {
        feedbackAnimation = codeFeedback.animate([
          { height: previousHeight + 'px' },
          { height: nextHeight + 'px' }
        ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    }

    function emailError(value) {
      if (!value) return '请填写邮箱';
      if (value.length > 120) return '邮箱不能超过 120 个字符';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : '邮箱格式不正确';
    }

    function revealCode() {
      codeReveal.classList.add('is-open');
      codeReveal.setAttribute('aria-hidden', 'false');
      codeReveal.removeAttribute('inert');
    }

    function paintSendButton() {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      sendBtn.disabled = !emailValid || sending || remaining > 0;
      sendBtn.setAttribute('aria-busy', sending ? 'true' : 'false');
      sendBtn.textContent = sending ? '发送中…' : remaining ? remaining + ' 秒后重发' : '发送验证码';
      if (!remaining && cooldownTimer !== null) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }

    function startCooldown(seconds) {
      retryAt = Date.now() + seconds * 1000;
      if (cooldownTimer !== null) clearInterval(cooldownTimer);
      cooldownTimer = setInterval(() => {
        if (!disposed) paintSendButton();
      }, 1000);
      paintSendButton();
    }

    function validateEmail(showEmpty) {
      clearTimeout(emailTimer);
      emailTimer = null;
      const value = emailInput.value.trim();
      const message = emailError(value);
      emailValid = !message;
      setFieldError(emailField, value || showEmpty ? message : '');
      if (emailValid) paintEmailState(emailField, 'valid');
      if (emailValid) revealCode();
      paintSendButton();
      return emailValid;
    }

    emailInput.addEventListener('input', () => {
      emailRevision++;
      emailValid = false;
      setFieldError(emailField, '');
      codeInput.value = '';
      showCodeFeedback('', false);
      paintSendButton();
      clearTimeout(emailTimer);
      emailTimer = setTimeout(() => {
        if (!disposed) validateEmail(false);
      }, 100);
    });

    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      showCodeFeedback(codeStatus.textContent, false);
    });

    sendBtn.addEventListener('click', async () => {
      if (disposed || sending) return;
      if (!validateEmail(true) || Date.now() < retryAt) return;
      const email = emailInput.value.trim();
      const revision = emailRevision;
      sending = true;
      showCodeFeedback('', false);
      paintSendButton();
      try {
        await QSL.api.auth.sendEmailCode(email);
        if (disposed) return;
        startCooldown(60);
        if (emailRevision === revision && emailInput.value.trim() === email) {
          showCodeFeedback('验证码已发送，请查收邮件（30 分钟内有效）。', false);
        }
      } catch (err) {
        if (disposed) return;
        if (err && err.status === 429) startCooldown(60);
        if (emailRevision === revision && emailInput.value.trim() === email) {
          showCodeFeedback((err && err.message) || '验证码发送失败，请稍后重试', true);
        }
      } finally {
        if (!disposed) {
          sending = false;
          paintSendButton();
        }
      }
    });

    /* 密码可见切换 */
    form.querySelectorAll('[data-eye]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const input = this.parentElement.querySelector('input');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        this.classList.toggle('is-on', !showing);
        this.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
        this.setAttribute('aria-pressed', showing ? 'false' : 'true');
        input.focus({ preventScroll: true });
      });
    });

    /* 呼号自动大写 */
    const callSignInput = form.querySelector('[name="callSign"]');
    callSignInput.addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      try { this.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    });

    /* 密码强度提示 */
    function scorePassword(value) {
      if (!value) return 0;
      let score = 0;
      if (value.length >= 8) score++;
      if (value.length >= 12) score++;
      if (/[A-Za-z]/.test(value) && /[0-9]/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      return Math.min(3, score);
    }
    function paintStrength(value) {
      if (!strengthEl) return;
      const score = scorePassword(value);
      strengthEl.hidden = !value;
      const labels = ['太短', '较弱', '不错', '很强'];
      strengthEl.dataset.level = String(score);
      strengthBars.forEach((bar, index) => bar.classList.toggle('is-on', index < Math.max(1, score)));
      if (strengthText) strengthText.textContent = value ? '密码强度：' + labels[score] : '密码强度';
    }
    passwordInput.addEventListener('input', () => paintStrength(passwordInput.value));

    function collect() {
      const get = (name) => {
        const el = form.querySelector('[name="' + name + '"]');
        return el ? el.value : '';
      };
      return {
        username: get('username').trim(),
        email: get('email').trim(),
        emailCode: get('emailCode').trim(),
        password: get('password'),
        confirmPassword: get('confirmPassword'),
        displayName: get('displayName').trim(),
        callSign: get('callSign').trim().toUpperCase()
      };
    }

    function validate(values) {
      const errors = {};
      if (!form.querySelector('[name="legalConsent"]').checked) errors.legalConsent = '请阅读并同意用户条款，确认已阅读隐私说明';
      if (!values.username) errors.username = '请填写用户名';
      else if (!/^[A-Za-z0-9_]{3,20}$/.test(values.username)) errors.username = '用户名需为 3-20 位字母、数字或下划线';
      const message = emailError(values.email);
      if (message) errors.email = message;
      if (!values.emailCode) errors.emailCode = '请填写邮箱验证码';
      else if (!/^\d{6}$/.test(values.emailCode)) errors.emailCode = '验证码需为 6 位数字';
      if (values.displayName && values.displayName.length > 40) errors.displayName = '昵称不能超过 40 个字符';
      if (values.callSign && values.callSign.length > 20) errors.callSign = '呼号不能超过 20 个字符';
      if (!values.password) errors.password = '请设置密码';
      else if (values.password.length < 8) errors.password = '密码至少 8 位';
      else if (!/[A-Za-z]/.test(values.password) || !/[0-9]/.test(values.password)) errors.password = '密码需同时包含字母与数字';
      if (!values.confirmPassword) errors.confirmPassword = '请再次输入密码';
      else if (values.confirmPassword !== values.password) errors.confirmPassword = '两次输入的密码不一致';
      return errors;
    }

    function focusField(key) {
      const wrap = form.querySelector('.f-field[data-field="' + key + '"]');
      if (!wrap) return;
      const input = wrap.querySelector('input');
      if (input) {
        try { input.focus(); } catch (e) { /* ignore */ }
      }
      const rect = wrap.getBoundingClientRect();
      if (rect.top < 90 || rect.bottom > window.innerHeight - 40) {
        wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    async function onSubmit(event) {
      event.preventDefault();
      if (disposed || busy) return;
      setAlert(alertBox, '');
      clearFieldErrors(form);
      validateEmail(true);
      const values = collect();
      const errors = validate(values);
      if (Object.keys(errors).length) {
        Object.keys(errors).forEach((key) => setFieldError(form.querySelector('.f-field[data-field="' + key + '"]'), errors[key]));
        focusField(Object.keys(errors)[0]);
        return;
      }
      busy = true;
      setBusy(submitBtn, true, '创建中…');
      try {
        const payload = {
          acceptTerms: true,
          termsVersion: '2026-10-25',
          username: values.username,
          email: values.email,
          emailCode: values.emailCode,
          password: values.password
        };
        if (values.displayName) payload.displayName = values.displayName;
        if (values.callSign) payload.callSign = values.callSign;
        const res = await QSL.api.auth.register(payload);
        if (disposed) return;
        if (res && res.token) QSL.api.setToken(res.token);
        if (res && res.user) QSL.setUser(res.user);
        else await QSL.refreshUser();
        if (disposed) return;
        if (QSL.toast) QSL.toast('注册成功，欢迎加入 QSLink！', 'success');
        QSL.navigate(safeNext || '/dashboard');
      } catch (err) {
        if (disposed) return;
        busy = false;
        setBusy(submitBtn, false);
        if (err && err.fields) applyFieldErrors(form, err.fields);
        let message = '';
        if (err && err.code === 'USERNAME_TAKEN') message = '该用户名已被占用，换一个试试';
        else if (err && err.code === 'EMAIL_TAKEN') message = '该邮箱已被注册，可直接登录';
        else if (err && err.isNetwork) message = '无法连接服务器，请确认服务已启动后重试';
        else if (!err || !err.fields || !Object.keys(err.fields).length) message = (err && err.message) || '注册失败，请稍后重试';
        setAlert(alertBox, message);
        if (err && err.status !== 400) console.error('[register]', err);
      }
    }

    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', (event) => {
      if (event.target === emailInput || event.target === codeInput) return;
      setFieldError(event.target.closest('.f-field[data-field]'), '');
    });

    if (window.innerWidth >= 860) {
      focusTimer = setTimeout(() => {
        const input = form.querySelector('[name="username"]');
        if (input && document.body.contains(input)) input.focus({ preventScroll: true });
      }, 60);
    }

    return function cleanup() {
      disposed = true;
      clearTimeout(emailTimer);
      clearTimeout(focusTimer);
      clearInterval(cooldownTimer);
      if (feedbackAnimation) feedbackAnimation.cancel();
    };
  }

  QSL.registerPage('register', { title: '注册', render: render });
})();
