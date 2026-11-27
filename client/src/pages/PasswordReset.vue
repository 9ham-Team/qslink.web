<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import AuthBrandVisualVue3 from '../components/AuthBrandVisual.vue';
import type { AuthServicesVue3 } from '../contracts';

const props = defineProps<{ services: AuthServicesVue3; nextRaw: string | null }>();
const t = props.services.t;
const loginHref = computed(() => {
  const next = props.services.safeNext(props.nextRaw);
  return '/login' + (next ? '?next=' + encodeURIComponent(next) : '');
});
const email = ref(''), emailCode = ref(''), newPassword = ref(''), confirmPassword = ref('');
const emailInput = ref<HTMLInputElement | null>(null);
const busy = ref<'send' | 'reset' | ''>(''), error = ref(''), notice = ref(''), seconds = ref(0);
const controller = new AbortController();
let timer: ReturnType<typeof setInterval> | undefined;

function cooldown(duration: number) {
  const deadline = Date.now() + duration * 1000;
  clearInterval(timer);
  const tick = () => {
    seconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (!seconds.value) clearInterval(timer);
  };
  tick();
  timer = setInterval(tick, 1000);
}

async function send() {
  if (busy.value || seconds.value || !emailInput.value?.reportValidity()) return;
  busy.value = 'send';
  error.value = ''; notice.value = '';
  try {
    const result = await props.services.sendPasswordResetCode(email.value.trim(), controller.signal);
    if (controller.signal.aborted) return;
    emailCode.value = '';
    cooldown(result.retryAfter || 60);
    notice.value = t('如果该邮箱可用于找回密码，你将收到验证码。请检查收件箱及垃圾邮件。');
  } catch (err) {
    if (!controller.signal.aborted) error.value = (err as Error).message || t('验证码邮件暂时无法发送，请稍后重试');
  } finally {
    busy.value = '';
  }
}

async function reset() {
  if (busy.value) return;
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('两次输入的密码不一致');
    return;
  }
  busy.value = 'reset';
  try {
    await props.services.resetPassword({
      email: email.value.trim(), emailCode: emailCode.value.trim(), newPassword: newPassword.value,
    }, controller.signal);
    if (controller.signal.aborted) return;
    props.services.toast(t('密码已重设，请使用新密码登录。'), 'success');
    props.services.navigate(loginHref.value, { replace: true });
  } catch (err) {
    const failure = err as Error & { fields?: Record<string, string> };
    if (!controller.signal.aborted) error.value = failure.fields?.newPassword || failure.fields?.email || failure.message || t('重设密码失败，请重试');
  } finally {
    busy.value = '';
  }
}

onBeforeUnmount(() => { controller.abort(); clearInterval(timer); });
</script>

<template>
  <section class="f-auth-page" aria-labelledby="password-reset-title">
    <div class="container f-auth">
      <AuthBrandVisualVue3 mode="login" :t="t" />
      <div class="f-auth-panel">
        <form class="f-auth-card glass" @submit.prevent="reset">
          <div class="f-auth-card-head">
            <h1 id="password-reset-title">{{ t('找回密码') }}</h1>
            <p>{{ t('使用注册邮箱的验证码重设密码。') }}</p>
          </div>
          <fieldset class="reset-fields" :disabled="!!busy">
            <div class="f-field">
              <label for="password-reset-email">{{ t('注册邮箱') }}</label>
              <input id="password-reset-email" ref="emailInput" v-model.trim="email" class="input" name="email" type="email" autocomplete="email" maxlength="254" required @input="emailCode = ''; notice = ''">
            </div>
            <div class="f-field">
              <label for="password-reset-code">{{ t('邮箱验证码') }}</label>
              <div class="reset-code-row">
                <input id="password-reset-code" v-model.trim="emailCode" class="input" name="emailCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
                <button class="btn btn-ghost" type="button" :disabled="seconds > 0" @click="send">
                  {{ seconds ? t('{n} 秒后重发', { n: seconds }) : t(busy === 'send' ? '正在发送…' : '获取验证码') }}
                </button>
              </div>
            </div>
            <p v-if="notice" class="muted" role="status">{{ notice }}</p>
            <div class="f-field">
              <label for="password-reset-new">{{ t('新密码') }}</label>
              <input id="password-reset-new" v-model="newPassword" class="input" name="newPassword" type="password" autocomplete="new-password" minlength="8" required aria-describedby="password-reset-hint">
              <small id="password-reset-hint" class="muted">{{ t('密码至少 8 位，需同时包含字母和数字。') }}</small>
            </div>
            <div class="f-field">
              <label for="password-reset-confirm">{{ t('确认新密码') }}</label>
              <input id="password-reset-confirm" v-model="confirmPassword" class="input" name="confirmPassword" type="password" autocomplete="new-password" required>
            </div>
            <p v-if="error" class="f-form-alert is-error" role="alert">{{ error }}</p>
            <button class="btn btn-primary" type="submit">{{ t(busy === 'reset' ? '正在重设…' : '重设密码') }}</button>
          </fieldset>
          <p class="f-auth-alt"><a class="f-link" :href="loginHref">{{ t('返回登录') }}</a></p>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reset-fields { display: grid; gap: 14px; margin: 0; padding: 0; border: 0; min-inline-size: 0; }
.reset-code-row { display: flex; align-items: center; gap: 8px; }
.reset-code-row input { min-width: 0; }
.reset-code-row button { flex: none; }
</style>
