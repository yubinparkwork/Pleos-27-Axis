import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const base='http://127.0.0.1:51765',out='artifacts/cube-surface';
const originalFile='.pleos/optical-state/pleos-optical-studio-v1%3Aarchive%3Asaved-20260916093405726%3Acube0914-motion.json';
const original=await readFile(originalFile,'utf8');
const fixture={...JSON.parse(original).state,playing:false,cubeSurfaceLight:1,cubeThroughLight:1,cubeFaceLight:1};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51765','--strictPort'],{stdio:'ignore'});
let browser;const errors=[];
const mae=(a,b)=>{let n=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)n+=Math.abs(a.data[i+c]-b.data[i+c]);return n/(a.width*a.height*3);};
try{
  await mkdir(out,{recursive:true});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>200)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.route('**/__pleos/optical-state?*',r=>r.fulfill({status:204}));
  page.on('pageerror',e=>errors.push(e.message));
  const open=async path=>{await page.goto(base+path);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);};
  const capture=async(name,patch={})=>{
    const url=await page.evaluate(async s=>{window.__pleosOptical.set(s);return window.__pleosOptical.capture(480,600,4);},{...fixture,...patch});
    const b=Buffer.from(url.split(',')[1],'base64');await writeFile(`${out}/${name}.png`,b);return PNG.sync.read(b);
  };
  await open('/versions/saved-20260916093405726-compatible/index.html?look=cube0914');
  const old=await capture('original');
  const shader=await readFile('src/optical-studio/cube0914.frag.glsl','utf8');
  const unmodified=shader.replace('uCubeSurfaceLight * f * uReflection','f * uReflection').replace('directFill * energy * (1.0 - reflectance)','energy * (1.0 - reflectance)').replace('(.52 * uCubeFaceLight)', '.52');
  const shaderRoute=/\/src\/optical-studio\/cube0914\.frag\.glsl\?/;
  await page.route(shaderRoute,r=>r.fulfill({contentType:'application/javascript',body:`export default ${JSON.stringify(unmodified)};`}));
  await open('/?look=cube0914');
  const unchanged=await capture('unmodified-current');
  await page.unroute(shaderRoute);
  await open('/?look=cube0914');
  const current=await capture('unchanged');
  const baseline=mae(unchanged,current);assert(baseline<.02,`A shader baseline mismatch ${baseline}`);
  const archiveMAE=mae(old,current);assert(archiveMAE<1,`Archived A diverged ${archiveMAE}`);
  const surfaceOff=await capture('surface-off',{cubeSurfaceLight:0});
  const throughOff=await capture('through-off',{cubeThroughLight:0});
  const bothOff=await capture('both-off',{cubeSurfaceLight:0,cubeThroughLight:0});
  assert(mae(current,surfaceOff)>.01,'Exterior reflection control has no effect');
  assert(mae(current,throughOff)>.01,'Transmitted fill control has no effect');
  // Visual residual at both controls zero must still contain the internal layers.
  const noLayers=await capture('both-off-no-layers',{cubeSurfaceLight:0,cubeThroughLight:0,dimensionTop:0,dimensionLeft:0,dimensionRight:0});
  assert(mae(bothOff,noLayers)>1,'Dimension layers must survive surface removal');
  const faceOff=await capture('face-off',{cubeFaceLight:0});
  assert(mae(bothOff,faceOff)>1,'Whole face fill must be removed beyond the first reflection/transmission');
  const empty=await capture('face-off-no-layers',{cubeFaceLight:0,dimensionTop:0,dimensionLeft:0,dimensionRight:0});
  assert(empty.data.every((v,i)=>i%4===3||v===0),'Zero face and zero dimensions must be black');
  // With face light zero, old shell-only parameters cannot change dimension pixels.
  const dimensionOnly=await capture('dimension-isolation',{cubeFaceLight:0,cubeSurfaceLight:0,cubeThroughLight:0});
  assert.equal(mae(faceOff,dimensionOnly),0,'Dimension branch must stay independent');
  await capture('adjustment',{cubeFaceLight:.5});
  const input=page.getByRole('spinbutton',{name:'겉면 빛 강도 (×)',exact:true});
  await input.fill('.5');await input.press('ArrowUp');await input.press('Tab');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect())).state.cubeFaceLight,.51);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect())).state.cubeFaceLight,.51);
  await input.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/panel-wide.png`});
  await page.setViewportSize({width:390,height:844});await input.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/panel-narrow.png`});
  await page.setViewportSize({width:1440,height:960});
  const video=await page.evaluate(()=>window.__pleosOptical.exportVideo({width:480,height:600,fps:30,samples:4,start:8.25,end:8.35},false));
  assert(video.url,'Video export failed');
  assert.deepEqual(errors,[]);
  assert.equal(await readFile(originalFile,'utf8'),original,'Original settings changed');
  const report={status:'pass',baselineMAE:baseline,archiveMAE,faceFillMAE:mae(current,faceOff),residualShellRemovedMAE:mae(bothOff,faceOff),dimensionIsolationMAE:mae(faceOff,dimensionOnly),keyboardPersistence:'pass',png:'pass',mp4:'pass',errors};
  await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server.kill();}
