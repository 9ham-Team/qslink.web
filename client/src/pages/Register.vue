<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import AuthBrandVisualVue3 from '../components/AuthBrandVisual.vue';
import IconVue3 from '../components/Icon.vue';
import {
  focusFirstFieldErrorVue3,
  isAbortErrorVue3,
  normalizeFieldErrorsVue3,
  useAuthSessionVue3,
} from '../composables/use-auth-session';
import type { AuthServicesVue3, RegisterPayloadVue3 } from '../contracts';

const TERMS_VERSION = '2026-10-25';
const FIELD_ORDER = [
  'legalConsent',
  'username',
  'email',
  'emailCode',
  'displayName',
  'callSign',
  'password',
  'confirmPassword',
];

const props = defineProps<{
  nextRaw?: string | null;
  services: AuthServicesVue3;
}>();

const t = props.services.t;
const { busy, submitAuth, isDisposed } = useAuthSessionVue3(props.services);

const formRef = ref<HTMLFormElement | null>(null);
const usernameRef = ref<HTMLInputElement | null>(null);
const passwordRef = ref<HTMLInputElement | null>(null);
const confirmPasswordRef = ref<HTMLInputElement | null>(null);
const codeFeedbackRef = ref<HTMLDivElement | null>(null);
const codeFeedbackInnerRef = ref<HTMLDivElement | null>(null);

const form = reactive({
  username: '',
  email: '',
  emailCode: '',
  displayName: '',
  callSign: '',
  password: '',
  confirmPassword: '',
  legalConsent: false,
});

const fieldErrors = reactive<Record<string, string>>({
  username: '',
  email: '',
  emailCode: '',
  displayName: '',
  callSign: '',
  password: '',
  confirmPassword: '',
  legalConsent: '',
});

const alertMessage = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const emailValid = ref(false);
const emailState = ref<'' | 'valid' | 'error'>('');
const codeRevealOpen = ref(false);
const sendingCode = ref(false);
const cooldownRemaining = ref(0);
const codeStatus = ref('');

const reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const reducedMotion = ref(!!reducedMotionQuery?.matches);
const onMotionChange = (e: MediaQueryListEvent) => {
  reducedMotion.value = e.matches;
};
reducedMotionQuery?.addEventListener?.('change', onMotionChange);

const safeNext = computed(() => props.services.safeNext(props.nextRaw) || '');
const loginHref = computed(() => '/login' + (safeNext.value ? '?next=' + encodeURIComponent(safeNext.value) : ''));

const emailBadgeLabel = computed(() => {
  if (emailState.value === 'error' && fieldErrors.email) return fieldErrors.email;
  return t('邮箱格式正确');
});

const sendButtonText = computed(() => {
  if (sendingCode.value) return t('发送中…');
  if (cooldownRemaining.value > 0) return `${cooldownRemaining.value} ${t('秒后重发')}`;
  return t('发送验证码');
});

const sendButtonDisabled = computed(() => !emailValid.value || sendingCode.value || cooldownRemaining.value > 0);

const passwordScore = computed(() => {
  const value = form.password;
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Za-z]/.test(value) && /[0-9]/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(3, score);
});

const passwordStrengthText = computed(() => {
  if (!form.password) return t('密码强度');
  const labels = [t('太短'), t('较弱'), t('不错'), t('很强')];
  return t('密码强度：') + labels[passwordScore.value];
});

let emailTimer: ReturnType<typeof setTimeout> | null = null;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;
let focusTimer: ReturnType<typeof setTimeout> | null = null;
let emailSendAbort: AbortController | null = null;
let feedbackAnimation: Animation | null = null;
let emailRevision = 0;
let retryAt = 0;

function syncCooldown() {
  const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  cooldownRemaining.value = remaining;
  if (remaining === 0 && cooldownTimer !== null) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function startCooldown(seconds: number) {
  retryAt = Date.now() + seconds * 1000;
  if (cooldownTimer !== null) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    if (!isDisposed()) syncCooldown();
  }, 1000);
  syncCooldown();
}

const onVisibilityOrFocus = () => {
  if (!isDisposed() && retryAt > 0) syncCooldown();
};

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisibilityOrFocus);
    if (window.innerWidth >= 860) {
      focusTimer = setTimeout(() => {
        if (!isDisposed() && usernameRef.value && document.body.contains(usernameRef.value)) {
          usernameRef.value.focus({ preventScroll: true });
        }
      }, 60);
    }
  }
});

