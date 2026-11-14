<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { contestApiVue3, contestPathVue3, type ContestServicesVue3, type WorkVue3, type VotingVue3 } from '../contracts-vue3';
import { beijingTimeVue3, votingBrowserVue3 } from '../services-vue3';
import { useContestScopeVue3 } from '../../composables/use-contest-scope-vue3';
import Card3DViewerVue3 from '../../components/Card3DViewer-vue3.vue';
import DialogVue3 from '../../components/Dialog-vue3.vue';
import AvatarVue3 from '../../components/Avatar-vue3.vue';
import ContestShareVue3 from '../components/ContestShare-vue3.vue';
const props = defineProps<{ id: string; services: ContestServicesVue3 }>(); const t = props.services.t;
const user = ref(props.services.currentUser());
const work = ref<WorkVue3>(), voting = ref<VotingVue3>(), error = ref(''), loading = ref(false), busy = ref(false), confirm = ref(false), uncertain = ref(false), now = ref(Date.now());
const scope = useContestScopeVue3(props.services, () => { user.value = props.services.currentUser(); confirm.value = false; work.value = undefined; voting.value = undefined; busy.value = false; void load(); });
const endpoint = () => contestApiVue3 + '/works/' + encodeURIComponent(props.id);
const voted = computed(() => voting.value?.votedWorkIds.some(id => String(id) === String(work.value?.id)));
const open = computed(() => !!voting.value?.isOpen && Number.isFinite(Date.parse(voting.value.startsAt || '')) && now.value >= Date.parse(voting.value.startsAt!) && now.value < Date.parse(voting.value.endsAt || ''));
const label = computed(() => !open.value ? '当前不在投票时间' : !user.value ? '登录后投票' : voted.value ? '已投票' : (voting.value?.votesUsed || 0) >= 5 ? '赛事票数已用完' : !voting.value?.eligible || uncertain.value ? '暂不可投票' : '为这件作品投票');
const disabled = computed(() => busy.value || loading.value || !open.value || uncertain.value || (!!user.value && (!!voted.value || (voting.value?.votesUsed || 0) >= 5 || !voting.value?.eligible)));
async function load() {
  const task = scope.renew(); confirm.value = false; busy.value = false; loading.value = true; error.value = '';
  try {
    const data = await props.services.get<{ work: WorkVue3; voting: VotingVue3 }>(endpoint(), task.signal);
    if (!scope.valid(task.id)) return;
    work.value = data.work; voting.value = data.voting; uncertain.value = false;
    document.title = (data.work.card.title || t('参赛作品')) + ' · QSLink';
  } catch (err) { if (scope.valid(task.id)) { work.value = undefined; voting.value = undefined; error.value = (err as Error).message || t('加载失败'); } }
  finally { if (scope.valid(task.id)) loading.value = false; }
}
function askVote() {
  if (disabled.value || !work.value) return;
  if (!user.value) { props.services.navigate('/login?next=' + encodeURIComponent(contestPathVue3 + '/works/' + props.id)); return; }
  confirm.value = true;
}
async function vote() {
  if (busy.value || disabled.value || !confirm.value) return;
  confirm.value = false; busy.value = true; error.value = '';
  const task = scope.renew();
  try {
    const fingerprint = votingBrowserVue3();
    if (!fingerprint) throw Error(t('无法读取投票浏览器标识，请允许本站存储后重试'));
    const data = await props.services.post<{ work: WorkVue3; voting: VotingVue3 }>(endpoint() + '/vote', { fingerprint }, task.signal);
    if (!scope.valid(task.id)) return;
    work.value = data.work; voting.value = data.voting; props.services.toast(t('投票成功，感谢你的支持！'), 'success');
  } catch (err) {
    if (!scope.valid(task.id)) return;
    error.value = (err as Error).message || t('投票失败，请稍后重试'); uncertain.value = true;
    props.services.toast(error.value, 'error');
    try {
      const data = await props.services.get<{ work: WorkVue3; voting: VotingVue3 }>(endpoint(), task.signal);
      if (scope.valid(task.id)) { work.value = data.work; voting.value = data.voting; uncertain.value = false; }
    } catch (failure) {
      if (scope.valid(task.id) && [401, 403, 404].includes((failure as { status?: number }).status || 0)) { work.value = undefined; voting.value = undefined; }
      // Otherwise keep writes disabled until an explicit successful refresh.
    }
  } finally { if (scope.valid(task.id)) busy.value = false; }
}
const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
watch(() => props.id, () => { work.value = undefined; void load(); }, { immediate: true });
onBeforeUnmount(() => clearInterval(timer));
</script>
<template><div class="g-contest-detail container"><nav class="g-crumbs" :aria-label="t('面包屑')"><a :href="contestPathVue3" data-link>{{ t('比赛信息') }}</a><span>/</span><a :href="contestPathVue3 + '/works'" data-link>{{ t('参赛作品') }}</a></nav>
  <div v-if="loading && !work" role="status"><p>{{ t('加载中…') }}</p><div class="skeleton skeleton-block" style="height:320px" aria-hidden="true"></div></div><div v-if="error" class="g-error-panel" role="alert"><p>{{ error }}</p><button class="btn btn-soft" type="button" :disabled="busy" @click="load">{{ t('重新加载') }}</button></div>
  <div v-if="work && voting" class="g-contest-detail__grid"><section class="g-contest-detail__viewer g-panel" style="overflow:clip"><div class="g-contest-detail__stage" :aria-label="t('3D 卡片查看器')"><Card3DViewerVue3 :front="work.card.frontImage || ''" :back="work.card.backImage" :ratio="work.card.ratio || { w: 3, h: 2 }" :create="services.createViewer" :options="{ width: 430, showControls: true, ambient: true }" /></div><p class="hint">{{ t('拖拽旋转 · 双击翻面') }}</p></section>
  <section class="g-contest-detail__info"><p class="eyebrow">{{ t('作品编号：{n}', { n: String(work.number).padStart(3, '0') }) }}</p><h1>{{ work.card.title || t('未命名卡片') }}</h1><div class="g-contest-detail__author owner-line"><AvatarVue3 :user="work.card.owner" :size="26" /><span>{{ work.card.owner.displayName }} {{ work.card.owner.callSign }}</span></div><p class="hint">{{ t('上传时间') }} · {{ beijingTimeVue3(work.card.createdAt || null) }}</p><h2>{{ t('作品说明') }}</h2><p class="g-contest-detail__description">{{ work.description || t('作品说明审核通过后展示，不影响图片展示与投票。') }}</p>
  <section class="g-contest-detail__voting" :aria-label="t('赛事投票')"><strong aria-live="polite">{{ t('{n} 票', { n: work.voteCount }) }}</strong><p class="hint">{{ t('每账号本赛事共 5 票，不设每日限制；同一作品只能投 1 次，允许为自己投票。投票后不可撤回。') }}</p><p class="hint">{{ t('账号正常可用即可投票，无需拥有广场卡片或报名参赛。') }}</p><p class="hint">{{ t('禁止多账号刷票、脚本投票及付费买票。同一浏览器跨账号合计最多 5 票，系统限制高频请求；共用浏览器请注意共享额度，遇到误拦请联系管理员。') }}</p><p class="hint">{{ t('投票时间') }} · {{ beijingTimeVue3(voting.startsAt) }} — {{ beijingTimeVue3(voting.endsAt) }}</p><p v-if="user" class="hint">{{ t('本赛事已用 {n} / 5 票', { n: voting.votesUsed }) }}</p><div class="g-contest-detail__actions"><button class="btn btn-primary" type="button" :disabled="disabled" @click="askVote">{{ t(label) }}</button><ContestShareVue3 :work="work" :services="services" /></div></section></section></div>
  <DialogVue3 v-if="confirm && work" :title="t('确认投票')" :t="t" @close="confirm = false"><p>{{ t('确定为作品 {n} 投出 1 票吗？投票后不可撤回。', { n: String(work.number).padStart(3, '0') }) }}</p><template #actions><button class="btn btn-ghost" type="button" @click="confirm = false">{{ t('取消') }}</button><button class="btn btn-primary" type="button" @click="vote">{{ t('确认投票') }}</button></template></DialogVue3>
</div></template>
