import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out='artifacts/cube-rgb-ratio',base='http://127.0.0.1:5173';
const originalFile='.pleos/optical-state/pleos-optical-studio-v1%3Aarchive%3Asaved-20260930110231639%3Acube0914-motion.json';
const original=await readFile(originalFile,'utf8');
const fixture={...JSON.parse(original).state,playing:false,time:0,lightCycle:true,cubeSubPercent:10};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
try{
  await mkdir(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__pleos/optical-state?*',r=>r.fulfill({status:204}));
  const open=async url=>{await page.goto(base+url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);await page.evaluate(s=>window.__pleosOptical.set(s),fixture);};
  const capture=()=>page.evaluate(()=>window.__pleosOptical.capture(360,480,4));
  await open('/versions/saved-20260930110231639-compatible/index.html?look=cube0914');const old=PNG.sync.read(Buffer.from((await capture()).split(',')[1],'base64'));
  await open('/?look=cube0914');const same=PNG.sync.read(Buffer.from((await capture()).split(',')[1],'base64'));
  assert.deepEqual(same.data,old.data,'10% default must preserve old A rendering');
  const weights=await page.evaluate(async()=>{
    const {writeCube0914Weights}=await import('/src/optical-studio/Cube0914.ts');const state=window.__pleosOptical.inspect().state;const out=new Float32Array(3),values=[];
    for(const percent of [0,5,8,10,33])for(const time of [0,state.duration/3,state.duration*2/3,state.duration]){writeCube0914Weights({...state,time,lightCycleOffset:0,cubeSubPercent:percent},out);values.push({percent,weights:Array.from(out)});}
    return values;
  });
  for(const v of weights){assert(Math.abs(v.weights.reduce((a,b)=>a+b,0)-1)<1e-6);assert(Math.abs(Math.max(...v.weights)-(1-v.percent/50))<1e-6);}
  const input=page.getByRole('spinbutton',{name:'서브 컬러 각각 (%)',exact:true});await input.fill('8');await input.press('ArrowUp');await input.press('Tab');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).cubeSubPercent,9);
  const changed=PNG.sync.read(Buffer.from((await capture()).split(',')[1],'base64'));assert.notDeepEqual(changed.data,same.data);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).cubeSubPercent,9);
  await input.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/panel-wide.png'});
  await page.setViewportSize({width:390,height:844});await input.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/panel-narrow.png'});
  await page.getByRole('checkbox',{name:'RGB 주도색 순환',exact:true}).uncheck();assert(await input.isDisabled());
  await page.getByRole('checkbox',{name:'RGB 주도색 순환',exact:true}).check();assert(await input.isEnabled());
  assert.deepEqual(errors,[]);assert.equal(await readFile(originalFile,'utf8'),original,'Artist settings changed');
  await writeFile(out+'/verification.json',JSON.stringify({status:'pass',baseline:'identical',weights,keyboard:true,persistence:true,cycleToggle:true,errors},null,2));
  console.log('PASS: A baseline identical, normalized RGB ratio, live render, keyboard, persistence, narrow/wide, cycle toggle, original settings preserved');
}finally{await browser.close();}
