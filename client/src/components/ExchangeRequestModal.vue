<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import AvatarVue3 from './Avatar.vue';
import DialogVue3 from './Dialog.vue';
import IconVue3 from './Icon.vue';
import ResponsiveImageVue3 from './ResponsiveImage.vue';
import type {
  CardDetailVue3,
  ExchangeRequestServicesVue3,
  LogbookRowVue3,
  PublicUserVue3,
  SelfUserVue3,
} from '../contracts';
import { displayNameVue3, formatContactLogPairsVue3 } from '../exchange-utils';
import {
  addressCityVue3,
  mapAccountFieldErrorsVue3,
  unicodeLengthVue3,
  validateAddressDraftVue3,
  type AddressDraftVue3,
} from '../profile-utils';

const props = defineProps<{
  card: CardDetailVue3;
  services: ExchangeRequestServicesVue3;
}>();

const emit = defineEmits<{
  close: [];
}>();

const t = props.services.t;
const initialUser = props.services.user() as SelfUserVue3 | null;
const initialUserId = initialUser?.id || null;
const initialToken = props.services.token();

let disposed = false;
let authEpoch = 0;
let logGen = 0;
let logAbort: AbortController | null = null;
let submitAbort: AbortController | null = null;

const currentUser = ref<SelfUserVue3 | null>(initialUser);
const submitting = ref(false);
const alertText = ref('');
const fieldErrors = ref<Record<string, string>>({});

function createInitialDraft(user: SelfUserVue3 | null): AddressDraftVue3 {
  const addr = user?.address || {};
  return {
    name: addr.name || user?.displayName || user?.username || '',
    phone: addr.phone || '',
    province: addr.province || '',
    city: addr.city || '',
    district: '',
    line1: addr.line1 || '',
    postalCode: addr.postalCode || '',
    country: addr.country || t('中国'),
  };
}

const form = reactive<AddressDraftVue3 & { message: string }>({
  ...createInitialDraft(initialUser),
  message: '',
});

const hasSavedProfileAddress = computed(() => !!currentUser.value?.address?.line1);
const messageLength = computed(() => unicodeLengthVue3(form.message));

// Logbook picker state (strictly in-memory for this modal instance)
const logSearchInput = ref('');
const logQuery = ref('');
const logPage = ref(1);
const logPages = ref(1);
const logRows = ref<LogbookRowVue3[]>([]);
const logLoading = ref(false);
const logStatusText = ref('');
const selectedLogs = reactive(new Map<string, LogbookRowVue3>());

const selectedLogList = computed(() => Array.from(selectedLogs.values()));
const ownerUser = computed<PublicUserVue3 | null>(() => props.card.owner || null);

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(epoch = authEpoch): boolean {
  if (disposed || epoch !== authEpoch) return false;
  const u = props.services.user() as SelfUserVue3 | null;
  return !!u && u.id === initialUserId && props.services.token() === initialToken;
}

function clearAllState() {
  logAbort?.abort();
  logAbort = null;
  submitAbort?.abort();
  submitAbort = null;
  logGen++;
  selectedLogs.clear();
  logRows.value = [];
  form.name = '';
  form.phone = '';
  form.province = '';
  form.city = '';
  form.district = '';
  form.line1 = '';
  form.postalCode = '';
  form.country = '';
  form.message = '';
  alertText.value = '';
  fieldErrors.value = {};
}

function handleClose() {
  if (submitting.value) return;
  clearAllState();
  emit('close');
}

function refillFromProfile() {
  if (submitting.value || !isSessionValid()) return;
  const latest = (props.services.user() as SelfUserVue3 | null) || currentUser.value;
  const addr = latest?.address || {};
  form.name = addr.name || '';
  form.phone = addr.phone || '';
  form.province = addr.province || '';
  form.city = addr.city || '';
  form.district = '';
  form.line1 = addr.line1 || '';
  form.postalCode = addr.postalCode || '';
  form.country = addr.country || t('中国');
  fieldErrors.value = {};
  alertText.value = '';
  props.services.toast(
    addr.line1 ? t('已重新填入个人资料地址') : t('个人资料中还没有保存地址'),
    addr.line1 ? 'info' : 'error',
  );
}

