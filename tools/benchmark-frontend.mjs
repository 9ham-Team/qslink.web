// Reproducible laboratory comparison. Never points at a deployed database.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { serveTestVue3 } from './serve-test.mjs';

const output = path.resolve(process.env.QSL_BENCH_OUTPUT || 'artifacts/frontend-benchmark');
const baseline = path.resolve(process.env.QSL_BENCH_BASELINE || 'artifacts/legacy-baseline-f328923/public');
const repeats = Number(process.env.QSL_BENCH_REPEATS || 5);
const runtimeOnly = process.argv.includes('--runtime-only');
const android = process.argv.includes('--android');
const gesturesOnly = process.argv.includes('--gestures-only');
const serial = process.env.QSL_ANDROID_SERIAL;
if(android && !serial)throw Error('Set QSL_ANDROID_SERIAL to the explicitly selected device');
if(gesturesOnly && !android)throw Error('--gestures-only requires --android');
if(runtimeOnly && android)throw Error('--runtime-only is the desktop resource measurement');
if (!Number.isInteger(repeats) || repeats < 1) throw Error('Invalid repeats');
await fs.mkdir(output, { recursive: true });
await fs.access(path.join(baseline, 'index.html'));
const backend = 'http://127.0.0.1:18787';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2' };

// The same gzip edge model fronts both versions; API and images are shared.
async function frontend(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (/^\/(api|uploads)(\/|$)/.test(url.pathname)) {
        const upstream = await fetch(backend + req.url, { headers: req.headers.authorization ? { authorization:req.headers.authorization } : {} });
        const bytes = Buffer.from(await upstream.arrayBuffer());
        const headers = Object.fromEntries(upstream.headers);
        delete headers['content-encoding']; delete headers['transfer-encoding'];
        res.writeHead(upstream.status, { ...headers, 'content-length':bytes.length }); res.end(bytes); return;
      }
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if (!path.extname(relative)) relative = 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      let bytes = await fs.readFile(file);
      const ext = path.extname(file);
      const compress = /\.(html|js|mjs|css|json|svg)$/.test(file);
      if (compress) bytes = gzipSync(bytes);
      const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
      const cache = ext === '.html' || ext === '.json' ? 'no-store' : relative.startsWith('build/') ? 'public, max-age=31536000, immutable' : /\.(js|css|mjs)$/.test(file) ? 'no-cache' : 'public, max-age=3600';
      const headers = { 'content-type':types[ext] || 'application/octet-stream', 'cache-control':cache, etag, vary:'Accept-Encoding' };
      if (cache !== 'no-store' && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
      res.writeHead(200, { ...headers, 'content-length':bytes.length, ...(compress ? { 'content-encoding':'gzip' } : {}) }); res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin:'http://127.0.0.1:' + server.address().port, close:() => new Promise(resolve => server.close(resolve)) };
}

function instrument() {
  const data = window.__bench = { lcp:0, cls:0, shifts:[], longTasks:[], firstUi:0, ready:0 };
  for (const [type, callback] of [
    ['largest-contentful-paint', entries => { data.lcp = entries.at(-1)?.startTime || data.lcp; }],
    ['layout-shift', entries => { for (const e of entries) if (!e.hadRecentInput) data.shifts.push({ t:e.startTime, value:e.value }); }],
    ['longtask', entries => { for (const e of entries) data.longTasks.push({ start:e.startTime, duration:e.duration }); }],
  ]) {
    try { new PerformanceObserver(list => callback(list.getEntries())).observe({ type, buffered:true }); } catch { /* unsupported browser recorded separately */ }
  }
  const observer = new MutationObserver(() => {
    const app = document.querySelector('#app');
    if (!app) return;
    if (!data.firstUi && app.querySelector('h1, .g-search, .g-detail')) data.firstUi = performance.now();
    const detail = location.pathname.startsWith('/card/');
    const explore = location.pathname === '/explore';
    const ready = detail ? app.querySelector('.card3d-card') && app.querySelector('.g-detail__title') : explore ? app.querySelector('.qsl-tile') : app.querySelector('.card3d-card') && app.querySelector('.qsl-tile');
    if (!data.ready && ready) data.ready = performance.now();
  });
  observer.observe(document, { childList:true, subtree:true });
}

