import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {fileURLToPath} from 'node:url';
const out=new URL('../artifacts/optical-axis-motion/',import.meta.url);
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','51755','--strictPort'],{stdio:'ignore'});
const url='http://127.0.0.1:51755/?sequence=pleos25&transition=layered';
let browser;const report={errors:[],frames:[]};
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
  const p=await browser.newPage({viewport:{width:1440,height:1000}});
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await p.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await p.goto(url);await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const fixture={playing:false,cameraMotion:0,axisMotion:1,axisYaw:24,axisRoll:12,axisMoveSeconds:8,
    azimuth:80.384,elevation:28.675,zoom:1.657,panX:-20,duration:30.3,identityHold:5,identityDissolve:3,identityLayerStagger:.5,
    dimensionTop:50,dimensionLeft:50,dimensionRight:50,dimensionSpacingTop:.25,dimensionSpacingLeft:.085,dimensionSpacingRight:.105,
    lightColor:'#FA293C',lightCycle:true,lightIntensity:5,exposure:.59,bloom:.37,bevel:.03,gap:.015};
  await p.evaluate(s=>window.__pleosOptical.set(s),fixture);
  const baseline=await p.evaluate(()=>window.__pleosOptical.inspect());
  for(const time of [0,5,6.5,8,13,20,30.3]){
    const result=await p.evaluate(async time=>{
      const api=window.__pleosOptical;api.set({time});
      const state=api.inspect();return {state,png:await api.capture(320,400,1)};
    },time);
    assert.equal(result.state.motion.camera.azimuth,fixture.azimuth);
    assert.equal(result.state.motion.camera.elevation,fixture.elevation);
    assert.deepEqual(result.state.axis.renderedCenters,baseline.axis.renderedCenters);
    assert.deepEqual(result.state.motion.axis.pivot,[0,0,0]);
    if(time<=5||time===30.3)assert.equal(result.state.motion.axis.weight,0);
    await writeFile(new URL(`time-${time}.png`,out),Buffer.from(result.png.split(',')[1],'base64'));
    report.frames.push({time,axis:result.state.motion.axis,camera:result.state.motion.camera});
  }
  report.rigid=await p.evaluate(async()=>{
    const {writeWorldToAxis,transformAxisVector}=await import('/src/optical-studio/OpticalAxisMotion.ts');
    const s=window.__pleosOptical.inspect().state,m=new Float32Array(9);writeWorldToAxis({...s,time:13},m);
    const axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>transformAxisVector(m,v));
    return {lengths:axes.map(v=>Math.hypot(...v)),dot:axes[0].reduce((sum,v,i)=>sum+v*axes[1][i],0)};
  });
  report.rigid.lengths.forEach(n=>assert(Math.abs(n-1)<1e-6));assert(Math.abs(report.rigid.dot)<1e-6);
  // Model yaw is analytically equivalent to inverse camera yaw, with the
  // crucial difference that the actual world camera and its frame remain fixed.
  const images=await p.evaluate(async()=>{
    const api=window.__pleosOptical;api.set({time:13,axisRoll:0});const a=await api.capture(256,320,1);
    const yaw=api.inspect().motion.axis.yaw;
    api.set({axisMotion:0,azimuth:80.384-yaw});const b=await api.capture(256,320,1);return [a,b];
  });
  const [a,b]=images.map(s=>PNG.sync.read(Buffer.from(s.split(',')[1],'base64')));
  report.yawEquivalenceMae=a.data.reduce((sum,v,i)=>sum+Math.abs(v-b.data[i]),0)/a.data.length;
  assert(report.yawEquivalenceMae<.1);
  report.swing=await p.evaluate(async()=>{
    const {opticalAxisPose,writeWorldToAxis,transformAxisVector}=await import('/src/optical-studio/OpticalAxisMotion.ts');
    const s={...window.__pleosOptical.inspect().state,axisMotion:1,axisYaw:90,axisRoll:-42,
      azimuth:61.9,elevation:50.5,axisMoveSeconds:10,identityTransition:1,identityHold:5,duration:30.3};
    const az=s.azimuth*Math.PI/180,el=s.elevation*Math.PI/180;
    const view=[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)],m=new Float32Array(9);
    let minWeight=1,maxWeight=-1,minFace=1,maxJump=0,previous=0;
    for(let i=0;i<=3030;i++){
      const state={...s,time:i*.01},pose=opticalAxisPose(state);writeWorldToAxis(state,m);
      const ray=transformAxisVector(m,view);
      minWeight=Math.min(minWeight,pose.weight);maxWeight=Math.max(maxWeight,pose.weight);
      minFace=Math.min(minFace,...ray);maxJump=Math.max(maxJump,Math.abs(pose.yaw-previous));previous=pose.yaw;
      if(i<=500 && pose.weight!==0)throw Error('Motion before handover');
    }
    return {minWeight,maxWeight,minFace,maxJump,pose:opticalAxisPose({...s,time:5}),
      start:opticalAxisPose({...s,time:0}),end:opticalAxisPose({...s,time:30.3})};
  });
  assert(report.swing.minWeight<-.99 && report.swing.maxWeight>.99,'Both motion directions must be reached');
  assert(report.swing.minFace>.09,'Safe swing crossed or grazed a face plane');
  assert(report.swing.maxJump<.3,'Swing has a velocity discontinuity');
  assert.equal(report.swing.start.yaw,0);assert.equal(report.swing.end.yaw,0);
  // Actual user-range fixture, including large requested angles. The bounds
  // act on the complete path, not on individual frames near its endpoints.
  const swingFixture={...fixture,azimuth:61.9,elevation:50.5,axisYaw:90,axisRoll:-42,axisMoveSeconds:10};
  for(const time of [5,7.1083333333,9.2166666667,11.325,13.4333333333,30.3]){
    const data=await p.evaluate(async s=>{const api=window.__pleosOptical;api.set(s);return api.capture(400,500,4);},{...swingFixture,time});
    await writeFile(new URL(`swing-${time}.png`,out),Buffer.from(data.split(',')[1],'base64'));
  }
  report.float=await p.evaluate(async()=>{
    const {opticalCameraFloat}=await import('/src/optical-studio/OpticalCameraFloat.ts');
    const s={...window.__pleosOptical.inspect().state,cameraFloat:1,cameraFloatX:4,cameraFloatY:3,cameraFloatSeconds:15};
    let minX=0,maxX=0,minY=0,maxY=0;
    for(let i=0;i<=3030;i++){
      const f=opticalCameraFloat({...s,time:i*.01});
      if(i<=500 && (f.x!==0||f.y!==0))throw Error('Float before hold');
      minX=Math.min(minX,f.x);maxX=Math.max(maxX,f.x);minY=Math.min(minY,f.y);maxY=Math.max(maxY,f.y);
    }
    return{minX,maxX,minY,maxY,start:opticalCameraFloat({...s,time:0}),end:opticalCameraFloat({...s,time:s.duration})};
  });
  assert(report.float.minX< -3.9 && report.float.maxX>3.9);
  assert(report.float.minY< -2.9 && report.float.maxY>2.9);
  assert.equal(report.float.end.x,0);assert.equal(report.float.end.y,0);
  const floatImages=await p.evaluate(async s=>{
    const api=window.__pleosOptical;api.set({...s,time:20,cameraFloat:1,cameraFloatX:4,cameraFloatY:0,cameraFloatSeconds:15});
    const inspect=api.inspect(),first=await api.capture(256,320,1);
    api.set({cameraFloat:0,panX:s.panX+inspect.motion.float.x});
    return[first,await api.capture(256,320,1)];
  },fixture);
  const floatPng=floatImages.map(s=>PNG.sync.read(Buffer.from(s.split(',')[1],'base64')));
  report.float.translationMae=floatPng[0].data.reduce((sum,v,i)=>sum+Math.abs(v-floatPng[1].data[i]),0)/floatPng[0].data.length;
  assert(report.float.translationMae<.03,'Float changed direction instead of pure translation');
  report.cameraOrbit=await p.evaluate(async()=>{
    const {opticalCameraPose,axisCameraLoopLimits}=await import('/src/optical-studio/OpticalCameraMotion.ts');
    const {writeWorldToAxis,transformAxisVector}=await import('/src/optical-studio/OpticalAxisMotion.ts');
    const s={...window.__pleosOptical.inspect().state,axisMotion:1,cameraMotion:1,
      axisYaw:90,axisRoll:-42,axisMoveSeconds:10,cameraOrbitHorizontal:37,cameraOrbitVertical:20,cameraMoveSeconds:10,
      azimuth:61.9,elevation:50.5,identityTransition:1,identityHold:5,duration:30.3};
    const limits=axisCameraLoopLimits(s),matrix=new Float32Array(9);let minFace=1,maxHorizontal=0,maxVertical=0;
    for(let i=0;i<=3030;i++){
      const state={...s,time:i*.01},pose=opticalCameraPose(state);writeWorldToAxis(state,matrix);
      const az=pose.azimuth*Math.PI/180,el=pose.elevation*Math.PI/180;
      const local=transformAxisVector(matrix,[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)]);
      minFace=Math.min(minFace,...local.map(Math.abs));maxHorizontal=Math.max(maxHorizontal,Math.abs(pose.azimuth-s.azimuth));maxVertical=Math.max(maxVertical,Math.abs(pose.elevation-s.elevation));
    }
    return {limits,minFace,maxHorizontal,maxVertical,start:opticalCameraPose({...s,time:0}),end:opticalCameraPose({...s,time:s.duration})};
  });
  assert(report.cameraOrbit.minFace>.074,'Combined camera and Axis loop grazed a face plane');
  assert(report.cameraOrbit.maxHorizontal>1 && report.cameraOrbit.maxVertical>1,'Camera loop did not visibly move');
  assert.equal(report.cameraOrbit.start.azimuth,61.9);assert.equal(report.cameraOrbit.end.azimuth,61.9);
  await p.evaluate(s=>window.__pleosOptical.set({...s,time:13,cameraFloat:0}),fixture);
  await p.getByRole('slider',{name:'기울기 회전 폭 슬라이더',exact:true}).press('ArrowRight');
  assert.equal(await p.locator('#optical-axisRoll-number').inputValue(),'12.5');
  await p.screenshot({path:fileURLToPath(new URL('wide.png',out))});
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:fileURLToPath(new URL('narrow.png',out))});
  await p.reload();await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await p.evaluate(()=>window.__pleosOptical.inspect().state.axisRoll),12.5);
  await p.setViewportSize({width:1440,height:1000});
  if(await p.locator('[data-optical-action="inspector"]').getAttribute('aria-expanded')==='false')
    await p.locator('[data-optical-action="inspector"]').click();
  await p.locator('[data-optical-section="camera"] > summary').click();
  await p.getByRole('spinbutton',{name:'부유 모션',exact:true}).fill('1');
  await p.getByRole('spinbutton',{name:'부유 모션',exact:true}).press('Tab');
  await p.getByRole('slider',{name:'좌우 부유 폭 슬라이더',exact:true}).press('ArrowRight');
  assert.equal(await p.locator('#optical-cameraFloatX-number').inputValue(),'4.1');
  await p.getByRole('spinbutton',{name:'상하 부유 폭 (%)',exact:true}).fill('3');
  await p.getByRole('spinbutton',{name:'상하 부유 폭 (%)',exact:true}).press('Tab');
  await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:fileURLToPath(new URL('float-narrow.png',out))});
  await p.setViewportSize({width:1440,height:1000});
  await p.screenshot({path:fileURLToPath(new URL('float-wide.png',out))});
  await p.reload();await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await p.evaluate(()=>window.__pleosOptical.inspect().state.cameraFloat),1);
  assert.equal(await p.evaluate(()=>window.__pleosOptical.inspect().state.cameraFloatX),4.1);
  assert.deepEqual(report.errors,[]);report.status='pass';
}finally{await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser?.close();server.kill();}
console.log(JSON.stringify({status:report.status,errors:report.errors,yawEquivalenceMae:report.yawEquivalenceMae}));