async function loadLogs(targetPage: number) {
  if (!isSessionValid()) return;
  const gen = ++logGen;
  const epoch = authEpoch;
  logAbort?.abort();
  const controller = new AbortController();
  logAbort = controller;
  logLoading.value = true;
  logStatusText.value = t('正在加载自己的通联日志…');

  try {
    const data = await props.services.listLogbook(targetPage, logQuery.value, controller.signal);
    if (!isSessionValid(epoch) || gen !== logGen) return;
    logRows.value = Array.isArray(data.items) ? data.items : [];
    logPage.value = Number(data.page) || targetPage;
    logPages.value = Math.max(1, Number(data.pages) || 1);
    logStatusText.value = data.total
      ? t('共') + ' ' + data.total + ' ' + t('条，默认不勾选任何记录。')
      : logQuery.value
        ? t('没有搜索结果，可修改呼号后搜索。')
        : t('暂无通联日志，可以不附记录直接申请。');
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch) || gen !== logGen) return;
    const msg = err instanceof Error && err.message ? err.message : t('请点击搜索重试');
    logStatusText.value = t('加载失败：') + msg;
  } finally {
    if (logAbort === controller) logAbort = null;
    if (isSessionValid(epoch) && gen === logGen) logLoading.value = false;
  }
}

function searchLogs() {
  if (!isSessionValid()) return;
  logQuery.value = logSearchInput.value.trim();
  void loadLogs(1);
}

function toggleLog(row: LogbookRowVue3, event: Event) {
  const input = event.target as HTMLInputElement;
  if (submitting.value) {
    input.checked = selectedLogs.has(row.id);
    return;
  }
  if (!input.checked) {
    selectedLogs.delete(row.id);
    return;
  }
  if (selectedLogs.size >= 100 && !selectedLogs.has(row.id)) {
    input.checked = false;
    props.services.toast(t('每次最多附上 100 条通联记录'), 'info');
    return;
  }
  selectedLogs.set(row.id, row);
}

function saveAddressSilently(address: {
  name: string;
  phone: string;
  province: string;
  city: string;
  line1: string;
  postalCode: string;
  country: string;
}) {
  if (!initialUserId || !initialToken) return;
  void props.services
    .updateProfileAddress(address)
    .then(res => {
      if (
        res &&
        res.user &&
        props.services.user()?.id === initialUserId &&
        props.services.token() === initialToken
      ) {
        props.services.setUser(res.user);
      }
    })
    .catch(() => {
      // Silent failure; never affects the already-created exchange.
    });
}

