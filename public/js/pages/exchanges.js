/* ============================================================
 * QSLink · 换卡申请中心（flows-ui）
 * 路由：/dashboard/exchanges
 * 跨模块接口：window.QSL.exchangeRequest = { open(card) }（卡片详情/分享页调用）
 * 依赖：core.js / api.js / ui.js
 * ============================================================ */
(function () {
  'use strict';
  const QSL = window.QSL;
  const esc = (v) => QSL.escapeHtml(v == null ? '' : v);
  const ico = (name, size) => (typeof QSL.icon === 'function' ? QSL.icon(name, size || 18) : '');
  const timeAgo = (iso) => (typeof QSL.timeAgo === 'function' ? QSL.timeAgo(iso) : '');

  const STATUS_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待处理' },
    { key: 'approved', label: '已同意' },
    { key: 'completed', label: '已完成' },
    { key: 'rejected', label: '已拒绝' },
    { key: 'cancelled', label: '已取消' }
  ];

  function displayName(user) {
    if (!user) return '未知用户';
    return user.displayName || user.username || '未知用户';
  }

  function personLabel(user) {
    if (!user) return '未知用户';
    return displayName(user) + (user.callSign ? '（' + user.callSign + '）' : '');
  }

  function formatAddress(address) {
    if (!address) return '';
    const lines = [];
    const head = [address.name, address.phone].filter(Boolean).join(' ');
    if (head) lines.push(head);
    const region = [address.province, address.city, address.line1].filter(Boolean).join(' ');
    if (region) lines.push(region);
    const tail = [address.postalCode, address.country].filter(Boolean).join(' · ');
    if (tail) lines.push(tail);
    return lines.join('\n');
  }

  function counterpartOf(ex) {
    return ex.direction === 'incoming' ? ex.fromUser : ex.toUser;
  }

  /* ============================================================
   * 换卡申请弹窗 —— 跨模块接口
   * ============================================================ */
  function xreqField(opts) {
    const o = opts || {};
    return (
      '<label class="f-field f-xreq-field' + (o.span ? ' f-span-2' : '') + '" data-field="' + esc(o.name) + '">' +
      '<span class="f-field-row"><span class="label">' + esc(o.label) +
      (o.required ? '<i class="req">*</i>' : '') + (o.optional ? '<span class="f-optional">选填</span>' : '') + '</span></span>' +
      '<input class="input" name="' + esc(o.name) + '" type="' + esc(o.type || 'text') + '" value="' + esc(o.value || '') + '"' +
      ' placeholder="' + esc(o.placeholder || '') + '" maxlength="' + esc(o.maxlength || 100) + '"' +
      (o.inputmode ? ' inputmode="' + esc(o.inputmode) + '"' : '') + ' autocomplete="' + esc(o.autocomplete || 'off') + '">' +
      '<span class="f-error" data-error="' + esc(o.name) + '" role="alert" hidden></span>' +
      '</label>'
    );
  }

  function openExchangeRequest(card) {
    const currentUser = QSL.state.user;
    const target = card || {};

    if (!currentUser) {
      QSL.toast('登录后即可申请换卡', 'info');
      const isGuestPage = /^\/(login|register)\b/.test(location.pathname);
      QSL.navigate(isGuestPage ? '/login' : '/login?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }
    if (!target.id) {
      QSL.toast('卡片信息不完整，暂时无法申请', 'error');
      return;
    }
    if (target.owner && target.owner.id && target.owner.id === currentUser.id) {
      QSL.toast('这是你自己的卡片，不需要申请换卡', 'info');
      return;
    }
    if (target.status && target.status !== 'approved') {
      QSL.toast('这张卡片暂不可申请换卡', 'info');
      return;
    }
    if (target.myExchange && (target.myExchange.status === 'pending' || target.myExchange.status === 'approved')) {
      QSL.toast(target.myExchange.status === 'pending' ? '你已经申请过这张卡片，请等待对方处理' : '你已经与对方达成了换卡', 'info');
      return;
    }

    const profileAddress = currentUser.address || {};
    const defaults = {
      name: profileAddress.name || currentUser.displayName || currentUser.username || '',
      phone: profileAddress.phone || '',
      province: profileAddress.province || '',
      city: profileAddress.city || '',
      district: '',
      line1: profileAddress.line1 || '',
      postalCode: profileAddress.postalCode || '',
      country: profileAddress.country || '中国'
    };

    const content =
      '<div class="f-xreq">' +
      '<div class="f-xreq-card">' +
      '<span class="f-xreq-thumb" style="aspect-ratio:' + esc(QSL.ratioCss(target.ratio || { w: 3, h: 2 })) + '">' +
      '<img src="' + esc(target.frontImage || QSL.PLACEHOLDER_IMAGE) + '" alt="' + esc(target.title || '卡片') + '" loading="lazy">' +
      '</span>' +
      '<div class="f-xreq-card-info">' +
      '<span class="f-xreq-eyebrow">' + ico('send', 13) + ' APPLY TO EXCHANGE</span>' +
      '<b class="f-xreq-title">' + esc(target.title || '未命名卡片') + '</b>' +
      '<span class="f-xreq-card-meta">' + esc(QSL.ratioLabel(target.ratio || { w: 3, h: 2 })) + '</span>' +
      (target.owner ? '<span class="f-xreq-owner">' + QSL.ownerLine(target.owner) + '</span>' : '') +
      '</div>' +
      '<span class="f-xreq-pill">' + ico('cards', 14) + ' 换卡申请</span>' +
      '</div>' +
      '<div class="f-xreq-tip">' + ico('shield', 15) +
      '<span>寄送地址仅在对方同意后互相可见。请确认信息准确，方便彼此寄出实体卡片。</span></div>' +
      '<div class="f-xreq-alert" data-xreq-alert role="alert" hidden></div>' +
      '<form class="f-xreq-form" data-xreq-form novalidate>' +
      '<div class="f-xreq-section-head"><b>' + ico('map-pin', 16) + ' 我的寄送地址</b>' +
      '<button type="button" class="f-xreq-restore" data-fill-profile>' + ico('refresh', 14) + ' 重新填入资料地址</button></div>' +
      (profileAddress.line1 ? '' : '<p class="f-xreq-empty-tip">' + ico('info', 14) + ' 你还没有保存过地址，填写后将同步到个人资料。</p>') +
      '<div class="f-xreq-grid">' +
      xreqField({ name: 'name', label: '收件人姓名', value: defaults.name, placeholder: '真实姓名', required: true, maxlength: 30 }) +
      xreqField({ name: 'phone', label: '联系电话', value: defaults.phone, placeholder: '方便快递联系', optional: true, maxlength: 30, inputmode: 'tel' }) +
      xreqField({ name: 'province', label: '省 / 自治区', value: defaults.province, placeholder: '如：湖南省', optional: true, maxlength: 50 }) +
      xreqField({ name: 'city', label: '城市', value: defaults.city, placeholder: '如：长沙市', required: true, maxlength: 50 }) +
      xreqField({ name: 'district', label: '区 / 县', value: defaults.district, placeholder: '如：岳麓区', optional: true, maxlength: 50 }) +
      xreqField({ name: 'postalCode', label: '邮政编码', value: defaults.postalCode, placeholder: '如：410000', optional: true, maxlength: 20, inputmode: 'numeric' }) +
      xreqField({ name: 'line1', label: '详细地址', value: defaults.line1, placeholder: '街道、门牌号、单元楼室', required: true, maxlength: 100, span: true }) +
      xreqField({ name: 'country', label: '国家 / 地区', value: defaults.country, placeholder: '中国', optional: true, maxlength: 50 }) +
      '</div>' +
      '<div class="f-xreq-section-head"><b>' + ico('mail', 16) + ' 给对方留言</b>' +
      '<span class="f-label-hint" data-msg-counter>0 / 500</span></div>' +
      '<label class="f-field f-xreq-field f-span-2" data-field="message">' +
      '<textarea class="textarea" name="message" rows="3" maxlength="500" placeholder="例如：希望交换卡片，73！"></textarea>' +
      '<span class="f-error" data-error="message" role="alert" hidden></span>' +
      '</label>' +
      '</form>' +
      '</div>';

    let busy = false;
    const modal = QSL.modal({
      title: '申请换卡',
      size: 'lg',
      content: content,
      actions: [
        { label: '取消', type: 'ghost' },
        {
          label: '发送申请', type: 'primary', closeOnClick: false,
          onClick: (instance) => submitRequest(instance)
        }
      ]
    });
    const body = modal.body;
    const formEl = body.querySelector('[data-xreq-form]');
    const alertEl = body.querySelector('[data-xreq-alert]');
    const messageEl = formEl.querySelector('[name="message"]');
    const counterEl = body.querySelector('[data-msg-counter]');
    const submitBtn = modal.el ? modal.el.querySelector('.modal-actions .btn-primary') : null;

    if (messageEl && counterEl) {
      messageEl.addEventListener('input', () => {
        counterEl.textContent = messageEl.value.length + ' / 500';
      });
    }

    const fillProfileBtn = body.querySelector('[data-fill-profile]');
    if (fillProfileBtn) {
      fillProfileBtn.addEventListener('click', () => {
        const address = (QSL.state.user && QSL.state.user.address) || {};
        fillForm({
          name: address.name || '',
          phone: address.phone || '',
          province: address.province || '',
          city: address.city || '',
          district: '',
          line1: address.line1 || '',
          postalCode: address.postalCode || '',
          country: address.country || '中国'
        });
        clearErrors();
        QSL.toast(address.line1 ? '已重新填入个人资料地址' : '个人资料中还没有保存地址', address.line1 ? 'info' : 'error');
      });
    }

    function fillForm(values) {
      Object.keys(values).forEach((key) => {
        const input = formEl.querySelector('[name="' + key + '"]');
        if (input) input.value = values[key] || '';
      });
    }

    function clearErrors() {
      formEl.querySelectorAll('[data-field]').forEach((wrap) => {
        wrap.classList.remove('has-error');
        const err = wrap.querySelector('.f-error');
        if (err) { err.hidden = true; err.textContent = ''; }
      });
      setAlert('');
    }

    function setAlert(message) {
      if (!alertEl) return;
      alertEl.hidden = !message;
      alertEl.innerHTML = message
        ? ico('alert', 16) + '<span>' + esc(message) + '</span>'
        : '';
    }

    function showFieldError(name, message) {
      const wrap = formEl.querySelector('[data-field="' + name + '"]');
      if (!wrap) return false;
      wrap.classList.add('has-error');
      const err = wrap.querySelector('.f-error');
      if (err) {
        err.hidden = false;
        err.textContent = message || '';
      }
      return true;
    }

    function collect() {
      const get = (name) => {
        const input = formEl.querySelector('[name="' + name + '"]');
        return input ? input.value.trim() : '';
      };
      return {
        name: get('name'),
        phone: get('phone'),
        province: get('province'),
        city: get('city'),
        district: get('district'),
        line1: get('line1'),
        postalCode: get('postalCode'),
        country: get('country'),
        message: get('message')
      };
    }

    function validate(values) {
      let firstBad = null;
      const fail = (name, message) => {
        showFieldError(name, message);
        if (!firstBad) firstBad = name;
      };
      if (!values.name) fail('name', '请填写收件人姓名');
      else if (values.name.length > 30) fail('name', '姓名不能超过 30 个字符');
      if (!values.city) fail('city', '请填写城市');
      else if (values.city.length > 50) fail('city', '城市名称过长');
      if (!values.line1) fail('line1', '请填写详细地址');
      else if (values.line1.length > 100) fail('line1', '详细地址不能超过 100 个字符');
      if (values.phone && values.phone.length > 30) fail('phone', '联系电话过长');
      if (values.province && values.province.length > 50) fail('province', '省份名称过长');
      if (values.postalCode && values.postalCode.length > 20) fail('postalCode', '邮编过长');
      if (values.country && values.country.length > 50) fail('country', '国家名称过长');
      if (values.message.length > 500) fail('message', '留言不能超过 500 个字符');
      if (firstBad) {
        const wrap = formEl.querySelector('[data-field="' + firstBad + '"]');
        if (wrap) wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return !firstBad;
    }

    // 服务端字段（可能是 address.name / contactName）→ 表单字段
    function mapServerFields(fields) {
      if (!fields) return;
      Object.keys(fields).forEach((key) => {
        const short = String(key).split('.').pop();
        const targetKey = short === 'contactName' ? 'name' : short;
        const message = fields[key];
        if (!showFieldError(targetKey, message)) {
          if (targetKey === 'address') setAlert(message);
        }
      });
    }

    function saveAddressSilently(address) {
      try {
        if (!QSL.api.me || typeof QSL.api.me.updateProfile !== 'function') return;
        QSL.api.me.updateProfile({ address }).then((res) => {
          if (res && res.user) QSL.setUser(res.user);
        }).catch(() => { /* 静默失败，不影响申请 */ });
      } catch (e) { /* ignore */ }
    }

    async function submitRequest(instance) {
      if (busy) return false;
      clearErrors();
      const values = collect();
      if (!validate(values)) return false;
      busy = true;
      QSL.setBusy(submitBtn, true, '发送中…');
      const address = {
        name: values.name,
        phone: values.phone,
        province: values.province,
        city: [values.city, values.district].filter(Boolean).join(' '),
        line1: values.line1,
        postalCode: values.postalCode,
        country: values.country || '中国'
      };
      try {
        await QSL.api.exchanges.create(target.id, {
          message: values.message,
          contactName: values.name,
          address: address
        });
        instance.close();
        saveAddressSilently(address);
        if (QSL.fx && typeof QSL.fx.confetti === 'function') {
          try { QSL.fx.confetti(); } catch (e) { /* ignore */ }
        }
        QSL.toast('换卡申请已发送，等待对方处理', 'success');
        QSL.navigate('/dashboard/exchanges?box=outgoing');
      } catch (err) {
        if (instance.el && !instance.el.isConnected) return false;
        busy = false;
        QSL.setBusy(submitBtn, false);
        if (err && err.status === 401) {
          instance.close();
          QSL.toast('登录已过期，请重新登录', 'error');
          QSL.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search));
          return false;
        }
        if (err && err.status === 409) {
          setAlert(err.message || '你已申请过这张卡片，请等待对方处理');
          return false;
        }
        if (err && err.fields) mapServerFields(err.fields);
        if (!(err && err.fields && Object.keys(err.fields).length)) {
          setAlert((err && err.message) || '申请发送失败，请稍后重试');
        }
        return false;
      }
      return false;
    }

    void submitBtn;
    void formEl;
  }

  /* ============================================================
   * 页面
   * ============================================================ */
  function render(container, ctx) {
    if (!QSL.state.user) {
      QSL.navigate('/login?next=' + encodeURIComponent('/dashboard/exchanges'), { replace: true });
      return function cleanup() {};
    }

    const query = ctx && ctx.query ? ctx.query : new URLSearchParams();
    const initialBox = query.get('box') === 'outgoing' ? 'outgoing' : 'incoming';
    const initialStatus = STATUS_FILTERS.some((s) => s.key === query.get('status')) ? query.get('status') : 'all';
    const state = { items: [], counts: {}, box: initialBox, status: initialStatus, alive: true, loading: false };
    let listEl = null;

    container.innerHTML =
      '<div class="f-page f-exchanges container">' +
      QSL.pageHeader({
        eyebrow: 'CARD EXCHANGES',
        title: '换卡申请',
        desc: '处理收到的换卡申请，跟进你发出的申请；达成交换后双方地址互相可见。',
        actions: '<a class="btn btn-primary" href="/explore">' + ico('compass', 17) + '<span>去广场找卡片</span></a>'
      }) +
      '<div class="f-ex-toolbar" data-reveal>' +
      '<div class="tabs tabs-lg f-ex-tabs" role="tablist" aria-label="申请分类">' +
      '<span class="f-ex-tab-glider" aria-hidden="true"></span>' +
      '<button class="tab is-active" type="button" role="tab" aria-selected="true" data-box="incoming">' +
      ico('inbox', 16) + ' <span>收到的申请</span><b class="tab-count" data-box-count="incoming" hidden>0</b></button>' +
      '<button class="tab" type="button" role="tab" aria-selected="false" data-box="outgoing">' +
      ico('send', 16) + ' <span>我发出的申请</span><b class="tab-count" data-box-count="outgoing" hidden>0</b></button>' +
      '</div>' +
      '<div class="f-ex-toolbar-side">' +
      '<span class="f-ex-total" data-ex-total></span>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-refresh>' + ico('refresh', 15) + '<span class="f-hide-sm">刷新</span></button>' +
      '</div>' +
      '</div>' +
      '<div class="f-ex-filters" role="group" aria-label="状态筛选">' +
      STATUS_FILTERS.map((item) =>
        '<button class="chip' + (item.key === initialStatus ? ' is-active' : '') + '" type="button" data-status="' + item.key + '">' +
        esc(item.label) + '<b class="f-ex-filter-count" data-status-count="' + item.key + '"></b></button>'
      ).join('') +
      '</div>' +
      '<div class="f-ex-list" id="fExchangeList" aria-live="polite">' + QSL.skeletonRows(3) + '</div>' +
      '</div>';

    listEl = container.querySelector('#fExchangeList');
    const totalEl = container.querySelector('[data-ex-total]');
    const refreshBtn = container.querySelector('[data-refresh]');

    const tabsEl = container.querySelector('.f-ex-tabs');
    const gliderEl = container.querySelector('.f-ex-tab-glider');

    function moveGlider() {
      if (!tabsEl || !gliderEl) return;
      const active = tabsEl.querySelector('.tab.is-active');
      if (!active || !active.offsetWidth) return;
      gliderEl.style.width = active.offsetWidth + 'px';
      gliderEl.style.transform = 'translateX(' + active.offsetLeft + 'px)';
      if (!tabsEl.classList.contains('has-glider')) {
        // 首次定位不做动画，避免页面打开时滑块从左侧飞入
        requestAnimationFrame(() => tabsEl.classList.add('has-glider'));
      }
    }

    let tabsObserver = null;
    if (tabsEl && typeof ResizeObserver === 'function') {
      tabsObserver = new ResizeObserver(moveGlider);
      tabsObserver.observe(tabsEl);
    }

    let switchTimer = 0;
    function animateListSwitch(direction) {
      if (!listEl) return;
      clearTimeout(switchTimer);
      listEl.classList.remove('is-switch-left', 'is-switch-right');
      void listEl.offsetWidth;
      listEl.classList.add(direction === 'outgoing' ? 'is-switch-right' : 'is-switch-left');
      // 动画结束后移除，避免后续刷新列表时重复播放
      switchTimer = setTimeout(() => listEl.classList.remove('is-switch-left', 'is-switch-right'), 800);
    }

    function paintChrome() {
      container.querySelectorAll('[data-box]').forEach((btn) => {
        const active = btn.dataset.box === state.box;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      container.querySelectorAll('[data-status]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.status === state.status);
      });
      const counts = state.counts || {};
      const incomingCount = Number(counts.incomingPending) || 0;
      const outgoingCount = Number(counts.outgoingPending) || 0;
      const incomingBadge = container.querySelector('[data-box-count="incoming"]');
      const outgoingBadge = container.querySelector('[data-box-count="outgoing"]');
      if (incomingBadge) {
        incomingBadge.hidden = incomingCount <= 0;
        incomingBadge.textContent = String(incomingCount);
      }
      if (outgoingBadge) {
        outgoingBadge.hidden = outgoingCount <= 0;
        outgoingBadge.textContent = String(outgoingCount);
      }
      moveGlider();
      // 当前 Tab 各状态数量
      const inBox = state.items.filter((item) => item.direction === state.box);
      const byStatus = { all: inBox.length };
      inBox.forEach((item) => { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
      container.querySelectorAll('[data-status-count]').forEach((el) => {
        const count = byStatus[el.dataset.statusCount] || 0;
        el.textContent = count ? String(count) : '';
      });
      const visible = visibleItems();
      if (totalEl) {
        totalEl.textContent = inBox.length ? '共 ' + inBox.length + ' 条' + (state.status === 'all' ? '' : '，当前 ' + visible.length + ' 条') : '';
      }
    }

    function visibleItems() {
      return state.items.filter((item) => {
        if (item.direction !== state.box) return false;
        if (state.status !== 'all' && item.status !== state.status) return false;
        return true;
      });
    }

    function addressCard(address, person, role) {
      if (!address) return '';
      const addressText = formatAddress(address);
      return '<div class="f-addr">' +
        '<div class="f-addr-head">' +
        '<span class="f-addr-role">' + ico(role.icon, 14) + esc(role.label) + '</span>' +
        '<span class="f-addr-person">' + esc(personLabel(person)) + '</span>' +
        '</div>' +
        '<div class="f-addr-body">' +
        '<b class="f-addr-name">' + esc(address.name || '') + '</b>' +
        (address.phone ? '<span class="f-addr-phone mono">' + esc(address.phone) + '</span>' : '') +
        '<p class="f-addr-line">' + esc([address.province, address.city, address.line1].filter(Boolean).join(' ')) + '</p>' +
        (address.postalCode || address.country
          ? '<span class="f-addr-tail">' + esc([address.postalCode, address.country].filter(Boolean).join(' · ')) + '</span>'
          : '') +
        '</div>' +
        '<button class="f-addr-copy" type="button" data-ex-act="copy-address" data-addr="' + esc(role.addrKey) + '" title="复制地址">' +
        ico('copy', 15) + '<span>复制</span></button>' +
        '<span class="f-addr-text" hidden>' + esc(addressText) + '</span>' +
        '</div>';
    }

    function actionButtons(ex) {
      const buttons = [];
      if (ex.direction === 'incoming') {
        if (ex.status === 'pending') {
          buttons.push('<button class="btn btn-sm btn-primary" type="button" data-ex-act="approve">' + ico('check', 15) + '同意交换</button>');
          buttons.push('<button class="btn btn-sm btn-ghost" type="button" data-ex-act="reject">' + ico('x', 15) + '拒绝</button>');
        }
      } else if (ex.status === 'pending') {
        buttons.push('<button class="btn btn-sm btn-ghost" type="button" data-ex-act="cancel">' + ico('x', 15) + '撤回申请</button>');
      }
      if (ex.status === 'approved') {
        buttons.push('<button class="btn btn-sm btn-primary" type="button" data-ex-act="complete">' + ico('check-circle', 15) + '标记完成</button>');
      }
      return buttons.length ? '<div class="f-ex-actions">' + buttons.join('') + '</div>' : '';
    }

    function rowHtml(ex) {
      const card = ex.card || {};
      const other = counterpartOf(ex) || {};
      const incoming = ex.direction === 'incoming';
      const status = ex.status || 'pending';
      const dirText = incoming
        ? '收到来自 <b>' + esc(displayName(ex.fromUser)) + '</b>（' + esc((ex.fromUser && ex.fromUser.callSign) || '无呼号') + '）的换卡申请'
        : '你向 <b>' + esc(displayName(ex.toUser)) + '</b>（' + esc((ex.toUser && ex.toUser.callSign) || '无呼号') + '）发出换卡申请';
      const showAddresses = (status === 'approved' || status === 'completed') && (ex.fromAddress || ex.toAddress);
      let addressesHtml = '';
      if (showAddresses) {
        addressesHtml =
          '<div class="f-ex-addresses">' +
          addressCard(ex.fromAddress, ex.fromUser, {
            label: incoming ? '申请人 · 寄件地址' : '我的寄件地址',
            icon: 'send',
            addrKey: 'from'
          }) +
          addressCard(ex.toAddress, ex.toUser, {
            label: incoming ? '我的收件地址' : '卡片拥有者 · 收件地址',
            icon: 'map-pin',
            addrKey: 'to'
          }) +
          '</div>';
      }
      return '<article class="f-ex" data-ex-id="' + esc(ex.id) + '" data-status="' + esc(status) + '" data-direction="' + esc(ex.direction || '') + '">' +
        '<div class="f-ex-side-card">' +
        '<a class="f-ex-thumb" href="/card/' + esc(card.id || '') + '" aria-label="查看卡片 ' + esc(card.title || '') + '">' +
        '<span style="aspect-ratio:' + esc(QSL.ratioCss(card.ratio || { w: 3, h: 2 })) + '">' +
        '<img src="' + esc(card.frontImage || QSL.PLACEHOLDER_IMAGE) + '" alt="" loading="lazy"></span>' +
        '<span class="f-ex-thumb-dir">' + ico(incoming ? 'inbox' : 'send', 15) + '</span>' +
        '</a>' +
        '<div class="f-ex-side-info">' +
        '<a class="f-ex-card-title" href="/card/' + esc(card.id || '') + '">' + esc(card.title || '未命名卡片') + '</a>' +
        '<span class="f-ex-card-meta">' +
        '<span class="f-ex-ratio">' + esc(QSL.ratioLabel(card.ratio || { w: 3, h: 2 })) + '</span></span>' +
        '<span class="f-ex-counterpart">' + ico(incoming ? 'user' : 'globe', 13) + (incoming ? '申请人' : '卡片拥有者') + '：' +
        esc(displayName(other)) + ' <b class="mono">' + esc(other.callSign || '') + '</b></span>' +
        '</div>' +
        '</div>' +
        '<div class="f-ex-main">' +
        '<div class="f-ex-head">' +
        '<div class="f-ex-user">' + QSL.avatar(other, 40) +
        '<div class="f-ex-user-info"><b>' + esc(displayName(other)) + '</b>' +
        '<span class="f-ex-user-sub"><b class="mono">' + esc(other.callSign || '—') + '</b> · @' + esc(other.username || '') + '</span></div>' +
        '</div>' +
        '<div class="f-ex-status">' + QSL.exchangeBadge(status) +
        '<time class="f-ex-time" datetime="' + esc(ex.createdAt || '') + '">' + esc(timeAgo(ex.createdAt)) + '</time></div>' +
        '</div>' +
        '<div class="f-ex-direction">' + ico(incoming ? 'inbox' : 'send', 14) + '<span>' + dirText + '</span>' +
        (ex.decidedAt ? '<span class="f-ex-decided">处理于 ' + esc(timeAgo(ex.decidedAt)) + '</span>' : '') + '</div>' +
        (ex.message ? '<p class="f-ex-message">' + ico('mail', 14) + '<span>' + esc(ex.message) + '</span></p>' : '') +
        (ex.rejectReason && (status === 'rejected' || status === 'cancelled')
          ? '<p class="f-ex-reject">' + ico('alert', 14) + '<span>拒绝理由：' + esc(ex.rejectReason) + '</span></p>'
          : '') +
        addressesHtml +
        actionButtons(ex) +
        '</div>' +
        '</article>';
    }

    function renderEmpty() {
      const isIncoming = state.box === 'incoming';
      if (state.status !== 'all') {
        const empty = QSL.emptyState({
          icon: 'search',
          title: '该状态下暂无申请',
          desc: '切换上方的状态筛选，查看其它申请记录。',
          actionLabel: '查看全部',
          onAction: () => {
            state.status = 'all';
            paintChrome();
            paintList();
            syncQuery();
          }
        });
        listEl.innerHTML = '';
        listEl.appendChild(empty);
        return;
      }
      const empty = QSL.emptyState({
        icon: isIncoming ? 'inbox' : 'send',
        title: isIncoming ? '还没有收到换卡申请' : '还没有发出换卡申请',
        desc: isIncoming
          ? '当其他火腿对你的卡片感兴趣时会在这里发起申请。先去广场看看，也多多上传自己的卡片吧。'
          : '去卡片广场挑选喜欢的卡片，点击「申请换卡」即可把电波里的相遇寄出去。',
        actionLabel: isIncoming ? '去卡片广场逛逛' : '去找喜欢的卡片',
        onAction: () => QSL.navigate('/explore')
      });
      listEl.innerHTML = '';
      listEl.appendChild(empty);
    }

    function paintList() {
      if (!state.alive) return;
      const visible = visibleItems();
      if (!visible.length) {
        renderEmpty();
        return;
      }
      listEl.innerHTML = visible.map(rowHtml).join('');
    }

    function setRowBusy(row, busy) {
      if (!row) return;
      row.classList.toggle('is-busy', !!busy);
      row.querySelectorAll('button').forEach((btn) => { if (btn.dataset.exAct !== 'copy-address') btn.disabled = !!busy; });
    }

    async function approveExchange(ex, row) {
      const ok = await QSL.confirm({
        title: '同意换卡申请',
        message: '同意与「' + personLabel(ex.fromUser) + '」交换卡片？同意后你们双方的寄送地址将互相可见。',
        confirmText: '同意交换',
        cancelText: '再想想'
      });
      if (!ok || !state.alive) return;
      setRowBusy(row, true);
      try {
        await QSL.api.exchanges.approve(ex.id);
        QSL.toast('已同意换卡申请，双方地址已解锁', 'success');
        if (QSL.fx && QSL.fx.confetti) {
          try { QSL.fx.confetti(); } catch (e) { /* ignore */ }
        }
        await load();
      } catch (err) {
        setRowBusy(row, false);
        QSL.toast((err && err.message) || '操作失败，请稍后重试', 'error');
      }
    }

    function rejectExchange(ex, row) {
      let rejectBusy = false;
      const modal = QSL.modal({
        title: '拒绝换卡申请',
        size: 'sm',
        content:
          '<p class="modal-text">来自「' + esc(personLabel(ex.fromUser)) + '」的换卡申请：' + esc((ex.card && ex.card.title) || '') + '</p>' +
          '<label class="f-modal-field"><span class="label">拒绝理由<span class="f-optional">选填</span></span>' +
          '<textarea class="textarea" data-reject-reason rows="3" maxlength="200" placeholder="例如：这张卡片暂时不互换，抱歉啦"></textarea>' +
          '<span class="f-counter" data-reject-counter>0 / 200</span></label>' +
          '<p class="f-modal-error" data-modal-error hidden></p>',
        actions: [
          { label: '取消', type: 'ghost' },
          {
            label: '确认拒绝', type: 'danger', closeOnClick: false,
            onClick: async (instance) => {
              if (rejectBusy) return false;
              rejectBusy = true;
              const btn = instance.el.querySelector('.modal-actions .btn-danger');
              const errorEl = instance.body.querySelector('[data-modal-error]');
              const reasonEl = instance.body.querySelector('[data-reject-reason]');
              if (errorEl) errorEl.hidden = true;
              QSL.setBusy(btn, true, '提交中');
              try {
                await QSL.api.exchanges.reject(ex.id, { reason: reasonEl ? reasonEl.value.trim() : '' });
                QSL.toast('已拒绝该换卡申请', 'info');
                instance.close();
                if (state.alive) load();
              } catch (err) {
                if (errorEl) {
                  errorEl.hidden = false;
                  errorEl.textContent = (err && err.message) || '操作失败，请稍后重试';
                }
                QSL.setBusy(btn, false);
                rejectBusy = false;
                return false;
              }
              return undefined;
            }
          }
        ]
      });
      const reasonEl = modal.body.querySelector('[data-reject-reason]');
      const counter = modal.body.querySelector('[data-reject-counter]');
      if (reasonEl && counter) {
        reasonEl.addEventListener('input', () => {
          counter.textContent = reasonEl.value.length + ' / 200';
        });
        setTimeout(() => {
          try { reasonEl.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }, 120);
      }
      void row;
    }

    async function cancelExchange(ex, row) {
      const ok = await QSL.confirm({
        title: '撤回换卡申请',
        message: '撤回后对方将看不到这条申请，你可以稍后重新申请。确定撤回吗？',
        confirmText: '撤回申请',
        cancelText: '保留申请',
        danger: true
      });
      if (!ok || !state.alive) return;
      setRowBusy(row, true);
      try {
        await QSL.api.exchanges.cancel(ex.id);
        QSL.toast('已撤回换卡申请', 'info');
        await load();
      } catch (err) {
        setRowBusy(row, false);
        QSL.toast((err && err.message) || '撤回失败，请稍后重试', 'error');
      }
    }

    async function completeExchange(ex, row) {
      const ok = await QSL.confirm({
        title: '标记换卡完成',
        message: '确认你与「' + personLabel(counterpartOf(ex)) + '」都已经寄出并收到卡片了吗？标记后将记录这段通联。',
        confirmText: '标记完成',
        cancelText: '还没完成'
      });
      if (!ok || !state.alive) return;
      setRowBusy(row, true);
      try {
        await QSL.api.exchanges.complete(ex.id);
        QSL.toast('已标记完成，感谢这次电波相遇', 'success');
        if (QSL.fx && QSL.fx.confetti) {
          try { QSL.fx.confetti(); } catch (e) { /* ignore */ }
        }
        await load();
      } catch (err) {
        setRowBusy(row, false);
        QSL.toast((err && err.message) || '操作失败，请稍后重试', 'error');
      }
    }

    function copyAddress(ex, addrKey, btn) {
      const address = addrKey === 'from' ? ex.fromAddress : ex.toAddress;
      if (!address) return;
      btn.disabled = true;
      QSL.copyText(formatAddress(address), '地址已复制，去寄卡片吧').finally(() => {
        btn.disabled = false;
      });
    }

    listEl.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-ex-act]');
      if (!btn) return;
      const row = btn.closest('[data-ex-id]');
      if (!row) return;
      const ex = state.items.find((item) => item.id === row.dataset.exId);
      if (!ex) return;
      const action = btn.dataset.exAct;
      if (action === 'approve') approveExchange(ex, row);
      else if (action === 'reject') rejectExchange(ex, row);
      else if (action === 'cancel') cancelExchange(ex, row);
      else if (action === 'complete') completeExchange(ex, row);
      else if (action === 'copy-address') copyAddress(ex, btn.dataset.addr, btn);
    });

    container.querySelectorAll('[data-box]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.box === btn.dataset.box) return;
        state.box = btn.dataset.box;
        paintChrome();
        paintList();
        animateListSwitch(state.box);
        syncQuery();
      });
    });

    container.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.status === btn.dataset.status) return;
        state.status = btn.dataset.status;
        paintChrome();
        paintList();
        syncQuery();
      });
    });

    function syncQuery() {
      QSL.setQuery({
        box: state.box === 'incoming' ? null : state.box,
        status: state.status === 'all' ? null : state.status
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (refreshBtn.disabled) return;
        refreshBtn.disabled = true;
        try {
          await load();
          QSL.toast('列表已刷新', 'info');
        } finally {
          refreshBtn.disabled = false;
        }
      });
    }

    async function load() {
      if (!state.alive || state.loading) return;
      state.loading = true;
      try {
        const data = await QSL.api.exchanges.mine();
        if (!state.alive) return;
        state.items = Array.isArray(data && data.items) ? data.items : [];
        state.counts = (data && data.counts) || {};
        paintChrome();
        paintList();
        if (state.items.length === 0) renderEmpty();
      } catch (err) {
        if (!state.alive) return;
        console.error('[exchanges] 加载失败', err);
        const empty = QSL.emptyState({
          icon: 'alert',
          title: '换卡申请加载失败',
          desc: (err && err.message) || '网络异常，请稍后重试',
          actionLabel: '重新加载',
          onAction: () => {
            listEl.innerHTML = QSL.skeletonRows(3);
            load();
          }
        });
        listEl.innerHTML = '';
        listEl.appendChild(empty);
        if (totalEl) totalEl.textContent = '加载失败';
        QSL.toast((err && err.message) || '加载失败', 'error');
      } finally {
        state.loading = false;
      }
    }

    paintChrome();
    load();
    return function cleanup() {
      state.alive = false;
      clearTimeout(switchTimer);
      if (tabsObserver) tabsObserver.disconnect();
    };
  }

  QSL.registerPage('exchanges', { title: '换卡申请', render: render });

  /* 跨模块接口：卡片详情/分享页调用 */
  QSL.exchangeRequest = {
    open(card) {
      try {
        openExchangeRequest(card);
      } catch (err) {
        console.error('[QSL.exchangeRequest]', err);
        QSL.toast('申请换卡面板打开失败，请刷新后重试', 'error');
      }
    }
  };
})();
