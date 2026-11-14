<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { contestApiVue3, contestPathVue3, type ContestCardVue3, type ContestErrorVue3, type ContestServicesVue3, type EntryVue3 } from '../contracts-vue3';
import { validDescriptionVue3 } from '../services-vue3';
import { useContestScopeVue3 } from '../../composables/use-contest-scope-vue3';
import { useContestLeaveVue3 } from '../../composables/use-contest-leave-vue3';
import DialogVue3 from '../../components/Dialog-vue3.vue';
import ResponsiveImageVue3 from '../../components/ResponsiveImage-vue3.vue';
const props = defineProps<{ services: ContestServicesVue3 }>(); const t = props.services.t;
const user = ref(props.services.currentUser()), entry = ref<EntryVue3 | null>(null), cards = ref<ContestCardVue3[]>([]);
const loading = ref(false), saving = ref(false), editing = ref(false), loaded = ref(false), stale = ref(false), error = ref(''), email = ref('');
const selected = ref<string[]>([]), drafts = reactive<Record<string, string>>({}), fields = ref<Record<string, string>>({});
const picker = ref(false), checkPicker = ref(false), pending = ref<string[]>([]), descriptionId = ref(''), description = ref(''), descriptionError = ref('');
let baseline = '';
function signature() { return JSON.stringify({ selected: selected.value.map(id => [id, drafts[id] || '']), email: email.value }); }
const dirty = computed(() => editing.value && (signature() !== baseline || (!!descriptionId.value && description.value !== drafts[descriptionId.value])));
useContestLeaveVue3(() => dirty.value, () => t('刷新会丢弃尚未保存的报名修改，是否继续？'));
const scope = useContestScopeVue3(props.services, () => { user.value = props.services.currentUser(); closeModals(); entry.value = null; cards.value = []; selected.value = []; editing.value = loaded.value = false; saving.value = loading.value = false; email.value = ''; for (const id of Object.keys(drafts)) delete drafts[id]; void load(); });
const cardMap = computed(() => {
  const map = new Map<string, ContestCardVue3>();
  for (const work of entry.value?.works || []) if (work.card) map.set(work.cardId || work.card.id, work.card);
  for (const card of cards.value) map.set(card.id, card);
  return map;
});
const choices = computed(() => [...new Set([...selected.value, ...cards.value.map(card => card.id)])]);
const missing = computed(() => selected.value.some(id => !cards.value.some(card => card.id === id)));
const statusLabel = computed(() => entry.value?.status === 'approved' ? '作品说明已通过审核' : entry.value?.status === 'rejected' ? '作品说明未通过审核' : '作品说明审核中');
function number(id: string) { const work = entry.value?.works.find(work => (work.cardId || work.card?.id) === id); return work ? String(work.number).padStart(3, '0') : ''; }
function closeModals() { checkPicker.value = picker.value = false; descriptionId.value = ''; }
function resetDrafts() {
  for (const id of Object.keys(drafts)) delete drafts[id];
  selected.value = (entry.value?.works || []).map(work => work.cardId || work.card?.id).filter((id): id is string => !!id);
  for (const work of entry.value?.works || []) drafts[work.cardId || work.card.id] = work.description || '';
  email.value = entry.value?.contactEmail || user.value?.email || '';
  baseline = signature();
}
async function load() {
  if (saving.value || loading.value) return;
  if (dirty.value && !window.confirm(t('刷新会丢弃尚未保存的报名修改，是否继续？'))) return;
  closeModals();
  if (!user.value) { loading.value = false; loaded.value = true; return; }
  const task = scope.renew(); loading.value = true; error.value = ''; fields.value = {};
  try {
    const [registration, mine] = await Promise.all([
      props.services.get<{ entry: EntryVue3 | null }>(contestApiVue3 + '/entry', task.signal),
      props.services.get<{ items: ContestCardVue3[] }>('/api/me/cards', task.signal),
    ]);
    if (!scope.valid(task.id)) return;
    entry.value = registration.entry; cards.value = mine.items.filter(card => card.status === 'approved');
    resetDrafts(); editing.value = !entry.value; loaded.value = true; stale.value = false; props.services.resetEdits();
  } catch (failure) { if (scope.valid(task.id)) { error.value = (failure as Error).message || t('加载失败'); props.services.toast(error.value, 'error'); } }
  finally { if (scope.valid(task.id)) loading.value = false; }
}
function startEdit() { resetDrafts(); editing.value = true; error.value = ''; fields.value = {}; }
function openDescription(id: string) { descriptionId.value = id; description.value = drafts[id] || ''; descriptionError.value = ''; }
function saveDescription() {
  if (!validDescriptionVue3(description.value)) { descriptionError.value = t('作品说明须为 1–2000 字'); return; }
  drafts[descriptionId.value] = description.value.trim(); descriptionId.value = '';
}
function confirmCards() {
  if (pending.value.length < 1 || pending.value.length > 2) { error.value = t('请选择 1–2 张参赛卡片'); return; }
  checkPicker.value = true;
}
async function submit() {
  if (saving.value || loading.value || stale.value || !user.value) return;
  error.value = ''; fields.value = {};
  if (!selected.value.length || selected.value.length > 2) { error.value = t('请选择 1–2 张参赛卡片'); return; }
  const invalid = selected.value.find(id => !validDescriptionVue3(drafts[id] || ''));
  if (invalid) { error.value = t('请为每张参赛作品填写 1–2000 字说明'); openDescription(invalid); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) || email.value.trim().length > 120) { fields.value.contactEmail = t('邮箱格式不正确'); return; }
  const task = scope.renew(); saving.value = true;
  const payload = { works: selected.value.map(id => ({ cardId: id, description: drafts[id].trim() })), contactEmail: email.value.trim(), ...(entry.value ? { expectedRevision: entry.value.revision } : {}) };
  try {
    const result = await props.services.put<{ entry: EntryVue3 }>(contestApiVue3 + '/entry', payload, task.signal);
    if (!scope.valid(task.id)) return;
    entry.value = result.entry; resetDrafts(); editing.value = false; props.services.resetEdits(); props.services.toast(t('报名已保存'), 'success');
  } catch (failure) {
    if (!scope.valid(task.id)) return;
    const problem = failure as ContestErrorVue3;
    stale.value = problem.status === 409; fields.value = problem.fields || {};
    error.value = stale.value ? t('报名状态已变化。请先复制保留当前填写内容，再刷新报名状态后重试。') : problem.message || t('保存失败，请重试');
    props.services.toast(error.value, 'error');
  } finally { if (scope.valid(task.id)) saving.value = false; }
}
void load();
</script>

