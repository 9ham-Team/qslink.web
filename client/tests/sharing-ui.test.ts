import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CardShareControl from '../src/components/CardShareControl.vue';
import PosterPreview from '../src/components/PosterPreview.vue';
const wrappers:VueWrapper[]=[];
beforeEach(()=>{
  document.body.innerHTML='<div id="modal-root"></div>';
  vi.stubGlobal('matchMedia',(query:string)=>({matches:query.includes('pointer'),addEventListener(){},removeEventListener(){}}));
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
});
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());vi.unstubAllGlobals();vi.restoreAllMocks();document.body.innerHTML='';});
function setup(){
  const sharing={getUrl:vi.fn().mockResolvedValue('https://example.test/s/AbCdEf'),poster:vi.fn(),qr:vi.fn(()=>document.createElement('canvas'))};
  const props={card:{id:'one',title:'<img src=x>',ratio:{w:3,h:2},stock:1,likeCount:0},sharing,t:(s:string)=>s,image:vi.fn(),placeholder:'',copyText:vi.fn().mockResolvedValue(undefined),toast:vi.fn(),userKey:'guest'};
  const wrapper=mount(CardShareControl,{props,attachTo:document.body});wrappers.push(wrapper);return {wrapper,sharing,props};
}
it('Vue menu caches its URL across unrelated likes without parsing user title as HTML',async()=>{
  const {wrapper,sharing,props}=setup();
  await wrapper.find('[data-share]').trigger('keydown',{key:'ArrowDown'});await flushPromises();
  expect(sharing.getUrl).toHaveBeenCalledOnce();expect(document.querySelector('.g-card-share__card img[src=x]')).toBeNull();
  await wrapper.setProps({card:{...props.card,likeCount:99}});await flushPromises();
  expect(document.querySelector('.g-card-share__panel')?.classList.contains('is-open')).toBe(true);
  expect(sharing.getUrl).toHaveBeenCalledOnce();
});
it('identity changes abort the old URL request and discard its late value',async()=>{
  const {wrapper,sharing}=setup();let resolve!:(url:string)=>void;
  sharing.getUrl.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await wrapper.find('[data-share]').trigger('keydown',{key:'ArrowDown'});await flushPromises();
  const signal=sharing.getUrl.mock.calls[0][2] as AbortSignal;
  await wrapper.setProps({userKey:'new-user'});expect(signal.aborted).toBe(true);
  resolve('https://example.test/s/Private');await flushPromises();
  expect(document.body.textContent).not.toContain('Private');
  expect(document.querySelector('.g-card-share__panel')?.classList.contains('is-open')).toBe(false);
});
it('poster preview aborts on unmount and revokes its Blob URL',async()=>{
  const revoke=vi.fn();
  class LocalUrl extends URL {static createObjectURL(){return 'blob:poster';}static revokeObjectURL(value:string){revoke(value);}}
  vi.stubGlobal('URL',LocalUrl);
  const sharing={getUrl:vi.fn(),poster:vi.fn().mockResolvedValue(new Blob(['png'])),qr:vi.fn()};
  const wrapper=mount(PosterPreview,{props:{card:{id:'one'},title:'One',url:async()=> 'https://example.test/s/one',sharing,t:(s:string)=>s},attachTo:document.body});wrappers.push(wrapper);
  await flushPromises();expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:poster');
  const signal=sharing.poster.mock.calls[0][2] as AbortSignal;
  wrapper.unmount();wrappers.splice(wrappers.indexOf(wrapper),1);
  expect(signal.aborted).toBe(true);expect(revoke).toHaveBeenCalledWith('blob:poster');
});
