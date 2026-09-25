import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
const url='http://127.0.0.1:51754/?sequence=pleos25&transition=layered';
const out=new URL('../artifacts/optical-camera-motion/',import.meta.url);
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','51754','--strictPort'],{stdio:'ignore'});
let browser;
const report={errors:[],checks:[]};
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.goto(url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,cameraMotion:1,azimuth:80.384,elevation:28.675,panX:-20,zoom:1.657,identityHold:5,identityDissolve:3,duration:30.3,dimensionTop:50,dimensionLeft:50,dimensionRight:50}));
  report.timeline=await page.evaluate(async()=>{
    const {opticalCameraPose}=await import('/src/optical-studio/OpticalCameraMotion.ts');
    const s={...window.__pleosOptical.inspect().state,duration:30.3};
    return [0,5,5.001,6.5,8,13,20,30.299,30.3].map(time=>({time,...opticalCameraPose({...s,time})}));
  });
  assert.equal(report.timeline[0].weight,0);assert.equal(report.timeline[1].weight,0);
  assert.equal(report.timeline.at(-1).weight,0);assert.equal(report.timeline[5].weight,1);
  for(const time of [0,5,6.5,8,13,20,30.3]){
    const result=await page.evaluate(async time=>{
      const api=window.__pleosOptical;
      api.set({time,cameraMotion:1,azimuth:80.384,elevation:28.675});
      const state=api.inspect(), moving=await api.capture(256,320,1);
      api.set({cameraMotion:0,azimuth:state.motion.camera.azimuth,elevation:state.motion.camera.elevation});
      const fixed=await api.capture(256,320,1);
      return {moving,fixed,state};
    },time);
    const bytes=Buffer.from(result.moving.split(',')[1],'base64');
    const a=PNG.sync.read(bytes),b=PNG.sync.read(Buffer.from(result.fixed.split(',')[1],'base64'));
    assert.deepEqual(a.data,b.data,`animated camera must equal explicit camera at ${time}`);
    assert.equal(result.state.state.azimuth,80.384);
    await writeFile(new URL(`time-${time}.png`,out),bytes);
    report.checks.push({time,explicitCameraPixelDifference:0,savedAngleUnchanged:true});
  }
  await page.evaluate(()=>window.__pleosOptical.set({cameraMotion:1,azimuth:80.384,elevation:28.675,time:13}));
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const persisted=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  assert.equal(persisted.cameraMotion,1);assert.equal(persisted.azimuth,80.384);
  report.axisCameraLoop=await page.evaluate(async()=>{
    const {opticalCameraPose,axisCameraLoopLimits}=await import('/src/optical-studio/OpticalCameraMotion.ts');
    const {writeWorldToAxis,transformAxisVector}=await import('/src/optical-studio/OpticalAxisMotion.ts');
    const s={...window.__pleosOptical.inspect().state,playing:false,time:0,duration:30.3,identityTransition:1,identityHold:5.3,identityDissolve:3,axisMotion:1,axisYaw:90,axisRoll:-42,axisMoveSeconds:10,cameraMotion:1,cameraOrbitHorizontal:37,cameraOrbitVertical:20,cameraMoveSeconds:10,azimuth:58.676,elevation:13.048};
    const limits=axisCameraLoopLimits(s),matrix=new Float32Array(9),base=[Math.sin(s.azimuth*Math.PI/180)*Math.cos(s.elevation*Math.PI/180),Math.sin(s.elevation*Math.PI/180),Math.cos(s.azimuth*Math.PI/180)*Math.cos(s.elevation*Math.PI/180)];
    let minMargin=Infinity,minHorizontal=Infinity,maxHorizontal=-Infinity,minVertical=Infinity,maxVertical=-Infinity;
    for(let index=0;index<=600;index++){
      const time=s.duration*index/600,pose=opticalCameraPose({...s,time});
      minHorizontal=Math.min(minHorizontal,pose.horizontal);maxHorizontal=Math.max(maxHorizontal,pose.horizontal);minVertical=Math.min(minVertical,pose.vertical);maxVertical=Math.max(maxVertical,pose.vertical);
      const azimuth=pose.azimuth*Math.PI/180,elevation=pose.elevation*Math.PI/180,world=[Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)];
      writeWorldToAxis({...s,time},matrix);const local=transformAxisVector(matrix,world);
      for(let axis=0;axis<3;axis++)minMargin=Math.min(minMargin,local[axis]*Math.sign(base[axis]||1));
    }
    return {limits,minMargin,minHorizontal,maxHorizontal,minVertical,maxVertical,start:opticalCameraPose({...s,time:0}),end:opticalCameraPose({...s,time:s.duration})};
  });
  assert.ok(report.axisCameraLoop.minMargin>=.074,'combined camera loop must remain inside the same visible Axis octant');
  assert.ok(report.axisCameraLoop.maxHorizontal-report.axisCameraLoop.minHorizontal>.2,'combined loop must move horizontally');
  assert.ok(report.axisCameraLoop.maxVertical-report.axisCameraLoop.minVertical>.1,'combined loop must move vertically');
  assert.equal(report.axisCameraLoop.start.azimuth,report.axisCameraLoop.end.azimuth,'combined loop must close at the same view');
  await page.screenshot({path:fileURLToPath(new URL('panel-wide.png',out))});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('panel-narrow.png',out))});
  assert.deepEqual(report.errors,[]);report.status='PASS';
} finally {
  await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
  await browser?.close();server.kill();
}
console.log(JSON.stringify(report));
