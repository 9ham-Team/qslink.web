<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import IconVue3 from '../components/Icon.vue';
import type {
  LogbookImportResultVue3,
  LogbookRowVue3,
  LogbookServicesVue3,
  SelfUserVue3,
} from '../contracts';
import {
  decodeAdifUtf8Vue3,
  encodeTq8Base64Vue3,
  isSecureLotwOriginVue3,
} from '../exchange-utils';

const props = defineProps<{
  services: LogbookServicesVue3;
}>();

const t = props.services.t;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const initialUser = props.services.user() as SelfUserVue3 | null;
const initialUserId = initialUser?.id || null;
const initialToken = props.services.token();

let disposed = false;
let authEpoch = 0;
let listGen = 0;
let listAbort: AbortController | null = null;
let importAbort: AbortController | null = null;

const currentUser = ref<SelfUserVue3 | null>(initialUser);
const isSecureLotw = isSecureLotwOriginVue3();

const hasCallSign = computed(() => !!(currentUser.value?.callSign && currentUser.value.callSign.trim()));
const normalizedCallSign = computed(() => (currentUser.value?.callSign || '').trim().toUpperCase());

// File import state
const fileInputRef = ref<HTMLInputElement>();
const selectedFile = ref<File | null>(null);
const fileError = ref('');

// LoTW import state
const lotwUsername = ref('');
const lotwPassword = ref('');
const lotwUsernameError = ref('');
const lotwPasswordError = ref('');

// Shared import state
const importing = ref(false);
const importSource = ref<'file' | 'lotw' | null>(null);
const importResult = ref<LogbookImportResultVue3 | null>(null);
const importErrorText = ref('');

// List & search state
const searchInput = ref('');
const committedQuery = ref('');
const committedPage = ref(1);
const pages = ref(1);
const totalFiltered = ref(0);
const stats = ref({ total: 0, confirmed: 0 });
const rows = ref<LogbookRowVue3[]>([]);
const listLoading = ref(true);
const listError = ref('');
const failedTarget = ref<{ page: number; query: string } | null>(null);

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function isSessionValid(epoch = authEpoch): boolean {
  if (disposed || epoch !== authEpoch) return false;
  const u = props.services.user() as SelfUserVue3 | null;
  return !!u && u.id === initialUserId && props.services.token() === initialToken;
}

function clearLotwCredentials() {
  lotwPassword.value = '';
}

function clearPrivateState() {
  listGen++;
  listAbort?.abort();
  listAbort = null;
  importAbort?.abort();
  importAbort = null;
  clearLotwCredentials();
  lotwUsername.value = '';
  lotwUsernameError.value = '';
  lotwPasswordError.value = '';
  fileError.value = '';
  selectedFile.value = null;
  if (fileInputRef.value) fileInputRef.value.value = '';
  importing.value = false;
  importSource.value = null;
  importResult.value = null;
  importErrorText.value = '';
  currentUser.value = null;
  rows.value = [];
  stats.value = { total: 0, confirmed: 0 };
  totalFiltered.value = 0;
  committedPage.value = 1;
  pages.value = 1;
  listLoading.value = false;
  listError.value = '';
  failedTarget.value = null;
}

async function loadList(targetPage = committedPage.value, targetQuery = committedQuery.value) {
  if (!isSessionValid()) return;
  const gen = ++listGen;
  const epoch = authEpoch;
  listAbort?.abort();
  const controller = new AbortController();
  listAbort = controller;

  listLoading.value = true;
  listError.value = '';
  failedTarget.value = null;

  try {
    const data = await props.services.listLogbook(targetPage, targetQuery, controller.signal);
    if (gen !== listGen || !isSessionValid(epoch)) return;
    rows.value = Array.isArray(data?.items) ? data.items : [];
    committedPage.value = Number(data?.page) || targetPage;
    committedQuery.value = targetQuery;
    failedTarget.value = null;
    pages.value = Math.max(1, Number(data?.pages) || 1);
    totalFiltered.value = Number(data?.total) || 0;
    stats.value = {
      total: Number(data?.stats?.total) || 0,
      confirmed: Number(data?.stats?.confirmed) || 0,
    };
    listLoading.value = false;
  } catch (err) {
    if (isAbortError(err) || gen !== listGen || !isSessionValid(epoch)) return;
    listLoading.value = false;
    failedTarget.value = { page: targetPage, query: targetQuery };
    const message = err instanceof Error && err.message ? err.message : t('日志加载失败');
    listError.value = message;
    props.services.toast(message, 'error');
  } finally {
    if (listAbort === controller) listAbort = null;
  }
}