async function submitRequest() {
  if (submitting.value || !isSessionValid()) return;
  alertText.value = '';
  const errors = validateAddressDraftVue3(form, t);
  const trimmedMessage = form.message.trim();
  if (unicodeLengthVue3(trimmedMessage) > 500) {
    errors.message = t('留言不能超过 500 个字符');
  }
  fieldErrors.value = errors;
  if (Object.keys(errors).length > 0) return;

  const epoch = authEpoch;
  submitting.value = true;
  submitAbort?.abort();
  const controller = new AbortController();
  submitAbort = controller;

  const address = {
    name: form.name.trim(),
    phone: form.phone.trim(),
    province: form.province.trim(),
    city: addressCityVue3(form.city, form.district),
    line1: form.line1.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim() || t('中国'),
  };

  try {
    await props.services.createExchange(
      props.card.id,
      {
        message: trimmedMessage,
        contactName: address.name,
        address,
        contactLogIds: Array.from(selectedLogs.keys()),
      },
      controller.signal,
    );
    if (!isSessionValid(epoch)) return;
    submitting.value = false;
    saveAddressSilently(address);
    clearAllState();
    emit('close');
    props.services.celebrate(window.innerWidth / 2, window.innerHeight / 3);
    props.services.toast(t('换卡申请已发送，等待对方处理'), 'success');
    props.services.navigate('/dashboard/exchanges?box=outgoing');
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    submitting.value = false;
    const apiErr = err as { status?: number; fields?: Record<string, string>; message?: string };
    if (apiErr && apiErr.status === 401) {
      clearAllState();
      emit('close');
      props.services.navigate('/login?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }
    if (apiErr && apiErr.status === 409) {
      alertText.value = apiErr.message || t('你已申请过这张卡片，请等待对方处理');
      return;
    }
    if (apiErr && apiErr.fields && Object.keys(apiErr.fields).length) {
      const mapped = mapAccountFieldErrorsVue3(apiErr.fields);
      fieldErrors.value = mapped;
      if (mapped.address || mapped.contactLogIds) {
        alertText.value = mapped.address || mapped.contactLogIds;
      }
      return;
    }
    alertText.value = (apiErr && apiErr.message) || t('申请发送失败，请稍后重试');
  } finally {
    if (submitAbort === controller) submitAbort = null;
    if (isSessionValid(epoch)) submitting.value = false;
  }
}

const offAuth = props.services.onAuth(nextUser => {
  const tokenNow = props.services.token();
  if (nextUser && initialUserId && nextUser.id === initialUserId && tokenNow === initialToken) {
    currentUser.value = nextUser as SelfUserVue3;
    return;
  }
  authEpoch++;
  clearAllState();
  emit('close');
});

onMounted(() => {
  if (!isSessionValid()) {
    clearAllState();
    emit('close');
    return;
  }
  void loadLogs(1);
});

onBeforeUnmount(() => {
  disposed = true;
  authEpoch++;
  offAuth();
  clearAllState();
});
</script>

<template>
  <DialogVue3
    :title="t('申请换卡')"
    :t="t"
    :busy="submitting"
    size="lg"
    @close="handleClose"
  >
    <div class="f-xreq" data-vue3="exchange-request">
      <div class="f-xreq-card">
        <span
          class="f-xreq-thumb"
          :style="{ aspectRatio: `${card.ratio?.w || 3} / ${card.ratio?.h || 2}` }"
        >
          <ResponsiveImageVue3
            :src="card.frontImage || services.placeholder"
            :width="100"
            :alt="card.title || t('卡片')"
            :services="services"
          />
        </span>
        <div class="f-xreq-card-info">
          <span class="f-xreq-eyebrow"><IconVue3 name="send" :size="13" /> APPLY TO EXCHANGE</span>
          <b class="f-xreq-title">{{ card.title || t('未命名卡片') }}</b>
          <span class="f-xreq-card-meta">{{ services.ratioLabel(card.ratio || { w: 3, h: 2 }) }}</span>
          <span v-if="ownerUser" class="f-xreq-owner">
            <span class="owner-line">
              <AvatarVue3 :user="ownerUser" :size="20" />
              <span class="owner-name">{{ displayNameVue3(ownerUser, t) }}</span>
              <span v-if="ownerUser.callSign" class="owner-call mono">{{ ownerUser.callSign }}</span>
            </span>
          </span>
        </div>
        <span class="f-xreq-pill"><IconVue3 name="cards" :size="14" /> {{ t('换卡申请') }}</span>
      </div>

      <div class="f-xreq-tip">
        <IconVue3 name="shield" :size="15" />
        <span>{{ t('寄送地址仅在对方同意后互相可见。请确认信息准确，方便彼此寄出实体卡片。') }}</span>
      </div>

      <div v-if="alertText" class="f-xreq-alert" data-xreq-alert role="alert">
        <IconVue3 name="alert" :size="16" /><span>{{ alertText }}</span>
      </div>

      <form class="f-xreq-form" data-xreq-form novalidate @submit.prevent="submitRequest">
        <div class="f-xreq-section-head">
          <b><IconVue3 name="map-pin" :size="16" /> {{ t('我的寄送地址') }}</b>
          <button
            type="button"
            class="f-xreq-restore"
            data-fill-profile
            :disabled="submitting"
            @click="refillFromProfile"
          >
            <IconVue3 name="refresh" :size="14" /> {{ t('重新填入资料地址') }}
          </button>
        </div>

        <p v-if="!hasSavedProfileAddress" class="f-xreq-empty-tip">
          <IconVue3 name="info" :size="14" /> {{ t('你还没有保存过地址，填写后将同步到个人资料。') }}
        </p>

        <div class="f-xreq-grid">
          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.name }" data-field="name">
            <span class="f-field-row">
              <span class="label">{{ t('收件人姓名') }}<i class="req">*</i></span>
            </span>
            <input
              v-model="form.name"
              class="input"
              name="name"
              type="text"
              :placeholder="t('真实姓名')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.name" class="f-error" data-error="name" role="alert">{{ fieldErrors.name }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.phone }" data-field="phone">
            <span class="f-field-row">
              <span class="label">{{ t('联系电话') }}<span class="f-optional">{{ t('选填') }}</span></span>
            </span>
            <input
              v-model="form.phone"
              class="input"
              name="phone"
              type="text"
              inputmode="tel"
              :placeholder="t('方便快递联系')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.phone" class="f-error" data-error="phone" role="alert">{{ fieldErrors.phone }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.province }" data-field="province">
            <span class="f-field-row">
              <span class="label">{{ t('省 / 自治区') }}<span class="f-optional">{{ t('选填') }}</span></span>
            </span>
            <input
              v-model="form.province"
              class="input"
              name="province"
              type="text"
              :placeholder="t('如：湖南省')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.province" class="f-error" data-error="province" role="alert">{{ fieldErrors.province }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.city }" data-field="city">
            <span class="f-field-row">
              <span class="label">{{ t('城市') }}<i class="req">*</i></span>
            </span>
            <input
              v-model="form.city"
              class="input"
              name="city"
              type="text"
              :placeholder="t('如：长沙市')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.city" class="f-error" data-error="city" role="alert">{{ fieldErrors.city }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.district }" data-field="district">
            <span class="f-field-row">
              <span class="label">{{ t('区 / 县') }}<span class="f-optional">{{ t('选填') }}</span></span>
            </span>
            <input
              v-model="form.district"
              class="input"
              name="district"
              type="text"
              :placeholder="t('如：岳麓区')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.district" class="f-error" data-error="district" role="alert">{{ fieldErrors.district }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.postalCode }" data-field="postalCode">
            <span class="f-field-row">
              <span class="label">{{ t('邮政编码') }}<span class="f-optional">{{ t('选填') }}</span></span>
            </span>
            <input
              v-model="form.postalCode"
              class="input"
              name="postalCode"
              type="text"
              inputmode="numeric"
              :placeholder="t('如：410000')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.postalCode" class="f-error" data-error="postalCode" role="alert">{{ fieldErrors.postalCode }}</span>
          </label>

          <label class="f-field f-xreq-field f-span-2" :class="{ 'has-error': !!fieldErrors.line1 }" data-field="line1">
            <span class="f-field-row">
              <span class="label">{{ t('详细地址') }}<i class="req">*</i></span>
            </span>
            <input
              v-model="form.line1"
              class="input"
              name="line1"
              type="text"
              :placeholder="t('街道、门牌号、单元楼室')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.line1" class="f-error" data-error="line1" role="alert">{{ fieldErrors.line1 }}</span>
          </label>

          <label class="f-field f-xreq-field" :class="{ 'has-error': !!fieldErrors.country }" data-field="country">
            <span class="f-field-row">
              <span class="label">{{ t('国家 / 地区') }}<span class="f-optional">{{ t('选填') }}</span></span>
            </span>
            <input
              v-model="form.country"
              class="input"
              name="country"
              type="text"
              :placeholder="t('中国')"
              :disabled="submitting"
              autocomplete="off"
            >
            <span v-if="fieldErrors.country" class="f-error" data-error="country" role="alert">{{ fieldErrors.country }}</span>
          </label>
        </div>

        <div class="f-xreq-section-head">
          <b><IconVue3 name="mail" :size="16" /> {{ t('给对方留言') }}</b>
          <span class="f-label-hint" data-msg-counter>{{ messageLength }} / 500</span>
        </div>
        <label class="f-field f-xreq-field f-span-2" :class="{ 'has-error': !!fieldErrors.message }" data-field="message">
          <textarea
            v-model="form.message"
            class="textarea"
            name="message"
            rows="3"
            :disabled="submitting"
            :placeholder="t('例如：希望交换卡片，73！')"
          ></textarea>
          <span v-if="fieldErrors.message" class="f-error" data-error="message" role="alert">{{ fieldErrors.message }}</span>
        </label>

        <section class="f-xreq-logs" :aria-label="t('选择通联记录')">
          <div class="f-xreq-section-head">
            <b><IconVue3 name="clock" :size="16" /> {{ t('附上通联记录') }}</b>
            <span class="f-label-hint">{{ t('选填 · 最多 100 条') }}</span>
          </div>
          <p class="muted">{{ t('请自行选择要分享给对方的记录。所选记录的全部下列信息将随申请发送，双方自行核对。') }}</p>
          <div class="f-xreq-log-search">
            <input
              v-model="logSearchInput"
              class="input"
              data-log-search
              :aria-label="t('搜索自己的通联日志')"
              :placeholder="t('输入对方呼号搜索自己的日志')"
              maxlength="32"
              :disabled="submitting"
              @keydown.enter.prevent="searchLogs"
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-log-search-btn
              :disabled="submitting"
              @click="searchLogs"
            >
              {{ t('搜索') }}
            </button>
          </div>
          <p data-log-status role="status">{{ logStatusText }}</p>
          <div class="f-xreq-log-options" data-log-options :aria-busy="logLoading ? 'true' : undefined">
            <label v-for="row in logRows" :key="row.id" class="f-xreq-log-option">
              <input
                type="checkbox"
                :data-select-log="row.id"
                :checked="selectedLogs.has(row.id)"
                :disabled="submitting"
                @change="toggleLog(row, $event)"
              >
              <span class="f-ex-log-record">
                <span v-for="[k, v] in formatContactLogPairsVue3(row, t)" :key="k"><b>{{ k }}</b> {{ v }}</span>
                <span>{{ t('LoTW 确认：') }}{{ row.lotwConfirmed ? t('是') : t('否') }}</span>
              </span>
            </label>
          </div>
          <div class="f-xreq-log-nav">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-log-prev
              :disabled="logPage <= 1 || logLoading"
              @click="loadLogs(Math.max(1, logPage - 1))"
            >
              {{ t('上一页') }}
            </button>
            <span data-log-page>{{ logPage }} / {{ logPages }}</span>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-log-next
              :disabled="logPage >= logPages || logLoading"
              @click="loadLogs(logPage + 1)"
            >
              {{ t('下一页') }}
            </button>
          </div>
          <details class="f-ex-submitted-logs">
            <summary data-log-selected-count>{{ t('已选择') }} {{ selectedLogs.size }} {{ t('条') }}</summary>
            <div data-log-selected>
              <label v-for="row in selectedLogList" :key="row.id" class="f-xreq-log-option">
                <input
                  type="checkbox"
                  :data-select-log="row.id"
                  checked
                  :disabled="submitting"
                  @change="toggleLog(row, $event)"
                >
                <span class="f-ex-log-record">
                  <span v-for="[k, v] in formatContactLogPairsVue3(row, t)" :key="k"><b>{{ k }}</b> {{ v }}</span>
                  <span>{{ t('LoTW 确认：') }}{{ row.lotwConfirmed ? t('是') : t('否') }}</span>
                </span>
              </label>
            </div>
          </details>
        </section>
      </form>
    </div>

    <template #actions>
      <button class="btn btn-ghost" type="button" :disabled="submitting" @click="handleClose">
        {{ t('取消') }}
      </button>
      <button class="btn btn-primary" type="button" :disabled="submitting" @click="submitRequest">
        {{ submitting ? t('发送中…') : t('发送申请') }}
      </button>
    </template>
  </DialogVue3>
</template>