<template><div class="f-contest container"><header class="page-head"><h1>{{ t('比赛报名') }}</h1><p>{{ t('第一届QSLink杯QSL卡片设计大赛') }}</p><a class="btn btn-soft" :href="contestPathVue3" data-link>{{ t('比赛信息') }}</a></header>
  <section class="f-contest-registration" :aria-busy="loading || undefined"><div v-if="loading && !loaded" role="status"><p>{{ t('加载中…') }}</p><div class="skeleton skeleton-block" style="height:240px" aria-hidden="true"></div></div>
  <div v-else-if="!user" class="f-contest-guest"><h3>{{ t('登录后报名') }}</h3><p>{{ t('登录后选择自己的卡片，提交作品说明和联系邮箱。') }}</p><a class="btn btn-primary" :href="'/login?next=' + encodeURIComponent(contestPathVue3 + '/registration')" data-link>{{ t('登录并返回报名') }}</a></div>
  <template v-else><div v-if="error" class="f-contest-notice" role="alert"><p>{{ error }}</p><button class="btn btn-soft" type="button" :disabled="loading || saving" @click="load">{{ t(stale ? '刷新报名状态' : '重试') }}</button></div>
    <div v-if="entry && !editing" class="f-contest-result" :class="'f-contest-result--' + entry.status"><span class="f-contest-result-icon" aria-hidden="true"><svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path v-if="entry.status === 'approved'" d="m8 12 3 3 5-6"/><path v-else-if="entry.status === 'pending'" d="M12 6v6l4 2"/><path v-else d="M12 7v6m0 3v1"/></svg></span><p class="f-contest-result-label">{{ t('我的报名') }}</p><h3>{{ t(statusLabel) }}</h3><p v-if="entry.status === 'rejected'" class="f-contest-result-note">{{ t('驳回原因') }}：{{ entry.reviewReason || t('请修改后重新提交。') }}</p><p class="f-contest-result-note">{{ t('已通过广场审核的图片在报名后即可展示和接受投票；作品说明审核通过后公开，待审核或驳回不影响图片投票。') }}</p>
      <div class="f-contest-submitted-works"><article v-for="work in entry.works" :key="work.id" class="f-contest-submitted-work"><strong>{{ t('作品编号：{number}', { number: String(work.number).padStart(3, '0') }) }}</strong><h4>{{ work.card?.title || t('未命名卡片') }}</h4><p>{{ work.description }}</p></article></div><div class="f-contest-actions"><button class="btn btn-soft" type="button" :disabled="loading" @click="load">{{ t('刷新状态') }}</button><button class="btn btn-primary" type="button" :disabled="loading" @click="startEdit">{{ t('修改报名信息') }}</button></div>
    </div>
    <template v-else-if="editing && loaded"><p class="f-contest-form-intro">{{ t('每个账号一份报名，最多选择 2 件作品；上传卡片时勾选「审核通过后自动参赛」的作品也计入此上限。已通过广场审核的图片提交报名后即可展示和接受投票；作品说明审核通过后公开，修改报名资料需重新审核说明。') }}</p><p v-if="missing" class="f-contest-review">{{ t('原报名卡片已不可用或未通过广场审核，请重新选择已通过审核的卡片。') }}</p>
    <p v-if="!cards.length && !selected.length">{{ t('暂无可参赛卡片。请先上传卡片并通过广场审核，再回来报名。') }}</p><div class="f-contest-actions"><a class="btn btn-soft" href="/dashboard/cards/new" data-link>{{ t('上传卡片') }}</a><a class="btn btn-ghost" href="/dashboard/cards" data-link>{{ t('我的卡片') }}</a></div>
    <form @submit.prevent="submit"><fieldset :disabled="loading || saving" style="border:0;padding:0;min-width:0"><div class="field"><span class="label">{{ t('参赛卡片') }} *</span><div class="f-contest-selected"><article v-for="id in selected" :key="id" class="f-contest-selected-card"><span v-if="cardMap.get(id)" class="card-thumb" style="height:80px;aspect-ratio:3/2"><ResponsiveImageVue3 :src="cardMap.get(id)?.frontImage || ''" :alt="cardMap.get(id)?.title || ''" :services="services" /></span><h4>{{ cardMap.get(id)?.title || t('未命名卡片') }}</h4><p class="f-contest-work-number">{{ number(id) ? t('作品编号：{number}', { number: number(id) }) : t('提交后分配作品编号') }}</p><p class="f-contest-description-state" :class="{ 'is-complete': validDescriptionVue3(drafts[id] || '') }">{{ t(validDescriptionVue3(drafts[id] || '') ? '作品说明已填写' : '作品说明必填') }}</p><p class="f-contest-description-preview">{{ drafts[id] }}</p><div class="f-contest-work-actions"><button class="btn btn-ghost btn-sm" type="button" :aria-label="t('编辑作品说明：{title}', { title: cardMap.get(id)?.title || t('未命名卡片') })" @click="openDescription(id)">{{ t('作品说明') }}</button><button class="btn btn-ghost btn-sm" type="button" @click="selected = selected.filter(value => value !== id)">{{ t('移除') }}</button></div></article></div>
      <button class="btn btn-soft" type="button" @click="pending = selected.slice(); picker = true">{{ t('选择参赛卡片') }}</button><span class="hint">{{ t('已选择 {n}/2 张', { n: selected.length }) }}</span><p v-if="fields.works || fields.cardIds" class="f-modal-error">{{ fields.works || fields.cardIds }}</p></div>
      <label class="field"><span class="label">{{ t('联系邮箱') }} *</span><input v-model="email" class="input" name="contactEmail" type="email" autocomplete="email" maxlength="120" required :aria-invalid="!!fields.contactEmail"><span class="hint">{{ t('邮箱仅供本人及管理员查看，用于赛事联系，不会修改账号邮箱。') }}</span><span v-if="fields.contactEmail" class="f-modal-error">{{ fields.contactEmail }}</span></label><div class="f-contest-actions"><button class="btn btn-primary" type="submit" :disabled="stale">{{ t(entry ? '更新报名' : '提交报名') }}</button><button class="btn btn-ghost" type="button" @click="load">{{ t('刷新报名状态') }}</button></div></fieldset></form></template>
  </template></section>
  <DialogVue3 v-if="picker" :title="t('选择参赛卡片')" :t="t" size="lg" @close="picker = false; checkPicker = false"><p>{{ t('最多选择 2 张本人已通过广场审核的卡片。') }}</p><div class="f-ex-showcase" :inert="checkPicker || undefined"><label v-for="id in choices" :key="id" class="f-ex-choice"><input v-model="pending" type="checkbox" :value="id" :disabled="!pending.includes(id) && (pending.length >= 2 || !cards.some(card => card.id === id))"><span class="f-ex-choice__stage"><ResponsiveImageVue3 :src="cardMap.get(id)?.frontImage || ''" :alt="cardMap.get(id)?.title || ''" :services="services" /></span><span class="f-ex-choice__name">{{ cardMap.get(id)?.title || t('未命名卡片') }}</span><span class="f-ex-choice__check" aria-hidden="true">✓</span></label></div><p class="hint">{{ t('已选择 {n}/2 张', { n: pending.length }) }}</p><template #actions><button class="btn btn-ghost" type="button" @click="picker = false">{{ t('取消') }}</button><button class="btn btn-primary" type="button" :disabled="pending.length < 1 || pending.length > 2 || checkPicker" @click="confirmCards">{{ t('确认') }}</button></template></DialogVue3>
  <DialogVue3 v-if="checkPicker" :title="t('确认参赛卡片')" :t="t" size="sm" @close="checkPicker = false"><p>{{ t('确认选择以下 {n} 张卡片作为参赛作品？确认后仍可修改并重新提交。', { n: pending.length }) }}</p><ul><li v-for="id in pending" :key="id">{{ cardMap.get(id)?.title || t('未命名卡片') }}</li></ul><template #actions><button class="btn btn-ghost" type="button" @click="checkPicker = false">{{ t('返回修改') }}</button><button class="btn btn-primary" type="button" @click="selected = pending.slice(); checkPicker = picker = false">{{ t('确认') }}</button></template></DialogVue3>
  <DialogVue3 v-if="descriptionId" :title="t('作品说明')" :t="t" @close="descriptionId = ''"><h3>{{ cardMap.get(descriptionId)?.title }}</h3><label class="field"><span class="label">{{ t('作品说明') }} *</span><textarea v-model="description" class="textarea" rows="8" :aria-invalid="!!descriptionError"></textarea></label><p class="hint">{{ t('请填写 1–2000 字作品说明。保存仅更新当前草稿，提交报名后才会保存到服务器。') }}</p><p class="hint">{{ Array.from(description.trim()).length }} / 2000</p><p v-if="descriptionError" class="f-modal-error" role="alert">{{ descriptionError }}</p><template #actions><button class="btn btn-ghost" type="button" @click="descriptionId = ''">{{ t('取消') }}</button><button class="btn btn-primary" type="button" @click="saveDescription">{{ t('保存草稿') }}</button></template></DialogVue3>
</div></template>