onUnmounted(() => {
  if (emailTimer !== null) clearTimeout(emailTimer);
  if (cooldownTimer !== null) clearInterval(cooldownTimer);
  if (focusTimer !== null) clearTimeout(focusTimer);
  emailSendAbort?.abort();
  emailSendAbort = null;
  feedbackAnimation?.cancel();
  feedbackAnimation = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityOrFocus);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onVisibilityOrFocus);
  }
  reducedMotionQuery?.removeEventListener?.('change', onMotionChange);
  form.password = '';
  form.confirmPassword = '';
  form.emailCode = '';
  showPassword.value = false;
  showConfirmPassword.value = false;
  alertMessage.value = '';
});

function emailError(value: string): string {
  if (!value) return t('请填写邮箱');
  if (value.length > 120) return t('邮箱不能超过 120 个字符');
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : t('邮箱格式不正确');
}

function setEmailFieldError(message: string) {
  fieldErrors.email = message;
  if (message) emailState.value = 'error';
  else if (emailValid.value) emailState.value = 'valid';
  else emailState.value = '';
}

async function showCodeFeedback(message: string, isError: boolean) {
  const feedbackEl = codeFeedbackRef.value;
  const previousHeight = feedbackEl ? feedbackEl.getBoundingClientRect().height : 0;
  if (feedbackAnimation) {
    feedbackAnimation.cancel();
    feedbackAnimation = null;
  }
  fieldErrors.emailCode = isError ? message : '';
  codeStatus.value = isError ? '' : message;
  await nextTick();
  if (isDisposed() || !feedbackEl) return;
  const nextHeight = message && codeFeedbackInnerRef.value ? codeFeedbackInnerRef.value.scrollHeight : 0;
  if (!reducedMotion.value && typeof feedbackEl.animate === 'function') {
    feedbackAnimation = feedbackEl.animate(
      [{ height: previousHeight + 'px' }, { height: nextHeight + 'px' }],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }
}

function validateEmail(showEmpty: boolean): boolean {
  if (emailTimer !== null) {
    clearTimeout(emailTimer);
    emailTimer = null;
  }
  const value = form.email.trim();
  const message = emailError(value);
  emailValid.value = !message;
  setEmailFieldError(value || showEmpty ? message : '');
  if (emailValid.value) {
    emailState.value = 'valid';
    codeRevealOpen.value = true;
  }
  return emailValid.value;
}

function onEmailInput() {
  emailRevision++;
  emailSendAbort?.abort();
  emailSendAbort = null;
  sendingCode.value = false;
  emailValid.value = false;
  emailState.value = '';
  fieldErrors.email = '';
  form.emailCode = '';
  void showCodeFeedback('', false);
  if (emailTimer !== null) clearTimeout(emailTimer);
  emailTimer = setTimeout(() => {
    if (!isDisposed()) validateEmail(false);
  }, 100);
}

function onEmailCodeInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const cleaned = target.value.replace(/\D/g, '').slice(0, 6);
  form.emailCode = cleaned;
  if (target.value !== cleaned) target.value = cleaned;
  void showCodeFeedback(codeStatus.value, false);
}

function onCallSignInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const pos = target.selectionStart;
  const upper = target.value.toUpperCase();
  form.callSign = upper;
  if (target.value !== upper) {
    target.value = upper;
    if (pos !== null) {
      try { target.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }
  }
  fieldErrors.callSign = '';
}

function togglePassword(which: 'password' | 'confirmPassword') {
  if (which === 'password') {
    showPassword.value = !showPassword.value;
    passwordRef.value?.focus({ preventScroll: true });
  } else {
    showConfirmPassword.value = !showConfirmPassword.value;
    confirmPasswordRef.value?.focus({ preventScroll: true });
  }
}

