<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { contestApiVue3, type ContestErrorVue3, type ContestServicesVue3, type JudgingVue3, type MaterialVue3, type ScoreVue3 } from '../contracts-vue3';
import { beijingTimeVue3, validScoreVue3 } from '../services-vue3';
import { useContestScopeVue3 } from '../../composables/use-contest-scope-vue3';
import { useContestLeaveVue3 } from '../../composables/use-contest-leave-vue3';
import JudgingImagesVue3 from '../components/JudgingImages-vue3.vue';
import DialogVue3 from '../../components/Dialog-vue3.vue';
const props = defineProps<{ services: ContestServicesVue3 }>(); const t = props.services.t;
const endpoint = contestApiVue3 + '/judging';
const judging = ref<JudgingVue3 | null>(null), items = ref<MaterialVue3[]>([]), selected = ref(''), filter = ref('all');
const loading = ref(false), busy = ref(false), uncertain = ref(true), conflict = ref(false), error = ref(''), confirmation = ref(false), now = ref(Date.now());
const value = ref(''), comment = ref('');
const drafts = reactive(new Map<string, { value: string; comment: string; expectedRevision: number }>());
const scope = useContestScopeVue3(props.services, () => { clearPrivate(); loading.value = busy.value = false; if (props.services.user()) void load(false); });
const item = computed(() => items.value.find(work => work.id === selected.value));
function canWriteNow() { return !!judging.value?.isOpen && !uncertain.value && !conflict.value && Date.parse(judging.value.deadline || '') > Date.now(); }
const writable = computed(() => { void now.value; return canWriteNow(); });
const savedCount = computed(() => items.value.filter(work => !!work.score).length);
const canComplete = computed(() => writable.value && !busy.value && !loading.value && !judging.value?.submittedAt && !drafts.size && !!items.value.length && savedCount.value === items.value.length);
const visible = computed(() => items.value.filter(work => filter.value === 'all' || (filter.value === 'dirty' ? drafts.has(work.id) : filter.value === 'scored' ? !!work.score : !work.score)));
const status = computed(() => !judging.value ? '' : t('已保存 {n}/{total} 件 · 未保存 {dirty} 件', { n: savedCount.value, total: items.value.length, dirty: drafts.size }) + ' · ' +
  t('材料版本：{version} · 共 {n} 件作品', { version: judging.value.materialVersion || '—', n: judging.value.totalWorks }) + ' · ' +
  t('截止时间（北京时间）：{time}', { time: beijingTimeVue3(judging.value.deadline) }) + ' · ' +
  t(!judging.value.frozenAt ? '评审尚未开始' : !writable.value ? '评审已关闭或需刷新（只读）' : judging.value.submittedAt ? '已标记完成（截止前仍可修改）' : '评审进行中'));
