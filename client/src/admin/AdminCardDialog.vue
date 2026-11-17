<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { ApplicationContext } from '../contracts';
import { codeLength, fields, message, type AdminCard } from './contracts';
import { useAdmin } from './use-admin';
import Dialog from '../components/Dialog.vue';
import Card3DViewer from '../components/Card3DViewer.vue';
import AdminCardImages from './AdminCardImages.vue';
const props = defineProps<{ platform: ApplicationContext; card: AdminCard; action: 'edit' | 'approve' | 'reject' | 'delete' | 'preview' }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const api = useAdmin(props.platform), busy = ref(false), error = ref(''), errors = ref<Record<string,string>>({});
const draft = reactive({ title: props.card.title, callSign: props.card.callSign || '', notes: props.card.notes || '', status: props.card.status || 'pending', rejectReason: props.card.rejectReason || '', w: props.card.ratio.w, h: props.card.ratio.h });
const title = computed(() => ({edit:'编辑卡片 ·',approve:'通过审核',reject:'拒绝原因',delete:'删除卡片',preview:'查看卡片'}[props.action]));
const autoEntry = computed(() => props.card.contestOptIn && (props.action === 'approve' || (props.action === 'edit' && draft.status === 'approved')));
async function submit() {
  if (busy.value || !api.live()) return;
  error.value = ''; errors.value = {};
  let body: Record<string, unknown> = {};
  if (props.action === 'edit') {
    if (!draft.title.trim() || codeLength(draft.title.trim()) > 60) errors.value.title = props.platform.t('标题不能超过 60 个字符');
    if (codeLength(draft.callSign.trim()) > 20) errors.value.callSign = props.platform.t('呼号不能超过 20 个字符');
    if (codeLength(draft.notes.trim()) > 300) errors.value.notes = props.platform.t('卡片简介不能超过 300 个字符');
    if (![draft.w,draft.h].every(n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 1000)) errors.value.ratio = props.platform.t('宽度需为 1–1000 的整数');
    body = { title:draft.title.trim(), callSign:draft.callSign.trim().toUpperCase(), notes:draft.notes.trim(), ratio:{w:Number(draft.w),h:Number(draft.h)}, status:draft.status };
  } else body.status = props.action === 'approve' ? 'approved' : 'rejected';
  if (body.status === 'rejected') {
    if (codeLength(draft.rejectReason.trim()) > 200 || !draft.rejectReason.trim()) errors.value.rejectReason = props.platform.t('请填写拒绝原因');
    body.rejectReason = draft.rejectReason.trim();
  }
  if (props.action !== 'delete' && Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const path = '/api/admin/cards/' + encodeURIComponent(props.card.id);
    if (props.action === 'delete') await api.del(path);
    else {
      const result = await api.put<{ contestAutoEntry?: { status: string; reason?: string } }>(path, body);
      if (result.contestAutoEntry?.status === 'skipped' && api.live()) props.platform.toast(props.platform.t(result.contestAutoEntry.reason === 'limit' ? '卡片已通过，但该账号参赛作品已达 2 件，未自动参赛。' : result.contestAutoEntry.reason === 'description' ? '卡片已通过，但参赛说明无效，未自动参赛。' : '卡片已通过，但账号不可用，未自动参赛。'), 'info');
    }
    if (api.live()) { props.platform.toast(props.platform.t('卡片信息已更新'), 'success'); emit('saved'); }
  } catch (err) { if (api.live()) { error.value = props.platform.t(message(err)); errors.value = fields(err); } }
  finally { if (api.live()) busy.value = false; }
}
</script>
<template><Dialog :title="platform.t(title) + ' ' + card.title" :t="platform.t" :busy="busy" size="lg" @close="emit('close')">
<Card3DViewer v-if="action === 'preview'" :front="card.frontImage" :back="card.backImage" :ratio="card.ratio" :create="platform.card3d.create" :options="{width:430,showControls:true}"><template #fallback><AdminCardImages :card="card" :platform="platform" /></template></Card3DViewer>
<form v-else id="admin-card-form" class="modal-form" @submit.prevent="submit"><AdminCardImages :card="card" :platform="platform" /><p v-if="action === 'delete'" class="modal-text">{{ platform.t('删除后无法恢复，相关换卡记录也将被删除。') }}</p><template v-if="action === 'edit'"><p class="muted">{{ platform.t('如需更换正反面图片，请由卡片作者在「我的卡片」中重新上传。') }}</p><label class="field">{{ platform.t('标题') }}<input v-model="draft.title" name="title" class="input" required></label><label class="field">{{ platform.t('呼号') }}<input v-model="draft.callSign" name="callSign" class="input"></label><label class="field">{{ platform.t('宽高比') }}<span class="a-ratio-inputs"><input v-model.number="draft.w" name="ratioW" class="input" type="number" min="1" max="1000" step="1" :aria-label="platform.t('宽')"><input v-model.number="draft.h" name="ratioH" class="input" type="number" min="1" max="1000" step="1" :aria-label="platform.t('高')"></span></label><label class="field">{{ platform.t('审核状态') }}<select v-model="draft.status" class="select" name="status"><option v-for="s in ['pending','approved','rejected']" :key="s" :value="s">{{ platform.statusText(s) }}</option></select></label><label class="field">{{ platform.t('卡片简介') }}<textarea v-model="draft.notes" name="notes" class="textarea"></textarea></label></template>
<label v-if="action === 'reject' || (action === 'edit' && draft.status === 'rejected')" class="field">{{ platform.t('拒绝原因') }}<textarea v-model="draft.rejectReason" name="rejectReason" class="textarea" required></textarea></label>
<div v-if="autoEntry" class="a-info-block"><h4>{{ platform.t('通过审核并自动参赛') }}</h4><p>{{ platform.t('该卡片勾选了「审核通过后自动参赛」。通过后卡片将公开展示，参赛说明也将公开并参与投票。') }}</p><p class="a-quote a-contest-text">{{ card.contestDescription }}</p></div><p class="a-hint-error" role="alert">{{ error }}</p><p v-for="(value,key) in errors" :key="key" class="a-hint-error">{{ platform.t(value) }}</p></form>
<template #actions><button type="button" class="btn btn-ghost" :disabled="busy" @click="emit('close')">{{ platform.t('关闭') }}</button><button v-if="action !== 'preview'" type="submit" form="admin-card-form" class="btn" :class="action === 'delete' || action === 'reject' ? 'btn-danger' : 'btn-primary'" :disabled="busy">{{ platform.t(autoEntry ? '通过并参赛' : '确认') }}</button></template></Dialog></template>