async function onSendCode() {
  if (isDisposed() || sendingCode.value) return;
  if (!validateEmail(true) || Date.now() < retryAt) return;

  const email = form.email.trim();
  const revision = emailRevision;
  emailSendAbort?.abort();
  const controller = new AbortController();
  emailSendAbort = controller;
  sendingCode.value = true;
  void showCodeFeedback('', false);

  try {
    await props.services.sendEmailCode(email, controller.signal);
    if (isDisposed() || revision !== emailRevision || form.email.trim() !== email) return;
    startCooldown(60);
    await showCodeFeedback(t('验证码已发送，请查收邮件（30 分钟内有效）。'), false);
  } catch (err: unknown) {
    if (isAbortErrorVue3(err) || isDisposed()) return;
    if (revision !== emailRevision || form.email.trim() !== email) return;
    const apiErr = err as { status?: number; message?: string; isNetwork?: boolean };
    if (apiErr && apiErr.status === 429) startCooldown(60);
    const message = apiErr && apiErr.isNetwork
      ? t('无法连接服务器，请确认服务已启动后重试')
      : (apiErr && apiErr.message) || t('验证码发送失败，请稍后重试');
    await showCodeFeedback(message, true);
  } finally {
    if (emailSendAbort === controller) emailSendAbort = null;
    if (!isDisposed() && revision === emailRevision) sendingCode.value = false;
  }
}

function clearFieldErrors() {
  for (const key of Object.keys(fieldErrors)) fieldErrors[key] = '';
  if (emailValid.value) emailState.value = 'valid';
  else emailState.value = '';
}

function validate(values: {
  username: string;
  email: string;
  emailCode: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  callSign: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.legalConsent) errors.legalConsent = t('请阅读并同意用户条款，确认已阅读隐私说明');
  if (!values.username) errors.username = t('请填写用户名');
  else if (!/^[A-Za-z0-9_]{3,20}$/.test(values.username)) errors.username = t('用户名需为 3-20 位字母、数字或下划线');
  const emailMsg = emailError(values.email);
  if (emailMsg) errors.email = emailMsg;
  if (!values.emailCode) errors.emailCode = t('请填写邮箱验证码');
  else if (!/^\d{6}$/.test(values.emailCode)) errors.emailCode = t('验证码需为 6 位数字');
  if (values.displayName && Array.from(values.displayName).length > 30) errors.displayName = t('昵称不能超过 30 个字符');
  if (values.callSign && Array.from(values.callSign).length > 20) errors.callSign = t('呼号不能超过 20 个字符');
  if (!values.password) errors.password = t('请设置密码');
  else if (Array.from(values.password).length < 8) errors.password = t('密码至少 8 位');
  else if (Array.from(values.password).length > 200) errors.password = t('密码不能超过 200 位');
  else if (!/[A-Za-z]/.test(values.password) || !/[0-9]/.test(values.password)) errors.password = t('密码需同时包含字母与数字');
  if (!values.confirmPassword) errors.confirmPassword = t('请再次输入密码');
  else if (values.confirmPassword !== values.password) errors.confirmPassword = t('两次输入的密码不一致');
  return errors;
}

function applyErrors(errors: Record<string, string>) {
  for (const key of Object.keys(errors)) {
    if (key in fieldErrors) fieldErrors[key] = errors[key];
  }
  if (errors.email) emailState.value = 'error';
  if (errors.emailCode) void showCodeFeedback(errors.emailCode, true);
}

async function onSubmit() {
  if (isDisposed() || busy.value) return;
  alertMessage.value = '';
  clearFieldErrors();
  validateEmail(true);

  const values = {
    username: form.username.trim(),
    email: form.email.trim(),
    emailCode: form.emailCode.trim(),
    password: form.password,
    confirmPassword: form.confirmPassword,
    displayName: form.displayName.trim(),
    callSign: form.callSign.trim().toUpperCase(),
  };

  const errors = validate(values);
  if (Object.keys(errors).length > 0) {
    applyErrors(errors);
    focusFirstFieldErrorVue3(formRef.value, FIELD_ORDER, errors, reducedMotion.value);
    return;
  }

  const payload: RegisterPayloadVue3 = {
    acceptTerms: true,
    termsVersion: TERMS_VERSION,
    username: values.username,
    email: values.email,
    emailCode: values.emailCode,
    password: values.password,
  };
  if (values.displayName) payload.displayName = values.displayName;
  if (values.callSign) payload.callSign = values.callSign;

  try {
    const outcome = await submitAuth(signal => props.services.register(payload, signal));
    if (outcome.status !== 'ok') return;
    props.services.toast(t('注册成功，欢迎加入 QSLink！'), 'success');
    props.services.navigate(safeNext.value || '/dashboard');
  } catch (err: unknown) {
    if (isDisposed()) return;
    const apiErr = err as { status?: number; code?: string; message?: string; fields?: Record<string, string>; isNetwork?: boolean };
    if (apiErr && apiErr.fields) {
      const normalized = normalizeFieldErrorsVue3(apiErr.fields);
      applyErrors(normalized);
      focusFirstFieldErrorVue3(formRef.value, FIELD_ORDER, normalized, reducedMotion.value);
    }
    let message = '';
    if (apiErr && apiErr.code === 'USERNAME_TAKEN') message = t('该用户名已被占用，换一个试试');
    else if (apiErr && apiErr.code === 'EMAIL_TAKEN') message = t('该邮箱已被注册，可直接登录');
    else if (apiErr && apiErr.isNetwork) message = t('无法连接服务器，请确认服务已启动后重试');
    else if (!apiErr || !apiErr.fields || !Object.keys(apiErr.fields).length) {
      message = (apiErr && apiErr.message) || t('注册失败，请稍后重试');
    }
    alertMessage.value = message;
    if (apiErr && !apiErr.isNetwork && ![400, 409, 429].includes(apiErr.status ?? 0)) {
      console.error('[register]', err);
    }
  }
}
</script>

