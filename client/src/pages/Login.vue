<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import AuthBrandVisualVue3 from '../components/AuthBrandVisual.vue';
import IconVue3 from '../components/Icon.vue';
import {
  focusFirstFieldErrorVue3,
  normalizeFieldErrorsVue3,
  useAuthSessionVue3,
} from '../composables/use-auth-session';
import type { AuthServicesVue3, DemoAccountVue3 } from '../contracts';

const props = defineProps<{
  nextRaw?: string | null;
  services: AuthServicesVue3;
}>();

const t = props.services.t;
const { busy, submitAuth, isDisposed } = useAuthSessionVue3(props.services);

const formRef = ref<HTMLFormElement | null>(null);
const identifierRef = ref<HTMLInputElement | null>(null);
const passwordRef = ref<HTMLInputElement | null>(null);
const submitRef = ref<HTMLButtonElement | null>(null);

const form = reactive({
  identifier: '',
  password: '',
});
const fieldErrors = reactive<{ identifier: string; password: string }>({
  identifier: '',
  password: '',
});
const alertMessage = ref('');
const showPassword = ref(false);
const activeDemoId = ref('');
const pulseIdentifier = ref(false);

const reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const reducedMotion = ref(!!reducedMotionQuery?.matches);
const onMotionChange = (e: MediaQueryListEvent) => {
  reducedMotion.value = e.matches;
};
reducedMotionQuery?.addEventListener?.('change', onMotionChange);

const safeNext = computed(() => props.services.safeNext(props.nextRaw) || '');
const registerHref = computed(() => '/register' + (safeNext.value ? '?next=' + encodeURIComponent(safeNext.value) : ''));
const resetHref = computed(() => '/password-reset' + (safeNext.value ? '?next=' + encodeURIComponent(safeNext.value) : ''));
const config = computed(() => props.services.config());
const demoAccounts = computed(() => (config.value.demo ? config.value.demoAccounts || [] : []));

let focusTimer: ReturnType<typeof setTimeout> | null = null;
let pulseTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  if (typeof window !== 'undefined' && window.innerWidth >= 860) {
    focusTimer = setTimeout(() => {
      if (!isDisposed() && identifierRef.value && document.body.contains(identifierRef.value)) {
        identifierRef.value.focus({ preventScroll: true });
      }
    }, 60);
  }
});

onUnmounted(() => {
  if (focusTimer !== null) clearTimeout(focusTimer);
  if (pulseTimer !== null) clearTimeout(pulseTimer);
  reducedMotionQuery?.removeEventListener?.('change', onMotionChange);
  form.identifier = '';
  form.password = '';
  showPassword.value = false;
  alertMessage.value = '';
});

function clearFieldErrors() {
  fieldErrors.identifier = '';
  fieldErrors.password = '';
}

function onIdentifierInput() {
  fieldErrors.identifier = '';
  activeDemoId.value = '';
}

function onPasswordInput() {
  fieldErrors.password = '';
}

function togglePassword() {
  showPassword.value = !showPassword.value;
  passwordRef.value?.focus({ preventScroll: true });
}

function fillDemo(acc: DemoAccountVue3) {
  form.identifier = acc.id;
  form.password = acc.pass;
  clearFieldErrors();
  alertMessage.value = '';
  activeDemoId.value = acc.id;
  if (!reducedMotion.value) {
    if (pulseTimer !== null) clearTimeout(pulseTimer);
    pulseIdentifier.value = true;
    pulseTimer = setTimeout(() => {
      pulseIdentifier.value = false;
      pulseTimer = null;
    }, 700);
  }
  submitRef.value?.focus({ preventScroll: true });
  props.services.toast(t('已填入演示账号「') + acc.id + t('」，点击登录即可'), 'info');
}

function validate(identifier: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!identifier) errors.identifier = t('请输入用户名或邮箱');
  else if (identifier.length > 120) errors.identifier = t('用户名或邮箱过长');
  if (!password) errors.password = t('请输入密码');
  else if (Array.from(password).length > 200) errors.password = t('密码过长');
  return errors;
}

async function onSubmit() {
  if (busy.value || isDisposed()) return;
  alertMessage.value = '';
  clearFieldErrors();

  const identifier = form.identifier.trim();
  const password = form.password;
  const errors = validate(identifier, password);
  if (Object.keys(errors).length > 0) {
    fieldErrors.identifier = errors.identifier || '';
    fieldErrors.password = errors.password || '';
    focusFirstFieldErrorVue3(formRef.value, ['identifier', 'password'], errors, reducedMotion.value);
    return;
  }

  try {
    const outcome = await submitAuth(signal => props.services.login({ identifier, password }, signal));
    if (outcome.status !== 'ok') return;
    const name = outcome.user?.displayName || outcome.user?.username || identifier;
    props.services.toast(t('欢迎回来，') + name + '！', 'success');
    props.services.navigate(safeNext.value || '/');
  } catch (err: unknown) {
    if (isDisposed()) return;
    const apiErr = err as { status?: number; code?: string; message?: string; fields?: Record<string, string>; isNetwork?: boolean };
    if (apiErr && apiErr.fields) {
      const normalized = normalizeFieldErrorsVue3(apiErr.fields);
      fieldErrors.identifier = normalized.identifier || '';
      fieldErrors.password = normalized.password || '';
      focusFirstFieldErrorVue3(formRef.value, ['identifier', 'password'], normalized, reducedMotion.value);
    }
    let message = '';
    if (apiErr && apiErr.code === 'INVALID_CREDENTIALS') message = t('用户名/邮箱或密码不正确，请检查后重试');
    else if (apiErr && apiErr.code === 'BANNED') message = t('该账号已被禁用，请联系站点管理员');
    else if (apiErr && apiErr.isNetwork) message = t('无法连接服务器，请确认服务已启动后重试');
    else if (!apiErr || !apiErr.fields || !Object.keys(apiErr.fields).length) {
      message = (apiErr && apiErr.message) || t('登录失败，请稍后重试');
    }
    alertMessage.value = message;
    if (apiErr && !apiErr.isNetwork && ![400, 401, 403, 429].includes(apiErr.status ?? 0)) {
      console.error('[login]', err);
    }
  }
}
</script>

