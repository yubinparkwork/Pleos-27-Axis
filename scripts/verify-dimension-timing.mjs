import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1400,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
 await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:4,speed:0,lightCycle:false,lightColor:'#FFFFFF',layerFadeAmount:1,layerFadeCycles:1,duration:15}));
 const keys=['dimensionDelayTop','dimensionDelayLeft','dimensionDelayRight'];
 const counts=['dimensionTop','dimensionLeft','dimensionRight'];
 const capture=patch=>page.evaluate(async patch=>{window.__pleosOptical.set(patch);return window.__pleosOptical.capture(320,400,1)},patch);
 for(let i=0;i<3;i++){
  const reset=Object.fromEntries([...keys.map(k=>[k,0]),...counts.map((k,j)=>[k,i===j?3:0])]);
  const base=await capture(reset);
  assert.equal(await capture({[keys[(i+1)%3]]:2}),base,'Other cube delay changes isolated cube');
  const shifted=await capture({[keys[i]]:7});
  assert(shifted!==base,`Own cube ${i} delay has no effect`);
 }
 const section=page.locator('[data-optical-section="timing"]');
 for(const [i,k] of keys.entries()){const input=section.locator(`[data-optical-number="${k}"]`);await input.fill(String(i+1));await input.press('Tab');}
 await section.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/pleos-timing-wide.png'});
 await page.setViewportSize({width:600,height:850});await section.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/pleos-timing-narrow.png'});
 await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
 for(const [i,k] of keys.entries())assert.equal(await page.evaluate(k=>window.__pleosOptical.inspect().state[k],k),i+1);
 assert.equal(await capture({time:0}),await capture({time:15}),'Loop seam with delays');
 assert.deepEqual(errors,[]);console.log('PASS: all three independent delays, input, persistence, exact loop');
}finally{await browser.close();}
