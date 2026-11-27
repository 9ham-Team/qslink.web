<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import type { AnnouncementVue3, ApplicationContext } from '../contracts';
import { codeLength, fields, message } from './contracts';
import { useAdminList } from './use-admin-list';
import AdminFeedback from './AdminFeedback.vue';
import AdminPager from './AdminPager.vue';
import Dialog from '../components/Dialog.vue';
import AnnouncementBody from '../components/AnnouncementBody.vue';
const props = defineProps<{ platform: ApplicationContext; eventKey?: string }>();
const filters = computed(() => { const value: Record<string,string> = {}; if (props.eventKey) value.eventKey = props.eventKey; return value; });
const { api, data, loading, error, load } = useAdminList<AnnouncementVue3>(props.platform, '/api/admin/announcements', filters);
const opened = ref(false), id = ref(''), busy = ref(false), savingError = ref(''), errors = ref<Record<string,string>>({});
const draft = reactive({ title:'',body:'',displaySeconds:30,status:'draft' });
const bodyInput = ref<HTMLTextAreaElement | null>(null), imageInput = ref<HTMLInputElement | null>(null);
const imageAlt = ref(''), showPreview = ref(false);
const loadImage = (src: string, signal: AbortSignal) => props.platform.api.get<Blob>(src, { signal, responseType: 'blob' });

function edit(item?: AnnouncementVue3) {
  if (busy.value) return;
  id.value = item?.id || ''; Object.assign(draft,{title:item?.title || '',body:item?.body || '',displaySeconds:item?.displaySeconds || 30,status:item?.status || 'draft'});
  errors.value = {}; savingError.value = ''; imageAlt.value = ''; showPreview.value = false; opened.value = true;
}

