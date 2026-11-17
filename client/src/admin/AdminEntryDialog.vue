<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ApplicationContext } from '../contracts';
import { CONTEST_API, codeLength, conflict, message, type ContestEntry } from './contracts';
import { useAdmin } from './use-admin';
import Dialog from '../components/Dialog.vue';
import AdminFeedback from './AdminFeedback.vue';
import AdminCardImages from './AdminCardImages.vue';
const props = defineProps<{platform:ApplicationContext;id:string}>();
const emit = defineEmits<{close:[];saved:[]}>();
const api = useAdmin(props.platform), entry = ref<ContestEntry>(), loading = ref(false), busy = ref(false), stale = ref(false), error = ref(''), reason = ref('');
const canApprove = computed(() => !!entry.value?.cards.length && entry.value.cards.every(card => card.status === 'approved'));
async function load() {
  if (loading.value || busy.value) return; loading.value = true; error.value = '';
  try { const result = await api.get<{entry:ContestEntry}>(CONTEST_API + '/entries/' + encodeURIComponent(props.id)); if (api.live()) { entry.value = result.entry; reason.value = ''; stale.value = false; } }
  catch(err) { if(api.live()) error.value = props.platform.t(message(err)); }
  finally { if(api.live()) loading.value = false; }
}
async function review(status:string) {
  if (busy.value || loading.value || stale.value || !entry.value || (status === 'approved' && !canApprove.value)) return;
  const text = reason.value.trim();
  if ((status === 'rejected' && !text) || codeLength(text) > 200) { error.value = props.platform.t('请填写驳回原因。'); return; }
  busy.value = true; error.value = '';
  try { await api.put(CONTEST_API + '/entries/' + encodeURIComponent(props.id) + '/review',{status,reviewReason:text,expectedRevision:entry.value.revision}); if(api.live()) { props.platform.toast(props.platform.t('作品说明审核已更新'), 'success'); emit('saved'); } }
  catch(err) { if(api.live()) { stale.value = conflict(err); error.value = props.platform.t(stale.value ? '报名已更新，请刷新详情后重新审核。' : message(err)); } }
  finally { if(api.live()) busy.value = false; }
}
onMounted(load);
</script>
<template><Dialog :title="platform.t('比赛报名详情')" :t="platform.t" :busy="busy" size="lg" @close="emit('close')"><AdminFeedback :loading="loading" :error="!entry ? error : ''" :t="platform.t" @retry="load" /><div v-if="entry && !loading" class="a-contest-detail"><article v-for="work in entry.works" :key="work.number"><h3>#{{ String(work.number).padStart(3,'0') }} · {{ work.card?.title || platform.t('卡片已删除') }}</h3><template v-if="work.card"><AdminCardImages :card="work.card" :platform="platform" /><p>{{ platform.t('广场审核状态') }} · {{ platform.statusText(work.card.status || '') }}</p></template><h4>{{ platform.t('作品说明') }}</h4><p class="a-quote a-contest-text">{{ work.description }}</p></article><p>{{ entry.user?.displayName || entry.user?.username }} · {{ platform.statusText(entry.status) }}</p><h4>{{ platform.t('联系邮箱') }}</h4><p>{{ entry.contactEmail }}</p><small>{{ platform.t('仅参赛者本人及管理员可见，不修改账号邮箱。') }}</small><p v-if="entry.reviewReason" class="a-quote">{{ entry.reviewReason }}</p><label class="field">{{ platform.t('审核原因（驳回必填）') }}<textarea v-model="reason" name="reviewReason" class="textarea"></textarea></label><p v-if="!canApprove" class="a-hint-error">{{ platform.t('关联卡片未通过广场审核，不能批准报名。') }}</p><p role="alert" class="a-hint-error">{{ error }}</p></div><template #actions><button type="button" class="btn btn-ghost" :disabled="loading || busy" @click="load">{{ platform.t('刷新详情') }}</button><button type="button" class="btn btn-primary" :disabled="busy || loading || stale || !canApprove" @click="review('approved')">{{ platform.t('通过作品说明') }}</button><button type="button" class="btn btn-danger" :disabled="busy || loading || stale || !entry" @click="review('rejected')">{{ platform.t('驳回作品说明') }}</button></template></Dialog></template>