async function settle(page) {
  await page.waitForFunction(() => window.__bench?.ready > 0, undefined, { timeout:30000 });
  await page.waitForLoadState('networkidle', { timeout:30000 });
  await page.waitForTimeout(700);
}

async function measure(page, cdp, origin, route, label) {
  const network = [], urls = new Map();
  const received = e => { urls.set(e.requestId, e.response); network.push({ id:e.requestId, url:e.response.url, status:e.response.status, diskCache:!!e.response.fromDiskCache, mime:e.response.mimeType, encodedBytes:0 }); };
  const finished = e => { const item = network.findLast(x => x.id === e.requestId); if (item) item.encodedBytes = e.encodedDataLength; };
  cdp.on('Network.responseReceived', received); cdp.on('Network.loadingFinished', finished);
  const errors = [];
  const onError = e => errors.push(e.message); page.on('pageerror', onError);
  try {
    await page.goto(origin + route, { waitUntil:'domcontentloaded' });
    await settle(page);
    const result = await page.evaluate(() => {
      const d = window.__bench;
      // CLS uses the largest session window, excluding shifts after input.
      let cls=0, sum=0, first=0, previous=-Infinity;
      for(const shift of d.shifts) { if(shift.t-previous>1000 || shift.t-first>5000) { sum=0; first=shift.t; } sum+=shift.value; cls=Math.max(cls,sum); previous=shift.t; }
      const resources = performance.getEntriesByType('resource').map(e => ({ url:e.name, start:e.startTime, responseEnd:e.responseEnd, duration:e.duration, transferBytes:e.transferSize, encodedBodyBytes:e.encodedBodySize, decodedBodyBytes:e.decodedBodySize, initiator:e.initiatorType }));
      return { lcp:d.lcp, cls, firstUi:d.firstUi, ready:d.ready, foreground:{focused:document.hasFocus(),visibility:document.visibilityState}, longTasks:d.longTasks, resources, navigation:performance.getEntriesByType('navigation')[0]?.toJSON(), heap:performance.memory?.usedJSHeapSize };
    });
    const code = network.filter(x => /(?:javascript|css)/i.test(x.mime));
    if(label.startsWith('android-')&&!result.foreground.focused)throw Error('Android test page lost foreground focus');
    const resources = result.resources.filter(x => /\.(?:js|css)(?:\?|$)/.test(x.url));
    result.codeWireBytes = code.reduce((sum,x) => sum + x.encodedBytes, 0);
    result.codeGzipBodyBytes = resources.reduce((sum,x) => sum + x.encodedBodyBytes, 0);
    result.codeRequests = code.length;
    result.privateBundleRequests = code.filter(x => /\/(?:Admin|ContestJudging|AdminJudging|admin(?:-contest-judging)?|qsl-design-judging)[-\.]/i.test(x.url)).map(x => x.url);
    result.network = network; result.errors = errors;
    await fs.writeFile(path.join(output, label + '.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { cdp.off('Network.responseReceived', received); cdp.off('Network.loadingFinished', finished); page.off('pageerror', onError); }
}

const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
let fixture, oldSite, newSite, browser;
const reversedPorts=[];
const samples = [];
try {
  fixture = await serveTestVue3();
  oldSite = await frontend(baseline); newSite = await frontend(path.resolve('dist-public'));
  if(android) {
    execFileSync('adb',['-s',serial,'shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-p','com.android.chrome']);
    browser=await chromium.connectOverCDP(process.env.QSL_ANDROID_CDP || 'http://127.0.0.1:19223');
    for(const site of [oldSite,newSite]) {
      const port=new URL(site.origin).port;
      execFileSync('adb',['-s',serial,'reverse','tcp:'+port,'tcp:'+port]);reversedPorts.push(port);
    }
  } else browser = await chromium.launch({ channel:process.env.QSL_BROWSER_CHANNEL || 'msedge' });
  const cards = (await (await fetch(backend + '/api/cards?limit=100')).json()).items;
  const card = cards.find(x => x.backImage) || cards[0];
  const metadata = { date:new Date().toISOString(), head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), baseline:'f3289231bb3fd50941980eb146b5e5667095b034', browser:browser.version(), node:process.version, repeats, data:{ cards:cards.length, cardId:card.id, cardRatio:card.ratio }, network:{ latencyMs:80, downloadBytesPerSecond:200000, uploadBytesPerSecond:93750 }, compression:'identical gzip proxy model; not CDN measurement', cache:android ? 'cold=CDP cache bypass; hot=cache enabled, unmeasured priming load then measured revisit; existing user cache never cleared' : 'cold=new context, hot=same context navigate away then back; no-cache legacy revalidates, hashed build immutable', lcpWindow:'networkidle + 700ms; no input before collection', devices:android ? {android:{physical:true,cpuRate:1}} : { desktop:{width:1440,height:1000,dpr:1,cpuRate:1},mobile:{width:375,height:812,dpr:2,cpuRate:4} } };
  await fs.writeFile(path.join(output,runtimeOnly ? 'runtime-metadata.json' : gesturesOnly ? 'gestures-metadata.json' : 'metadata.json'), JSON.stringify(metadata,null,2));
  // Alternate version order each repetition to reduce host-load ordering bias.
  if (!runtimeOnly && !gesturesOnly) for (let repeat=0; repeat<repeats; repeat++) for (const device of Object.keys(metadata.devices)) for (const [scene,route] of [['home','/'],['explore','/explore'],['detail','/card/' + card.id]]) {
    for (const [version,site] of repeat%2 ? [['vue',newSite],['legacy',oldSite]] : [['legacy',oldSite],['vue',newSite]]) {
      const d=metadata.devices[device];
      const context=android ? browser.contexts()[0] : await browser.newContext({viewport:{width:d.width,height:d.height},deviceScaleFactor:d.dpr,isMobile:device==='mobile',hasTouch:device==='mobile',locale:'zh-CN'});
      let page;
      try {
        page=await context.newPage();await page.addInitScript(instrument);
        const cdp=await context.newCDPSession(page);
        if(android){await page.bringToFront();await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});}
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:200000,uploadThroughput:93750});
        if(!android)await cdp.send('Emulation.setCPUThrottlingRate',{rate:d.cpuRate});
        for(const cache of ['cold','hot']) {
          if(android)await cdp.send('Network.setCacheDisabled',{cacheDisabled:cache==='cold'});
          if(cache==='hot') {
            if(android){await page.goto(site.origin+route);await settle(page);}
            await page.goto('about:blank');
          }
          const label=`${device}-${scene}-${version}-${cache}-${repeat+1}`;
          const result=await measure(page,cdp,site.origin,route,label);
          samples.push({device,scene,version,cache,repeat:repeat+1,...result});
          console.log(JSON.stringify({label,LCP:Math.round(result.lcp),CLS:result.cls,codeWireBytes:result.codeWireBytes,errors:result.errors}));
        }
      } finally { if(android)await page?.close();else await context.close(); }
    }
  }
  const summary=[];
  for(const device of Object.keys(metadata.devices)) for(const scene of ['home','explore','detail']) for(const cache of ['cold','hot']) for(const version of ['legacy','vue']) {
    const set=samples.filter(s=>s.device===device && s.scene===scene && s.cache===cache && s.version===version);
    summary.push({device,scene,cache,version,n:set.length,...Object.fromEntries(['lcp','cls','firstUi','ready','codeWireBytes','codeGzipBodyBytes','codeRequests'].map(key=>[key,median(set.map(x=>x[key]))])),longTaskTotalMs:median(set.map(x=>x.longTasks.reduce((sum,t)=>sum+t.duration,0))),privateBundles:[...new Set(set.flatMap(x=>x.privateBundleRequests))],errors:set.flatMap(x=>x.errors)});
  }
  if (!runtimeOnly && !gesturesOnly) await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
  if(android && gesturesOnly)await androidGestures(browser,[['legacy',oldSite],['vue',newSite]],cards,output);
  if(!android)await runtimeMeasurements(browser, [['legacy',oldSite],['vue',newSite]], card, output);
  console.log('BENCHMARK_COMPLETE ' + output);
} finally {
  await browser?.close(); await oldSite?.close(); await newSite?.close(); await fixture?.close();
  for(const port of reversedPorts)execFileSync('adb',['-s',serial,'reverse','--remove','tcp:'+port]);
}