useContestLeaveVue3(() => drafts.size > 0, () => t('存在未保存的评分，离开将丢失这些修改。确定离开？'));
function clearPrivate() { items.value = []; judging.value = null; selected.value = ''; value.value = comment.value = ''; drafts.clear(); confirmation.value = false; uncertain.value = true; error.value = t('此账号没有评审权限，或评审材料不可用。'); }
function problem(failure: unknown) {
  const issue = failure as ContestErrorVue3;
  uncertain.value = true;
  if ([401, 403, 404].includes(issue.status || 0)) { scope.renew(); loading.value = busy.value = false; clearPrivate(); }
  if (issue.status === 409) conflict.value = true;
  error.value = issue.message || t('加载失败');
}
function readEditor() {
  const draft = drafts.get(selected.value);
  value.value = draft ? draft.value : item.value?.score ? String(item.value.score.value) : '';
  comment.value = draft ? draft.comment : item.value?.score?.comment || '';
}
watch(selected, readEditor);
function edit() {
  if (!item.value || busy.value || !canWriteNow()) return;
  const work = item.value, prior = drafts.get(work.id);
  if (value.value === (work.score ? String(work.score.value) : '') && comment.value === (work.score?.comment || '')) drafts.delete(work.id);
  else drafts.set(work.id, { value: value.value, comment: comment.value, expectedRevision: prior ? prior.expectedRevision : work.score?.revision || 0 });
}
function scoreInput(event: Event) { value.value = (event.target as HTMLInputElement).value; edit(); }
function discard() {
  if (drafts.has(selected.value) && !window.confirm(t('确定放弃此作品未保存的修改？'))) return;
  drafts.delete(selected.value); readEditor();
}
async function load(discardDrafts = false) {
  if (loading.value || busy.value || confirmation.value) return;
  if (discardDrafts && drafts.size && !window.confirm(t('刷新会放弃全部未保存修改，确定继续？'))) return;
  const task = scope.renew(); loading.value = true;
  try {
    const data = await props.services.get<{ judging: JudgingVue3; items: MaterialVue3[] }>(endpoint, task.signal);
    if (!scope.valid(task.id)) return;
    if (discardDrafts) { drafts.clear(); conflict.value = false; }
    judging.value = data.judging; items.value = data.items; uncertain.value = false; error.value = '';
    // Remove drafts for materials no longer authorized by this sheet.
    for (const id of drafts.keys()) if (!data.items.some(work => work.id === id)) drafts.delete(id);
    if (!data.items.some(work => work.id === selected.value)) selected.value = data.items[0]?.id || '';
    if (!drafts.has(selected.value)) readEditor();
  } catch (failure) { if (scope.valid(task.id)) problem(failure); }
  finally { if (scope.valid(task.id)) loading.value = false; }
}
async function save() {
  if (busy.value || loading.value || !canWriteNow() || !item.value) return;
  if (!validScoreVue3(value.value, comment.value)) { error.value = t('请输入 0–10 的评分（最多一位小数），评语不能超过 1000 字。'); return; }
  const work = item.value, draft = drafts.get(work.id), task = scope.renew();
  busy.value = true; error.value = '';
  try {
    const data = await props.services.put<{ score: ScoreVue3; judging: JudgingVue3 }>(endpoint + '/materials/' + encodeURIComponent(work.id) + '/score',
      { expectedRevision: draft ? draft.expectedRevision : work.score?.revision || 0, score: Number(value.value), comment: comment.value }, task.signal);
    if (!scope.valid(task.id)) return;
    work.score = data.score; judging.value = data.judging; drafts.delete(work.id);
    if (selected.value === work.id) readEditor();
  } catch (failure) { if (scope.valid(task.id)) problem(failure); }
  finally { if (scope.valid(task.id)) busy.value = false; }
}
async function complete() {
  if (!confirmation.value || !canComplete.value || !canWriteNow()) return;
  confirmation.value = false; const task = scope.renew(); busy.value = true; error.value = '';
  try {
    const data = await props.services.post<{ judging: JudgingVue3 }>(endpoint + '/submit', { expectedRevision: judging.value!.revision }, task.signal);
    if (scope.valid(task.id)) judging.value = data.judging;
  } catch (failure) { if (scope.valid(task.id)) problem(failure); }
  finally { if (scope.valid(task.id)) busy.value = false; }
}
const tick = window.setInterval(() => { now.value = Date.now(); }, 1000);
const poll = window.setInterval(() => { void load(false); }, 30000);
void load(true);
onBeforeUnmount(() => { clearInterval(tick); clearInterval(poll); drafts.clear(); items.value = []; judging.value = null; });
</script>
<template><section class="container section f-judging"><p class="eyebrow">QSL DESIGN CONTEST · 2026.11</p><h1>{{ t('评委工作台') }}</h1><p class="muted">{{ t('仅显示本人评分。每件作品 0–10 分，最多一位小数；评语最多 1000 字。截止前可随时保存和修改。完成标记为可选，不会锁定评分；再次保存会清除完成标记。截止后以已保存评分汇总，无需完成标记。') }}</p><p role="status" aria-live="polite">{{ loading && !judging ? t('加载中…') : status }}</p><p v-if="error" class="f-judging-error" role="alert">{{ error }}</p>
  <div class="f-judging-toolbar"><label>{{ t('筛选作品') }}<select v-model="filter" class="select"><option value="all">{{ t('全部作品') }}</option><option value="pending">{{ t('未评分') }}</option><option value="scored">{{ t('已评分') }}</option><option value="dirty">{{ t('未保存') }}</option></select></label><button class="btn btn-ghost" type="button" :disabled="loading || busy" @click="load(true)">{{ t('刷新评审数据') }}</button><button class="btn btn-primary" type="button" :disabled="!canComplete" @click="confirmation = true">{{ t('标记评分完成') }}</button></div>
  <div class="f-judging-layout"><nav class="f-judging-list" :aria-label="t('评审作品')"><button v-for="work in visible" :key="work.id" class="f-judging-work" :class="{ 'is-active': work.id === selected }" type="button" :disabled="busy" :aria-current="work.id === selected ? 'true' : undefined" @click="selected = work.id"><b>#{{ String(work.number).padStart(3, '0') }} {{ work.title }}</b><small>{{ t(drafts.has(work.id) ? '未保存' : work.score ? '已评分' : '未评分') }}</small></button></nav>
  <section class="f-judging-detail"><template v-if="item"><h2>#{{ String(item.number).padStart(3, '0') }} {{ item.title }}</h2><p class="f-judging-description">{{ item.description }}</p><JudgingImagesVue3 :item="item" :services="services" @forbidden="problem" />
  <form @submit.prevent="save"><fieldset :disabled="busy || !writable" style="border:0;padding:0;min-width:0"><div class="f-judging-toolbar"><label>{{ t('评分（0–10，最多一位小数）') }}<input :value="value" class="input" name="score" type="number" min="0" max="10" step="0.1" required @input="scoreInput"></label><span role="status">{{ t(drafts.has(selected) ? '未保存' : item.score ? '已保存到服务器' : '未评分') }}</span></div><label>{{ t('评语（最多 1000 字）') }}<textarea v-model="comment" class="input" name="comment" rows="5" @input="edit"></textarea></label><p class="muted">{{ Array.from(comment).length }} / 1000</p><div class="f-judging-toolbar"><button class="btn btn-primary" type="submit" :disabled="loading">{{ t('保存此作品评分') }}</button><button class="btn btn-ghost" type="button" @click="discard">{{ t('放弃此作品未保存修改') }}</button></div></fieldset></form></template><p v-else class="muted">{{ t('请选择作品；评审开始后会显示固定版本的材料。') }}</p></section></div>
  <DialogVue3 v-if="confirmation" :title="t('标记评分完成')" :t="t" @close="confirmation = false"><p>{{ t('完成标记仅用于提示进度，不会锁定评分。截止前仍可修改，再次保存会清除标记；截止后汇总已保存评分，不要求完成标记。') }}</p><template #actions><button class="btn btn-ghost" type="button" @click="confirmation = false">{{ t('取消') }}</button><button class="btn btn-primary" type="button" :disabled="!canComplete" @click="complete">{{ t('确认标记完成') }}</button></template></DialogVue3>
</section></template>
