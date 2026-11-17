<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import AvatarVue3 from '../components/Avatar.vue';
import IconVue3 from '../components/Icon.vue';
import { useScrollRevealVue3 } from '../composables/use-scroll-reveal';
import type {
  AccountServicesVue3,
  OverviewStatsVue3,
  PublicUserVue3,
  SelfUserVue3,
} from '../contracts';
import {
  addressCityVue3,
  applyParsedAddressVue3,
  mapAccountFieldErrorsVue3,
  parseShippingAddressVue3,
  PROFILE_LIMITS_VUE3,
  unicodeLengthVue3,
  validateAddressDraftVue3,
  validatePasswordDraftVue3,
  validateProfileDraftVue3,
  type AddressDraftVue3,
  type PasswordDraftVue3,
  type ProfileDraftVue3,
} from '../profile-utils';

const props = defineProps<{ services: AccountServicesVue3 }>();
const rootRef = ref<HTMLElement>();
const { scan } = useScrollRevealVue3(rootRef);

let disposed = false;
let authEpoch = 0;
let applyingSelfUser = false;
let writeEpoch = 0;
let profileWriteChain: Promise<void> = Promise.resolve();
let overviewAbort: AbortController | null = null;
let profileWriteAbort: AbortController | null = null;
let passwordAbort: AbortController | null = null;

const initialUser = props.services.user() as SelfUserVue3 | null;
const initialUserId = initialUser?.id || null;
const initialToken = props.services.token();

const avatarColors = props.services.avatarColors();
const summaryUser = ref<SelfUserVue3 | null>(initialUser);
const overviewStats = ref<OverviewStatsVue3 | null>(null);

// 1. Basic profile state
const profileDraft = reactive<ProfileDraftVue3>({
  displayName: initialUser?.displayName || initialUser?.username || '',
  callSign: initialUser?.callSign || '',
  bio: initialUser?.bio || '',
  avatarColor: initialUser?.avatarColor || '#0eaf8f',
});
const profileDirty = ref(false);
let profileEditVersion = 0;
const profileSaving = ref(false);
const profileFieldErrors = ref<Record<string, string>>({});
const profileFormError = ref('');

// 2. Shipping address state
const initialAddr = initialUser?.address || {};
const addressDraft = reactive<AddressDraftVue3>({
  name: initialAddr.name || '',
  phone: initialAddr.phone || '',
  province: initialAddr.province || '',
  city: initialAddr.city || '',
  district: '',
  postalCode: initialAddr.postalCode || '',
  line1: initialAddr.line1 || '',
  country: initialAddr.country || '中国',
});
const addressDirty = ref(false);
let addressEditVersion = 0;
const addressSaving = ref(false);
const addressFieldErrors = ref<Record<string, string>>({});
const addressFormError = ref('');
const addressSavedOk = ref(!!initialAddr.line1);
const addressSaveError = ref(false);
const addressPaste = ref('');
const parseResult = reactive<{ text: string; isError: boolean }>({ text: '', isError: false });

// 3. Password state
const passwordDraft = reactive<PasswordDraftVue3>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordShow = reactive<{ current: boolean; next: boolean; confirm: boolean }>({
  current: false,
  next: false,
  confirm: false,
});
const passwordSaving = ref(false);
const passwordFieldErrors = ref<Record<string, string>>({});
const passwordFormError = ref('');

const bioLength = computed(() => unicodeLengthVue3(profileDraft.bio));

const previewAvatarUser = computed<PublicUserVue3>(() => ({
  uid: summaryUser.value?.uid || '',
  username: summaryUser.value?.username,
  displayName: profileDraft.displayName.trim() || summaryUser.value?.username || 'Q',
  callSign: profileDraft.callSign.trim(),
  avatarColor: profileDraft.avatarColor || '#0eaf8f',
  joinedAt: summaryUser.value?.joinedAt || '',
  stats: { cards: 0, likesReceived: 0 },
}));

const previewDisplayName = computed(() =>
  profileDraft.displayName.trim() || summaryUser.value?.username || 'Q',
);

const previewCallSign = computed(() =>
  profileDraft.callSign.trim() || props.services.t('未填写呼号'),
);

const statCards = computed(() => {
  const s = overviewStats.value;
  const base = summaryUser.value?.stats;
  if (s && s.cards !== undefined && s.cards !== null) return Number(s.cards) || 0;
  return Number(base?.cards) || 0;
});

