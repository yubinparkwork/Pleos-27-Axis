// Isolated browser QA for per-artboard camera framing and explicit save/restore.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'artifacts/camera-profiles');
const base='http://127.0.0.1:51760/?look=hybrid-ab';
let server,browser;
const errors=[];
const camera=state=>({zoom:state.zoom,panX:state.panX,azimuth:state.azimuth,elevation:state.elevation});

try {
  await mkdir(output,{recursive:true});
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51760','--strictPort'],{cwd:root,stdio:'ignore'});
  const deadline=Date.now()+30000;
  while(true){try{if((await fetch(base)).ok)break;}catch{}
    if(Date.now()>deadline||server.exitCode!==null)throw Error('QA server unavailable');
    await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:1200,height:850}});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  await page.route('**/__pleos/optical-state?*',route=>route.fulfill({status:204}));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base);
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const inspect=()=>page.evaluate(()=>window.__pleosOptical.inspect().state);
  const aspect=page.locator('[data-optical-aspect]');
  const cameraSection=page.locator('[data-optical-section="camera"]');
  await cameraSection.evaluate(node=>node.open=true);
  const first={zoom:1.3,panX:-8,azimuth:31,elevation:41};
  const second={zoom:2.4,panX:12,azimuth:49,elevation:28};
  const original=await inspect();
  await page.evaluate(patch=>window.__pleosOptical.set(patch),{
    ...original,aspect:'a-series',...first,cameraProfiles:{},cameraDrafts:{},playing:false,
  });
  await page.locator('[data-optical-action="save-camera"]').click();
  assert.deepEqual((await inspect()).cameraProfiles['a-series'],first);
  await aspect.selectOption('16x9');
  assert.deepEqual(camera(await inspect()),first,'New ratio should inherit the current framing');
  await page.evaluate(view=>window.__pleosOptical.set(view),second);
  await page.locator('[data-optical-action="save-camera"]').click();
  assert.deepEqual((await inspect()).cameraProfiles['16x9'],second);
  await aspect.selectOption('a-series');
  assert.deepEqual(camera(await inspect()),first,'A-series framing was not restored');
  await aspect.selectOption('16x9');
  assert.deepEqual(camera(await inspect()),second,'16:9 framing was not restored');
  assert.equal((await inspect()).lightIntensity,original.lightIntensity,'Shared lighting changed with artboard');
  // An unsaved experiment is kept as a draft but can return to the explicit save.
  await page.locator('[data-optical-range="zoom"]').fill('2.8');
  assert.equal((await inspect()).zoom,2.8);
  await aspect.selectOption('a-series');
  await aspect.selectOption('16x9');
  assert.equal((await inspect()).zoom,2.8,'Unsaved draft was lost on format switch');
  await page.locator('[data-optical-action="restore-camera"]').click();
  assert.deepEqual(camera(await inspect()),second,'Saved 16:9 profile did not restore');
  await page.reload();
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.deepEqual(camera(await inspect()),second,'16:9 framing did not survive reload');
  await page.locator('[data-optical-section="camera"]').evaluate(node=>node.open=true);
  await aspect.selectOption('a-series');
  assert.deepEqual(camera(await inspect()),first,'A-series framing did not survive reload');
  const png=await page.evaluate(()=>window.__pleosOptical.capture(360,510,4));
  assert(png.startsWith('data:image/png;base64,'),'Selected-format capture failed');
  await page.locator('[data-optical-section="camera"]').evaluate(node=>node.open=true);
  await page.locator('[data-optical-action="save-camera"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'panel-wide.png')});
  await page.setViewportSize({width:390,height:844});
  const inspectorButton=page.locator('[data-optical-action="inspector"]');
  if((await inspectorButton.getAttribute('aria-expanded'))==='false')await inspectorButton.click();
  await page.locator('[data-optical-section="camera"]').evaluate(node=>node.open=true);
  await page.locator('[data-optical-action="save-camera"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'panel-narrow.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Narrow inspector overflows');
  assert.equal(errors.length,0,errors.join('\n'));
  const report={status:'pass',profiles:{'a-series':first,'16x9':second},checks:['switch','draft','explicit restore','reload','shared lighting','PNG capture','wide/narrow UI'],errors};
  await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server?.kill();}
