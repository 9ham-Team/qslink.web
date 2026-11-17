import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import type { ApplicationContext } from '../src/contracts';
import { beijingInput, beijingIso, normalizeTab, type AdminCard, type AdminUser } from '../src/admin/contracts';
import { useAdmin } from '../src/admin/use-admin';
import AdminUsers from '../src/admin/AdminUsers.vue';
import Admin from '../src/pages/Admin.vue';
import AdminUserDialog from '../src/admin/AdminUserDialog.vue';
import AdminCardDialog from '../src/admin/AdminCardDialog.vue';
import AdminAnnouncements from '../src/admin/AdminAnnouncements.vue';
import AdminVoting from '../src/admin/AdminVoting.vue';
import AdminEntryDialog from '../src/admin/AdminEntryDialog.vue';
import AdminJudging from '../src/admin/AdminJudging.vue';

const wrappers:VueWrapper[] = [];
function render(component:any, platform:ApplicationContext, props = {}) {
  const wrapper = mount(component,{props:{platform,...props},attachTo:document.body}); wrappers.push(wrapper); return wrapper;
}
function mock() {
  let token:string|null = 'token-a';
  const listeners = new Set<() => void>();
  const platform = {
    t:(s:string) => s, store:{user:{id:'admin',role:'admin',username:'admin'}},
    api:{ token:() => token, setToken:vi.fn((value:string|null) => {token=value;}),
      get:vi.fn().mockResolvedValue({items:[],total:0,page:1,pages:1}), put:vi.fn().mockResolvedValue({}), post:vi.fn().mockResolvedValue({}), del:vi.fn().mockResolvedValue({ok:true}) },
    on:vi.fn((_event:string,fn:() => void) => {listeners.add(fn);return () => listeners.delete(fn);}),
    setUser:vi.fn((user:any) => {platform.store.user = user;listeners.forEach(fn=>fn());}), toast:vi.fn(),
    formatDate:(s:string) => s, formatDateTime:(s:string) => s, statusText:(s:string) => s,
    images:{apply:vi.fn()},PLACEHOLDER_IMAGE:'',AVATAR_COLORS:['#0eaf8f'],card3d:{create:vi.fn()},
  };
  return {platform:platform as unknown as ApplicationContext, raw:platform, change:() => {token='token-b';platform.setUser({id:'other',role:'admin'});} };
}
const user = {id:'u1',username:'user',uid:'000000001',displayName:'User',email:'u@example.test',status:'active',role:'user',avatarColor:'#22c55e',createdAt:'2026-01-01'} as AdminUser;
const card = {id:'c1',title:'Card',status:'pending',ratio:{w:3,h:2},contestOptIn:true,contestDescription:'<img src=x onerror=alert(1)>',owner:{username:'user'}} as AdminCard;
beforeEach(() => { document.body.innerHTML = '<div id="modal-root"></div>'; vi.stubGlobal('matchMedia',() => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})); });
afterEach(() => { wrappers.splice(0).forEach(w=>w.unmount()); vi.unstubAllGlobals(); document.body.innerHTML=''; });