const statLikes = computed(() => {
  const s = overviewStats.value;
  const base = summaryUser.value?.stats;
  if (s && s.likesReceived !== undefined && s.likesReceived !== null) return Number(s.likesReceived) || 0;
  return Number(base?.likesReceived) || 0;
});

const statExchanges = computed(() => {
  const base = summaryUser.value?.stats;
  const s = overviewStats.value;
  if (base && base.exchanges !== undefined && base.exchanges !== null) return Number(base.exchanges) || 0;
  if (s && s.completedExchanges !== undefined && s.completedExchanges !== null) return Number(s.completedExchanges) || 0;
  return 0;
});

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(epoch: number): boolean {
  if (disposed || epoch !== authEpoch) return false;
  const u = props.services.user() as SelfUserVue3 | null;
  return !!u && u.id === initialUserId && props.services.token() === initialToken;
}

function applySelfUser(user: SelfUserVue3) {
  summaryUser.value = user;
  applyingSelfUser = true;
  try {
    props.services.setUser(user);
  } finally {
    applyingSelfUser = false;
  }
}

function hydrateProfileFromUser(user: SelfUserVue3) {
  profileDraft.displayName = user.displayName || user.username || '';
  profileDraft.callSign = user.callSign || '';
  profileDraft.bio = user.bio || '';
  profileDraft.avatarColor = user.avatarColor || '#0eaf8f';
}

function hydrateAddressFromUser(user: SelfUserVue3) {
  const addr = user.address || {};
  addressDraft.name = addr.name || '';
  addressDraft.phone = addr.phone || '';
  addressDraft.province = addr.province || '';
  addressDraft.city = addr.city || '';
  addressDraft.district = '';
  addressDraft.postalCode = addr.postalCode || '';
  addressDraft.line1 = addr.line1 || '';
  addressDraft.country = addr.country || '中国';
  addressSavedOk.value = !!addr.line1;
  addressSaveError.value = false;
}

function clearAllPrivateState() {
  overviewAbort?.abort();
  overviewAbort = null;
  profileWriteAbort?.abort();
  profileWriteAbort = null;
  passwordAbort?.abort();
  passwordAbort = null;

  summaryUser.value = null;
  overviewStats.value = null;

  profileDraft.displayName = '';
  profileDraft.callSign = '';
  profileDraft.bio = '';
  profileDraft.avatarColor = '#0eaf8f';
  profileDirty.value = false;
  profileFieldErrors.value = {};
  profileFormError.value = '';
  profileSaving.value = false;

  addressDraft.name = '';
  addressDraft.phone = '';
  addressDraft.province = '';
  addressDraft.city = '';
  addressDraft.district = '';
  addressDraft.postalCode = '';
  addressDraft.line1 = '';
  addressDraft.country = '中国';
  addressDirty.value = false;
  addressFieldErrors.value = {};
  addressFormError.value = '';
  addressSavedOk.value = false;
  addressSaveError.value = false;
  addressPaste.value = '';
  parseResult.text = '';
  parseResult.isError = false;
  addressSaving.value = false;

  passwordDraft.currentPassword = '';
  passwordDraft.newPassword = '';
  passwordDraft.confirmPassword = '';
  passwordShow.current = false;
  passwordShow.next = false;
  passwordShow.confirm = false;
  passwordFieldErrors.value = {};
  passwordFormError.value = '';
  passwordSaving.value = false;
}

function markProfileDirty() {
  profileDirty.value = true;
  profileEditVersion++;
}

function onCallSignInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const pos = input.selectionStart;
  const upper = input.value.toUpperCase();
  profileDraft.callSign = upper;
  if (input.value !== upper) {
    input.value = upper;
    if (pos !== null) {
      try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }
  }
  markProfileDirty();
}

function selectAvatarColor(color: string) {
  profileDraft.avatarColor = color;
  markProfileDirty();
}

function markAddressDirty() {
  addressDirty.value = true;
  addressEditVersion++;
}

function enqueueProfileWrite(task: () => Promise<void>): Promise<void> {
  const next = profileWriteChain.then(task, task);
  profileWriteChain = next.catch(() => {});
  return next;
}

