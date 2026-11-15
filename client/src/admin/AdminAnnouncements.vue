<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { AnnouncementVue3, LegacyQslVue3 } from '../contracts';
import { codeLength, fields, message } from './contracts';
import { useAdminList } from './use-admin-list';
import AdminFeedback from './AdminFeedback.vue';
import AdminPager from './AdminPager.vue';
import Dialog from '../components/Dialog.vue';
const props = defineProps<{ qsl: LegacyQslVue3; eventKey?: string }>();
const filters = computed(() => { const value: Record<string,string> = {}; if (props.eventKey) value.eventKey = props.eventKey; return value; });
const { api, data, loading, error, load } = useAdminList<AnnouncementVue3>(props.qsl, '/api/admin/announcements', filters);
const opened = ref(false), id = ref(''), busy = ref(false), savingError = ref(''), errors = ref<Record<string,string>>({});
const draft = reactive({ title:'',body:'',displaySeconds:30,status:'draft' });
function edit(item?: AnnouncementVue3) {
  if (busy.value) return;
  id.value = item?.id || ''; Object.assign(draft,{title:item?.title || '',body:item?.body || '',displaySeconds:item?.displaySeconds || 30,status:item?.status || 'draft'});
  errors.value = {}; savingError.value = ''; opened.value = true;
}
async function save() {
  if (busy.value || !api.live()) return;
  errors.value = {}; savingError.value = '';
  if (!draft.title.trim() || codeLength(draft.title.trim()) > 120) errors.value.title = props.qsl.t('请检查标题长度（1–120 字）');
  if (!draft.body.trim() || codeLength(draft.body.trim()) > 10000) errors.value.body = props.qsl.t('请检查正文长度（1–10000 字）');
  if (!Number.isInteger(Number(draft.displaySeconds)) || Number(draft.displaySeconds) < 1 || Number(draft.displaySeconds) > 3600) errors.value.displaySeconds = props.qsl.t('停留时长需为 1–3600 秒的整数');
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const body = { title:draft.title.trim(),body:draft.body.trim(),displaySeconds:Number(draft.displaySeconds),status:draft.status,...(props.eventKey ? {eventKey:props.eventKey} : {}) };
    if (id.value) await api.put('/api/admin/announcements/' + encodeURIComponent(id.value),body);
    else await api.post('/api/admin/announcements',body);
    if (api.live()) { opened.value = false; props.qsl.toast(props.qsl.t('公告已保存'), 'success'); void load(); }
  } catch (err) { if (api.live()) { errors.value = fields(err); savingError.value = props.qsl.t(message(err)); } }
  finally { if (api.live()) busy.value = false; }
}
async function toggle(item: AnnouncementVue3) {
  if (busy.value) return; busy.value = true;
  try { await api.put('/api/admin/announcements/' + encodeURIComponent(item.id),{status:item.status === 'published' ? 'draft' : 'published'}); if (api.live()) void load(); }
  catch (err) { if (api.live()) props.qsl.toast(props.qsl.t(message(err)), 'error'); }
  finally { if (api.live()) busy.value = false; }
}
</script>
<template><section class="a-tab-body"><div class="toolbar a-toolbar"><h2>{{ qsl.t(eventKey ? '赛事动态' : '公告管理') }}</h2><button type="button" class="btn btn-primary" :disabled="busy" @click="edit()">{{ qsl.t(eventKey ? '新建赛事动态' : '新建公告') }}</button></div><AdminFeedback :loading="loading" :error="error" :empty="!data?.items.length" :t="qsl.t" @retry="load()" /><div v-if="data && data.items.length && !loading && !error" class="a-cardlist"><article v-for="item in data.items" :key="item.id" class="a-announcement-row a-announcement-item"><h3>{{ item.title }}</h3><p class="a-announcement-body a-contest-text">{{ item.body }}</p><small>{{ qsl.t(item.status === 'published' ? '已发布' : '草稿 / 已撤下') }} · {{ qsl.formatDateTime(item.publishedAt || item.updatedAt || null) }} · {{ item.displaySeconds || 30 }} {{ qsl.t('秒') }}</small><div class="a-announcement-actions"><button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="edit(item)">{{ qsl.t('编辑') }}</button><button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="toggle(item)">{{ qsl.t(item.status === 'published' ? '撤下' : '发布') }}</button></div></article></div><AdminPager v-if="data" :page="data" :t="qsl.t" :busy="loading" @go="load" />
<Dialog v-if="opened" :title="qsl.t(eventKey ? (id ? '编辑赛事动态' : '新建赛事动态') : (id ? '编辑公告' : '新建公告'))" :t="qsl.t" :busy="busy" size="lg" @close="opened = false"><form id="admin-announcement-form" class="a-announcement-form" @submit.prevent="save"><label>{{ qsl.t('标题') }}<input v-model="draft.title" name="title" class="input" required><small>{{ codeLength(draft.title) }} / 120</small></label><label>{{ qsl.t('正文（纯文本）') }}<textarea v-model="draft.body" name="body" class="textarea" required></textarea><small>{{ codeLength(draft.body) }} / 10000</small></label><label>{{ qsl.t('弹窗停留时长（秒）') }}<input v-model.number="draft.displaySeconds" name="displaySeconds" type="number" min="1" max="3600" step="1" class="input" required></label><label>{{ qsl.t('状态') }}<select v-model="draft.status" name="status" class="select"><option value="draft">{{ qsl.t('草稿 / 已撤下') }}</option><option value="published">{{ qsl.t('已发布') }}</option></select></label><p role="alert" class="a-hint-error">{{ savingError }}</p><p v-for="(value,key) in errors" :key="key" class="a-hint-error">{{ qsl.t(value) }}</p></form><template #actions><button type="button" class="btn btn-ghost" :disabled="busy" @click="opened = false">{{ qsl.t('取消') }}</button><button type="submit" form="admin-announcement-form" class="btn btn-primary" :disabled="busy">{{ qsl.t('保存修改') }}</button></template></Dialog></section></template>
