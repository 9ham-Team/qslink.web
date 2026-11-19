<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { ApplicationContext } from '../contracts';
import { CONTEST_API, beijingInput, beijingIso, conflict, message, type AdminUser, type Judging, type JudgingResults, type Page } from './contracts';
import { useAdmin } from './use-admin';
import AdminFeedback from './AdminFeedback.vue';
import Dialog from '../components/Dialog.vue';
const props = defineProps<{platform:ApplicationContext}>();
const api = useAdmin(props.platform), endpoint = CONTEST_API + '/judging';
const judging = ref<Judging>(), results = ref<JudgingResults>(), loading = ref(false), busy = ref(false), downloading = ref<'all' | 'range' | 'scores'>(), stale = ref(false), error = ref('');
const syncError = ref('');
const downloadError = ref('');
const downloadLink = ref<Awaited<ReturnType<typeof api.download>>>();
function clearDownloadLink() {
  downloadLink.value?.release();
  downloadLink.value = undefined;
}
const deadline = ref(''), query = ref(''), users = ref<AdminUser[]>([]), searching = ref(false), searchError = ref('');
const selected = ref<Array<{id:string;displayName?:string;username?:string;uid?:string}>>([]);
const range = reactive({from:1,to:20});
const confirmation = ref<'start'|'config'>();
let searchJob = 0, poll:ReturnType<typeof setInterval>;
const dirty = computed(() => {
  if (!judging.value) return false;
  let date: string | null;
  try { date = beijingIso(deadline.value); } catch { return true; }
  return Date.parse(date || '') !== Date.parse(judging.value.deadline || '') &&
    !!(date || judging.value.deadline) ||
    selected.value.map(user => user.id).join(',') !== judging.value.judges.map(user => user.userId).join(',');
});
const locked = computed(() => busy.value || loading.value || stale.value || !!confirmation.value);
function apply(value:Judging) {
  clearDownloadLink();
  judging.value = value; deadline.value = beijingInput(value.deadline);
  selected.value = value.judges.map(user => ({...user,id:user.userId}));
  users.value = []; results.value = undefined; stale.value = false;
}
async function load(quiet = false) {
  if (loading.value || busy.value || confirmation.value) return;
  loading.value = true; if (!quiet) error.value = '';
  try {
    const data = await api.get<{judging:Judging; materialSyncError?: { number: number | null; reason: string }}>(endpoint);
    if (!api.live()) return;
    syncError.value = data.materialSyncError ? props.platform.t('评审材料更新失败（作品 #{number}）：{reason}。已有材料仍可评分，请联系管理员。', {number:data.materialSyncError.number ?? '—',reason:props.platform.t(data.materialSyncError.reason)}) : '';
    if (quiet && judging.value) {
      if (data.judging.revision !== judging.value.revision || data.judging.materialVersion !== judging.value.materialVersion || (dirty.value && data.judging.canViewResults !== judging.value.canViewResults)) {
        stale.value = true; results.value = undefined; clearDownloadLink();
        error.value = props.platform.t('评审配置已变化，请刷新后重新操作。');
      } else if (data.judging.canViewResults === judging.value.canViewResults) {
        judging.value = data.judging;
      } else apply(data.judging);
    } else apply(data.judging);
  } catch(err) {
    if (api.live()) { stale.value = true; results.value = undefined; error.value = props.platform.t(message(err)); }
  } finally { if (api.live()) loading.value = false; }
}
watch(query, () => { searchJob++; searching.value = false; users.value = []; });
async function search() {
  if (locked.value || !query.value.trim()) { searchError.value = props.platform.t('请输入用户名或 UID'); return; }
  const job = ++searchJob; searching.value = true; searchError.value = ''; users.value = [];
  try {
    const data = await api.get<Page<AdminUser>>('/api/admin/users?' + new URLSearchParams({q:query.value.trim(),role:'user',status:'active',limit:'20',page:'1'}));
    if (api.live() && job === searchJob) users.value = data.items.filter(user => user.role === 'user' && user.status === 'active');
  } catch(err) { if(api.live() && job === searchJob) searchError.value = props.platform.t(message(err)); }
  finally { if(api.live() && job === searchJob) searching.value = false; }
}
function add(user:AdminUser) {
  if (locked.value) return;
  if (!user.id || selected.value.length >= 5 || selected.value.some(item => item.id === user.id)) { error.value = props.platform.t('请选择 5 位不重复的正常普通用户'); return; }
  selected.value.push({...user,id:user.id});
}
async function save(starting:boolean, confirmed = false) {
  if (busy.value || loading.value || stale.value || !judging.value || !api.live()) return;
  error.value = '';
  let payload: Record<string,unknown> = {expectedRevision:judging.value.revision};
  if (starting) {
    if (judging.value.frozenAt || dirty.value || !judging.value.deadline || judging.value.judges.length !== 5) { error.value = props.platform.t('请先保存当前评审配置，再开始评审。'); return; }
  } else {
    let date: string | null = null;
    try { date = beijingIso(deadline.value); } catch { /* validated below */ }
    if (selected.value.length !== 5 || new Set(selected.value.map(user => user.id)).size !== 5 || !date || Date.parse(date) <= Date.now()) { error.value = props.platform.t('请选择 5 位不重复的正常普通用户，并填写未来的北京时间截止时间。'); return; }
    payload = {...payload,deadline:date,judgeUserIds:selected.value.map(user => user.id)};
  }
  if (!confirmed && (starting || judging.value.frozenAt)) { confirmation.value = starting ? 'start' : 'config'; return; }
  confirmation.value = undefined; busy.value = true;
  try {
    const data = starting ? await api.post<{judging:Judging}>(endpoint + '/start',payload) : await api.put<{judging:Judging}>(endpoint,payload);
    if(api.live()) apply(data.judging);
  } catch(err) { if(api.live()) { stale.value = conflict(err); if(stale.value) results.value = undefined; error.value = props.platform.t(message(err)); } }
  finally { if(api.live()) busy.value = false; }
}
async function loadResults() {
  if (!judging.value?.canViewResults || locked.value) return;
  busy.value = true;
  try { const data = await api.get<JudgingResults>(endpoint + '/results'); if(api.live()) results.value = data; }
  catch(err) { if(api.live()) { results.value = undefined; error.value = props.platform.t(message(err)); } }
  finally { if(api.live()) busy.value = false; }
}
async function download(materials:boolean, all = false) {
  if (locked.value || downloading.value || !judging.value || (materials ? !judging.value.frozenAt : !judging.value.canViewResults)) return;
  clearDownloadLink();
  downloadError.value = '';
  if (materials && !all && (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to < range.from)) { downloadError.value = props.platform.t('请输入有效作品编号范围。'); return; }
  downloading.value = materials ? (all ? 'all' : 'range') : 'scores';
  try { downloadLink.value = await api.download(materials ? endpoint + '/materials.zip' + (all ? '' : '?' + new URLSearchParams({from:String(range.from),to:String(range.to)})) : endpoint + '/scores.xlsx', materials ? 'qsl-design-2026-11-materials-' + (all ? 'all' : range.from + '-' + range.to) + '.zip' : 'qsl-design-2026-11-judging.xlsx',materials ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true); }
  catch(err) { if(api.live()) downloadError.value = err instanceof TypeError ? props.platform.t('下载失败，请稍后重试') : message(err); }
  finally { if(api.live()) downloading.value = undefined; }
}
onMounted(() => { void load(); poll = setInterval(() => { void load(true); },30000); });
onBeforeUnmount(() => { searchJob++; clearInterval(poll); });
</script>
<template><section class="a-contest-section a-judging-admin"><h2>{{ platform.t('人工评审管理') }}</h2><p class="muted">{{ platform.t('配置 5 位正常状态的普通用户。开始后仍可修改评委与截止时间；截止前自动补入新审核通过的参赛作品，保留已有材料与评分，并清除完成标记。被替换评委立即失去权限，其评分归档且不再计分，新评委须重新评分。延长已截止的评审会重新开放评分并暂时隐藏结果。') }}</p><AdminFeedback v-if="!judging" :loading="loading" :error="error" :t="platform.t" @retry="load()" /><template v-if="judging"><p class="a-contest-voting-status">{{ platform.t(judging.frozenAt ? '评审已开始，截止前自动补入新作品' : '评审尚未开始') }} · {{ platform.t('材料版本：{version} · 共 {n} 件作品', {version:judging.materialVersion || '—',n:judging.totalWorks}) }}</p><label class="field">{{ platform.t('截止时间（北京时间 UTC+08:00）') }}<input v-model="deadline" type="datetime-local" step="0.001" class="input" data-deadline :disabled="locked"></label>
<form class="a-judging-search" @submit.prevent="search"><label>{{ platform.t('搜索评委用户名或 UID') }}<input v-model="query" type="search" name="q" class="input" :disabled="locked"></label><button type="submit" class="btn btn-ghost" :disabled="locked || searching">{{ platform.t('搜索用户') }}</button></form><p role="status">{{ searchError }}</p><div aria-live="polite"><button v-for="user in users" :key="user.id" type="button" class="btn btn-ghost" :disabled="locked" @click="add(user)">{{ user.displayName || user.username }} @{{ user.username }} · UID {{ user.uid }}</button></div><ol class="a-judging-selected"><li v-for="(user,index) in selected" :key="user.id"><span>{{ platform.t('评委 {n}',{n:index+1}) }} · {{ user.displayName || user.username }} · UID {{ user.uid }}</span><button type="button" class="btn btn-ghost btn-sm" :disabled="locked" @click="selected.splice(index,1)">{{ platform.t('移除') }}</button></li></ol><button type="button" class="btn btn-primary" :disabled="locked" @click="save(false)">{{ platform.t('保存评审配置') }}</button><p role="alert" class="a-hint-error">{{ error }}</p><p v-if="syncError" role="alert" class="a-hint-error">{{ syncError }}</p><div class="a-announcement-actions"><button type="button" class="btn btn-primary" :disabled="locked || !!judging.frozenAt || dirty || !judging.deadline || judging.judges.length !== 5" @click="save(true)">{{ platform.t('开始并固定评审') }}</button><button type="button" class="btn btn-ghost" :disabled="busy || loading || !!confirmation" @click="load()">{{ platform.t('刷新评审配置与进度') }}</button></div>
<h3>{{ platform.t('评委完成进度') }}</h3><div class="a-judging-table"><table><thead><tr><th>{{ platform.t('评委') }}</th><th>{{ platform.t('已保存作品') }}</th><th>{{ platform.t('完成标记') }}</th></tr></thead><tbody><tr v-for="judge in judging.judges" :key="judge.userId"><td>{{ judge.displayName || judge.username }} · UID {{ judge.uid }}</td><td>{{ judge.scoredCount || 0 }} / {{ judging.totalWorks }}</td><td>{{ judge.submittedAt ? beijingInput(judge.submittedAt).replace('T',' ') + ' UTC+08:00' : platform.t('未标记完成') }}</td></tr></tbody></table></div>
<p class="muted">{{ platform.t(judging.canViewResults ? '结果可在截止后手动加载；不包含 AI 评分、投票分或最终排名。' : '截止前不显示任何评委分数或评语。') }}</p><button v-if="judging.canViewResults" type="button" class="btn btn-ghost" :disabled="locked" @click="loadResults">{{ platform.t('加载人工评审结果') }}</button><div v-if="results && judging.canViewResults && !stale"><h3>{{ platform.t('人工评审结果（非最终排名）') }}</h3><p class="muted">{{ platform.t('人工分：截止后按五位评委已保存评分，去掉一个最高分和一个最低分，余下三项平均后乘 5；缺项不计算。完成标记为可选，不影响汇总。') }}</p><div class="a-judging-table"><table><thead><tr><th>{{ platform.t('作品') }}</th><th v-for="judge in results.judges" :key="judge.slot">{{ platform.t('评委 {n}',{n:judge.slot}) }}</th><th>{{ platform.t('人工分 / 50') }}</th></tr></thead><tbody><tr v-for="item in results.items" :key="item.number"><td>#{{ item.number }} {{ item.title }}</td><td v-for="judge in results.judges" :key="judge.slot"><template v-for="score in item.scores.filter(score => score.slot === judge.slot)" :key="score.slot"><b>{{ score.score ?? '—' }}</b><small>{{ platform.t(score.submittedAt ? '已标记完成' : '未标记完成') }}</small><p class="a-judging-comment">{{ score.comment }}</p></template></td><td>{{ item.complete && item.humanScore != null ? item.humanScore : platform.t('评分未完成') }}</td></tr></tbody></table></div></div>
<div class="a-announcement-actions"><button type="button" class="btn btn-ghost" :disabled="locked || !!downloading || !judging.canViewResults" @click="download(false)">{{ platform.t(downloading === 'scores' ? '正在准备下载…' : '下载人工评分 XLSX') }}</button></div><h3>{{ platform.t('下载固定版评审材料 ZIP') }}</h3><p class="muted">{{ platform.t('支持一键导出全部有效评审作品，也可按编号范围下载。仅手动下载，不自动发送到任何第三方。') }}</p><p class="a-judging-notice">{{ platform.t('外发授权提示：材料含用户作品。下载不代表获得向 AI 或其他第三方外发、上传或再授权的许可；请先取得作者授权并核对平台条款。压缩包默认附带此提示。') }}</p><button type="button" class="btn btn-primary" :disabled="locked || !!downloading || !judging.frozenAt" @click="download(true, true)">{{ platform.t(downloading === 'all' ? '正在生成材料包…' : '一键导出全部材料 ZIP') }}</button><div class="a-judging-range"><label>{{ platform.t('起始作品编号') }}<input v-model.number="range.from" type="number" min="1" step="1" class="input"></label><label>{{ platform.t('结束作品编号') }}<input v-model.number="range.to" type="number" min="1" step="1" class="input"></label><button type="button" class="btn btn-ghost" :disabled="locked || !!downloading || !judging.frozenAt" @click="download(true)">{{ platform.t(downloading === 'range' ? '正在生成材料包…' : '下载此范围材料 ZIP') }}</button></div>
<p v-if="downloadError" role="alert" class="a-hint-error">{{ downloadError }}</p>
<div role="status" class="muted">
  <p v-if="downloading">{{ platform.t('正在准备下载…') }}</p>
  <p v-else-if="downloadLink">{{ platform.t('文件已准备好。若浏览器没有自动保存，请') }} <a class="section-link" :href="downloadLink.url" :download="downloadLink.filename">{{ platform.t('手动下载文件') }}</a></p>
</div></template>
<Dialog v-if="confirmation" :title="platform.t(confirmation === 'start' ? '开始并固定评审' : '确认调整评审配置')" :t="platform.t" @close="confirmation = undefined"><p>{{ platform.t(confirmation === 'start' ? '开始将固定当前审核通过作品材料；截止前新审核通过的参赛作品会自动补入，已有材料与评分保留，完成标记会清除。请确认已保存配置且材料完整。' : '留任评委保留评分；被替换评委立即失去权限，旧评分归档且不再计分，新评委须重新评分。修改截止时间可能重新开放评分并隐藏结果。确认保存？') }}</p><template #actions><button type="button" class="btn btn-ghost" @click="confirmation = undefined">{{ platform.t('取消') }}</button><button type="button" class="btn btn-primary" @click="save(confirmation === 'start',true)">{{ platform.t('确认') }}</button></template></Dialog></section></template>