<template>
  <section class="f-auth-page" aria-labelledby="fLoginTitle">
    <div class="container f-auth">
      <AuthBrandVisualVue3 mode="login" :t="t" />

      <div class="f-auth-panel">
        <form ref="formRef" class="f-auth-card glass" id="fLoginForm" novalidate @submit.prevent="onSubmit">
          <div class="f-auth-card-head">
            <span class="f-auth-chip"><IconVue3 name="radio" :size="15" /> MEMBER LOGIN</span>
            <h2 id="fLoginTitle">{{ t('欢迎回来') }}</h2>
            <p>{{ t('登录后即可管理卡片、处理换卡申请。') }}</p>
          </div>

          <div class="f-form-alert is-error" role="alert" :hidden="!alertMessage">
            <template v-if="alertMessage">
              <span class="f-alert-ico"><IconVue3 name="alert" :size="18" /></span>
              <span>{{ alertMessage }}</span>
            </template>
          </div>

          <div class="f-field" :class="{ 'has-error': !!fieldErrors.identifier }" data-field="identifier">
            <div class="f-field-row">
              <label class="label" for="fLoginIdentifier">{{ t('用户名或邮箱') }}</label>
            </div>
            <div class="f-input-wrap">
              <span class="f-input-ico"><IconVue3 name="user" :size="18" /></span>
              <input
                id="fLoginIdentifier"
                ref="identifierRef"
                v-model="form.identifier"
                class="input f-input f-input-has-ico"
                :class="{ 'f-pulse-once': pulseIdentifier }"
                name="identifier"
                type="text"
                :placeholder="t('用户名或 you@example.com')"
                autocomplete="username"
                maxlength="120"
                required
                :aria-invalid="fieldErrors.identifier ? 'true' : 'false'"
                @input="onIdentifierInput"
              />
            </div>
            <p class="f-error" data-error="identifier" role="alert" :hidden="!fieldErrors.identifier">{{ fieldErrors.identifier }}</p>
          </div>

          <div class="f-field" :class="{ 'has-error': !!fieldErrors.password }" data-field="password">
            <div class="f-field-row">
              <label class="label" for="fLoginPassword">{{ t('密码') }}</label>
              <a class="f-link" :href="resetHref">{{ t('忘记密码？') }}</a>
            </div>
            <div class="f-input-wrap">
              <span class="f-input-ico"><IconVue3 name="lock" :size="18" /></span>
              <input
                id="fLoginPassword"
                ref="passwordRef"
                v-model="form.password"
                class="input f-input f-input-has-ico f-input-has-eye"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="t('输入登录密码')"
                autocomplete="current-password"
                required
                :aria-invalid="fieldErrors.password ? 'true' : 'false'"
                @input="onPasswordInput"
              />
              <button
                type="button"
                class="f-eye"
                :class="{ 'is-on': showPassword }"
                :aria-label="showPassword ? t('隐藏密码') : t('显示密码')"
                :aria-pressed="showPassword ? 'true' : 'false'"
                data-eye
                @click="togglePassword"
              >
                <IconVue3 name="eye" :size="18" />
              </button>
            </div>
            <p class="f-error" data-error="password" role="alert" :hidden="!fieldErrors.password">{{ fieldErrors.password }}</p>
          </div>

          <button
            ref="submitRef"
            class="btn btn-primary btn-lg f-submit"
            :class="{ 'f-loading': busy }"
            type="submit"
            :disabled="busy"
          >
            <span class="f-btn-label">{{ busy ? t('登录中…') : t('登录') }}</span>
            <IconVue3 name="arrow-right" :size="18" />
          </button>

          <div v-if="demoAccounts.length > 0" class="f-demo">
            <div class="f-demo-head">
              <span class="f-demo-tag">{{ t('演示账号') }}</span>
              <span class="f-demo-tip">{{ t('点击一键填入，无需注册') }}</span>
            </div>
            <div class="f-demo-list">
              <button
                v-for="acc in demoAccounts"
                :key="acc.id"
                type="button"
                class="f-demo-item"
                :class="{ 'is-active': activeDemoId === acc.id }"
                :data-demo-user="acc.id"
                @click="fillDemo(acc)"
              >
                <span class="f-demo-ava" style="--f-ava:#0eaf8f">{{ acc.callSign.slice(0, 2) }}</span>
                <span class="f-demo-info">
                  <b>{{ acc.id }}</b>
                  <span>{{ acc.name }} · {{ acc.role }}</span>
                </span>
                <span class="f-demo-fill">{{ t('填入') }}<IconVue3 name="arrow-right" :size="14" /></span>
              </button>
            </div>
          </div>

          <p class="f-auth-alt">
            {{ t('还没有账号？') }}<a class="f-link" :href="registerHref">{{ t('立即注册') }}</a>
          </p>
        </form>

        <p class="f-auth-legal">
          <IconVue3 name="shield" :size="14" /> {{ t('登录即代表你同意以真实身份参与卡片交换') }}
        </p>
      </div>
    </div>
  </section>
</template>
