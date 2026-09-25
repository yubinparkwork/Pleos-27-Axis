import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1400,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
 await page.evaluate(()=>window.__pleosOptical.pause());
 const panel=page.locator('[data-optical-section="motion"]');
 for(const [key,value] of Object.entries({lightMotionCycles:2,layerFadeAmount:.6,layerFadeCycles:3,layerStagger:.7})){
  const input=panel.locator(`[data-optical-number="${key}"]`);await input.fill(String(value));await input.press('Tab');
  assert.equal(await page.evaluate(k=>window.__pleosOptical.inspect().state[k],key),value);
 }
 await panel.locator('[data-optical-range="layerFadeAmount"]').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.layerFadeAmount),.61);
 await page.screenshot({path:'/tmp/pleos-motion-wide.png'});
 await page.setViewportSize({width:600,height:850});await page.screenshot({path:'/tmp/pleos-motion-narrow.png'});
 await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
 assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.layerFadeAmount),.61);
 const capture=async(time)=>page.evaluate(async time=>{window.__pleosOptical.seek(time);return window.__pleosOptical.capture(320,400,1)},time);
 const first=await capture(0);assert.equal(await capture(15),first,'Loop seam');
 assert.notEqual(await capture(4),first,'Motion must change render');
 await page.evaluate(()=>window.__pleosOptical.set({lightMotionCycles:0,layerFadeAmount:0,lightCycle:false}));
 assert.equal(await capture(0),await capture(4),'Motion disabled must freeze');
 assert.deepEqual(errors,[]);console.log('PASS: controls, keyboard, persistence, render motion, loop and freeze');
}finally{await browser.close();}
