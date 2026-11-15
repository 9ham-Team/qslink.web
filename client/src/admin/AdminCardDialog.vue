<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { LegacyQslVue3 } from '../contracts';
import { codeLength, fields, message, type AdminCard } from './contracts';
import { useAdmin } from './use-admin';
import Dialog from '../components/Dialog.vue';
import Card3DViewer from '../components/Card3DViewer.vue';
import AdminCardImages from './AdminCardImages.vue';
const props = defineProps<{ qsl: LegacyQslVue3; card: AdminCard; action: 'edit' | 'approve' | 'reject' | 'delete' | 'preview' }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const api = useAdmin(props.qsl), busy = ref(false), error = ref(''), errors = ref<Record<string,string>>({});
const draft = reactive({ title: props.card.title, callSign: props.card.callSign || '', notes: props.card.notes || '', status: props.card.status || 'pending', rejectReason: props.card.rejectReason || '', w: props.card.ratio.w, h: props.card.ratio.h });
const title = computed(() => ({edit:'编辑卡片 ·',approve:'通过审核',reject:'拒绝原因',delete:'删除卡片',preview:'查看卡片'}[props.action]));
const autoEntry = computed(() => props.card.contestOptIn && (props.action === 'approve' || (props.action === 'edit' && draft.status === 'approved')));
async function submit() {
  if (busy.value || !api.live()) return;
  error.value = ''; errors.value = {};
  let body: Record<string, unknown> = {};
  if (props.action === 'edit') {
    if (!draft.title.trim() || codeLength(draft.title.trim()) > 60) errors.value.title = props.qsl.t('标题不能超过 60 个字符');
    if (codeLength(draft.callSign.trim()) > 20) errors.value.callSign = props.qsl.t('呼号不能超过 20 个字符');
    if (codeLength(draft.notes.trim()) > 300) errors.value.notes = props.qsl.t('卡片简介不能超过 300 个字符');
    if (![draft.w,draft.h].every(n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 1000)) errors.value.ratio = props.qsl.t('宽度需为 1–1000 的整数');
    body = { title:draft.title.trim(), callSign:draft.callSign.trim().toUpperCase(), notes:draft.notes.trim(), ratio:{w:Number(draft.w),h:Number(draft.h)}, status:draft.status };
  } else body.status = props.action === 'approve' ? 'approved' : 'rejected';
  if (body.status === 'rejected') {
    if (codeLength(draft.rejectReason.trim()) > 200 || !draft.rejectReason.trim()) errors.value.rejectReason = props.qsl.t('请填写拒绝原因');
    body.rejectReason = draft.rejectReason.trim();
  }
  if (props.action !== 'delete' && Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const path = '/api/admin/cards/' + encodeURIComponent(props.card.id);
    if (props.action === 'delete') await api.del(path);
    else {
      const result = await api.put<{ contestAutoEntry?: { status: string; reason?: string } }>(path, body);
      if (result.contestAutoEntry?.status === 'skipped' && api.live()) props.qsl.toast(props.qsl.t(result.contestAutoEntry.reason === 'limit' ? '卡片已通过，但该账号参赛作品已达 2 件，未自动参赛。' : result.contestAutoEntry.reason === 'description' ? '卡片已通过，但参赛说明无效，未自动参赛。' : '卡片已通过，但账号不可用，未自动参赛。'), 'info');
    }
    if (api.live()) { props.qsl.toast(props.qsl.t('卡片信息已更新'), 'success'); emit('saved'); }
  } catch (err) { if (api.live()) { error.value = props.qsl.t(message(err)); errors.value = fields(err); } }
  finally { if (api.live()) busy.value = false; }
}
</script>
<template><Dialog :title="qsl.t(title) + ' ' + card.title" :t="qsl.t" :busy="busy" size="lg" @close="emit('close')">
<Card3DViewer v-if="action === 'preview'" :front="card.frontImage" :back="card.backImage" :ratio="card.ratio" :create="qsl.card3d.create" :options="{width:430,showControls:true}"><template #fallback><AdminCardImages :card="card" :qsl="qsl" /></template></Card3DViewer>
<form v-else id="admin-card-form" class="modal-form" @submit.prevent="submit"><AdminCardImages :card="card" :qsl="qsl" /><p v-if="action === 'delete'" class="modal-text">{{ qsl.t('删除后无法恢复，相关换卡记录也将被删除。') }}</p><template v-if="action === 'edit'"><p class="muted">{{ qsl.t('如需更换正反面图片，请由卡片作者在「我的卡片」中重新上传。') }}</p><label class="field">{{ qsl.t('标题') }}<input v-model="draft.title" name="title" class="input" required></label><label class="field">{{ qsl.t('呼号') }}<input v-model="draft.callSign" name="callSign" class="input"></label><label class="field">{{ qsl.t('宽高比') }}<span class="a-ratio-inputs"><input v-model.number="draft.w" name="ratioW" class="input" type="number" min="1" max="1000" step="1" :aria-label="qsl.t('宽')"><input v-model.number="draft.h" name="ratioH" class="input" type="number" min="1" max="1000" step="1" :aria-label="qsl.t('高')"></span></label><label class="field">{{ qsl.t('审核状态') }}<select v-model="draft.status" class="select" name="status"><option v-for="s in ['pending','approved','rejected']" :key="s" :value="s">{{ qsl.statusText(s) }}</option></select></label><label class="field">{{ qsl.t('卡片简介') }}<textarea v-model="draft.notes" name="notes" class="textarea"></textarea></label></template>
<label v-if="action === 'reject' || (action === 'edit' && draft.status === 'rejected')" class="field">{{ qsl.t('拒绝原因') }}<textarea v-model="draft.rejectReason" name="rejectReason" class="textarea" required></textarea></label>
<div v-if="autoEntry" class="a-info-block"><h4>{{ qsl.t('通过审核并自动参赛') }}</h4><p>{{ qsl.t('该卡片勾选了「审核通过后自动参赛」。通过后卡片将公开展示，参赛说明也将公开并参与投票。') }}</p><p class="a-quote a-contest-text">{{ card.contestDescription }}</p></div><p class="a-hint-error" role="alert">{{ error }}</p><p v-for="(value,key) in errors" :key="key" class="a-hint-error">{{ qsl.t(value) }}</p></form>
<template #actions><button type="button" class="btn btn-ghost" :disabled="busy" @click="emit('close')">{{ qsl.t('关闭') }}</button><button v-if="action !== 'preview'" type="submit" form="admin-card-form" class="btn" :class="action === 'delete' || action === 'reject' ? 'btn-danger' : 'btn-primary'" :disabled="busy">{{ qsl.t(autoEntry ? '通过并参赛' : '确认') }}</button></template></Dialog></template>
