import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/rgb-holds-origin');
const url='http://127.0.0.1:51756/?look=hybrid-ab';
const report={status:'running',errors:[]};let server,browser;
try {
  await mkdir(out,{recursive:true});
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51756','--strictPort'],{cwd:root,stdio:'ignore'});
  const deadline=Date.now()+30000;
  while(true){try{if((await fetch(url)).ok)break;}catch{}if(Date.now()>deadline)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.goto(url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  report.timing=await page.evaluate(async()=>{
    const {sanitizeOpticalState}=await import('/src/optical-studio/OpticalState.ts');
    const {writeHybridWeights}=await import('/src/optical-studio/HybridAB.ts');
    const {opticalColorStart,opticalColorTiming}=await import('/src/optical-studio/OpticalLighting.ts');
    const ratios=[0,5,8,20,33].map(sub=>{
      const samples=[0,2.5,3,7].map(time=>{
        const out=new Float32Array(3);
        writeHybridWeights(sanitizeOpticalState({identityTransition:0,lightTimingCustom:1,lightHoldRed:2,lightHoldGreen:3,lightHoldBlue:4,lightCrossfade:1,hybridSubPercent:sub,time,duration:60}),out);
        return [...out];
      });return {sub,samples};
    });
    window.__ratioChecks={ratios,defaultSub:sanitizeOpticalState({}).hybridSubPercent};
    const seed=sanitizeOpticalState({...window.__pleosOptical.inspect().state,hybridSubPercent:5,identityTransition:0,duration:60,lightTimingCustom:1,lightHoldRed:2,lightHoldGreen:3,lightHoldBlue:4,lightCrossfade:1,hybridColorMode:0,lightCycleOffset:0,playing:false});
    const weights=t=>{const out=new Float32Array(3);writeHybridWeights({...seed,time:t},out);return [...out];};
    const transition={...seed,identityTransition:1,identityHold:5,identityDissolve:3,identityLayerStagger:.4,dimensionTop:12,dimensionLeft:12,dimensionRight:12};
    const start=opticalColorStart(transition),red=new Float32Array(3);
    writeHybridWeights({...transition,time:start+1.9},red);
    const firstCycle=[5,5.9,6.5,7,8.5,9,10.5,11].map(time=>{
      const out=new Float32Array(3);
      writeHybridWeights({...transition,lightHoldRed:1,lightHoldGreen:1,lightHoldBlue:1,time},out);
      return {time,w:[...out]};
    });
    const legacyStart=opticalColorStart({...transition,lightTimingCustom:0});
    const denseStart=opticalColorStart({...transition,dimensionTop:50,identityLayerStagger:1});
    const fittedStart=opticalColorStart({...transition,duration:4});
    const extremes=sanitizeOpticalState({lightHoldRed:-2,lightHoldGreen:100,lightCrossfade:0,lightTimingCustom:1});
    window.__pleosOptical.set(seed);
    return {firstCycle,legacyStart,denseStart,fittedStart,period:opticalColorTiming(seed).period,samples:[0,1.9,2.5,3,5.9,7,10.9,12,24].map(t=>({t,w:weights(t)})),start,red:[...red],extremes:[extremes.lightHoldRed,extremes.lightHoldGreen,extremes.lightCrossfade],oldDefault:sanitizeOpticalState({}).lightTimingCustom};
  });
  assert.equal(report.timing.period,12);assert.equal(report.timing.oldDefault,0);
  assert.deepEqual(report.timing.extremes,[0,60,.1]);
  for(const [t,c] of [[0,0],[1.9,0],[3,1],[5.9,1],[7,2],[10.9,2],[12,0],[24,0]])assert(report.timing.samples.find(s=>s.t===t).w[c]>.899);
  assert(Math.abs(report.timing.samples.find(s=>s.t===2.5).w[0]-.475)<1e-5);
  assert(report.timing.red[0]>.899);assert.equal(report.timing.start,5);
  assert(Math.abs(report.timing.legacyStart-10.2)<1e-9);
  assert.equal(report.timing.denseStart,5);assert.equal(report.timing.fittedStart,2.5);
  for(const [time,c] of [[5,0],[5.9,0],[7,1],[9,2],[11,0]])assert(report.timing.firstCycle.find(s=>s.time===time).w[c]>.899);
  for(const [time,c] of [[6.5,0],[8.5,1],[10.5,2]])assert(Math.abs(report.timing.firstCycle.find(s=>s.time===time).w[c]-.475)<1e-5);
  const mode=page.getByLabel('RGB 시간 방식',{exact:true});
  report.ratios=await page.evaluate(()=>window.__ratioChecks);
  assert.equal(report.ratios.defaultSub,8);
  for(const {sub,samples} of report.ratios.ratios){
    for(const w of samples){assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);assert(w.every(v=>v>=sub/100-1e-6));}
    assert(Math.abs(samples[0][0]-(1-2*sub/100))<1e-6);
  }
  const sub=page.getByLabel('서브 컬러 각각 (%)',{exact:true});
  await sub.fill('7');await sub.press('ArrowUp');await sub.press('Tab');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridSubPercent),8);
  await page.getByLabel('통합안 컬러 구성',{exact:true}).selectOption('1');assert(await sub.isDisabled());
  await page.getByLabel('통합안 컬러 구성',{exact:true}).selectOption('0');assert(await sub.isEnabled());
  await mode.selectOption('0');assert(await page.getByLabel('레드 유지 (초)',{exact:true}).isDisabled());
  await mode.selectOption('1');
  const red=page.getByLabel('레드 유지 (초)',{exact:true});
  await red.fill('4.5');await red.press('Tab');
  await red.focus();await red.press('ArrowUp');await red.press('Tab');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.lightHoldRed),4.6);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.lightHoldRed),4.6);
  await page.getByLabel('RGB 시간 방식',{exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.hybridSubPercent),8);
  await page.screenshot({path:path.join(out,'panel-wide.png')});
  await page.setViewportSize({width:760,height:820});
  await page.getByLabel('RGB 시간 방식',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'panel-narrow.png')});
  report.ui='mode toggle, keyboard step, persisted reload, wide/narrow screenshot';
  for(const time of [1,1.1,1.25]) {
    const data=await page.evaluate(async time=>{
      window.__pleosOptical.set({playing:false,time,identityTransition:1,identityHold:5.3,identityDissolve:3,panX:0,aspect:'main'});
      return window.__pleosOptical.capture(512,512,16);
    },time);
    const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(path.join(out,`origin-${time}.png`),bytes);
    const png=PNG.sync.read(bytes);let center=0;
    for(const y of [255,256])for(const x of [255,256])center+=png.data[(y*512+x)*4];
    // A 0.14-display thin stroke is subpixel at 512px; require coverage,
    // not an artificial bright dot at the junction.
    assert(center/4>=8,`Origin must not be black at ${time}s`);
    report[`origin${time}`]=center/4;
  }
  assert.equal(report.errors.length,0);report.status='pass';
}catch(e){report.status='fail';report.failure=e.message;throw e;}
finally{await mkdir(out,{recursive:true});await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));await browser?.close();server?.kill();console.log(JSON.stringify(report,null,2));}
