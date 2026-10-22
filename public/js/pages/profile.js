/* ============================================================
 * QSLink · 个人资料 Profile（flows-ui）
 * 路由：/dashboard/profile
 * 依赖：core.js / api.js / ui.js
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');
  const AVATAR_COLORS = QSL.AVATAR_COLORS || ['#0eaf8f', '#38bdf8', '#8b5cf6', '#fb7185', '#f59e0b'];

  function fieldHtml(opts) {
    const o = opts || {};
    return (
      '<div class="f-field' + (o.span ? ' f-span-2' : '') + '" data-field="' + esc(o.name) + '">' +
      '<div class="f-field-row"><label class="label" for="' + esc(o.id) + '">' + esc(o.label) +
      (o.required ? '<i class="req">*</i>' : '') + (o.optional ? '<span class="f-optional">选填</span>' : '') + '</label>' +
      (o.counter ? '<span class="f-label-hint" data-counter="' + esc(o.name) + '">0 / ' + o.counter + '</span>' : '') +
      '</div>' +
      (o.multiline
        ? '<textarea id="' + esc(o.id) + '" class="textarea" name="' + esc(o.name) + '" rows="' + (o.rows || 4) + '" maxlength="' + (o.maxlength || 500) + '" placeholder="' + esc(o.placeholder || '') + '"></textarea>'
        : '<input id="' + esc(o.id) + '" class="input" name="' + esc(o.name) + '" type="' + esc(o.type || 'text') + '"' +
          (o.autocomplete ? ' autocomplete="' + esc(o.autocomplete) + '"' : ' autocomplete="off"') +
          ' maxlength="' + (o.maxlength || 100) + '" placeholder="' + esc(o.placeholder || '') + '"' +
          (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') + '>') +
      (o.eye && !o.multiline
        ? '<button type="button" class="f-eye" aria-label="显示密码" aria-pressed="false" data-eye>' + ico('eye', 18) + '</button>'
        : '') +
      '<p class="f-error" data-error="' + esc(o.name) + '" role="alert" hidden></p>' +
      '</div>'
    );
  }

  /* 显示 / 隐藏密码 */
  function bindEyes(scope) {
    scope.querySelectorAll('[data-eye]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const wrap = this.closest('.f-field');
        const input = wrap ? wrap.querySelector('input') : null;
        if (!input) return;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        this.classList.toggle('is-on', !showing);
        this.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
        this.setAttribute('aria-pressed', showing ? 'false' : 'true');
        input.focus({ preventScroll: true });
      });
    });
  }

  function fieldError(scope, name, message) {
    const wrap = scope.querySelector('[data-field="' + name + '"]');
    if (!wrap) return;
    wrap.classList.toggle('has-error', !!message);
    const err = wrap.querySelector('.f-error');
    if (err) {
      err.hidden = !message;
      err.textContent = message || '';
    }
  }

  function clearErrors(scope) {
    scope.querySelectorAll('[data-field]').forEach((wrap) => {
      wrap.classList.remove('has-error');
      const err = wrap.querySelector('.f-error');
      if (err) { err.hidden = true; err.textContent = ''; }
    });
    scope.querySelectorAll('[data-form-error]').forEach((el) => {
      el.hidden = true;
      el.textContent = '';
    });
  }

  /* 服务端 fields 可能是 address.name 等，取末段匹配 */
  function showServerFields(scope, fields) {
    if (!fields) return false;
    let any = false;
    Object.keys(fields).forEach((key) => {
      const short = String(key).split('.').pop();
      const alias = short === 'contactName' ? 'name' : short;
      const wrap = scope.querySelector('[data-field="' + alias + '"]');
      if (wrap) {
        fieldError(scope, alias, fields[key]);
        any = true;
      }
    });
    return any;
  }

  function setFormError(scope, message) {
    const el = scope.querySelector('[data-form-error]');
    if (!el) return;
    el.hidden = !message;
    el.innerHTML = message ? ico('alert', 16) + '<span>' + esc(message) + '</span>' : '';
  }

  function render(container) {
    let currentUser = QSL.state.user;
    if (!currentUser) {
      QSL.navigate('/login?next=' + encodeURIComponent('/dashboard/profile'), { replace: true });
      return function cleanup() {};
    }

    function defaults() {
      const user = currentUser || QSL.state.user || {};
      const address = user.address || {};
      return {
        user,
        address,
        displayName: user.displayName || user.username || '',
        callSign: user.callSign || '',
        bio: user.bio || '',
        avatarColor: user.avatarColor || '#0eaf8f',
        addrName: address.name || '',
        addrPhone: address.phone || '',
        addrProvince: address.province || '',
        addrCity: address.city || '',
        addrDistrict: '',
        addrLine1: address.line1 || '',
        addrPostalCode: address.postalCode || '',
        addrCountry: address.country || '中国'
      };
    }

    const init = defaults();
    const colorSwatches = AVATAR_COLORS.map((color) =>
      '<button class="f-swatch' + (String(color).toLowerCase() === String(init.avatarColor).toLowerCase() ? ' is-active' : '') +
      '" type="button" data-color="' + esc(color) + '" style="--f-swatch:' + esc(color) + '" aria-label="选择头像颜色 ' + esc(color) + '"></button>'
    ).join('');

    container.innerHTML =
      '<div class="f-page f-profile container">' +
      QSL.pageHeader({
        eyebrow: 'MY ACCOUNT',
        title: '个人资料',
        desc: '完善你的呼号、简介与寄送地址；地址只会在双方同意换卡后互相可见。'
      }) +
      '<div class="f-profile-grid">' +
      '<div class="f-profile-main">' +

      /* -------- 基本资料 -------- */
      '<section class="f-form-card f-profile-card" data-reveal>' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">基本资料</h2>' +
      '<p class="f-form-card-desc">这些信息会展示在你的卡片与个人主页上。</p></div>' +
      '<span class="f-form-step">01</span></header>' +
      '<form id="fProfileForm" novalidate>' +
      '<div class="f-avatar-editor">' +
      '<span class="f-avatar-preview" data-avatar-preview>' + QSL.avatar(init.user, 76) + '</span>' +
      '<div class="f-avatar-editor-main">' +
      '<span class="label">头像配色</span>' +
      '<div class="f-swatches" data-swatches>' + colorSwatches + '</div>' +
      '<p class="f-form-tip">' + ico('info', 14) + ' 头像由呼号缩写与配色自动生成，无需上传图片。</p>' +
      '</div>' +
      '</div>' +
      '<div class="f-form-error" data-form-error hidden></div>' +
      '<div class="f-form-grid">' +
      fieldHtml({ id: 'fProfileDisplayName', name: 'displayName', label: '昵称', value: init.displayName, placeholder: '展示给其他火腿的名字', required: true, maxlength: 40 }) +
      fieldHtml({ id: 'fProfileCallSign', name: 'callSign', label: '呼号', value: init.callSign, placeholder: '如 BG7MOM', optional: true, maxlength: 20 }) +
      fieldHtml({ id: 'fProfileBio', name: 'bio', label: '个人简介', value: init.bio, placeholder: '介绍一下你的电台与通联故事', optional: true, multiline: true, rows: 3, maxlength: 200, counter: 200, span: true }) +
      '</div>' +
      '<div class="f-form-actions">' +
      '<button class="btn btn-primary" type="submit" data-save="profile">' + ico('check', 17) + '<span>保存资料</span></button>' +
      '<span class="f-form-hint">' + ico('shield', 14) + ' 修改后立即生效</span>' +
      '</div>' +
      '</form>' +
      '</section>' +

      /* -------- 寄送地址 -------- */
      '<section class="f-form-card f-profile-card" data-reveal data-reveal-delay="60">' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">寄送地址</h2>' +
      '<p class="f-form-card-desc">换卡申请会自动带入此地址；只有达成交换的双方才能看到它。</p></div>' +
      '<span class="f-form-step">02</span></header>' +
      '<form id="fAddressForm" novalidate>' +
      '<div class="f-form-error" data-form-error hidden></div>' +
      '<div class="f-form-grid">' +
      fieldHtml({ id: 'fAddrName', name: 'name', label: '收件人姓名', value: init.addrName, placeholder: '真实姓名', required: true, maxlength: 30 }) +
      fieldHtml({ id: 'fAddrPhone', name: 'phone', label: '联系电话', value: init.addrPhone, placeholder: '方便快递联系', optional: true, maxlength: 30, inputmode: 'tel' }) +
      fieldHtml({ id: 'fAddrProvince', name: 'province', label: '省 / 自治区', value: init.addrProvince, placeholder: '如：湖南省', optional: true, maxlength: 50 }) +
      fieldHtml({ id: 'fAddrCity', name: 'city', label: '城市', value: init.addrCity, placeholder: '如：长沙市', required: true, maxlength: 50 }) +
      fieldHtml({ id: 'fAddrDistrict', name: 'district', label: '区 / 县', value: init.addrDistrict, placeholder: '如：岳麓区', optional: true, maxlength: 50 }) +
      fieldHtml({ id: 'fAddrPostalCode', name: 'postalCode', label: '邮政编码', value: init.addrPostalCode, placeholder: '如：410000', optional: true, maxlength: 20, inputmode: 'numeric' }) +
      fieldHtml({ id: 'fAddrLine1', name: 'line1', label: '详细地址', value: init.addrLine1, placeholder: '街道、门牌号、单元楼室', required: true, maxlength: 100, span: true }) +
      fieldHtml({ id: 'fAddrCountry', name: 'country', label: '国家 / 地区', value: init.addrCountry, placeholder: '中国', optional: true, maxlength: 50 }) +
      '</div>' +
      '<div class="f-form-actions">' +
      '<button class="btn btn-primary" type="submit" data-save="address">' + ico('map-pin', 17) + '<span>保存地址</span></button>' +
      '<span class="f-address-state" data-address-state>' + (init.addrLine1 ? ico('check-circle', 15) + ' 已保存寄送地址' : ico('info', 15) + ' 尚未填写寄送地址') + '</span>' +
      '</div>' +
      '</form>' +
      '</section>' +

      /* -------- 修改密码 -------- */
      '<section class="f-form-card f-profile-card" data-reveal data-reveal-delay="120">' +
      '<header class="f-form-card-head"><div><h2 class="f-form-card-title">修改密码</h2>' +
      '<p class="f-form-card-desc">定期更换密码，保护你的账号与卡片收藏。</p></div>' +
      '<span class="f-form-step">03</span></header>' +
      '<form id="fPasswordForm" novalidate>' +
      '<div class="f-form-error" data-form-error hidden></div>' +
      '<div class="f-form-grid">' +
      fieldHtml({ id: 'fPwdCurrent', name: 'currentPassword', label: '当前密码', type: 'password', placeholder: '输入当前登录密码', required: true, maxlength: 128, eye: true, span: true }) +
      fieldHtml({ id: 'fPwdNew', name: 'newPassword', label: '新密码', type: 'password', placeholder: '至少 8 位，含字母与数字', required: true, maxlength: 128, eye: true }) +
      fieldHtml({ id: 'fPwdConfirm', name: 'confirmPassword', label: '确认新密码', type: 'password', placeholder: '再次输入新密码', required: true, maxlength: 128, eye: true }) +
      '</div>' +
      '<div class="f-form-actions">' +
      '<button class="btn btn-primary" type="submit" data-save="password">' + ico('lock', 17) + '<span>更新密码</span></button>' +
      '<span class="f-form-hint">' + ico('key', 14) + ' 修改后当前登录仍然有效</span>' +
      '</div>' +
      '</form>' +
      '</section>' +

      '</div>' +

      /* -------- 侧栏 -------- */
      '<aside class="f-profile-side">' +
      '<div class="f-profile-summary glass" data-reveal data-reveal-delay="60">' +
      '<div class="f-summary-avatar" data-summary-avatar>' + QSL.avatar(init.user, 84) + '</div>' +
      '<h2 class="f-summary-name" data-summary-name>' + esc(init.displayName) + '</h2>' +
      '<span class="f-summary-call mono" data-summary-call>' + esc(init.callSign || '未填写呼号') + '</span>' +
      '<span class="f-summary-username">@' + esc(init.user.username || '') + ' · ' +
      (init.user.role === 'admin' ? QSL.badge('管理员', 'violet') : QSL.badge('火腿', 'mint')) + '</span>' +
      '<div class="f-summary-stats" data-summary-stats>' +
      '<span><b data-stat="cards">' + QSL.formatNumber((init.user.stats && init.user.stats.cards) || 0) + '</b><small>卡片</small></span>' +
      '<span><b data-stat="likes">' + QSL.formatNumber((init.user.stats && init.user.stats.likesReceived) || 0) + '</b><small>获赞</small></span>' +
      '<span><b data-stat="exchanges">' + QSL.formatNumber((init.user.stats && init.user.stats.exchanges) || 0) + '</b><small>换卡</small></span>' +
      '</div>' +
      '<div class="f-summary-meta">' +
      '<span>' + ico('mail', 14) + esc(init.user.email || '—') + '</span>' +
      '<span>' + ico('calendar', 14) + (init.user.joinedAt ? QSL.formatDate(init.user.joinedAt) + ' 加入' : '—') + '</span>' +
      '</div>' +
      '<div class="f-summary-links">' +
      '<a class="f-summary-link" href="/dashboard/cards">' + ico('cards', 16) + '<span>我的卡片</span>' + ico('chevron-right', 14) + '</a>' +
      '<a class="f-summary-link" href="/dashboard/exchanges">' + ico('inbox', 16) + '<span>换卡申请</span>' + ico('chevron-right', 14) + '</a>' +
      '<a class="f-summary-link" href="/dashboard/cards/new">' + ico('upload', 16) + '<span>上传新卡片</span>' + ico('chevron-right', 14) + '</a>' +
      '</div>' +
      '</div>' +
      '</aside>' +
      '</div>' +
      '</div>';

    const profileForm = container.querySelector('#fProfileForm');
    const addressForm = container.querySelector('#fAddressForm');
    const passwordForm = container.querySelector('#fPasswordForm');
    const avatarPreview = container.querySelector('[data-avatar-preview]');
    const summaryAvatar = container.querySelector('[data-summary-avatar]');
    const summaryName = container.querySelector('[data-summary-name]');
    const summaryCall = container.querySelector('[data-summary-call]');
    const addressState = container.querySelector('[data-address-state]');
    const swatches = container.querySelector('[data-swatches]');
    const bioInput = profileForm.querySelector('[name="bio"]');
    let alive = true;
    let touched = false;
    let avatarColor = init.avatarColor;

    bindEyes(container);

    function avatarObject() {
      const user = currentUser || {};
      const displayNameInput = profileForm.querySelector('[name="displayName"]');
      const callSignInput = profileForm.querySelector('[name="callSign"]');
      return {
        displayName: (displayNameInput && displayNameInput.value.trim()) || user.username || 'Q',
        callSign: (callSignInput && callSignInput.value.trim()) || '',
        avatarColor: avatarColor
      };
    }

    function paintAvatar() {
      const fake = avatarObject();
      if (avatarPreview) avatarPreview.innerHTML = QSL.avatar(fake, 76);
      if (summaryAvatar) summaryAvatar.innerHTML = QSL.avatar(fake, 84);
      if (summaryName) summaryName.textContent = fake.displayName;
      if (summaryCall) summaryCall.textContent = fake.callSign || '未填写呼号';
    }

    function paintSummary(user, stats) {
      const u = user || currentUser || {};
      const base = u.stats || {};
      const s = stats || {};
      const pick = (key, fallback) => {
        if (s[key] !== undefined && s[key] !== null) return Number(s[key]) || 0;
        if (base[key] !== undefined && base[key] !== null) return Number(base[key]) || 0;
        return Number(fallback) || 0;
      };
      const setText = (sel, value) => {
        const el = container.querySelector(sel);
        if (el) el.textContent = QSL.formatNumber(Number(value) || 0);
      };
      setText('[data-stat="cards"]', pick('cards', 0));
      setText('[data-stat="likes"]', pick('likesReceived', 0));
      // overview.stats 没有 exchanges 字段（只有 completedExchanges），优先用 user.stats.exchanges 的总换卡数
      setText('[data-stat="exchanges"]', pick('exchanges', s.completedExchanges !== undefined ? s.completedExchanges : base.exchanges));
      paintAvatar();
    }

    function updateAddressState(saved, isError) {
      if (!addressState) return;
      addressState.classList.toggle('is-ok', saved && !isError);
      addressState.classList.toggle('is-error', !!isError);
      addressState.innerHTML = isError
        ? ico('alert', 15) + ' 地址保存失败'
        : saved
          ? ico('check-circle', 15) + ' 已保存寄送地址'
          : ico('info', 15) + ' 尚未填写寄送地址';
    }

    function updateBioCounter() {
      const counter = profileForm.querySelector('[data-counter="bio"]');
      if (counter && bioInput) counter.textContent = bioInput.value.length + ' / 200';
    }
    updateBioCounter();
    if (bioInput) bioInput.addEventListener('input', updateBioCounter);

    profileForm.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', () => {
        touched = true;
        if (input.name === 'callSign') {
          const pos = input.selectionStart;
          input.value = input.value.toUpperCase();
          try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
        }
        paintAvatar();
      });
    });

    if (swatches) {
      swatches.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-color]');
        if (!btn) return;
        avatarColor = btn.dataset.color;
        swatches.querySelectorAll('[data-color]').forEach((el) => el.classList.toggle('is-active', el === btn));
        paintAvatar();
      });
    }

    /* ---------------- 基本资料提交 ---------------- */
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(profileForm);
      const values = {
        displayName: (profileForm.querySelector('[name="displayName"]').value || '').trim(),
        callSign: (profileForm.querySelector('[name="callSign"]').value || '').trim().toUpperCase(),
        bio: (profileForm.querySelector('[name="bio"]').value || '').trim(),
        avatarColor: avatarColor
      };
      if (!values.displayName) {
        fieldError(profileForm, 'displayName', '请填写昵称');
        profileForm.querySelector('[name="displayName"]').focus();
        return;
      }
      if (values.displayName.length > 40) {
        fieldError(profileForm, 'displayName', '昵称不能超过 40 个字符');
        return;
      }
      if (values.callSign.length > 20) {
        fieldError(profileForm, 'callSign', '呼号不能超过 20 个字符');
        return;
      }
      const btn = profileForm.querySelector('[data-save="profile"]');
      QSL.setBusy(btn, true, '保存中…');
      try {
        const res = await QSL.api.me.updateProfile(values);
        if (!alive) return;
        if (res && res.user) {
          currentUser = res.user;
          QSL.setUser(res.user);
        }
        touched = false;
        QSL.toast('个人资料已保存', 'success');
        paintAvatar();
        paintSummary(currentUser);
      } catch (err) {
        if (!alive) return;
        const handled = err && err.fields ? showServerFields(profileForm, err.fields) : false;
        if (!handled) setFormError(profileForm, (err && err.message) || '保存失败，请稍后重试');
      } finally {
        if (alive) QSL.setBusy(btn, false);
      }
    });

    /* ---------------- 寄送地址提交 ---------------- */
    addressForm.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', () => { touched = true; });
    });

    addressForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(addressForm);
      const get = (name) => {
        const input = addressForm.querySelector('[name="' + name + '"]');
        return input ? input.value.trim() : '';
      };
      const values = {
        name: get('name'),
        phone: get('phone'),
        province: get('province'),
        city: [get('city'), get('district')].filter(Boolean).join(' '),
        line1: get('line1'),
        postalCode: get('postalCode'),
        country: get('country') || '中国'
      };
      if (!values.name) {
        fieldError(addressForm, 'name', '请填写收件人姓名');
        addressForm.querySelector('[name="name"]').focus();
        return;
      }
      if (values.name.length > 30) {
        fieldError(addressForm, 'name', '姓名不能超过 30 个字符');
        return;
      }
      if (!values.city) {
        fieldError(addressForm, 'city', '请填写城市');
        addressForm.querySelector('[name="city"]').focus();
        return;
      }
      if (!values.line1) {
        fieldError(addressForm, 'line1', '请填写详细地址');
        addressForm.querySelector('[name="line1"]').focus();
        return;
      }
      if (values.line1.length > 100) {
        fieldError(addressForm, 'line1', '详细地址不能超过 100 个字符');
        return;
      }
      const btn = addressForm.querySelector('[data-save="address"]');
      QSL.setBusy(btn, true, '保存中…');
      try {
        const res = await QSL.api.me.updateProfile({ address: values });
        if (!alive) return;
        if (res && res.user) {
          currentUser = res.user;
          QSL.setUser(res.user);
        }
        touched = false;
        updateAddressState(true);
        QSL.toast('寄送地址已保存', 'success');
      } catch (err) {
        if (!alive) return;
        const handled = err && err.fields ? showServerFields(addressForm, err.fields) : false;
        if (!handled) setFormError(addressForm, (err && err.message) || '地址保存失败，请稍后重试');
        updateAddressState(false, true);
      } finally {
        if (alive) QSL.setBusy(btn, false);
      }
    });

    /* ---------------- 修改密码提交 ---------------- */
    passwordForm.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => { touched = true; });
    });

    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(passwordForm);
      const get = (name) => {
        const input = passwordForm.querySelector('[name="' + name + '"]');
        return input ? input.value : '';
      };
      const values = {
        currentPassword: get('currentPassword'),
        newPassword: get('newPassword'),
        confirmPassword: get('confirmPassword')
      };
      if (!values.currentPassword) {
        fieldError(passwordForm, 'currentPassword', '请输入当前密码');
        passwordForm.querySelector('[name="currentPassword"]').focus();
        return;
      }
      if (!values.newPassword) {
        fieldError(passwordForm, 'newPassword', '请输入新密码');
        passwordForm.querySelector('[name="newPassword"]').focus();
        return;
      }
      if (values.newPassword.length < 8) {
        fieldError(passwordForm, 'newPassword', '密码至少 8 位');
        return;
      }
      if (!/[A-Za-z]/.test(values.newPassword) || !/[0-9]/.test(values.newPassword)) {
        fieldError(passwordForm, 'newPassword', '密码需同时包含字母与数字');
        return;
      }
      if (values.confirmPassword !== values.newPassword) {
        fieldError(passwordForm, 'confirmPassword', '两次输入的新密码不一致');
        return;
      }
      const btn = passwordForm.querySelector('[data-save="password"]');
      QSL.setBusy(btn, true, '更新中…');
      try {
        await QSL.api.me.updatePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword
        });
        if (!alive) return;
        passwordForm.reset();
        QSL.toast('密码已更新，请牢记新密码', 'success');
      } catch (err) {
        if (!alive) return;
        if (err && err.code === 'INVALID_CREDENTIALS') {
          fieldError(passwordForm, 'currentPassword', '当前密码不正确');
        } else {
          const handled = err && err.fields ? showServerFields(passwordForm, err.fields) : false;
          if (!handled) setFormError(passwordForm, (err && err.message) || '密码更新失败，请稍后重试');
        }
      } finally {
        if (alive) QSL.setBusy(btn, false);
      }
    });

    /* ---------------- 拉取最新资料 ---------------- */
    async function load() {
      try {
        const data = await QSL.api.me.overview();
        if (!alive) return;
        if (data && data.user) {
          currentUser = data.user;
          QSL.setUser(data.user);
          if (!touched) {
            const user = data.user;
            const address = user.address || {};
            profileForm.querySelector('[name="displayName"]').value = user.displayName || '';
            profileForm.querySelector('[name="callSign"]').value = user.callSign || '';
            profileForm.querySelector('[name="bio"]').value = user.bio || '';
            updateBioCounter();
            avatarColor = user.avatarColor || avatarColor;
            if (swatches) {
              swatches.querySelectorAll('[data-color]').forEach((el) => {
                el.classList.toggle('is-active', String(el.dataset.color).toLowerCase() === String(avatarColor).toLowerCase());
              });
            }
            addressForm.querySelector('[name="name"]').value = address.name || '';
            addressForm.querySelector('[name="phone"]').value = address.phone || '';
            addressForm.querySelector('[name="province"]').value = address.province || '';
            addressForm.querySelector('[name="city"]').value = address.city || '';
            addressForm.querySelector('[name="line1"]').value = address.line1 || '';
            addressForm.querySelector('[name="postalCode"]').value = address.postalCode || '';
            addressForm.querySelector('[name="country"]').value = address.country || '中国';
            updateAddressState(!!address.line1);
            paintAvatar();
          }
          paintSummary(data.user, data.stats);
        }
      } catch (err) {
        if (!alive) return;
        console.error('[profile] 加载最新资料失败', err);
        paintSummary(currentUser);
        QSL.toast((err && err.message) || '资料加载失败，显示的是本地缓存', 'error');
      }
    }

    paintSummary(currentUser);
    load();
    return function cleanup() { alive = false; };
  }

  QSL.registerPage('profile', { title: '个人资料', render: render });
})();