async function insertImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value || !api.live()) return;
  const t = props.platform.t;
  savingError.value = '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    savingError.value = t('请选择 PNG、JPEG 或 WebP 图片');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    savingError.value = t('公告图片不能超过 3 MB');
    return;
  }
  const start = bodyInput.value?.selectionStart ?? draft.body.length;
  const end = bodyInput.value?.selectionEnd ?? start;
  busy.value = true;
  try {
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t('无法读取图片')));
      reader.readAsDataURL(file);
    });
    const { url } = await api.post<{ url: string }>('/api/admin/announcement-images', { image });
    const alt = imageAlt.value.trim().replace(/[\[\]\r\n]/g, ' ');
    const marker = '![' + alt + '](' + url + ')';
    draft.body = draft.body.slice(0, start) + marker + draft.body.slice(end);
    imageAlt.value = '';
    showPreview.value = true;
    busy.value = false;
    await nextTick();
    bodyInput.value?.focus();
    bodyInput.value?.setSelectionRange(start + marker.length, start + marker.length);
  } catch (err) {
    if (api.live()) savingError.value = t(message(err));
  } finally {
    if (api.live()) busy.value = false;
  }
}
async function save() {
  if (busy.value || !api.live()) return;
  errors.value = {}; savingError.value = '';
  if (!draft.title.trim() || codeLength(draft.title.trim()) > 120) errors.value.title = props.platform.t('请检查标题长度（1–120 字）');
  if (!draft.body.trim() || codeLength(draft.body.trim()) > 10000) errors.value.body = props.platform.t('请检查正文长度（1–10000 字）');
  if (!Number.isInteger(Number(draft.displaySeconds)) || Number(draft.displaySeconds) < 1 || Number(draft.displaySeconds) > 3600) errors.value.displaySeconds = props.platform.t('停留时长需为 1–3600 秒的整数');
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const body = { title:draft.title.trim(),body:draft.body.trim(),displaySeconds:Number(draft.displaySeconds),status:draft.status,...(props.eventKey ? {eventKey:props.eventKey} : {}) };
    if (id.value) await api.put('/api/admin/announcements/' + encodeURIComponent(id.value),body);
    else await api.post('/api/admin/announcements',body);
    if (api.live()) { opened.value = false; props.platform.toast(props.platform.t('公告已保存'), 'success'); void load(); }
  } catch (err) { if (api.live()) { errors.value = fields(err); savingError.value = props.platform.t(message(err)); } }
  finally { if (api.live()) busy.value = false; }
}
async function toggle(item: AnnouncementVue3) {
  if (busy.value) return; busy.value = true;
  try { await api.put('/api/admin/announcements/' + encodeURIComponent(item.id),{status:item.status === 'published' ? 'draft' : 'published'}); if (api.live()) void load(); }
  catch (err) { if (api.live()) props.platform.toast(props.platform.t(message(err)), 'error'); }
  finally { if (api.live()) busy.value = false; }
}
</script>
<template><section class="a-tab-body"><div class="toolbar a-toolbar"><h2>{{ platform.t(eventKey ? '赛事动态' : '公告管理') }}</h2><button type="button" class="btn btn-primary" :disabled="busy" @click="edit()">{{ platform.t(eventKey ? '新建赛事动态' : '新建公告') }}</button></div><AdminFeedback :loading="loading" :error="error" :empty="!data?.items.length" :t="platform.t" @retry="load()" /><div v-if="data && data.items.length && !loading && !error" class="a-cardlist"><article v-for="item in data.items" :key="item.id" class="a-announcement-row a-announcement-item"><h3>{{ item.title }}</h3><AnnouncementBody class="a-announcement-body a-contest-text" :body="item.body" images-as-text :image-label="platform.t('公告图片')" /><small>{{ platform.t(item.status === 'published' ? '已发布' : '草稿 / 已撤下') }} · {{ platform.formatDateTime(item.publishedAt || item.updatedAt || null) }} · {{ item.displaySeconds || 30 }} {{ platform.t('秒') }}</small><div class="a-announcement-actions"><button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="edit(item)">{{ platform.t('编辑') }}</button><button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="toggle(item)">{{ platform.t(item.status === 'published' ? '撤下' : '发布') }}</button></div></article></div><AdminPager v-if="data" :page="data" :t="platform.t" :busy="loading" @go="load" />
<Dialog v-if="opened" :title="platform.t(eventKey ? (id ? '编辑赛事动态' : '新建赛事动态') : (id ? '编辑公告' : '新建公告'))" :t="platform.t" :busy="busy" size="lg" @close="opened = false"><form id="admin-announcement-form" class="a-announcement-form" @submit.prevent="save"><label>{{ platform.t('标题') }}<input v-model="draft.title" name="title" class="input" required><small>{{ codeLength(draft.title) }} / 120</small></label><label>{{ platform.t('正文') }}<textarea ref="bodyInput" v-model="draft.body" name="body" class="textarea" :readonly="busy" required></textarea><small>{{ codeLength(draft.body) }} / 10000</small></label>
<div class="a-announcement-image-tools">
  <label>{{ platform.t('图片说明（选填）') }}<input v-model="imageAlt" class="input" maxlength="120" :disabled="busy"></label>
  <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden :disabled="busy" @change="insertImage">
  <button type="button" class="btn btn-ghost" :disabled="busy" @click="imageInput?.click()">{{ platform.t('插入图片') }}</button>
  <button type="button" class="btn btn-ghost" :aria-expanded="showPreview" @click="showPreview = !showPreview">{{ platform.t(showPreview ? '收起预览' : '预览正文') }}</button>
</div>
<small>{{ platform.t('图片插入在光标处。支持 PNG、JPEG、WebP，每张最多 3 MB，每条最多 8 张；删除正文中的图片标记即可移除。') }}</small>
<AnnouncementBody v-if="showPreview" class="a-announcement-image-preview" :body="draft.body" :load-image="loadImage" :image-error="platform.t('公告图片加载失败')" />
<label>{{ platform.t('弹窗停留时长（秒）') }}<input v-model.number="draft.displaySeconds" name="displaySeconds" type="number" min="1" max="3600" step="1" class="input" required></label><label>{{ platform.t('状态') }}<select v-model="draft.status" name="status" class="select"><option value="draft">{{ platform.t('草稿 / 已撤下') }}</option><option value="published">{{ platform.t('已发布') }}</option></select></label><p role="alert" class="a-hint-error">{{ savingError }}</p><p v-for="(value,key) in errors" :key="key" class="a-hint-error">{{ platform.t(value) }}</p></form><template #actions><button type="button" class="btn btn-ghost" :disabled="busy" @click="opened = false">{{ platform.t('取消') }}</button><button type="submit" form="admin-announcement-form" class="btn btn-primary" :disabled="busy">{{ platform.t('保存修改') }}</button></template></Dialog></section></template>

<style scoped>
.a-announcement-image-tools { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.a-announcement-image-tools label { flex: 1 1 180px; }
.a-announcement-image-preview { max-height: 300px; overflow: auto; }
</style>