/* ---------------- 1. 提交基本资料 ---------------- */
async function submitProfile() {
  if (profileSaving.value || !isSessionValid(authEpoch)) return;
  profileFieldErrors.value = {};
  profileFormError.value = '';

  const errors = validateProfileDraftVue3(profileDraft, avatarColors, props.services.t);
  if (Object.keys(errors).length) {
    profileFieldErrors.value = errors;
    return;
  }

  const epoch = authEpoch;
  const sentVersion = profileEditVersion;
  const payload = {
    displayName: profileDraft.displayName.trim(),
    callSign: profileDraft.callSign.trim().toUpperCase(),
    bio: profileDraft.bio.trim(),
    avatarColor: profileDraft.avatarColor.trim().toLowerCase(),
  };

  profileSaving.value = true;
  writeEpoch++;

  await enqueueProfileWrite(async () => {
    if (!isSessionValid(epoch)) return;
    const controller = new AbortController();
    profileWriteAbort = controller;
    try {
      const res = await props.services.updateProfile(payload, controller.signal);
      if (!isSessionValid(epoch)) return;
      if (res && res.user) {
        applySelfUser(res.user);
      }
      if (profileEditVersion === sentVersion) {
        profileDirty.value = false;
      }
      props.services.toast(props.services.t('个人资料已保存'), 'success');
    } catch (err) {
      if (isAbortError(err) || !isSessionValid(epoch)) return;
      const apiErr = err as { fields?: Record<string, string>; message?: string };
      const mapped = mapAccountFieldErrorsVue3(apiErr.fields);
      if (Object.keys(mapped).length) {
        profileFieldErrors.value = mapped;
      } else {
        profileFormError.value = apiErr.message || props.services.t('保存失败，请稍后重试');
      }
    } finally {
      if (profileWriteAbort === controller) profileWriteAbort = null;
      if (isSessionValid(epoch)) profileSaving.value = false;
    }
  });
}

/* ---------------- 2. 地址解析 & 提交寄送地址 ---------------- */
function handleParseAddress() {
  const parsed = parseShippingAddressVue3(addressPaste.value);
  if (!parsed) {
    parseResult.text = props.services.t('没有识别到地址信息。可以分行粘贴姓名、手机号和完整地址，或直接填写下方字段。');
    parseResult.isError = true;
    return;
  }
  const filled = applyParsedAddressVue3(addressDraft, parsed);
  if (filled > 0) {
    markAddressDirty();
  }
  parseResult.isError = false;
  parseResult.text = filled
    ? props.services.t('已识别') + ' ' + filled + ' ' + props.services.t('项并填入空字段。请检查后保存。')
    : props.services.t('已识别地址，但现有字段均已填写；为避免覆盖，未修改内容。');
  addressPaste.value = '';
}

async function submitAddress() {
  if (addressSaving.value || !isSessionValid(authEpoch)) return;
  addressFieldErrors.value = {};
  addressFormError.value = '';

  const errors = validateAddressDraftVue3(addressDraft, props.services.t);
  if (Object.keys(errors).length) {
    addressFieldErrors.value = errors;
    return;
  }

  const epoch = authEpoch;
  const sentVersion = addressEditVersion;
  const payload = {
    address: {
      name: addressDraft.name.trim(),
      phone: addressDraft.phone.trim(),
      province: addressDraft.province.trim(),
      city: addressCityVue3(addressDraft.city, addressDraft.district),
      line1: addressDraft.line1.trim(),
      postalCode: addressDraft.postalCode.trim(),
      country: addressDraft.country.trim() || '中国',
    },
  };

  addressSaving.value = true;
  writeEpoch++;

  await enqueueProfileWrite(async () => {
    if (!isSessionValid(epoch)) return;
    const controller = new AbortController();
    profileWriteAbort = controller;
    try {
      const res = await props.services.updateProfile(payload, controller.signal);
      if (!isSessionValid(epoch)) return;
      if (res && res.user) {
        applySelfUser(res.user);
      }
      if (addressEditVersion === sentVersion) {
        addressDirty.value = false;
      }
      addressSavedOk.value = true;
      addressSaveError.value = false;
      props.services.toast(props.services.t('寄送地址已保存'), 'success');
    } catch (err) {
      if (isAbortError(err) || !isSessionValid(epoch)) return;
      const apiErr = err as { fields?: Record<string, string>; message?: string };
      const mapped = mapAccountFieldErrorsVue3(apiErr.fields);
      if (Object.keys(mapped).length) {
        addressFieldErrors.value = mapped;
      } else {
        addressFormError.value = apiErr.message || props.services.t('地址保存失败，请稍后重试');
      }
      addressSavedOk.value = false;
      addressSaveError.value = true;
    } finally {
      if (profileWriteAbort === controller) profileWriteAbort = null;
      if (isSessionValid(epoch)) addressSaving.value = false;
    }
  });
}