it('normalizes tabs and converts Beijing inputs independent of device timezone', () => {
  expect(normalizeTab('unknown')).toBe('overview');
  expect(normalizeTab('contest')).toBe('contest');
  expect(beijingIso('2026-11-20T16:00:00.123')).toBe('2026-11-20T08:00:00.123Z');
  expect(beijingInput('2026-11-20T08:00:00.123Z')).toBe('2026-11-20T16:00:00.123');
  expect(beijingIso('')).toBeNull();
});
it('aborts module requests on account switch and rejects late successful responses', async () => {
  const {platform,raw,change} = mock(); let resolve!:(v:any)=>void;
  raw.api.get.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  let scope!:ReturnType<typeof useAdmin>;
  const wrapper=mount(defineComponent({setup(){scope=useAdmin(platform);return()=>h('div');}})); wrappers.push(wrapper);
  const pending=scope.get('/api/admin/users').catch(err=>err);
  const signal=raw.api.get.mock.calls[0][1].signal; change(); expect(signal.aborted).toBe(true);
  resolve({items:[user]}); expect((await pending).name).toBe('AbortError');
});
it('ignores out-of-order searches and retries the failed target page', async () => {
  const {platform,raw}=mock();
  raw.api.get.mockResolvedValue({items:[user],total:12,page:1,pages:2});
  const wrapper=render(AdminUsers,platform);await flushPromises();
  raw.api.get.mockRejectedValueOnce(new Error('page two failed'));
  await wrapper.find('.a-pager-btns button:last-child').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('page two failed');
  raw.api.get.mockResolvedValue({items:[user],total:12,page:2,pages:2});
  await wrapper.find('.empty-state button').trigger('click');await flushPromises();
  expect(raw.api.get.mock.calls.at(-1)?.[0]).toContain('page=2');
  let resolve!:(v:any)=>void;
  raw.api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await wrapper.find('input[type=search]').setValue('old');await wrapper.find('form').trigger('submit');
  raw.api.get.mockResolvedValue({items:[{...user,displayName:'Newest'}],total:1,page:1,pages:1});
  await wrapper.find('input[type=search]').setValue('new');await wrapper.find('form').trigger('submit');await flushPromises();
  resolve({items:[{...user,displayName:'Stale'}],total:1,page:1,pages:1});await flushPromises();
  expect(wrapper.text()).toContain('Newest');expect(wrapper.text()).not.toContain('Stale');
});
it('saves Unicode names and original passwords, keeps arbitrary valid avatar colors, and omits self role/status', async () => {
  const {platform,raw}=mock();raw.api.put.mockResolvedValue({user:{...user,id:'admin',role:'admin'}});
  render(AdminUserDialog,platform,{user:{...user,id:'admin',role:'admin'},action:'edit'});
  const form=document.querySelector('form')!;
  const set = async (name:string,value:string) => { const input=form.querySelector<HTMLInputElement>('[name="'+name+'"]')!;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises(); };
  await set('displayName','😀'.repeat(30));await set('newPassword','  Abcdef123😀  ');
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
  const body=raw.api.put.mock.calls[0][1];
  expect(body.displayName).toBe('😀'.repeat(30));expect(body.newPassword).toBe('  Abcdef123😀  ');
  expect(body.avatarColor).toBe('#22c55e');expect(body).not.toHaveProperty('role');expect(body).not.toHaveProperty('status');
});
it('keeps a user editor open on failure and allows a successful retry', async () => {
  const {platform,raw}=mock();raw.api.put.mockRejectedValueOnce(Object.assign(new Error('taken'),{fields:{email:'EMAIL_TAKEN'}}));
  const wrapper=render(AdminUserDialog,platform,{user,action:'edit'});
  document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
  expect(document.body.textContent).toContain('EMAIL_TAKEN');expect(wrapper.emitted('saved')).toBeUndefined();
  raw.api.put.mockResolvedValue({user});
  document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
  expect(wrapper.emitted('saved')).toHaveLength(1);
});
it('requires explicit card approval, escapes auto-entry description, and never sends stock', async () => {
  const {platform,raw}=mock();const wrapper=render(AdminCardDialog,platform,{card,action:'approve'});
  expect(raw.api.put).not.toHaveBeenCalled();expect(document.querySelector('img[src=x]')).toBeNull();
  expect(document.body.textContent).toContain(card.contestDescription);
  document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
  expect(raw.api.put.mock.calls[0][1]).toEqual({status:'approved'});
  expect(wrapper.emitted('saved')).toHaveLength(1);
});
it('cancelling dangerous deletion sends no mutation', async () => {
  const {platform,raw}=mock();const wrapper=render(AdminCardDialog,platform,{card,action:'delete'});
  (document.querySelector('.modal-x') as HTMLButtonElement).click();await flushPromises();
  expect(wrapper.emitted('close')).toHaveLength(1);expect(raw.api.del).not.toHaveBeenCalled();
});
it('publishes announcements as plain text with separate event scope', async () => {
  const {platform,raw}=mock();const wrapper=render(AdminAnnouncements,platform,{eventKey:'qsl-design-2026-11'});await flushPromises();
  await wrapper.find('button.btn-primary').trigger('click');await flushPromises();
  const form=document.querySelector('form#admin-announcement-form')!;
  for (const name of ['title','body']) { const input=form.querySelector<HTMLInputElement>('[name="'+name+'"]')!;input.value='<b>text</b>';input.dispatchEvent(new Event('input',{bubbles:true})); }
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
  expect(raw.api.post.mock.calls[0][1]).toMatchObject({eventKey:'qsl-design-2026-11',title:'<b>text</b>',body:'<b>text</b>',displaySeconds:30});
});
it('preserves voting drafts after revision conflict and requires explicit refresh', async () => {
  const {platform,raw}=mock();raw.api.get.mockResolvedValue({voting:{revision:4,startsAt:null,endsAt:null}});
  const wrapper=render(AdminVoting,platform);await flushPromises();
  await wrapper.find('[name=startsAt]').setValue('2026-11-20T16:00');
  await wrapper.find('[name=endsAt]').setValue('2026-11-21T16:00');
  raw.api.put.mockRejectedValueOnce(Object.assign(new Error('conflict'),{status:409}));
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(raw.api.put.mock.calls[0][1]).toEqual({expectedRevision:4,startsAt:'2026-11-20T08:00:00.000Z',endsAt:'2026-11-21T08:00:00.000Z'});
  expect(wrapper.find('button[type=submit]').attributes('disabled')).toBeDefined();
  expect((wrapper.find('[name=startsAt]').element as HTMLInputElement).value).toContain('2026-11-20');
});
it('blocks stale contest reviews until details are refreshed', async () => {
  const {platform,raw}=mock();raw.api.get.mockResolvedValue({entry:{id:'e1',revision:7,status:'pending',cards:[{...card,status:'approved'}],works:[],contactEmail:'contact@test.dev'}});
  render(AdminEntryDialog,platform,{id:'e1'});await flushPromises();
  raw.api.put.mockRejectedValueOnce(Object.assign(new Error('stale'),{status:409}));
  const approve=Array.from(document.querySelectorAll<HTMLButtonElement>('.modal-actions button')).find(b=>b.textContent==='通过作品说明')!;
  approve.click();await flushPromises();expect(approve.disabled).toBe(true);
  expect(raw.api.put.mock.calls[0][1]).toMatchObject({expectedRevision:7,status:'approved'});
});
it('never auto-fetches judge scores and confirms starting a saved judging configuration', async () => {
  const {platform,raw}=mock();const judges=Array.from({length:5},(_,i)=>({userId:'u'+i,slot:i+1,username:'judge'+i}));
  raw.api.get.mockResolvedValue({judging:{revision:2,deadline:'2099-12-01T00:00:00.000Z',frozenAt:null,judges,totalWorks:0,canViewResults:false}});
  const wrapper=render(AdminJudging,platform);await flushPromises();
  expect(raw.api.get.mock.calls).toHaveLength(1);expect(wrapper.text()).not.toContain('加载人工评审结果');
  const start=wrapper.findAll('button').find(b=>b.text()==='开始并固定评审')!;
  expect(start.attributes('disabled')).toBeUndefined();await start.trigger('click');await flushPromises();
  expect(raw.api.post).not.toHaveBeenCalled();
  raw.api.post.mockResolvedValue({judging:{revision:3,deadline:'2099-12-01T00:00:00.000Z',frozenAt:'2026-11-01',judges,totalWorks:0,canViewResults:false}});
  Array.from(document.querySelectorAll<HTMLButtonElement>('.modal-actions button')).find(b=>b.textContent==='确认')!.click();await flushPromises();
  expect(raw.api.post.mock.calls[0][1]).toEqual({expectedRevision:2});
});
it('displays material sync errors without hiding existing judging progress', async () => {
  const {platform,raw}=mock();
  raw.t=(text:string,values?:Record<string,unknown>)=>text.replace(/\{(\w+)\}/g,(match,key)=>String(values?.[key] ?? match));
  raw.api.get.mockResolvedValue({judging:{revision:2,deadline:'2099-12-01T00:00:00.000Z',frozenAt:'2026-11-01',judges:[],totalWorks:68,canViewResults:false},materialSyncError:{number:27,reason:'冻结图片解码失败'}});
  const wrapper=render(AdminJudging,platform);await flushPromises();
  expect(wrapper.text()).toContain('评审材料更新失败');
  expect(wrapper.text()).toContain('冻结图片解码失败');
  expect(wrapper.find('.a-contest-voting-status').exists()).toBe(true);
});
it('exports all judging materials with one click and no number range', async () => {
  const {platform,raw}=mock();
  raw.api.get.mockResolvedValue({judging:{revision:2,deadline:'2099-12-01T00:00:00.000Z',frozenAt:'2026-11-01',judges:[],totalWorks:68,canViewResults:false}});
  const fetcher=vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['zip'])});
  vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:all-materials'),revokeObjectURL:vi.fn()}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const wrapper=render(AdminJudging,platform);await flushPromises();
  await wrapper.findAll('button').find(b=>b.text()==='一键导出全部材料 ZIP')!.trigger('click');await flushPromises();
  expect(fetcher).toHaveBeenCalledWith('/api/admin/contests/qsl-design-2026-11/judging/materials.zip',expect.objectContaining({headers:expect.objectContaining({Accept:'application/zip'})}));
  expect(click).toHaveBeenCalledOnce();click.mockRestore();
});
it('revokes download object URLs when leaving and prevents late 401 clearing another session', async () => {
  const {platform,raw,change}=mock();let scope!:ReturnType<typeof useAdmin>;
  const wrapper=mount(defineComponent({setup(){scope=useAdmin(platform);return()=>h('div');}}));wrappers.push(wrapper);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['test'])}));
  const create=vi.fn(()=> 'blob:test'), revoke=vi.fn();
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await scope.download('/api/admin/contests/qsl-design-2026-11/votes.xlsx','votes.xlsx','application/octet-stream');
  wrapper.unmount();expect(revoke).toHaveBeenCalledWith('blob:test');
  wrappers.splice(wrappers.indexOf(wrapper),1);
  const second=mount(defineComponent({setup(){scope=useAdmin(platform);return()=>h('div');}}));wrappers.push(second);
  let resolve!:(value:any)=>void;(fetch as any).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const download=scope.download('/api/admin/contests/qsl-design-2026-11/votes.xlsx','votes.xlsx','application/octet-stream').catch(err=>err);
  change();resolve({ok:false,status:401,json:async()=>({})});await download;
  expect(raw.api.setToken).not.toHaveBeenCalled();
});


