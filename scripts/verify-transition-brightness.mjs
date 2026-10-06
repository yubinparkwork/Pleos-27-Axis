// Browser regression for the Hybrid A/B handover-only brightness control.
// The isolated browser blocks shared-settings writes and leaves the artist's state untouched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'artifacts/transition-brightness');
const base='http://127.0.0.1:51759';
const errors=[];
let server,browser;
const decode=data=>PNG.sync.read(Buffer.from(data.split(',')[1],'base64'));
const mean=png=>{
  let sum=0;
  for(let i=0;i<png.data.length;i+=4)sum+=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
  return sum/(png.width*png.height);
};
const difference=(a,b)=>{
  let sum=0;
  for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);
  return sum/(a.width*a.height*3);
};

try{
  await mkdir(output,{recursive:true});
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51759','--strictPort'],{cwd:root,stdio:'ignore'});
  const deadline=Date.now()+30000;
  while(true){try{if((await fetch(base+'/?look=hybrid-ab')).ok)break;}catch{}
    if(Date.now()>deadline||server.exitCode!==null)throw Error('QA server unavailable');
    await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:1200,height:850}});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  await page.route('**/__pleos/optical-state?*',route=>route.fulfill({status:204}));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base+'/?look=hybrid-ab');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const slider=page.locator('[data-optical-range="identityTransitionBrightness"]');
  const number=page.locator('[data-optical-number="identityTransitionBrightness"]');
  assert.equal(await slider.count(),1,'Transition brightness slider missing');
  assert.equal(await number.count(),1,'Numeric input missing');
  const initial=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  const fixture={...initial,identityTransition:1,identityHold:3,identityDissolve:3,
    identityEngraving:1,identityAxisAccent:0,identityLayerStagger:0,playing:false};
  const hold=fixture.identityHold,dissolve=fixture.identityDissolve;
  async function capture(level,time){
    const data=await page.evaluate(async state=>{
      window.__pleosOptical.set(state);
      return window.__pleosOptical.capture(480,600,8);
    },{...fixture,identityTransitionBrightness:level,time});
    return decode(data);
  }
  const during=hold+dissolve*.5;
  const dim=await capture(0,during),baseline=await capture(1,during),bright=await capture(2,during);
  await writeFile(path.join(output,'dim.png'),PNG.sync.write(dim));
  await writeFile(path.join(output,'baseline.png'),PNG.sync.write(baseline));
  await writeFile(path.join(output,'bright.png'),PNG.sync.write(bright));
  assert(mean(dim)<mean(baseline)-.05,'Lower value did not dim the handover');
  assert(mean(bright)>mean(baseline)+.05,'Higher value did not brighten the handover');
  const endpoints=[];
  for(const time of [Math.max(0,hold-.1),hold+dissolve+.1]){
    const low=await capture(0,time),high=await capture(2,time);
    const mae=difference(low,high);
    assert(mae<.02,`Endpoint changed at ${time}: ${mae}`);
    endpoints.push({time,mae});
  }
  await page.evaluate(state=>window.__pleosOptical.set(state),{...fixture,time:during,identityTransitionBrightness:1});
  await slider.fill('0.35');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state.identityTransitionBrightness)),.35);
  assert.equal(await number.inputValue(),'0.35');
  await page.reload();
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state.identityTransitionBrightness)),.35,'Control did not survive reload');
  await slider.focus();
  await slider.press('ArrowDown');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state.identityTransitionBrightness)),.3,'Keyboard adjustment failed');
  await page.screenshot({path:path.join(output,'panel-wide.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'panel-narrow.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Narrow panel overflows viewport');
  assert.equal(errors.length,0,errors.join('\n'));
  const report={status:'pass',during,mean:{dim:mean(dim),baseline:mean(baseline),bright:mean(bright)},endpoints,ui:'slider, numeric value, keyboard, local reload, wide/narrow layout',errors};
  await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server?.kill();}