/* ---------------- 3. 修改密码 ---------------- */
async function submitPassword() {
  if (passwordSaving.value || !isSessionValid(authEpoch)) return;
  passwordFieldErrors.value = {};
  passwordFormError.value = '';

  const errors = validatePasswordDraftVue3(passwordDraft, props.services.t);
  if (Object.keys(errors).length) {
    passwordFieldErrors.value = errors;
    return;
  }

  const epoch = authEpoch;
  passwordSaving.value = true;
  passwordAbort?.abort();
  const controller = new AbortController();
  passwordAbort = controller;

  try {
    await props.services.updatePassword(
      {
        currentPassword: passwordDraft.currentPassword,
        newPassword: passwordDraft.newPassword,
      },
      controller.signal,
    );
    if (!isSessionValid(epoch)) return;
    passwordDraft.currentPassword = '';
    passwordDraft.newPassword = '';
    passwordDraft.confirmPassword = '';
    passwordShow.current = false;
    passwordShow.next = false;
    passwordShow.confirm = false;
    props.services.toast(props.services.t('密码已更新，请牢记新密码'), 'success');
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    const apiErr = err as { status?: number; code?: string; fields?: Record<string, string>; message?: string };
    if (apiErr.code === 'INVALID_CREDENTIALS') {
      passwordFieldErrors.value = { currentPassword: props.services.t('当前密码不正确') };
    } else if (apiErr.status === 401) {
      authEpoch++;
      clearAllPrivateState();
      props.services.setUser(null);
      props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/profile'), { replace: true });
    } else {
      const mapped = mapAccountFieldErrorsVue3(apiErr.fields);
      if (Object.keys(mapped).length) {
        passwordFieldErrors.value = mapped;
      } else {
        passwordFormError.value = apiErr.message || props.services.t('密码更新失败，请稍后重试');
      }
    }
  } finally {
    if (passwordAbort === controller) passwordAbort = null;
    if (isSessionValid(epoch)) passwordSaving.value = false;
  }
}

/* ---------------- 拉取最新资料 ---------------- */
async function loadOverview() {
  if (!isSessionValid(authEpoch)) return;
  const epoch = authEpoch;
  const startWriteEpoch = writeEpoch;
  overviewAbort?.abort();
  const controller = new AbortController();
  overviewAbort = controller;

  try {
    const data = await props.services.getOverview(controller.signal);
    if (!isSessionValid(epoch)) return;
    if (data && data.stats) {
      overviewStats.value = data.stats;
    }
    if (data && data.user && writeEpoch === startWriteEpoch) {
      applySelfUser(data.user);
      if (!profileDirty.value && !profileSaving.value) {
        hydrateProfileFromUser(data.user);
      }
      if (!addressDirty.value && !addressSaving.value) {
        hydrateAddressFromUser(data.user);
      }
    }
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    const message = err instanceof Error && err.message ? err.message : props.services.t('资料加载失败，显示的是本地缓存');
    props.services.toast(message, 'error');
  } finally {
    if (overviewAbort === controller) overviewAbort = null;
  }
}

const offAuth = props.services.onAuth(nextUser => {
  if (applyingSelfUser) return;
  const tokenNow = props.services.token();
  if (nextUser && initialUserId && nextUser.id === initialUserId && tokenNow === initialToken) {
    const u = nextUser as SelfUserVue3;
    summaryUser.value = u;
    if (!profileDirty.value && !profileSaving.value) hydrateProfileFromUser(u);
    if (!addressDirty.value && !addressSaving.value) hydrateAddressFromUser(u);
    return;
  }
  authEpoch++;
  clearAllPrivateState();
  if (!nextUser) {
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/profile'), { replace: true });
  } else {
    props.services.navigate('/dashboard/profile', { replace: true });
  }
});

onMounted(async () => {
  if (!initialUser) {
    clearAllPrivateState();
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/profile'), { replace: true });
    return;
  }
  await nextTick();
  scan();
  void loadOverview();
});

onBeforeUnmount(() => {
  disposed = true;
  authEpoch++;
  offAuth();
  clearAllPrivateState();
});
</script>

