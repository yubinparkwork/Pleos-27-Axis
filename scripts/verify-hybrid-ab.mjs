// Disposable browser state; never mutate the artist's open tabs or approved A/B.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {fileURLToPath} from 'node:url';

const out=new URL('../artifacts/hybrid-face/',import.meta.url);
await mkdir(out,{recursive:true});
const base=process.env.PLEOS_HYBRID_URL??'http://127.0.0.1:5173/';
const report={status:'running',errors:[],checks:{},images:{}};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const metrics=png=>{
  const means=[0,0,0];let lit=0;
  for(let i=0;i<png.data.length;i+=4){if(Math.max(...png.data.subarray(i,i+3))>15)lit++;for(let c=0;c<3;c++)means[c]+=png.data[i+c];}
  return {meanRGB:means.map(v=>v/(png.width*png.height)),litFraction:lit/(png.width*png.height)};
};
const diff=(a,b)=>{let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);return sum/(a.width*a.height*3);};
async function set(patch){await page.evaluate(p=>window.__pleosOptical.set(p),patch);}
async function capture(name,w=400,h=500,samples=4){
  const data=await page.evaluate(async p=>window.__pleosOptical.capture(...p),[w,h,samples]);
  const bytes=Buffer.from(data.split(',')[1],'base64');const png=PNG.sync.read(bytes);
  await writeFile(new URL(name+'.png',out),bytes);report.images[name]={width:w,height:h,...metrics(png)};return png;
}
try{
  await page.goto(base+'?look=hybrid-ab');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.reset());
  await set({playing:false,time:2,layerFadeAmount:.6});
  const seed=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  report.heroState={...seed,hybridColorMode:1};
  const originalStorage=await page.evaluate(()=>localStorage.getItem('pleos-optical-studio-v1'));
  for(const [name,mode] of [['main-rgb',1],['sub-red',2],['sub-green',3],['sub-blue',4]]){
    await set({hybridColorMode:mode});await capture(name,800,1000);
  }
  for(const [name,channel] of [['sub-red',0],['sub-green',1],['sub-blue',2]]){
    const values=report.images[name].meanRGB;
    assert.equal(values.indexOf(Math.max(...values)),channel,name+' must read as its lead family at hero frame');
  }
  await set({hybridColorMode:1});
  const defaultImage=await capture('hybrid');
  await set({hybridFaceReflection:0});const noFace=await capture('face-off');
  report.checks.faceReflectionDifference=diff(noFace,defaultImage);
  assert(diff(noFace,defaultImage)>1,'Broad reflections must visibly affect the image');
  await page.goto(base+'versions/saved-20260922034933369-compatible/index.html?look=hybrid-ab');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,hybridColorMode:1});const archivedOpen=await capture('archived-v3');
  report.checks.zeroRestoresV3=diff(noFace,archivedOpen);assert(diff(noFace,archivedOpen)<.03);
  await page.goto(base+'?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,hybridColorMode:1});
  assert.equal(seed.hybridOpening,1,'Existing settings gain opening without losing camera/lighting values');
  await set({hybridOpening:0});const closedImage=await capture('closed');
  report.checks.openingChangesReflectionDomain=diff(closedImage,defaultImage);
  assert(diff(closedImage,defaultImage)>1);
  await page.goto(base+'versions/saved-20260921082636619-compatible/index.html?look=hybrid-ab');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,hybridColorMode:1,playing:false,time:2});const oldClosed=await capture('archived-closed-v2');
  report.checks.zeroRestoresV2=diff(closedImage,oldClosed);assert(diff(closedImage,oldClosed)<.03);
  await page.goto(base+'?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,hybridColorMode:1,hybridOpening:0});
  assert.equal(await page.locator('[data-optical-number="bounces"]').isEnabled(),true);
  await set({bounces:1});const oneBounce=await capture('one-bounce');
  await set({bounces:16});const manyBounces=await capture('sixteen-bounces');
  report.checks.actualInternalBounceDifference=diff(oneBounce,manyBounces);
  assert(diff(oneBounce,manyBounces)>.01,'Internal bounce budget must affect the actual rendered image');
  await set({bounces:seed.bounces,hybridOpening:1});
  await set({hybridOpening:.99});const nearlyOpen=await capture('nearly-open');
  await set({hybridOpening:1});const fullyOpen=await capture('fully-open');
  report.checks.openCapContinuity=diff(nearlyOpen,fullyOpen);
  assert(diff(nearlyOpen,fullyOpen)<3,'The final opening step should not flash');
  const openingControl=page.locator('[data-optical-number="hybridOpening"]');
  await openingControl.fill('0.50');await openingControl.press('ArrowUp');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridOpening),.51);
  await set({hybridOpening:1});
  await set({zoom:2.2,panX:-38});await capture('partial-kv-3x2',960,640);
  await set({...seed,hybridColorMode:1});await capture('poster-a-series',707,1000);
  for(const key of ['hybridDistortion','hybridDensity','hybridColorMix','hybridFaceWidth','hybridRefractionOverlap']){
    await set({[key]:0}); const low=await capture(key+'-zero');
    await set({[key]:1}); const high=await capture(key+'-one');
    report.checks[key+'-difference']=diff(low,high);assert(diff(low,high)>.05,key+' must affect the image');
    await set({[key]:seed[key]});
  }
  await set({lightIntensity:0});const dark=await capture('lights-off');
  assert.equal(metrics(dark).litFraction,0);report.checks.noEmission=true;
  await set({...seed,hybridColorMode:0,time:0});const start=await capture('loop-start');
  await set({time:seed.duration});const end=await capture('loop-end');
  assert(diff(start,end)<.01);report.checks.loopDifference=diff(start,end);
  await set({hybridColorMode:1,hybridDepthFlow:1,time:seed.duration/2});await capture('hall-depth-concept');
  await set({...seed,hybridColorMode:1,time:2});
  for(const angle of [-45,0,45,90,135]){
    await set({azimuth:angle});await capture('view-'+angle,240,300);
  }
  await set({...seed,hybridColorMode:1,time:2});
  await page.screenshot({path:fileURLToPath(new URL('panel-wide.png',out))});
  await page.setViewportSize({width:600,height:900});
  await page.screenshot({path:fileURLToPath(new URL('panel-narrow.png',out))});
  report.checks.noPageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  assert(report.checks.noPageOverflow);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pleos-optical-studio-v1')),originalStorage);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const panelExpand=page.getByRole('button',{name:'설정 패널 펼치기',exact:true});
  if(await panelExpand.isVisible())await panelExpand.click();
  const faceInput=page.getByRole('spinbutton',{name:'면 반사 강도',exact:true});
  await faceInput.fill('0.70');await faceInput.press('ArrowUp');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridFaceReflection),.71);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridFaceReflection),.71);
  await set({hybridFaceReflection:seed.hybridFaceReflection});
  await page.setViewportSize({width:390,height:844});
  const expand=page.getByRole('button',{name:'설정 패널 펼치기',exact:true});
  if(await expand.isVisible())await expand.click();
  await page.getByRole('spinbutton',{name:'굴절 중첩',exact:true}).scrollIntoViewIfNeeded();
  assert(await page.getByRole('spinbutton',{name:'굴절 중첩',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:fileURLToPath(new URL('panel-390.png',out))});
  report.checks.newControlsKeyboardPersistenceAndNarrow=true;
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridColorMode),1);
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridOpening),1);
  report.checks.independentPersistence=true;
  await page.goto(base+'?look=hybrid-ab&sequence=pleos25&transition=layered');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.panX),seed.panX);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pleos-optical-studio-v1:identity25:before-centered-light-v2')),null);
  report.checks.sequenceNavigationPreservesHybrid=true;
  await set({...seed,hybridColorMode:0,hybridColorMix:0,hybridDensity:0,hybridDistortion:0,playing:false,time:2});
  await capture('minimum-hybrid');
  await page.goto(base);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,lightCycle:true,playing:false,time:2});const b=await capture('B-comparison');
  report.checks.hybridVersusB=diff(defaultImage,b);
  assert(report.checks.hybridVersusB>1,'V2 must not reduce to B with stronger colour');
  await page.goto(base+'versions/saved-20260921073913986-compatible/index.html');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,lightCycle:true,playing:false,time:2});
  const archivedB=await capture('B-before-revision');
  report.checks.unchangedB=diff(b,archivedB);assert(diff(b,archivedB)<.01);
  await page.goto(base+'?look=cube0914');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,playing:false,time:2});await capture('A-comparison');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().rendering.shellRadiance),true);
  report.checks.originalAStillActive=true;
  await page.goto(base+'?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await set({...seed,hybridColorMode:1,identityTransition:1,identityHold:3,identityDissolve:4,axisMotion:1,cameraMotion:1,time:0});
  const gray=await capture('transition-gray');
  await set({time:5});await capture('transition-middle');
  await set({time:9});const full=await capture('transition-dimensions');
  assert(diff(gray,full)>10);report.checks.transitionAndMotion=true;
  await set({...seed,hybridColorMode:1,playing:false,time:2});
  if(process.env.PLEOS_HYBRID_4K==='1'){
    await page.goto(base+'?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
    await set({...seed,hybridColorMode:1,playing:false,time:2});
    await capture('main-rgb-4k',3072,3840,4);report.checks.native4K=true;
    const result=await page.evaluate(()=>window.__pleosOptical.exportVideo({width:384,height:480,fps:24,start:2,end:2.5,samples:4},false));
    const encoded=await page.evaluate(async url=>{const b=new Uint8Array(await(await fetch(url)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);},result.url);
    await writeFile(new URL('motion-test.mp4',out),Buffer.from(encoded,'base64'));
    report.checks.mp4Export={...result,url:undefined};
  }
  assert.deepEqual(report.errors,[]);report.status='pass';
}catch(error){
  report.status='fail';report.failure=error.message;throw error;
}finally{
  await writeFile(new URL('verification.json',out),JSON.stringify(report,null,2)+'\n');
  await browser.close();console.log(JSON.stringify(report,null,2));
}