async function androidGestures(browser,sites,cards,output) {
  // Raster fixtures exercise responsive image variants; seeded SVGs cannot.
  const config=await(await fetch(backend+'/api/config')).json();
  const login=async role=>{const a=config.demoAccounts.find(x=>x.role===role);return(await(await fetch(backend+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:a.id,password:a.pass})})).json()).token;};
  const member=await login('普通用户'),admin=await login('管理员');
  const fixtures=[];
  for(const portrait of [false,true]) {
    const width=portrait?1000:1500,height=portrait?1500:1000;
    const image=async side=>'data:image/webp;base64,'+(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${side==='FRONT'?'#0eaf8f':'#0b668d'}"/><rect x="50" y="50" width="${width-100}" height="${height-100}" fill="none" stroke="white" stroke-width="10"/><text x="80" y="200" fill="white" font-size="100">QSL ${side}</text><text x="80" y="340" fill="white" font-size="60">Synthetic test card</text></svg>`)).webp({quality:90}).toBuffer()).toString('base64');
    const response=await fetch(backend+'/api/cards',{method:'POST',headers:{authorization:'Bearer '+member,'content-type':'application/json'},body:JSON.stringify({title:'Benchmark raster '+(portrait?'portrait':'landscape'),callSign:'BG1QA',frontImage:await image('FRONT'),backImage:await image('BACK'),ratio:portrait?{w:2,h:3}:{w:3,h:2},stock:3,acceptTerms:true,acceptContentLicense:true,termsVersion:'2026-10-25'})});
    const created=await response.json();if(!response.ok)throw Error('Raster fixture creation failed: '+response.status);
    const approved=await fetch(backend+'/api/admin/cards/'+created.card.id,{method:'PUT',headers:{authorization:'Bearer '+admin,'content-type':'application/json'},body:JSON.stringify({status:'approved'})});
    if(!approved.ok)throw Error('Raster fixture approval failed: '+approved.status);
    fixtures.push((await(await fetch(backend+'/api/cards/'+created.card.id)).json()).card);
  }
  const results=[];
  for(const [version,site] of sites) for(const shape of ['landscape','portrait']) {
    const card=fixtures.find(x=>shape==='portrait'?x.ratio.h>x.ratio.w:x.ratio.w>x.ratio.h);
    if(!card)throw Error('Missing seeded '+shape+' card');
    const page=await browser.contexts()[0].newPage(),cdp=await page.context().newCDPSession(page);
    await page.bringToFront();await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});
    const errors=[],imageRequests=[],frames=[];let capture=false,seen=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(capture&&r.url().includes('/uploads/'))imageRequests.push(r.url());});
    await page.addInitScript(()=>{window.__visibility=[];document.addEventListener('visibilitychange',()=>window.__visibility.push({state:document.visibilityState,time:performance.now()}));});
    const onFrame=async e=>{
      if(seen++%3===0&&frames.length<480)frames.push(Buffer.from(e.data,'base64'));
      await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
    };
    try {
      await page.goto(site.origin+'/card/'+card.id);await page.bringToFront();await page.locator('.card3d-card').waitFor();
      await page.waitForLoadState('networkidle');await page.locator('.card3d-stage').scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>({scrollY,focused:document.hasFocus(),front:document.querySelector('.card3d-face--front img').currentSrc,back:document.querySelector('.card3d-face--back img').currentSrc,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},userAgent:navigator.userAgent}));
      await fs.writeFile(path.join(output,`${version}-${shape}-native-screen.png`),execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));
      await page.screenshot({path:path.join(output,`${version}-${shape}-before.png`)});
      cdp.on('Page.screencastFrame',onFrame);await cdp.send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:424,maxHeight:936,everyNthFrame:1});
      await page.evaluate(()=>{window.__dragFrames=[];window.__collectDrag=true;let previous=performance.now();const tick=t=>{window.__dragFrames.push(t-previous);previous=t;if(window.__collectDrag)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
      capture=true;
      const box=await page.locator('.card3d-stage').boundingBox();
      const y=Math.max(100,Math.min(before.viewport.height-100,box.y+box.height/2));
      const x0=Math.max(30,box.x+box.width*.2),x1=Math.min(before.viewport.width-30,box.x+box.width*.8);
      for(let swipe=0;swipe<20;swipe++) {
        const start=swipe%2?x1:x0,end=swipe%2?x0:x1;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
        for(let step=1;step<=12;step++) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*step/12,y}]});await page.waitForTimeout(8);}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(45);
      }
      const dragScrollY=await page.evaluate(()=>scrollY);
      const tapFlip=async()=>{
        const button=page.locator('[data-c3-act="flip"]');await button.scrollIntoViewIfNeeded();
        const r=await button.boundingBox();const touchPoints=[{x:r.x+r.width/2,y:r.y+r.height/2}];
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      };
      const flipSides=[];
      for(let flip=0;flip<8;flip++){await tapFlip();await page.waitForTimeout(180);flipSides.push(await page.locator('.card3d-sr').textContent());}
      await page.waitForTimeout(600);
      await page.screenshot({path:path.join(output,`${version}-${shape}-flipped.png`)});
      await tapFlip();await page.waitForTimeout(600);
      capture=false;
      await page.evaluate(()=>{window.__collectDrag=false;});
      await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',onFrame);
      execFileSync('adb',['-s',serial,'shell','input','keyevent','KEYCODE_HOME']);await new Promise(r=>setTimeout(r,1500));
      const background=await page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState}));
      execFileSync('adb',['-s',serial,'shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-p','com.android.chrome']);
      await page.bringToFront();
      await page.waitForTimeout(800);
      const after=await page.evaluate(()=>({scrollY,focused:document.hasFocus(),front:document.querySelector('.card3d-face--front img').currentSrc,back:document.querySelector('.card3d-face--back img').currentSrc,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,images:[...document.querySelectorAll('.card3d-face img')].map(x=>({complete:x.complete,width:x.naturalWidth})),frameIntervals:window.__dragFrames,visibility:window.__visibility}));
      await page.screenshot({path:path.join(output,`${version}-${shape}-restored.png`)});
      if(frames.length) {
        const selected=Array.from({length:Math.min(12,frames.length)},(_,i)=>frames[Math.round(i*(frames.length-1)/Math.max(1,Math.min(12,frames.length)-1))]);
        const thumbs=await Promise.all(selected.map(frame=>sharp(frame).resize(212,468,{fit:'contain',background:'#eef8f5'}).png().toBuffer()));
        await sharp({create:{width:212*4,height:468*Math.ceil(thumbs.length/4),channels:3,background:'#eef8f5'}}).composite(thumbs.map((input,i)=>({input,left:(i%4)*212,top:Math.floor(i/4)*468}))).png().toFile(path.join(output,`${version}-${shape}-filmstrip.png`));
        for(let i=0;i<frames.length;i++)await fs.writeFile(path.join(output,`${version}-${shape}-frame-${String(i).padStart(3,'0')}.jpg`),frames[i]);
      }
      const values=after.frameIntervals.filter(x=>x>0).sort((a,b)=>a-b);
      const record={version,shape,before,after,background,swipes:20,explicitFlips:9,flipSides,capturedFrames:frames.length,screencastFrames:seen,imageRequests,sourceStable:before.front===after.front&&before.back===after.back,scrollStable:Math.abs(before.scrollY-dragScrollY)<=2,frameMedianMs:values[Math.floor(values.length/2)],frameP95Ms:values[Math.floor(values.length*.95)],errors};
      results.push(record);await fs.writeFile(path.join(output,'android-gestures.json'),JSON.stringify(results,null,2));
      console.log(JSON.stringify({version,shape,sourceStable:record.sourceStable,scrollStable:record.scrollStable,imageRequests:imageRequests.length,frames:frames.length,overflow:after.overflow,errors}));
    } finally {await cdp.send('Page.stopScreencast').catch(()=>{});cdp.off('Page.screencastFrame',onFrame);await page.close();}
  }
}

