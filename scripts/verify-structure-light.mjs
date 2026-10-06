import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out='artifacts/structure-light';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text());});
await page.route('**/__pleos/optical-state**',r=>r.fulfill({status:204}));
await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
const regions=['Top','Left','Right'],axes=['X','Y','Z'];
const keys=regions.flatMap(r=>axes.map(a=>`structure${r}${a}`));
const neutral=Object.fromEntries(keys.map(k=>[k,1]));
const capture=async(name,patch={})=>{const data=await page.evaluate(async patch=>{window.__pleosOptical.set(patch);return window.__pleosOptical.capture(480,600,4);},patch);const b=Buffer.from(data.split(',')[1],'base64');await writeFile(`${out}/${name}.png`,b);return PNG.sync.read(b);};
const diff=(a,b)=>{let s=0;for(let i=0;i<a.data.length;i++)s+=Math.abs(a.data[i]-b.data[i]);return s/a.data.length;};
try{
  await page.goto('http://127.0.0.1:5173/?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const initial=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  keys.forEach(k=>assert.equal(initial[k],1));assert.equal(initial.structureContrast,0);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:8.4,identityTransition:0,axisMotion:0,cameraMotion:0,layerFadeAmount:0,hybridColorMode:1}));
  const baseline=await capture('baseline');const changes={};
  for(const axis of axes){
    changes[axis]=diff(baseline,await capture(`parent-${axis}-off`,Object.fromEntries(regions.map(r=>[`structure${r}${axis}`,0]))));
    assert(changes[axis]>.01,`Parent ${axis} lighting has no effect`);
    await page.evaluate(p=>window.__pleosOptical.set(p),neutral);
  }
  const contrasted=await capture('contrast',{structureContrast:.8});assert(diff(baseline,contrasted)>.01);
  await page.evaluate(()=>window.__pleosOptical.set({structureContrast:0}));
  assert(diff(baseline,await capture('neutral-restored'))<.01);
  // Same neutral controls must leave the untouched 25 Axis carrier identical.
  await page.evaluate(()=>window.__pleosOptical.set({identityTransition:1,time:1}));
  const gray=await capture('25-axis');const grayOff=await capture('25-axis-zero-light',{...Object.fromEntries(keys.map(k=>[k,0])),structureContrast:1});
  assert(diff(gray,grayOff)<.01);
  await page.evaluate(p=>window.__pleosOptical.set({...p,identityTransition:0,time:8.4,structureContrast:.8}),neutral);
  const section=page.locator('[data-optical-section="structure-light"]');const input=section.locator('[data-optical-number="structureLeftY"]');
  for(const region of regions)assert.equal(await section.locator(`.optical-control:visible input[data-optical-number^="structure${region}"]`).count(),2);
  for(const key of ['structureTopY','structureLeftZ','structureRightX']){
    assert.equal(await section.locator(`[data-optical-number="${key}"]`).isVisible(),false);
    assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state))[key],1);
  }
  await input.fill('.35');await input.press('Tab');assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).structureLeftY,.35);
  await page.keyboard.press('Meta+z');assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).structureLeftY,1);
  await input.fill('.6');await input.press('Tab');await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).structureLeftY,.6);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:8.4}));
  await section.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/panel-wide.png'});
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/panel-narrow.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Guard ownership: no camera vector, RGB selector, or internal image hit in
  // the helper. A single gain covers base dimensions AND both hybrid branches.
  const source=await readFile('src/optical-studio/optical.frag.glsl','utf8');
  const helper=source.slice(source.indexOf('float structureLightingGain'),source.indexOf('float hybridHit'));
  assert(helper.includes('hybridNormal(world,id)'));assert(!/uCamera|uCycle|opticalNormal|refract\(/.test(helper));
  assert(source.includes('colour*=structureLightingGain(entry,id)'));
  assert.equal(source.match(/colour\+=structureGain\*interiorWeight/g).length,2);
  assert.deepEqual(errors,[]);
  await writeFile(out+'/validation.json',JSON.stringify({status:'PASS',defaultsNeutral:true,parentAxisDifferences:changes,neutralRestored:true,grayCarrierUnchanged:true,twoControlsPerStructure:true,hiddenValuesPreserved:true,commandZ:true,persistence:true,narrowNoOverflow:true,errors},null,2));
  console.log('Structural lighting PASS',changes);
}finally{await browser.close();}
