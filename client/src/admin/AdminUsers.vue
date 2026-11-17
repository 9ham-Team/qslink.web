<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import type { ApplicationContext } from '../contracts';
import type { AdminUser } from './contracts';
import { useAdminList } from './use-admin-list';
import { useAdminFilters } from './memory';
import AdminFeedback from './AdminFeedback.vue';
import AdminPager from './AdminPager.vue';
import AdminUserDialog from './AdminUserDialog.vue';
import Avatar from '../components/Avatar.vue';
const props = defineProps<{ platform: ApplicationContext }>();
const emit = defineEmits<{changed:[]}>();
const state = useAdminFilters('/api/admin/users',{q:'',status:'',role:''});
const search = toRef(state.filters,'q'), status = toRef(state.filters,'status'), role = toRef(state.filters,'role'), query = ref(search.value);
let searchTimer:ReturnType<typeof setTimeout>;
watch(query,value => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { search.value = value.trim(); },280); });
onBeforeUnmount(() => clearTimeout(searchTimer));
const filters = computed(() => ({ q: search.value, status: status.value, role: role.value }));
const { data, loading, error, load } = useAdminList<AdminUser>(props.platform, '/api/admin/users', filters, 10);
const editing = ref<{ user: AdminUser; action: 'edit' | 'ban' | 'delete' }>();
function saved() { editing.value = undefined; emit('changed'); void load(); }
</script>
<template><div class="a-tab-body"><form class="toolbar a-toolbar" @submit.prevent="search = query.trim()"><label class="a-search">{{ platform.t('搜索用户') }}<input v-model="query" name="q" type="search" class="input"></label><button class="btn btn-ghost" type="submit">{{ platform.t('搜索') }}</button><label>{{ platform.t('状态') }}<select v-model="status" class="select"><option value="">{{ platform.t('全部') }}</option><option value="active">{{ platform.t('正常') }}</option><option value="banned">{{ platform.t('已禁用') }}</option></select></label><label>{{ platform.t('角色') }}<select v-model="role" class="select"><option value="">{{ platform.t('全部') }}</option><option value="user">{{ platform.t('普通用户') }}</option><option value="admin">{{ platform.t('管理员') }}</option></select></label></form>
<AdminFeedback :loading="loading" :error="error" :empty="!data?.items.length" :t="platform.t" @retry="load()" />
<div v-if="data && data.items.length && !loading && !error" class="table-wrap a-table-wrap"><table class="table a-table a-users-table"><thead><tr><th>{{ platform.t('用户') }}</th><th>{{ platform.t('呼号') }}</th><th>{{ platform.t('邮箱') }}</th><th>{{ platform.t('角色') }}</th><th>{{ platform.t('状态') }}</th><th>{{ platform.t('卡片数') }}</th><th>{{ platform.t('操作') }}</th></tr></thead><tbody><tr v-for="user in data.items" :key="user.id"><td><div class="cell-user a-user-cell"><Avatar :user="user" /><div class="a-user-cell-text"><b>{{ user.displayName || user.username }}</b><small>@{{ user.username }} · UID {{ user.uid }}</small><small>{{ platform.formatDate(user.createdAt) }}</small><span v-if="user.id === platform.store.user?.id" class="badge badge-sky">{{ platform.t('本人') }}</span></div></div></td><td>{{ user.callSign || '—' }}</td><td>{{ user.email }}</td><td>{{ platform.t(user.role === 'admin' ? '管理员' : '普通用户') }}</td><td>{{ platform.t(user.status === 'banned' ? '已禁用' : '正常') }}</td><td class="a-col-num">{{ user.cardCount ?? user.stats?.cards ?? 0 }}</td><td><div class="a-row-actions"><button type="button" class="btn btn-ghost btn-sm" @click="editing = { user, action:'edit' }">{{ platform.t('编辑') }}</button><button type="button" class="btn btn-ghost btn-sm" :disabled="user.id === platform.store.user?.id" @click="editing = { user, action:'ban' }">{{ platform.t(user.status === 'banned' ? '恢复用户' : '禁用用户') }}</button><button type="button" class="btn btn-danger btn-sm" :disabled="user.id === platform.store.user?.id" @click="editing = { user, action:'delete' }">{{ platform.t('删除') }}</button></div></td></tr></tbody></table></div>
<AdminPager v-if="data" :page="data" :busy="loading" :t="platform.t" @go="load" /><AdminUserDialog v-if="editing" :platform="platform" :user="editing.user" :action="editing.action" @close="editing = undefined" @saved="saved" /></div></template>
