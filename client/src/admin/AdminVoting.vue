<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { ApplicationContext } from '../contracts';
import { CONTEST_API, beijingInput, beijingIso, conflict, message, type Voting } from './contracts';
import { useAdmin } from './use-admin';
import AdminFeedback from './AdminFeedback.vue';
const props = defineProps<{platform:ApplicationContext}>();
const api = useAdmin(props.platform), voting = ref<Voting>(), loading = ref(false), busy = ref(false), downloading = ref(false), stale = ref(false), error = ref(''), now = ref(Date.now());
const draft = reactive({startsAt:'',endsAt:''});
const status = computed(() => !voting.value?.startsAt || !voting.value?.endsAt ? '未设置（投票未开放）' : now.value < Date.parse(voting.value.startsAt) ? '未开始' : now.value < Date.parse(voting.value.endsAt) ? '投票进行中' : '已结束');
function apply(value:Voting) { voting.value = value; draft.startsAt = beijingInput(value.startsAt); draft.endsAt = beijingInput(value.endsAt); stale.value = false; }
async function load() {
  if (busy.value || loading.value) return; loading.value = true; error.value = '';
  try { const result = await api.get<{voting:Voting}>(CONTEST_API + '/voting'); if (api.live()) apply(result.voting); }
  catch(err) { if (api.live()) { stale.value = true; error.value = props.platform.t(message(err)); } }
  finally { if (api.live()) loading.value = false; }
}
async function save() {
  if (busy.value || stale.value || !voting.value) return; error.value = '';
  try {
    if (!!draft.startsAt !== !!draft.endsAt) throw new Error('请同时填写开始和结束时间，或将两项均留空以关闭投票。');
    const startsAt = beijingIso(draft.startsAt), endsAt = beijingIso(draft.endsAt);
    if (startsAt && endsAt && startsAt >= endsAt) throw new Error('请输入有效的北京时间，且开始时间必须早于结束时间。');
    busy.value = true;
    const result = await api.put<{voting:Voting}>(CONTEST_API + '/voting',{startsAt,endsAt,expectedRevision:voting.value.revision});
    if (api.live()) { apply(result.voting); props.platform.toast(props.platform.t('投票时间已更新'), 'success'); }
  } catch(err) { if (api.live()) { stale.value = conflict(err); error.value = props.platform.t(stale.value ? '投票配置已更新，请刷新投票配置后重新保存。' : message(err)); } }
  finally { if (api.live()) busy.value = false; }
}
async function download() {
  if (downloading.value) return; downloading.value = true;
  try { await api.download(CONTEST_API + '/votes.xlsx','qsl-design-2026-11-votes.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
  catch(err) { if (api.live()) error.value = props.platform.t(message(err)); }
  finally { if (api.live()) downloading.value = false; }
}
let clock: ReturnType<typeof setInterval>;
onMounted(() => { void load(); clock = setInterval(() => { now.value = Date.now(); },1000); });
onBeforeUnmount(() => clearInterval(clock));
</script>
<template><section class="a-contest-section"><h2>{{ platform.t('投票管理') }}</h2><AdminFeedback v-if="!voting" :loading="loading" :error="error" :t="platform.t" @retry="load" /><form v-if="voting" class="a-contest-voting-form" @submit.prevent="save"><p class="a-contest-voting-status" role="status">{{ platform.t('当前状态') }}：{{ platform.t(status) }}</p><p class="muted">{{ platform.t('所有输入均为北京时间（UTC+08:00 / Asia/Shanghai），不使用设备当地时区。两项均留空并保存可关闭投票；开始时间必须早于结束时间。') }}</p><div class="a-contest-voting-times"><label>{{ platform.t('开始时间（北京时间 UTC+08:00）') }}<input v-model="draft.startsAt" name="startsAt" type="datetime-local" step="0.001" class="input" :disabled="busy || loading"></label><label>{{ platform.t('结束时间（北京时间 UTC+08:00）') }}<input v-model="draft.endsAt" name="endsAt" type="datetime-local" step="0.001" class="input" :disabled="busy || loading"></label></div><p role="alert" class="a-hint-error">{{ error }}</p><div class="a-announcement-actions"><button type="submit" class="btn btn-primary" :disabled="busy || loading || stale">{{ platform.t('保存投票时间') }}</button><button type="button" class="btn btn-ghost" :disabled="busy || loading" @click="load">{{ platform.t('刷新投票配置') }}</button><button type="button" class="btn btn-ghost" :disabled="downloading" @click="download">{{ platform.t('下载当前投票 XLSX') }}</button></div></form></section></template>
