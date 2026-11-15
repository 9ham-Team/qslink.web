import { createEvents } from '../src/events';
import { afterEach, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
import { createApi } from '../src/lib/api.js';
import { createQr } from '../src/lib/qr.js';
import { createPosterPalette } from '../src/lib/poster-palette.js';
import { createApplication } from '../src/application';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
function dependencies(){return {t:(s:string)=>s,error:(s:string)=>s,language:'zh-CN',clearUser:vi.fn(),tokenChanged:vi.fn(),toast:vi.fn()};}
it('module API preserves the token storage key and late 401 cannot clear a newer token',async()=>{
  localStorage.setItem('qsl_token','old');
  const deps=dependencies(),api=createApi(deps);
  let resolve!:(value:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise(done=>{resolve=done;})));
  const pending=api.get('/api/me/profile').catch((error:Error)=>error);
  api.setToken('new');
  resolve(new Response(JSON.stringify({error:{message:'expired',code:'UNAUTHORIZED'}}),{status:401}));
  await pending;
  expect(api.token()).toBe('new');expect(localStorage.getItem('qsl_token')).toBe('new');
  expect(deps.clearUser).not.toHaveBeenCalled();expect(deps.tokenChanged).toHaveBeenCalledWith('old','new');
});
it('module API handles real expiry, skipAuthClear and AbortSignal without a global namespace',async()=>{
  const deps=dependencies(),api=createApi(deps);api.setToken('active');
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{message:'expired',code:'UNAUTHORIZED'}}),{status:401}));
  vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();
  await expect(api.get('/api/me/profile',{signal:controller.signal,skipAuthClear:true})).rejects.toMatchObject({status:401,code:'UNAUTHORIZED'});
  expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);expect(api.token()).toBe('active');
  await expect(api.get('/api/me/profile')).rejects.toMatchObject({status:401});
  expect(api.token()).toBeNull();expect(deps.clearUser).toHaveBeenCalledOnce();expect(deps.toast).toHaveBeenCalledOnce();
  expect((window as any).QSL).toBeUndefined();
});
it('extracted QR and palette modules preserve the original algorithm outputs',()=>{
  const legacy={QSL:{t:(s:string)=>s}} as any;
  vm.runInNewContext(fs.readFileSync('public/js/qr.js','utf8'),{window:legacy,TextEncoder});
  vm.runInNewContext(fs.readFileSync('public/js/poster-palette.js','utf8'),{window:legacy});
  const qr=createQr((s:string)=>s),palette=createPosterPalette();
  for(const url of ['https://example.test/s/AbCdEf','https://example.test/events/qsl-design-2026-11/works/test']){
    expect(qr.matrix(url)).toEqual(legacy.QSL.qr.matrix(url));
  }
  const pixels=new Uint8ClampedArray([10,200,150,255,120,180,220,255,10,200,150,255]);
  expect(palette.fromPixels(pixels)).toEqual(legacy.QSL.posterPalette.fromPixels(pixels));
});
it('application services own one real Pinia store without registering state/router aliases',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  const platform=createApplication();
  try{
    expect((window as any).QSL).toBeUndefined();expect('state' in platform).toBe(false);expect('router' in platform).toBe(false);
    expect((platform.store as any).$id).toBe('qsl-runtime');
    expect(Object.getOwnPropertyDescriptor(platform,'store')?.get).toBeUndefined();
    platform.setUser?.({id:'one',role:'user'});expect(platform.store.user?.id).toBe('one');
    expect(platform.statusText('pending')).toBe(platform.t('审核中'));expect(platform.exchangeText('approved')).toBe(platform.t('已同意'));
  }finally{platform.dispose?.();}
});

it('a failed event listener cannot prevent other session cleanup listeners',()=>{
  const events=createEvents(),cleanup=vi.fn();
  vi.spyOn(console,'error').mockImplementation(()=>{});
  events.on('auth',()=>{throw new Error('failed listener');});
  const off=events.on('auth',cleanup);
  events.emit('auth',null);expect(cleanup).toHaveBeenCalledWith(null);
  off();off();events.emit('auth',null);expect(cleanup).toHaveBeenCalledOnce();
  const scoped=createEvents(),oldOff=scoped.on('auth',()=>{}),newListener=vi.fn();
  oldOff();scoped.on('auth',newListener);oldOff();scoped.emit('auth',null);expect(newListener).toHaveBeenCalledOnce();
  const afterClear=vi.fn(),lateOff=scoped.on('route',()=>{});scoped.clear();scoped.on('route',afterClear);lateOff();scoped.emit('route');expect(afterClear).toHaveBeenCalledOnce();
});