<template>
  <section class="f-auth-page f-auth-page-reg" aria-labelledby="fRegTitle">
    <div class="container f-auth f-auth-wide">
      <AuthBrandVisualVue3 mode="register" :t="t" />

      <div class="f-auth-panel">
        <form ref="formRef" class="f-auth-card glass f-auth-card-reg" id="fRegisterForm" novalidate @submit.prevent="onSubmit">
          <div class="f-auth-card-head">
            <span class="f-auth-chip"><IconVue3 name="sparkles" :size="15" /> CREATE ACCOUNT</span>
            <h2 id="fRegTitle">{{ t('加入 QSLink') }}</h2>
            <p>{{ t('创建你的账号，开始收集与交换 QSL 卡片。') }}</p>
          </div>

          <div class="f-form-alert" role="alert" :hidden="!alertMessage">
            <template v-if="alertMessage">
              <span class="f-alert-ico"><IconVue3 name="alert" :size="18" /></span>
              <span>{{ alertMessage }}</span>
            </template>
          </div>

          <div class="f-form-grid f-form-grid-2">
            <div class="f-field" :class="{ 'has-error': !!fieldErrors.username }" data-field="username">
              <div class="f-field-row">
                <label class="label" for="fRegUsername">{{ t('用户名') }}</label>
              </div>
              <div class="f-input-wrap">
                <span class="f-input-ico"><IconVue3 name="user" :size="18" /></span>
                <input
                  id="fRegUsername"
                  ref="usernameRef"
                  v-model="form.username"
                  class="input f-input f-input-has-ico"
                  name="username"
                  type="text"
                  :placeholder="t('3-20 位字母/数字/下划线')"
                  autocomplete="username"
                  maxlength="20"
                  required
                  :aria-invalid="fieldErrors.username ? 'true' : 'false'"
                  @input="fieldErrors.username = ''"
                />
              </div>
              <p class="f-error" data-error="username" role="alert" :hidden="!fieldErrors.username">{{ fieldErrors.username }}</p>
            </div>

            <div class="f-field" data-field="email">
              <div class="f-field-row">
                <label class="label" for="fRegEmail">{{ t('邮箱') }}</label>
              </div>
              <div class="f-input-wrap" :class="{ 'is-valid': emailValid, 'has-error': !!fieldErrors.email }">
                <span class="f-input-ico"><IconVue3 name="mail" :size="18" /></span>
                <input
                  id="fRegEmail"
                  v-model="form.email"
                  class="input f-input f-input-has-ico"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autocomplete="email"
                  aria-describedby="fRegEmailError"
                  inputmode="email"
                  maxlength="120"
                  required
                  :aria-invalid="fieldErrors.email ? 'true' : 'false'"
                  @input="onEmailInput"
                />
                <span
                  class="f-reg-email-check"
                  :class="{ 'is-visible': !!emailState, 'is-error': emailState === 'error' }"
                  role="img"
                  :aria-label="emailBadgeLabel"
                  :aria-hidden="emailState ? 'false' : 'true'"
                  :title="emailBadgeLabel"
                >
                  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                    <circle cx="10" cy="10" r="9" fill="currentColor" />
                    <g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path class="f-reg-email-tick" d="m6 10 2.5 2.5 5-5" />
                      <path class="f-reg-email-cross" d="m7 7 6 6m0-6-6 6" />
                    </g>
                  </svg>
                </span>
              </div>
              <p id="fRegEmailError" class="f-error" data-error="email" role="alert" :hidden="!fieldErrors.email">{{ fieldErrors.email }}</p>

              <div
                class="f-reg-code-reveal"
                :class="{ 'is-open': codeRevealOpen }"
                :aria-hidden="codeRevealOpen ? 'false' : 'true'"
                :inert="!codeRevealOpen"
              >
                <div class="f-reg-code-inner">
                  <div class="f-field" :class="{ 'has-error': !!fieldErrors.emailCode }" data-field="emailCode">
                    <label class="label" for="fRegEmailCode">{{ t('邮箱验证码') }}</label>
                    <div class="f-reg-code-row">
                      <input
                        id="fRegEmailCode"
                        :value="form.emailCode"
                        class="input f-input"
                        name="emailCode"
                        type="text"
                        :placeholder="t('6 位数字')"
                        maxlength="6"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        required
                        aria-describedby="fRegCodeStatus"
                        :aria-invalid="fieldErrors.emailCode ? 'true' : 'false'"
                        @input="onEmailCodeInput"
                      />
                      <button
                        type="button"
                        class="btn f-reg-code-send"
                        :disabled="sendButtonDisabled"
                        :aria-busy="sendingCode ? 'true' : 'false'"
                        @click="onSendCode"
                      >
                        {{ sendButtonText }}
                      </button>
                    </div>
                    <div ref="codeFeedbackRef" class="f-reg-code-feedback">
                      <div ref="codeFeedbackInnerRef" class="f-reg-code-feedback-inner">
                        <p class="f-error" data-error="emailCode" role="alert" :hidden="!fieldErrors.emailCode">{{ fieldErrors.emailCode }}</p>
                        <p class="f-reg-code-status" id="fRegCodeStatus" role="status" aria-live="polite">{{ codeStatus }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="f-field" :class="{ 'has-error': !!fieldErrors.displayName }" data-field="displayName">
              <div class="f-field-row">
                <label class="label" for="fRegDisplayName">{{ t('昵称') }}<span class="f-optional">{{ t('选填') }}</span></label>
              </div>
              <div class="f-input-wrap">
                <span class="f-input-ico"><IconVue3 name="sparkles" :size="18" /></span>
                <input
                  id="fRegDisplayName"
                  v-model="form.displayName"
                  class="input f-input f-input-has-ico"
                  name="displayName"
                  type="text"
                  :placeholder="t('展示给其他火腿的名字')"
                  autocomplete="nickname"
                  :aria-invalid="fieldErrors.displayName ? 'true' : 'false'"
                  @input="fieldErrors.displayName = ''"
                />
              </div>
              <p class="f-error" data-error="displayName" role="alert" :hidden="!fieldErrors.displayName">{{ fieldErrors.displayName }}</p>
            </div>

            <div class="f-field" :class="{ 'has-error': !!fieldErrors.callSign }" data-field="callSign">
              <div class="f-field-row">
                <label class="label" for="fRegCallSign">{{ t('呼号') }}<span class="f-optional">{{ t('选填') }}</span></label>
                <span class="f-label-hint">{{ t('大写字母+数字') }}</span>
              </div>
              <div class="f-input-wrap">
                <span class="f-input-ico"><IconVue3 name="radio" :size="18" /></span>
                <input
                  id="fRegCallSign"
                  :value="form.callSign"
                  class="input f-input f-input-has-ico"
                  name="callSign"
                  type="text"
                  placeholder=""
                  autocomplete="off"
                  maxlength="20"
                  :aria-invalid="fieldErrors.callSign ? 'true' : 'false'"
                  @input="onCallSignInput"
                />
              </div>
              <p class="f-error" data-error="callSign" role="alert" :hidden="!fieldErrors.callSign">{{ fieldErrors.callSign }}</p>
            </div>
          </div>

          <div class="f-form-grid f-form-grid-2">
            <div class="f-field" :class="{ 'has-error': !!fieldErrors.password }" data-field="password">
              <div class="f-field-row">
                <label class="label" for="fRegPassword">{{ t('密码') }}</label>
              </div>
              <div class="f-input-wrap">
                <span class="f-input-ico"><IconVue3 name="lock" :size="18" /></span>
                <input
                  id="fRegPassword"
                  ref="passwordRef"
                  v-model="form.password"
                  class="input f-input f-input-has-ico f-input-has-eye"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('至少 8 位，含字母与数字')"
                  autocomplete="new-password"
                  required
                  :aria-invalid="fieldErrors.password ? 'true' : 'false'"
                  @input="fieldErrors.password = ''"
                />
                <button
                  type="button"
                  class="f-eye"
                  :class="{ 'is-on': showPassword }"
                  :aria-label="showPassword ? t('隐藏密码') : t('显示密码')"
                  :aria-pressed="showPassword ? 'true' : 'false'"
                  data-eye
                  @click="togglePassword('password')"
                >
                  <IconVue3 name="eye" :size="18" />
                </button>
              </div>
              <p class="f-error" data-error="password" role="alert" :hidden="!fieldErrors.password">{{ fieldErrors.password }}</p>
            </div>

            <div class="f-field" :class="{ 'has-error': !!fieldErrors.confirmPassword }" data-field="confirmPassword">
              <div class="f-field-row">
                <label class="label" for="fRegConfirm">{{ t('确认密码') }}</label>
              </div>
              <div class="f-input-wrap">
                <span class="f-input-ico"><IconVue3 name="lock" :size="18" /></span>
                <input
                  id="fRegConfirm"
                  ref="confirmPasswordRef"
                  v-model="form.confirmPassword"
                  class="input f-input f-input-has-ico f-input-has-eye"
                  name="confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  :placeholder="t('再次输入密码')"
                  autocomplete="new-password"
                  required
                  :aria-invalid="fieldErrors.confirmPassword ? 'true' : 'false'"
                  @input="fieldErrors.confirmPassword = ''"
                />
                <button
                  type="button"
                  class="f-eye"
                  :class="{ 'is-on': showConfirmPassword }"
                  :aria-label="showConfirmPassword ? t('隐藏密码') : t('显示密码')"
                  :aria-pressed="showConfirmPassword ? 'true' : 'false'"
                  data-eye
                  @click="togglePassword('confirmPassword')"
                >
                  <IconVue3 name="eye" :size="18" />
                </button>
              </div>
              <p class="f-error" data-error="confirmPassword" role="alert" :hidden="!fieldErrors.confirmPassword">{{ fieldErrors.confirmPassword }}</p>
            </div>
          </div>

          <div class="f-strength" data-strength :data-level="passwordScore" :hidden="!form.password" aria-hidden="true">
            <span v-for="bar in 3" :key="bar" class="f-strength-bar">
              <i :class="{ 'is-on': bar - 1 < Math.max(1, passwordScore) }"></i>
            </span>
            <span class="f-strength-text">{{ passwordStrengthText }}</span>
          </div>

          <div class="f-field" :class="{ 'has-error': !!fieldErrors.legalConsent }" data-field="legalConsent">
            <label class="f-consent">
              <input
                v-model="form.legalConsent"
                type="checkbox"
                name="legalConsent"
                required
                :aria-invalid="fieldErrors.legalConsent ? 'true' : 'false'"
                @change="fieldErrors.legalConsent = ''"
              />
              <span>
                {{ t('我已阅读并同意') }}<a href="/legal/terms.html" target="_blank" rel="noopener">{{ t('用户条款') }}</a>{{ t('，并已阅读') }}<a href="/legal/privacy.html" target="_blank" rel="noopener">{{ t('隐私说明') }}</a>。
              </span>
            </label>
            <p class="f-error" role="alert" :hidden="!fieldErrors.legalConsent">{{ fieldErrors.legalConsent }}</p>
          </div>

          <button
            class="btn btn-primary btn-lg f-submit"
            :class="{ 'f-loading': busy }"
            type="submit"
            :disabled="busy"
          >
            <span class="f-btn-label">{{ busy ? t('创建中…') : t('创建账号') }}</span>
            <IconVue3 name="arrow-right" :size="18" />
          </button>

          <p class="f-auth-alt">
            {{ t('已经有账号了？') }}<a class="f-link" :href="loginHref">{{ t('直接登录') }}</a>
          </p>
        </form>

        <p class="f-auth-legal">
          <IconVue3 name="shield" :size="14" /> {{ t('请保护收件信息，上传卡片时需另行确认内容授权。') }}
        </p>
      </div>
    </div>
  </section>
</template>
