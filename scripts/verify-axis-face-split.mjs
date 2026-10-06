// Same authored optical state, isolated browser, no writes to artist settings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { testDetachedPanelGeometry } from './test-detached-panel-geometry.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'artifacts/axis-face-split');
const base='http://127.0.0.1:51762';
const originalFile=path.join(root,'.pleos/optical-state/pleos-optical-studio-v1%3Ahybrid-ab.json');
const original=await readFile(originalFile,'utf8');
const artist=JSON.parse(original).state;
// Archive predates the optional light-flow feature. Compare the same expression
// even if the artist has since enabled it; never change their saved settings.
const neutralFaceLighting=Object.fromEntries(['face','structure'].flatMap(prefix=>['Top','Left','Right'].flatMap(region=>['X','Y','Z'].map(axis=>[`${prefix}${region}${axis}`,1]))));
// Historical snapshots cannot apply recently introduced face gains. Compare
// their neutral expression, not the artist's new lighting adjustments.
const fixture={...artist,...neutralFaceLighting,faceDimensionContrast:0,structureContrast:0,playing:false,identityTransition:0,time:9.87,layerLightContrast:0};
const errors=[]; let browser,server;
const decode=data=>PNG.sync.read(Buffer.from(data.split(',')[1],'base64'));
const mae=(a,b)=>{let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);return sum/(a.width*a.height*3);};
const mean=a=>{let sum=0;for(let i=0;i<a.data.length;i+=4)sum+=a.data[i]+a.data[i+1]+a.data[i+2];return sum/(a.width*a.height*3);};
try{
  await mkdir(out,{recursive:true});
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51762','--strictPort'],{cwd:root,stdio:'ignore'});
  for(let n=0;;n++){try{if((await fetch(base)).ok)break;}catch{}if(n>200)throw Error('QA server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.route('**/__pleos/optical-state?*',r=>r.fulfill({status:204}));
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  async function open(route){await page.goto(base+route);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);}
  async function capture(name,patch={}){
    const data=await page.evaluate(async state=>{window.__pleosOptical.set(state);return window.__pleosOptical.capture(600,750,8);},{...fixture,...patch});
    const png=decode(data);if(name)await writeFile(path.join(out,name+'.png'),PNG.sync.write(png));return png;
  }
  await open('/versions/saved-20260930082750019-compatible/index.html?look=hybrid-ab');
  const archived=await capture('preserved');
  await open('/?look=hybrid-ab');
  const current=await capture('original');
  // The intentional bevel reflection prefilter changes edge pixels. Keep a
  // tight whole-image bound (one 8-bit level), while dedicated bevel QA checks
  // sample stability and the geometry suite checks the unchanged Axis layout.
  assert(mae(archived,current)<1,'A/B rendering changed beyond reflection filtering');
  assert.equal(await page.locator('[data-optical-range="axisFaceGap"]').count(),0,'Split control leaked to original');
  const rearFixture=JSON.parse(await readFile(path.join(root,'.pleos/optical-state/pleos-optical-studio-v1%3Aarchive%3Asaved-20260930091632641%3Ahybrid-axis-split.json'),'utf8')).state;
  await open('/versions/saved-20260930091632641-compatible/index.html?look=hybrid-axis-split');
  const rearBefore=await capture('rear-before',{...rearFixture,playing:false});
  await open('/?look=hybrid-axis-split');
  const rearAfter=await capture('rear-after',{...rearFixture,playing:false});
  assert(mae(rearBefore,rearAfter)>.02,'Rear-carrier fix has no visible effect');
  const straightFixture=JSON.parse(await readFile(path.join(root,'.pleos/optical-state/pleos-optical-studio-v1%3Aarchive%3Asaved-20260930093558711%3Ahybrid-axis-split.json'),'utf8')).state;
  await open('/versions/saved-20260930093558711-compatible/index.html?look=hybrid-axis-split');
  const straightBefore=await capture('straight-before',{...straightFixture,playing:false});
  await open('/?look=hybrid-axis-split');
  const straightAfter=await capture('straight-after',{...straightFixture,playing:false});
  assert(mae(straightBefore,straightAfter)>.02,'Straight Axis anchor has no visible effect');
  const geometry=await testDetachedPanelGeometry(page,root);
  await writeFile(path.join(out,'geometry-verification.json'),JSON.stringify(geometry,null,2));
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect())).persistence.browserKey,'pleos-optical-studio-v1:hybrid-axis-split');
  const zero=await capture('split-zero',{axisFaceGap:0});
  assert(mae(current,zero)<.02,'Zero gap must reproduce original');
  const split=await capture('split-current',{axisFaceGap:.025});
  const wide=await capture('split-wide',{axisFaceGap:.08});
  assert(mae(zero,split)>.02,'Default separation has no visible effect');
  assert(mae(split,wide)>.02,'Gap adjustment has no effect');
  const camera={azimuth:45,elevation:35.26438968,zoom:.8,panX:0,axisMotion:0,cameraMotion:0};
  await capture('overview-before',{...camera,axisFaceGap:0});
  await capture('overview-after',{...camera,axisFaceGap:.025});
  for(const azimuth of [-30,25,72,115]){
    const frame=await capture('angle-'+azimuth,{...camera,azimuth,axisFaceGap:.025});
    assert(mean(frame)>.05,`Unexpected black frame at ${azimuth}`);
  }
  for(const bevel of [0,.15,.6])await capture('bevel-'+bevel,{...camera,bevel,axisFaceGap:.025});
  for(const time of [1,3.5,5,6,10,13.9])await capture('transition-'+time,{...camera,identityTransition:1,time,axisFaceGap:.025});
  const slider=page.locator('[data-optical-range="axisFaceGap"]');
  const number=page.locator('[data-optical-number="axisFaceGap"]');
  await number.fill('0.045');await number.press('Enter');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).axisFaceGap,.045);
  await slider.focus();await slider.press('ArrowRight');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).axisFaceGap,.05);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).axisFaceGap,.05);
  assert.equal(await page.getByLabel('날짜별 사이트 버전').inputValue(),'live:hybrid-axis-split');
  await page.screenshot({path:path.join(out,'panel-wide.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'panel-narrow.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await readFile(originalFile,'utf8'),original,'Artist settings mutated');
  assert.equal(errors.length,0,errors.join('\n'));
  let exports='not-run';
  if(process.env.PLEOS_SPLIT_EXPORT==='1'){
    await page.evaluate(state=>window.__pleosOptical.set(state),{...fixture,axisFaceGap:.025});
    const large=decode(await page.evaluate(()=>window.__pleosOptical.capture(3072,3840,4)));
    assert.equal(large.width,3072);assert.equal(large.height,3840);assert(mean(large)>.05);
    await writeFile(path.join(out,'split-4k.png'),PNG.sync.write(large));
    const result=await page.evaluate(()=>window.__pleosOptical.exportVideo({width:480,height:600,fps:30,samples:4,start:9,end:9.2},false));
    assert.equal(result.frames,6);
    const encoded=await page.evaluate(async url=>{
      const bytes=new Uint8Array(await(await fetch(url)).arrayBuffer());let s='';
      for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
    },result.url);
    const bytes=Buffer.from(encoded,'base64');assert(bytes.length>1000);
    await writeFile(path.join(out,'split-motion-smoke.mp4'),bytes);
    const decoded=await page.evaluate(url=>new Promise((resolve,reject)=>{
      const video=document.createElement('video');video.muted=true;
      video.onloadeddata=()=>resolve({width:video.videoWidth,height:video.videoHeight});
      video.onerror=()=>reject(Error('MP4 decode failed'));video.src=url;
    }),result.url);
    assert.deepEqual(decoded,{width:480,height:600});exports={png:[3072,3840],mp4:[480,600],frames:6};
    await writeFile(path.join(out,'export-verification.json'),JSON.stringify({status:'pass',...exports,codec:result.codec},null,2));
  }
  assert.equal(errors.length,0,errors.join('\n'));
  const report={status:'pass',originalPreservationMAE:mae(archived,current),zeroGapMAE:mae(current,zero),defaultGapMAE:mae(zero,split),widthChangeMAE:mae(split,wide),mean:{original:mean(current),split:mean(split)},exports,errors};
  await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server?.kill();}