it('moves to the last valid page after deleting its final row', async () => {
  const {platform,raw}=mock();
  raw.api.get.mockResolvedValueOnce({items:[user],total:2,page:1,pages:2});
  const wrapper=render(AdminUsers,platform);await flushPromises();
  raw.api.get.mockResolvedValueOnce({items:[],total:1,page:2,pages:1}).mockResolvedValueOnce({items:[user],total:1,page:1,pages:1});
  await wrapper.find('.a-pager-btns button:last-child').trigger('click');await flushPromises();
  expect(raw.api.get.mock.calls.at(-1)?.[0]).toContain('page=1');
  expect(wrapper.text()).toContain('User');
});
it('keeps voting writes disabled if an explicit configuration refresh fails', async () => {
  const {platform,raw}=mock();raw.api.get.mockResolvedValueOnce({voting:{revision:4,startsAt:null,endsAt:null}});
  const wrapper=render(AdminVoting,platform);await flushPromises();
  raw.api.get.mockRejectedValueOnce(new Error('offline'));
  await wrapper.findAll('button').find(b=>b.text()==='刷新投票配置')!.trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('offline');expect(wrapper.find('[type=submit]').attributes('disabled')).toBeDefined();
  raw.api.get.mockResolvedValue({voting:{revision:5,startsAt:null,endsAt:null}});
  await wrapper.findAll('button').find(b=>b.text()==='刷新投票配置')!.trigger('click');await flushPromises();
  expect(wrapper.find('[type=submit]').attributes('disabled')).toBeUndefined();
});
it('clears loaded private judging results on a changed revision without overwriting the draft', async () => {
  vi.useFakeTimers();
  const {platform,raw}=mock();
  const initial={revision:2,deadline:'2026-01-01T00:00:00Z',frozenAt:'2025-12-01T00:00:00Z',judges:[],totalWorks:1,canViewResults:true};
  raw.api.get.mockImplementation(async(path:string)=>path.endsWith('/results') ?
    {judges:[{slot:1}],items:[{number:1,title:'Material',complete:false,humanScore:null,scores:[{slot:1,score:5,comment:'private judge comment'}]}]} : {judging:initial});
  const wrapper=render(AdminJudging,platform);await flushPromises();
  try {
    await wrapper.findAll('button').find(b=>b.text()==='加载人工评审结果')!.trigger('click');await flushPromises();
    expect(wrapper.text()).toContain('private judge comment');
    await wrapper.find('[data-deadline]').setValue('2099-12-20T16:00');
    raw.api.get.mockResolvedValue({judging:{...initial,revision:3,deadline:'2099-01-01T00:00:00Z',canViewResults:false}});
    await vi.advanceTimersByTimeAsync(30000);await flushPromises();
    expect(wrapper.text()).not.toContain('private judge comment');
    expect(wrapper.text()).toContain('评审配置已变化，请刷新后重新操作。');
    expect((wrapper.find('[data-deadline]').element as HTMLInputElement).value).toContain('2099-12-20T16:00');
  } finally { wrapper.unmount();wrappers.splice(wrappers.indexOf(wrapper),1);vi.useRealTimers(); }
});

it('does not treat native text-selection events as admin tab navigation', async () => {
  const {platform,raw}=mock();const setQuery=vi.fn();platform.setQuery=setQuery;
  raw.api.get.mockImplementation(async(path:string)=>path==='/api/admin/stats' ?
    {users:{total:0},cards:{pending:0},exchanges:{pending:0}} : {items:[user],page:1,pages:1,total:1});
  const wrapper=render(Admin,platform,{ctx:{path:'/admin',params:{},query:new URLSearchParams('tab=users'),hash:''}});
  await flushPromises();
  await wrapper.find('input[type=search]').trigger('select');
  expect(setQuery).not.toHaveBeenCalled();
  expect(wrapper.find('[data-tab=users]').attributes('aria-selected')).toBe('true');
});
