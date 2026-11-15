<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { LegacyQslVue3 } from '../contracts';
import type { AdminUser } from './contracts';
import { codeLength, fields, message } from './contracts';
import { useAdmin } from './use-admin';
import Dialog from '../components/Dialog.vue';
import Avatar from '../components/Avatar.vue';
const props = defineProps<{ qsl: LegacyQslVue3; user: AdminUser; action: 'edit' | 'delete' | 'ban' }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const api = useAdmin(props.qsl), busy = ref(false), error = ref(''), errors = ref<Record<string,string>>({});
const self = computed(() => props.user.id === props.qsl.state.user?.id);
const draft = reactive({ displayName: props.user.displayName || '', callSign: props.user.callSign || '', email: props.user.email || '', bio: props.user.bio || '', avatarColor: props.user.avatarColor || '#0eaf8f', role: props.user.role || 'user', status: props.user.status || 'active', newPassword: '' });
const colors = computed(() => [...new Set([...(props.qsl.AVATAR_COLORS || []), draft.avatarColor])]);
const title = computed(() => props.action === 'edit' ? '编辑用户 ·' : props.action === 'delete' ? '删除用户' : props.user.status === 'banned' ? '恢复用户' : '禁用用户');
async function submit() {
  if (busy.value || !api.live() || (self.value && props.action !== 'edit')) return;
  errors.value = {}; error.value = '';
  if (props.action === 'edit') {
    for (const [key, max] of [['displayName',30], ['callSign',20], ['bio',200]] as const)
      if (codeLength(draft[key].trim()) > max) errors.value[key] = props.qsl.t(key === 'displayName' ? '昵称不能超过 30 个字符' : key === 'callSign' ? '呼号不能超过 20 个字符' : '个人简介不能超过 200 个字符');
    if (!draft.displayName.trim()) errors.value.displayName = props.qsl.t('请填写显示名称');
    if (draft.newPassword && (codeLength(draft.newPassword) < 8 || codeLength(draft.newPassword) > 200 || !/[a-z]/i.test(draft.newPassword) || !/\d/.test(draft.newPassword))) errors.value.newPassword = props.qsl.t('新密码至少 8 位，且需包含字母与数字');
    if (!/^#[0-9a-f]{6}$/i.test(draft.avatarColor)) errors.value.avatarColor = props.qsl.t('头像颜色需为 #RRGGBB 格式');
    if (Object.keys(errors.value).length) return;
  }
  busy.value = true;
  try {
    const path = '/api/admin/users/' + encodeURIComponent(props.user.id!);
    if (props.action === 'delete') await api.del(path);
    else {
      const body = props.action === 'ban' ? { status: props.user.status === 'banned' ? 'active' : 'banned' } :
        { displayName: draft.displayName.trim(), callSign: draft.callSign.trim().toUpperCase(), email: draft.email.trim(), bio: draft.bio.trim(), avatarColor: draft.avatarColor,
          ...(!self.value ? { role: draft.role, status: draft.status } : {}), ...(draft.newPassword ? { newPassword: draft.newPassword } : {}) };
      const result = await api.put<{ user: AdminUser }>(path, body);
      if (self.value && api.live()) props.qsl.setUser?.(result.user);
    }
    if (api.live()) { draft.newPassword = ''; props.qsl.toast(props.qsl.t('用户信息已更新'), 'success'); emit('saved'); }
  } catch (err) { if (api.live()) { error.value = props.qsl.t(message(err)); errors.value = fields(err); } }
  finally { if (api.live()) busy.value = false; }
}
</script>
<template><Dialog :title="qsl.t(title) + ' ' + (user.displayName || user.username)" :t="qsl.t" :busy="busy" size="lg" @close="emit('close')">
<form id="admin-user-form" class="modal-form" @submit.prevent="submit"><template v-if="action === 'edit'"><div class="a-avatar-row"><Avatar :user="draft" :size="54" /><b>@{{ user.username }}</b></div><div class="form-grid">
<label v-for="field in ['displayName', 'callSign', 'email'] as const" :key="field" class="field">{{ qsl.t({ displayName:'显示名称', callSign:'呼号', email:'邮箱' }[field]) }}<input v-model="draft[field]" class="input" :name="field" :type="field === 'email' ? 'email' : 'text'" :required="field !== 'callSign'"><small class="a-hint-error">{{ errors[field] }}</small></label>
<label class="field">{{ qsl.t('角色') }}<select v-model="draft.role" name="role" class="select" :disabled="self"><option value="user">{{ qsl.t('普通用户') }}</option><option value="admin">{{ qsl.t('管理员') }}</option></select><small v-if="self">{{ qsl.t('不能修改自己的角色') }}</small></label>
<label class="field">{{ qsl.t('状态') }}<select v-model="draft.status" name="status" class="select" :disabled="self"><option value="active">{{ qsl.t('正常') }}</option><option value="banned">{{ qsl.t('已禁用') }}</option></select></label>
<label class="field span-2">{{ qsl.t('个人简介') }}<textarea v-model="draft.bio" name="bio" class="textarea"></textarea><small class="a-hint-error">{{ errors.bio }}</small></label>
<div class="field span-2"><span>{{ qsl.t('头像颜色') }}</span><div class="avatar-picker"><button v-for="color in colors" :key="color" type="button" class="avatar-swatch" :class="{ 'is-active': draft.avatarColor === color }" :style="{ background: color }" :aria-label="qsl.t('选择颜色') + ' ' + color" :aria-pressed="draft.avatarColor === color" @click="draft.avatarColor = color"></button></div><small class="a-hint-error">{{ errors.avatarColor }}</small></div>
<label class="field span-2">{{ qsl.t('重置密码') }}<input v-model="draft.newPassword" name="newPassword" type="password" class="input" autocomplete="new-password"><small>{{ qsl.t('留空则不修改；至少 8 位，需同时包含字母与数字') }}</small><small class="a-hint-error">{{ errors.newPassword }}</small></label>
</div></template><p v-else class="modal-text">{{ qsl.t(action === 'delete' ? '删除后无法恢复，相关卡片和换卡记录也将被删除。' : user.status === 'banned' ? '恢复后该用户可以正常登录。' : '禁用后该用户将无法登录') }}</p><p class="a-hint-error" role="alert">{{ error }}</p><p v-for="(value,key) in errors" :key="key" class="a-hint-error">{{ qsl.t(value) }}</p></form>
<template #actions><button type="button" class="btn btn-ghost" :disabled="busy" @click="emit('close')">{{ qsl.t('取消') }}</button><button form="admin-user-form" type="submit" class="btn" :class="action === 'edit' ? 'btn-primary' : 'btn-danger'" :disabled="busy || (self && action !== 'edit')">{{ qsl.t(action === 'edit' ? '保存修改' : '确认') }}</button></template></Dialog></template>