<template>
  <div v-if="summaryUser" ref="rootRef" class="f-page f-profile container">
    <header class="f-head">
      <div class="f-head-main">
        <span class="f-eyebrow">MY ACCOUNT</span>
        <h1 class="f-title">{{ services.t('个人资料') }}</h1>
        <p class="f-desc">{{ services.t('完善你的呼号、简介与寄送地址；地址只会在双方同意换卡后互相可见。') }}</p>
      </div>
    </header>

    <div class="f-profile-grid">
      <div class="f-profile-main">
        <!-- 01 基本资料 -->
        <section class="f-form-card f-profile-card" data-vue-reveal>
          <header class="f-form-card-head">
            <div>
              <h2 class="f-form-card-title">{{ services.t('基本资料') }}</h2>
              <p class="f-form-card-desc">{{ services.t('这些信息会展示在你的卡片与个人主页上。') }}</p>
            </div>
            <span class="f-form-step">01</span>
          </header>

          <form id="fProfileForm" novalidate @submit.prevent="submitProfile">
            <div class="f-avatar-editor">
              <span class="f-avatar-preview" data-avatar-preview>
                <AvatarVue3 :user="previewAvatarUser" :size="76" />
              </span>
              <div class="f-avatar-editor-main">
                <span class="label">{{ services.t('头像配色') }}</span>
                <div class="f-swatches" data-swatches>
                  <button
                    v-for="color in avatarColors"
                    :key="color"
                    class="f-swatch"
                    :class="{ 'is-active': color.toLowerCase() === profileDraft.avatarColor.toLowerCase() }"
                    type="button"
                    :data-color="color"
                    :style="{ '--f-swatch': color }"
                    :aria-label="services.t('选择头像颜色') + ' ' + color"
                    @click="selectAvatarColor(color)"
                  ></button>
                </div>
                <p class="f-form-tip">
                  <IconVue3 name="info" :size="14" /> {{ services.t('头像由呼号缩写与配色自动生成，无需上传图片。') }}
                </p>
              </div>
            </div>

            <div v-if="profileFormError" class="f-form-error" data-form-error role="alert">
              <IconVue3 name="alert" :size="16" /><span>{{ profileFormError }}</span>
            </div>

            <div class="f-form-grid">
              <div class="f-field" :class="{ 'has-error': !!profileFieldErrors.displayName }" data-field="displayName">
                <div class="f-field-row">
                  <label class="label" for="fProfileDisplayName">
                    {{ services.t('昵称') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fProfileDisplayName"
                  v-model="profileDraft.displayName"
                  class="input"
                  name="displayName"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('展示给其他火腿的名字')"
                  @input="markProfileDirty"
                >
                <p v-if="profileFieldErrors.displayName" class="f-error" data-error="displayName" role="alert">
                  {{ profileFieldErrors.displayName }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!profileFieldErrors.callSign }" data-field="callSign">
                <div class="f-field-row">
                  <label class="label" for="fProfileCallSign">
                    {{ services.t('呼号') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fProfileCallSign"
                  :value="profileDraft.callSign"
                  class="input"
                  name="callSign"
                  type="text"
                  autocomplete="off"
                  @input="onCallSignInput"
                >
                <p v-if="profileFieldErrors.callSign" class="f-error" data-error="callSign" role="alert">
                  {{ profileFieldErrors.callSign }}
                </p>
              </div>

              <div class="f-field f-span-2" :class="{ 'has-error': !!profileFieldErrors.bio }" data-field="bio">
                <div class="f-field-row">
                  <label class="label" for="fProfileBio">
                    {{ services.t('个人简介') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                  <span class="f-label-hint" data-counter="bio">{{ bioLength }} / {{ PROFILE_LIMITS_VUE3.bio }}</span>
                </div>
                <textarea
                  id="fProfileBio"
                  v-model="profileDraft.bio"
                  class="textarea"
                  name="bio"
                  rows="3"
                  :placeholder="services.t('介绍一下你的电台与通联故事')"
                  @input="markProfileDirty"
                ></textarea>
                <p v-if="profileFieldErrors.bio" class="f-error" data-error="bio" role="alert">
                  {{ profileFieldErrors.bio }}
                </p>
              </div>
            </div>

            <div class="f-form-actions">
              <button class="btn btn-primary" type="submit" data-save="profile" :disabled="profileSaving">
                <IconVue3 name="check" :size="17" />
                <span>{{ profileSaving ? services.t('保存中…') : services.t('保存资料') }}</span>
              </button>
              <span class="f-form-hint">
                <IconVue3 name="shield" :size="14" /> {{ services.t('修改后立即生效') }}
              </span>
            </div>
          </form>
        </section>

        <!-- 02 寄送地址 -->
        <section class="f-form-card f-profile-card" data-vue-reveal data-vue-reveal-delay="60">
          <header class="f-form-card-head">
            <div>
              <h2 class="f-form-card-title">{{ services.t('寄送地址') }}</h2>
              <p class="f-form-card-desc">{{ services.t('换卡申请会自动带入此地址；只有达成交换的双方才能看到它。') }}</p>
            </div>
            <span class="f-form-step">02</span>
          </header>

          <form id="fAddressForm" novalidate @submit.prevent="submitAddress">
            <div v-if="addressFormError" class="f-form-error" data-form-error role="alert">
              <IconVue3 name="alert" :size="16" /><span>{{ addressFormError }}</span>
            </div>

            <div class="f-address-parser">
              <label class="label" for="fAddressPaste">{{ services.t('粘贴完整地址，自动拆分字段') }}</label>
              <textarea
                id="fAddressPaste"
                v-model="addressPaste"
                class="textarea"
                rows="3"
                autocomplete="off"
                :placeholder="services.t('例如：张三 13800138000 广东省深圳市南山区科技南十二路18号')"
              ></textarea>
              <div class="f-address-parser__foot">
                <span>{{ services.t('在本机解析，不会单独上传；确认后再保存。') }}</span>
                <button class="btn btn-soft" type="button" data-parse-address @click="handleParseAddress">
                  {{ services.t('解析并填入') }}
                </button>
              </div>
              <p
                class="f-address-parser__result"
                :class="{ 'is-error': parseResult.isError }"
                data-parse-result
                role="status"
                aria-live="polite"
              >{{ parseResult.text }}</p>
            </div>

            <div class="f-form-grid">
              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.name }" data-field="name">
                <div class="f-field-row">
                  <label class="label" for="fAddrName">
                    {{ services.t('收件人姓名') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fAddrName"
                  v-model="addressDraft.name"
                  class="input"
                  name="name"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('真实姓名')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.name" class="f-error" data-error="name" role="alert">
                  {{ addressFieldErrors.name }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.phone }" data-field="phone">
                <div class="f-field-row">
                  <label class="label" for="fAddrPhone">
                    {{ services.t('联系电话') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fAddrPhone"
                  v-model="addressDraft.phone"
                  class="input"
                  name="phone"
                  type="text"
                  inputmode="tel"
                  autocomplete="off"
                  :placeholder="services.t('方便快递联系')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.phone" class="f-error" data-error="phone" role="alert">
                  {{ addressFieldErrors.phone }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.province }" data-field="province">
                <div class="f-field-row">
                  <label class="label" for="fAddrProvince">
                    {{ services.t('省 / 自治区') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fAddrProvince"
                  v-model="addressDraft.province"
                  class="input"
                  name="province"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('如：湖南省')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.province" class="f-error" data-error="province" role="alert">
                  {{ addressFieldErrors.province }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.city }" data-field="city">
                <div class="f-field-row">
                  <label class="label" for="fAddrCity">
                    {{ services.t('城市') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fAddrCity"
                  v-model="addressDraft.city"
                  class="input"
                  name="city"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('如：长沙市')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.city" class="f-error" data-error="city" role="alert">
                  {{ addressFieldErrors.city }}
                </p>
              </div>

              <div class="f-field" data-field="district">
                <div class="f-field-row">
                  <label class="label" for="fAddrDistrict">
                    {{ services.t('区 / 县') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fAddrDistrict"
                  v-model="addressDraft.district"
                  class="input"
                  name="district"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('如：岳麓区')"
                  @input="markAddressDirty"
                >
              </div>

              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.postalCode }" data-field="postalCode">
                <div class="f-field-row">
                  <label class="label" for="fAddrPostalCode">
                    {{ services.t('邮政编码') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fAddrPostalCode"
                  v-model="addressDraft.postalCode"
                  class="input"
                  name="postalCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  :placeholder="services.t('如：410000')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.postalCode" class="f-error" data-error="postalCode" role="alert">
                  {{ addressFieldErrors.postalCode }}
                </p>
              </div>

              <div class="f-field f-span-2" :class="{ 'has-error': !!addressFieldErrors.line1 }" data-field="line1">
                <div class="f-field-row">
                  <label class="label" for="fAddrLine1">
                    {{ services.t('详细地址') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fAddrLine1"
                  v-model="addressDraft.line1"
                  class="input"
                  name="line1"
                  type="text"
                  autocomplete="off"
                  :placeholder="services.t('街道、门牌号、单元楼室')"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.line1" class="f-error" data-error="line1" role="alert">
                  {{ addressFieldErrors.line1 }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!addressFieldErrors.country }" data-field="country">
                <div class="f-field-row">
                  <label class="label" for="fAddrCountry">
                    {{ services.t('国家 / 地区') }}<span class="f-optional">{{ services.t('选填') }}</span>
                  </label>
                </div>
                <input
                  id="fAddrCountry"
                  v-model="addressDraft.country"
                  class="input"
                  name="country"
                  type="text"
                  autocomplete="off"
                  placeholder="中国"
                  @input="markAddressDirty"
                >
                <p v-if="addressFieldErrors.country" class="f-error" data-error="country" role="alert">
                  {{ addressFieldErrors.country }}
                </p>
              </div>
            </div>

            <div class="f-form-actions">
              <button class="btn btn-primary" type="submit" data-save="address" :disabled="addressSaving">
                <IconVue3 name="map-pin" :size="17" />
                <span>{{ addressSaving ? services.t('保存中…') : services.t('保存地址') }}</span>
              </button>
              <span
                class="f-address-state"
                :class="{ 'is-ok': addressSavedOk && !addressSaveError, 'is-error': addressSaveError }"
                data-address-state
              >
                <template v-if="addressSaveError">
                  <IconVue3 name="alert" :size="15" /> {{ services.t('地址保存失败') }}
                </template>
                <template v-else-if="addressSavedOk">
                  <IconVue3 name="check-circle" :size="15" /> {{ services.t('已保存寄送地址') }}
                </template>
                <template v-else>
                  <IconVue3 name="info" :size="15" /> {{ services.t('尚未填写寄送地址') }}
                </template>
              </span>
            </div>
          </form>
        </section>

        <!-- 03 修改密码 -->
        <section class="f-form-card f-profile-card" data-vue-reveal data-vue-reveal-delay="120">
          <header class="f-form-card-head">
            <div>
              <h2 class="f-form-card-title">{{ services.t('修改密码') }}</h2>
              <p class="f-form-card-desc">{{ services.t('定期更换密码，保护你的账号与卡片收藏。') }}</p>
            </div>
            <span class="f-form-step">03</span>
          </header>

          <form id="fPasswordForm" novalidate @submit.prevent="submitPassword">
            <div v-if="passwordFormError" class="f-form-error" data-form-error role="alert">
              <IconVue3 name="alert" :size="16" /><span>{{ passwordFormError }}</span>
            </div>

            <div class="f-form-grid">
              <div class="f-field f-span-2" :class="{ 'has-error': !!passwordFieldErrors.currentPassword }" data-field="currentPassword">
                <div class="f-field-row">
                  <label class="label" for="fPwdCurrent">
                    {{ services.t('当前密码') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fPwdCurrent"
                  v-model="passwordDraft.currentPassword"
                  class="input"
                  name="currentPassword"
                  :type="passwordShow.current ? 'text' : 'password'"
                  autocomplete="current-password"
                  :placeholder="services.t('输入当前登录密码')"
                >
                <button
                  type="button"
                  class="f-eye"
                  :class="{ 'is-on': passwordShow.current }"
                  :aria-label="passwordShow.current ? services.t('隐藏密码') : services.t('显示密码')"
                  :aria-pressed="passwordShow.current ? 'true' : 'false'"
                  data-eye
                  @click="passwordShow.current = !passwordShow.current"
                >
                  <IconVue3 name="eye" :size="18" />
                </button>
                <p v-if="passwordFieldErrors.currentPassword" class="f-error" data-error="currentPassword" role="alert">
                  {{ passwordFieldErrors.currentPassword }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!passwordFieldErrors.newPassword }" data-field="newPassword">
                <div class="f-field-row">
                  <label class="label" for="fPwdNew">
                    {{ services.t('新密码') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fPwdNew"
                  v-model="passwordDraft.newPassword"
                  class="input"
                  name="newPassword"
                  :type="passwordShow.next ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="services.t('至少 8 位，含字母与数字')"
                >
                <button
                  type="button"
                  class="f-eye"
                  :class="{ 'is-on': passwordShow.next }"
                  :aria-label="passwordShow.next ? services.t('隐藏密码') : services.t('显示密码')"
                  :aria-pressed="passwordShow.next ? 'true' : 'false'"
                  data-eye
                  @click="passwordShow.next = !passwordShow.next"
                >
                  <IconVue3 name="eye" :size="18" />
                </button>
                <p v-if="passwordFieldErrors.newPassword" class="f-error" data-error="newPassword" role="alert">
                  {{ passwordFieldErrors.newPassword }}
                </p>
              </div>

              <div class="f-field" :class="{ 'has-error': !!passwordFieldErrors.confirmPassword }" data-field="confirmPassword">
                <div class="f-field-row">
                  <label class="label" for="fPwdConfirm">
                    {{ services.t('确认新密码') }}<i class="req">*</i>
                  </label>
                </div>
                <input
                  id="fPwdConfirm"
                  v-model="passwordDraft.confirmPassword"
                  class="input"
                  name="confirmPassword"
                  :type="passwordShow.confirm ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="services.t('再次输入新密码')"
                >
                <button
                  type="button"
                  class="f-eye"
                  :class="{ 'is-on': passwordShow.confirm }"
                  :aria-label="passwordShow.confirm ? services.t('隐藏密码') : services.t('显示密码')"
                  :aria-pressed="passwordShow.confirm ? 'true' : 'false'"
                  data-eye
                  @click="passwordShow.confirm = !passwordShow.confirm"
                >
                  <IconVue3 name="eye" :size="18" />
                </button>
                <p v-if="passwordFieldErrors.confirmPassword" class="f-error" data-error="confirmPassword" role="alert">
                  {{ passwordFieldErrors.confirmPassword }}
                </p>
              </div>
            </div>

            <div class="f-form-actions">
              <button class="btn btn-primary" type="submit" data-save="password" :disabled="passwordSaving">
                <IconVue3 name="lock" :size="17" />
                <span>{{ passwordSaving ? services.t('更新中…') : services.t('更新密码') }}</span>
              </button>
              <span class="f-form-hint">
                <IconVue3 name="key" :size="14" /> {{ services.t('修改后当前登录仍然有效') }}
              </span>
            </div>
          </form>
        </section>
      </div>

      <!-- 侧栏 -->
      <aside class="f-profile-side">
        <div class="f-profile-summary glass" data-vue-reveal data-vue-reveal-delay="60">
          <div class="f-summary-avatar" data-summary-avatar>
            <AvatarVue3 :user="previewAvatarUser" :size="84" />
          </div>
          <h2 class="f-summary-name" data-summary-name>{{ previewDisplayName }}</h2>
          <span class="f-summary-call mono" data-summary-call>{{ previewCallSign }}</span>
          <span class="f-summary-username">
            @{{ summaryUser.username || '' }} ·
            <span class="badge" :class="summaryUser.role === 'admin' ? 'badge-violet' : 'badge-mint'">
              {{ summaryUser.role === 'admin' ? services.t('管理员') : services.t('火腿') }}
            </span>
          </span>
          <div class="f-summary-stats" data-summary-stats>
            <span><b data-stat="cards">{{ services.formatNumber(statCards) }}</b><small>{{ services.t('卡片') }}</small></span>
            <span><b data-stat="likes">{{ services.formatNumber(statLikes) }}</b><small>{{ services.t('获赞') }}</small></span>
            <span><b data-stat="exchanges">{{ services.formatNumber(statExchanges) }}</b><small>{{ services.t('换卡') }}</small></span>
          </div>
          <div class="f-summary-meta">
            <span><IconVue3 name="mail" :size="14" />{{ summaryUser.email || '—' }}</span>
            <span>
              <IconVue3 name="calendar" :size="14" />
              {{ summaryUser.joinedAt ? services.formatDate(summaryUser.joinedAt) + ' ' + services.t('加入') : '—' }}
            </span>
          </div>
          <div class="f-summary-links">
            <a class="f-summary-link" href="/dashboard/cards" data-link>
              <IconVue3 name="cards" :size="16" /><span>{{ services.t('我的卡片') }}</span><IconVue3 name="chevron-right" :size="14" />
            </a>
            <a class="f-summary-link" href="/dashboard/exchanges" data-link>
              <IconVue3 name="inbox" :size="16" /><span>{{ services.t('换卡申请') }}</span><IconVue3 name="chevron-right" :size="14" />
            </a>
            <a class="f-summary-link" href="/dashboard/cards/new" data-link>
              <IconVue3 name="upload" :size="16" /><span>{{ services.t('上传新卡片') }}</span><IconVue3 name="chevron-right" :size="14" />
            </a>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