async function runtimeMeasurements(browser, sites, card, output) {
  const config = await (await fetch(backend + '/api/config')).json();
  const account = config.demoAccounts.find(x => x.role === '普通用户');
  const session = await (await fetch(backend + '/api/auth/login', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:account.id,password:account.pass}) })).json();
  const results=[];
  for (const [version,site] of sites) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
    try {
      await context.addInitScript(token => localStorage.setItem('qsl_token',token),session.token);
      await context.addInitScript(() => {
        const nativeRaf=requestAnimationFrame, nativeCancel=cancelAnimationFrame, pending=new Set();
        window.requestAnimationFrame=function(fn){let id;id=nativeRaf.call(window,t=>{pending.delete(id);fn(t);});pending.add(id);return id;};
        window.cancelAnimationFrame=function(id){pending.delete(id);return nativeCancel.call(window,id);};
        const observers=[], workers=[];
        for (const key of ['ResizeObserver','IntersectionObserver']) {
          const Base=window[key]; if(!Base)continue;
          window[key]=class extends Base {
            constructor(...args){super(...args);this.__count=0;this.__targets=new WeakSet();observers.push({kind:key,ref:new WeakRef(this)});}
            observe(target,...args){if(!this.__targets.has(target)){this.__targets.add(target);this.__count++;}return super.observe(target,...args);}
            unobserve(target){if(this.__targets.has(target)){this.__targets.delete(target);this.__count--;}return super.unobserve(target);}
            disconnect(){this.__count=0;this.__targets=new WeakSet();return super.disconnect();}
          };
        }
        const BaseWorker=window.Worker;
        window.Worker=class extends BaseWorker {
          constructor(...args){super(...args);this.__terminated=false;workers.push(new WeakRef(this));}
          terminate(){this.__terminated=true;return super.terminate();}
        };
        window.__runtimeSample=()=>({pendingRaf:pending.size,observers:observers.map(x=>({kind:x.kind,count:x.ref.deref()?.__count||0})).filter(x=>x.count),liveWorkers:workers.filter(x=>{const w=x.deref();return w&&!w.__terminated;}).length,viewerCount:document.querySelectorAll('.card3d').length,modalCount:document.querySelectorAll('.modal-overlay').length});
      });
      const page=await context.newPage(),cdp=await context.newCDPSession(page);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await cdp.send('Performance.enable'); await cdp.send('Network.enable');
      await page.goto(site.origin+'/explore');await page.locator('.qsl-tile').first().waitFor();await page.waitForLoadState('networkidle');
      await page.evaluate(async version => {
        if(version==='legacy')window.__driver=window.QSL;
        else {const m=await(await fetch('/asset-manifest.json')).json();window.__driver=(await import(m.application)).application;}
      },version);
      async function navigate(route,selector) {
        await page.evaluate(route => {void window.__driver.navigate(route);},route);
        const leave=page.getByRole('button',{name:'放弃修改并离开',exact:true});
        // Upload drafts deliberately exercise the normal unsaved-content guard.
        await Promise.race([page.locator(selector).first().waitFor({state:'visible'}),leave.waitFor({state:'visible'})]);
        if(await leave.isVisible())await leave.click();
        // Locator.waitFor does not retain prior SPA DOM through ElementHandles.
        await page.locator(selector).first().waitFor();await page.waitForLoadState('networkidle');await page.waitForTimeout(100);
        await page.waitForFunction(()=>!document.querySelector('.modal-overlay'));
      }
      const interactions=[];
      for(let repeat=0;repeat<5;repeat++) {
        await navigate('/explore','.g-search__input');
        // All intervals use browser clocks. The route interval includes API time.
        const search=await page.evaluate(async value => {
          const input=document.querySelector('.g-search__input'),start=performance.now();
          const done=new Promise(resolve=>{const original=window.fetch;window.fetch=async function(...args){const r=await original.apply(this,args);if(String(args[0]).includes('/api/cards')&&String(args[0]).includes('callSign='+value)){window.fetch=original;requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({inputToResponsePaintMs:performance.now()-start})));}return r;};});
          input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return done;
        },repeat%2?'BG':'BD');
        interactions.push({kind:'search',repeat:repeat+1,...search});
        await navigate('/card/'+card.id,'.card3d-controls');
        const flip=await page.evaluate(async()=>{const t=performance.now();document.querySelector('[data-c3-act="flip"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {eventToSecondFrameMs:performance.now()-t};});
        interactions.push({kind:'flip',repeat:repeat+1,...flip});
        const modal=await page.evaluate(async()=>{const t=performance.now();const promise=window.__driver.confirm({title:'性能测试',message:'隔离环境确认弹窗'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {eventToSecondFrameMs:performance.now()-t,visible:!!document.querySelector('.modal-overlay')};});
        interactions.push({kind:'modal',repeat:repeat+1,...modal});await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('.modal-overlay'));
        const route=await page.evaluate(()=>new Promise(resolve=>{
          const start=performance.now();let first=0,apiEnd=0;const original=window.fetch;
          window.fetch=async function(...args){const r=await original.apply(this,args);if(String(args[0]).includes('/api/cards'))apiEnd=performance.now();return r;};
          const mo=new MutationObserver(()=>{const root=document.querySelector('#app');if(!first&&root.querySelector('.g-search__input,.skeleton'))first=performance.now();if(root.querySelector('.g-search__input')&&root.querySelector('.qsl-tile')){mo.disconnect();window.fetch=original;requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({linkToFirstUiMs:first-start,linkToDataPaintMs:performance.now()-start,responseToDataPaintMs:apiEnd?performance.now()-apiEnd:null})));}});
          mo.observe(document.querySelector('#app'),{subtree:true,childList:true});document.querySelector('a[href="/explore"]').click();
        }));
        interactions.push({kind:'route',repeat:repeat+1,...route});
      }
      await navigate('/explore','.qsl-tile');
      const snapshots=[];
      async function sample(cycle) {
        // Chromium's DOM/console diagnostics retain uploaded input nodes in
        // DevTools global handles. Clear that debugger-only retention first.
        await cdp.send('Runtime.discardConsoleEntries');
        await cdp.send('HeapProfiler.collectGarbage');
        const metrics=await cdp.send('Performance.getMetrics');
        const dom=await cdp.send('Memory.getDOMCounters');
        const activity=await page.evaluate(()=>window.__runtimeSample());
        return {cycle,...Object.fromEntries(metrics.metrics.filter(x=>['JSHeapUsedSize','Nodes','Documents','JSEventListeners'].includes(x.name)).map(x=>[x.name,x.value])),...dom,...activity};
      }
      async function heap(name) {
        await cdp.send('Runtime.discardConsoleEntries');
        const chunks=[];const listener=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',listener);
        try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',listener);}
        const text=chunks.join('');await fs.writeFile(path.join(output,`${version}-${name}.heapsnapshot.gz`),gzipSync(text));
        const h=JSON.parse(text),fields=h.snapshot.meta.node_fields,stride=fields.length,index=fields.indexOf('detachedness');let detached=0;
        if(index>=0)for(let n=index;n<h.nodes.length;n+=stride)if(h.nodes[n]===2)detached++;
        return {detachedNodes:index>=0?detached:null,nodeCount:h.snapshot.node_count};
      }
      const beforeHeap=await heap('before');snapshots.push(await sample(0));
      const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const x=c.getContext('2d');x.fillStyle='#0eaf8f';x.fillRect(0,0,240,160);return c.toDataURL('image/png').split(',')[1];});
      for(let cycle=1;cycle<=30;cycle++) {
        await navigate('/card/'+card.id,'.card3d-controls');
        await navigate('/dashboard/cards/new','#fEditorForm');
        await page.locator('[data-upload-side="front"] input[type="file"]').setInputFiles({name:'benchmark.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
        await page.waitForFunction(()=>document.querySelector('[data-upload-side="front"] [data-preview-img]')?.getAttribute('src')?.startsWith('data:image/webp'));
        await navigate('/explore','.g-search__input');
        snapshots.push(await sample(cycle));
        console.log(JSON.stringify({runtime:version,cycle,activity:snapshots.at(-1)}));
      }
      const afterHeap=await heap('after');
      results.push({version,interactions,snapshots,beforeHeap,afterHeap,errors});
      await fs.writeFile(path.join(output,'runtime-results.json'),JSON.stringify(results,null,2));
    } finally {await context.close();}
  }
}