function retryLoad() {
  const target = failedTarget.value;
  void loadList(target ? target.page : committedPage.value, target ? target.query : committedQuery.value);
}

function handleSearchSubmit() {
  if (importing.value || !isSessionValid()) return;
  const nextQuery = searchInput.value.trim();
  void loadList(1, nextQuery);
}

function goPrevPage() {
  if (listLoading.value || committedPage.value <= 1) return;
  void loadList(committedPage.value - 1, committedQuery.value);
}

function goNextPage() {
  if (listLoading.value || committedPage.value >= pages.value) return;
  void loadList(committedPage.value + 1, committedQuery.value);
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] || null;
  fileError.value = '';
}

function clearImportFeedback() {
  fileError.value = '';
  lotwUsernameError.value = '';
  lotwPasswordError.value = '';
  importResult.value = null;
  importErrorText.value = '';
}

async function handleFileImport() {
  if (importing.value || !isSessionValid()) return;
  if (!hasCallSign.value) {
    props.services.toast(t('请先在个人资料中设置呼号，才能导入通联日志'), 'info');
    return;
  }

  clearImportFeedback();
  const file = selectedFile.value || fileInputRef.value?.files?.[0] || null;
  if (!file || !/\.(adi|adif|tq8)$/i.test(file.name)) {
    const msg = t('请选择 .adi、.adif 或 .tq8 日志文件');
    fileError.value = msg;
    importErrorText.value = msg;
    props.services.toast(msg, 'error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    const msg = t('文件不能超过 5MB');
    fileError.value = msg;
    importErrorText.value = msg;
    props.services.toast(msg, 'error');
    return;
  }

  const epoch = authEpoch;
  importing.value = true;
  importSource.value = 'file';
  importAbort?.abort();
  const controller = new AbortController();
  importAbort = controller;

  try {
    const bytes = await file.arrayBuffer();
    if (!isSessionValid(epoch)) return;
    const payload = /\.(adi|adif)$/i.test(file.name)
      ? { adif: decodeAdifUtf8Vue3(bytes, t) }
      : { tq8: encodeTq8Base64Vue3(bytes) };
    if (!isSessionValid(epoch)) return;

    const result = await props.services.importLogbookFile(payload, controller.signal);
    if (!isSessionValid(epoch)) return;
    importResult.value = result;
    importing.value = false;
    importSource.value = null;
    void loadList(1, committedQuery.value);
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    importing.value = false;
    importSource.value = null;
    const apiErr = err as { fields?: Record<string, string>; message?: string };
    const message = apiErr?.fields
      ? Object.values(apiErr.fields).join('；')
      : apiErr?.message || t('导入失败');
    importErrorText.value = message;
    if (apiErr?.fields) {
      fileError.value = apiErr.fields.file || apiErr.fields.adif || apiErr.fields.tq8 || apiErr.fields.callSign || '';
    } else if (err instanceof Error && err.message) {
      fileError.value = err.message;
    }
    props.services.toast(message, 'error');
  } finally {
    clearLotwCredentials();
    if (importAbort === controller) importAbort = null;
    if (isSessionValid(epoch)) {
      importing.value = false;
      importSource.value = null;
    }
  }
}

async function handleLotwImport() {
  if (!isSecureLotw || importing.value || !isSessionValid()) return;
  if (!hasCallSign.value) {
    props.services.toast(t('请先在个人资料中设置呼号，才能导入通联日志'), 'info');
    return;
  }

  clearImportFeedback();
  const username = lotwUsername.value;
  const password = lotwPassword.value;
  // Clear password immediately before sending
  clearLotwCredentials();

  const epoch = authEpoch;
  importing.value = true;
  importSource.value = 'lotw';
  importAbort?.abort();
  const controller = new AbortController();
  importAbort = controller;

  try {
    const result = await props.services.importLotw({ username, password }, controller.signal);
    if (!isSessionValid(epoch)) return;
    importResult.value = result;
    importing.value = false;
    importSource.value = null;
    void loadList(1, committedQuery.value);
  } catch (err) {
    if (isAbortError(err) || !isSessionValid(epoch)) return;
    importing.value = false;
    importSource.value = null;
    const apiErr = err as { fields?: Record<string, string>; message?: string };
    const message = apiErr?.fields
      ? Object.values(apiErr.fields).join('；')
      : apiErr?.message || t('导入失败');
    importErrorText.value = message;
    if (apiErr?.fields) {
      lotwUsernameError.value = apiErr.fields.username || '';
      lotwPasswordError.value = apiErr.fields.password || '';
    }
    props.services.toast(message, 'error');
  } finally {
    clearLotwCredentials();
    if (importAbort === controller) importAbort = null;
    if (isSessionValid(epoch)) {
      importing.value = false;
      importSource.value = null;
    }
  }
}

const offAuth = props.services.onAuth(nextUser => {
  const tokenNow = props.services.token();
  if (nextUser && initialUserId && nextUser.id === initialUserId && tokenNow === initialToken) {
    currentUser.value = nextUser as SelfUserVue3;
    return;
  }
  authEpoch++;
  clearPrivateState();
  if (!nextUser) {
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/logbook'), { replace: true });
  } else {
    props.services.navigate('/dashboard/logbook', { replace: true });
  }
});

onMounted(() => {
  if (!initialUser) {
    clearPrivateState();
    props.services.navigate('/login?next=' + encodeURIComponent('/dashboard/logbook'), { replace: true });
    return;
  }
  void loadList(1, '');
});

onBeforeUnmount(() => {
  disposed = true;
  authEpoch++;
  offAuth();
  clearPrivateState();
});
</script>

<template>
  <section v-if="currentUser" class="container section f-logbook" data-vue3="logbook">
    <div class="page-head">
      <div class="page-head-main">
        <span class="eyebrow">MY LOGBOOK</span>
        <h1 class="page-title">{{ t('通联日志') }}</h1>
        <p class="page-desc">{{ t('把每一次电波相遇，收进自己的日志。日志仅本人可见，时间统一为 UTC。') }}</p>
      </div>
    </div>

    <p id="f-logbook-callsign-hint" class="hint f-logbook-callsign-hint">
      <template v-if="hasCallSign">
        {{ t('当前呼号：') }}<strong>{{ normalizedCallSign }}</strong>{{ t('。ADI / ADIF 若含 STATION_CALLSIGN，须与此呼号一致；缺少该字段时使用此呼号。TQ8 证书呼号和 LoTW 本站呼号也须一致。') }}
      </template>
      <template v-else>
        {{ t('请先') }}<a href="/dashboard/profile" data-link>{{ t('在个人资料中设置呼号') }}</a>{{ t('，才能导入通联日志。') }}
      </template>
    </p>

    <div class="f-logbook-imports">
      <form class="surface f-logbook-panel" data-file-import @submit.prevent="handleFileImport">
        <h2>{{ t('导入日志文件') }}</h2>
        <p class="muted">{{ t('支持 .adi / .adif 文本及 TQSL 签名的 .tq8 文件，每次最多 5MB、10000 条。重复通联会自动合并。') }}</p>
        <label class="field">
          <span class="label">{{ t('选择文件') }}</span>
          <input
            ref="fileInputRef"
            class="input"
            name="file"
            type="file"
            accept=".adi,.adif,.tq8"
            required
            :disabled="importing"
            @change="onFileChange"
          >
          <span class="hint f-logbook-error" data-field-error="file">{{ fileError }}</span>
        </label>
        <p class="hint">{{ t('ADI / ADIF 请使用 UTF-8 编码，本站呼号以个人资料设置为准。TQ8 请在 TQSL 选择“签名并保存供以后上传”生成，本站会核验证书呼号及签名。') }}</p>
        <div class="f-logbook-import-action" :class="{ 'is-locked': !hasCallSign }">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!hasCallSign || importing"
            :aria-describedby="!hasCallSign ? 'f-logbook-callsign-hint' : undefined"
          >
            {{ importing && importSource === 'file' ? t('正在导入…') : t('导入文件') }}
          </button>
          <span
            v-if="!hasCallSign"
            class="f-logbook-import-lock"
            role="img"
            :aria-label="t('请先设置呼号才能导入')"
            :title="t('请先设置呼号才能导入')"
          >
            <IconVue3 name="lock" :size="19" />
          </span>
        </div>
      </form>

      <form class="surface f-logbook-panel" data-lotw @submit.prevent="handleLotwImport">
        <h2>{{ t('从 LoTW 导入') }}</h2>
        <p class="muted">{{ t('使用 ARRL LoTW 账号，一次性下载已上传的通联与确认状态。') }}</p>
        <label class="field">
          <span class="label">{{ t('LoTW 用户名') }}</span>
          <input
            v-model="lotwUsername"
            class="input"
            name="username"
            autocomplete="off"
            maxlength="80"
            required
            :disabled="!isSecureLotw || importing"
          >
          <span class="hint f-logbook-error" data-field-error="username">{{ lotwUsernameError }}</span>
        </label>
        <label class="field">
          <span class="label">{{ t('LoTW 网站登录密码') }}</span>
          <input
            v-model="lotwPassword"
            class="input"
            name="password"
            type="password"
            autocomplete="off"
            maxlength="256"
            required
            :disabled="!isSecureLotw || importing"
          >
          <span class="hint f-logbook-error" data-field-error="password">{{ lotwPasswordError }}</span>
        </label>
        <p class="hint">{{ t('点击即通过本站服务器向 ARRL 请求日志；密码仅本次使用，不保存。不是 TQSL 证书密码。每分钟可导入一次。') }}</p>
        <div class="f-logbook-import-action" :class="{ 'is-locked': !hasCallSign }">
          <button
            class="btn btn-soft"
            type="submit"
            :disabled="!isSecureLotw || !hasCallSign || importing"
            :aria-describedby="!hasCallSign ? 'f-logbook-callsign-hint' : undefined"
          >
            {{ importing && importSource === 'lotw' ? t('正在导入…') : t('从 LoTW 导入') }}
          </button>
          <span
            v-if="!hasCallSign"
            class="f-logbook-import-lock"
            role="img"
            :aria-label="t('请先设置呼号才能导入')"
            :title="t('请先设置呼号才能导入')"
          >
            <IconVue3 name="lock" :size="19" />
          </span>
        </div>
        <p v-if="!isSecureLotw" class="hint" data-https>{{ t('为保护 LoTW 密码，请通过 HTTPS 访问本站后导入。') }}</p>
      </form>
    </div>

    <div
      v-if="importResult || importErrorText"
      class="surface f-logbook-panel f-logbook-result"
      data-result
      role="status"
    >
      <template v-if="importResult">
        <b>{{ t('导入完成') }}</b>
        <p>
          {{ t('新增') }} {{ importResult.added }} {{ t('条，更新') }} {{ importResult.updated }} {{ t('条，重复') }} {{ importResult.duplicates }} {{ t('条，跳过') }} {{ importResult.skipped }} {{ t('条。') }}
        </p>
        <template v-if="importResult.issues && importResult.issues.length">
          <ul>
            <li v-for="(issue, idx) in importResult.issues" :key="idx">
              {{ t('第') }} {{ issue.record }} {{ t('条：') }}{{ issue.message }}
            </li>
          </ul>
          <p class="hint">{{ t('最多显示前 10 条问题。') }}</p>
        </template>
      </template>
      <template v-else>
        {{ importErrorText }}
      </template>
    </div>

    <div class="surface f-logbook-panel">
      <div class="row between wrap">
        <h2>
          {{ t('我的通联') }}
          <small class="muted" data-stats>
            {{ stats.total }} {{ t('条 · LoTW 已确认') }} {{ stats.confirmed }} {{ t('条') }}
          </small>
        </h2>
        <form class="row wrap" data-search @submit.prevent="handleSearchSubmit">
          <label>
            <input
              v-model="searchInput"
              class="input"
              name="q"
              :placeholder="t('搜索对方呼号')"
              maxlength="32"
              :aria-label="t('搜索对方呼号')"
            >
          </label>
          <button class="btn btn-ghost" type="submit" :disabled="importing">{{ t('搜索') }}</button>
        </form>
      </div>

      <div data-list>
        <div v-if="listLoading" class="loading-box" role="status" aria-live="polite">
          <span class="spinner"></span><span>{{ t('正在加载通联日志…') }}</span>
        </div>
        <div v-else-if="listError" class="empty-state">
          <p>{{ t('日志加载失败') }}</p>
          <button class="btn btn-ghost" data-retry type="button" @click="retryLoad">
            {{ t('重试') }}
          </button>
        </div>
        <div v-else-if="rows.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('UTC 时间') }}</th>
                <th>{{ t('对方呼号') }}</th>
                <th>{{ t('本站呼号') }}</th>
                <th>{{ t('波段 / 模式') }}</th>
                <th>{{ t('频率 MHz') }}</th>
                <th>{{ t('RST 发 / 收') }}</th>
                <th>LoTW</th>
                <th>{{ t('来源') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td>{{ row.qsoAt.replace('T', ' ').slice(0, 19) }}</td>
                <td><strong>{{ row.callSign }}</strong></td>
                <td>{{ row.stationCallSign || '—' }}</td>
                <td>{{ row.band + ' / ' + (row.submode || row.mode) }}</td>
                <td>{{ row.frequency || '—' }}</td>
                <td>{{ (row.rstSent || '—') + ' / ' + (row.rstReceived || '—') }}</td>
                <td>
                  <span v-if="row.lotwConfirmed" class="badge badge-mint">{{ t('已确认') }}</span>
                  <span v-else class="muted">{{ t('未确认') }}</span>
                </td>
                <td>{{ row.source === 'lotw' ? 'LoTW' : row.source === 'tq8' ? 'TQ8' : 'ADIF' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state">
          <h3>{{ committedQuery ? t('没有匹配的通联') : t('还没有通联日志') }}</h3>
          <p>{{ t('通过上方的 ADI / ADIF、TQ8 文件或 LoTW 导入通联记录。') }}</p>
        </div>
      </div>

      <div class="row between f-logbook-pages">
        <button
          class="btn btn-ghost"
          data-prev
          type="button"
          :disabled="listLoading || committedPage <= 1"
          @click="goPrevPage"
        >
          {{ t('上一页') }}
        </button>
        <span data-page>{{ t('第') }} {{ committedPage }} / {{ pages }} {{ t('页 ·') }} {{ totalFiltered }} {{ t('条') }}</span>
        <button
          class="btn btn-ghost"
          data-next
          type="button"
          :disabled="listLoading || committedPage >= pages"
          @click="goNextPage"
        >
          {{ t('下一页') }}
        </button>
      </div>
    </div>
  </section>
</template>
