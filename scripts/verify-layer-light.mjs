import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const base='http://127.0.0.1:51764', out='artifacts/layer-light';
const saved=JSON.parse(await readFile('.pleos/optical-state/pleos-optical-studio-v1%3Aarchive%3Asaved-20260930094901979%3Ahybrid-axis-split.json','utf8')).state;
const fixture={...saved,playing:false,identityTransition:0,axisMotion:0,cameraMotion:0,cameraFloat:0,hybridDepthFlow:0,layerFadeAmount:0,lightMotionCycles:0,hybridColorMode:1,time:2,layerLightContrast:0,layerLightLength:1.5,layerLightCycles:1};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51764','--strictPort'],{stdio:'ignore'});
let browser; const errors=[];
const difference=(a,b)=>{let v=0; for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)v+=Math.abs(a.data[i+c]-b.data[i+c]);return v/(a.width*a.height*3);};
try{
  await mkdir(out,{recursive:true});
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>200)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.route('**/__pleos/optical-state?*',r=>r.fulfill({status:204}));
  page.on('pageerror',e=>errors.push(e.message));
  const open=async url=>{await page.goto(base+url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);};
  const capture=async(name,patch={})=>{
    const data=await page.evaluate(async s=>{window.__pleosOptical.set(s);return window.__pleosOptical.capture(480,600,4);},{...fixture,...patch});
    const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(`${out}/${name}.png`,bytes);return PNG.sync.read(bytes);
  };
  await open('/versions/saved-20260930094901979-compatible/index.html?look=hybrid-axis-split');
  const before=await capture('before');
  await open('/?look=hybrid-axis-split');
  // Evaluate the actual GLSL envelope, not a JavaScript approximation:
  // advancing time while moving inward must follow the same brightness crest.
  const shader=await readFile('src/optical-studio/optical.frag.glsl','utf8');
  const helper=shader.slice(shader.indexOf('float layerLightEnvelope('),shader.indexOf('\nfloat dimensionLayers('));
  const inward=await page.evaluate(source=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const gl=canvas.getContext('webgl2');if(!gl)throw Error('WebGL2 missing');
    const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
    const vs=compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}');
    const fs=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform float uPhase;uniform float uAlong;const float uHalf=1.;const float uLayerLightContrast=1.;const float uLayerLightLength=1.5;const float uLayerLightCycles=1.;out vec4 colour;\n'+source+'\nvoid main(){colour=vec4(layerLightEnvelope(vec3(uAlong,.2,.1),0,0.),layerLightEnvelope(vec3(uAlong,.2,.1),2,12.),0,1);}');
    const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    const sample=(x,t)=>{gl.uniform1f(gl.getUniformLocation(p,'uAlong'),x);gl.uniform1f(gl.getUniformLocation(p,'uPhase'),t);gl.drawArrays(gl.TRIANGLES,0,3);const b=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return Array.from(b);};
    const shift=.4*1.5/(Math.PI*2), a=sample(1.5,0), b=sample(1.5-shift,.4), c=sample(1.5+shift,.4);
    gl.deleteProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);gl.getExtension('WEBGL_lose_context')?.loseContext();return {start:a,inward:b,outward:c};
  },helper);
  assert(Math.abs(inward.start[0]-inward.inward[0])<=1,'Brightness crest must travel inward');
  assert(Math.abs(inward.start[0]-inward.outward[0])>5,'Flow must not travel outward');
  assert.equal(inward.start[0],inward.start[1],'All domains/layers must share the same centre clock');
  // Archived output predates the intentional bevel antialiasing filter.
  // Allow less than one 8-bit level globally; temporal/flow checks stay exact.
  const off=await capture('off');assert(difference(before,off)<1,'Zero contrast changed beyond bevel filtering');
  const on=await capture('on',{layerLightContrast:.8});assert(difference(off,on)>.2,'Contrast must change output');
  const long=await capture('long',{layerLightContrast:.8,layerLightLength:4});assert(difference(on,long)>.2,'Length must change output');
  const later=await capture('later',{layerLightContrast:.8,time:5});assert(difference(on,later)>.2,'Flow must move');
  const still=await capture('still',{layerLightContrast:.8,layerLightCycles:0});
  const stillLater=await capture('still-later',{layerLightContrast:.8,layerLightCycles:0,time:5});assert(difference(still,stillLater)<.02,'Zero speed must stop only the flow');
  const loopStart=await capture('loop-start',{layerLightContrast:.8,time:0});
  const loopEnd=await capture('loop-end',{layerLightContrast:.8,time:fixture.duration});assert(difference(loopStart,loopEnd)<.02,'Flow loop must join');
  const input=page.getByRole('spinbutton',{name:'강약 대비',exact:true});await input.fill('.6');await input.press('Enter');await input.press('ArrowUp');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect())).state.layerLightContrast,.61);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect())).state.layerLightContrast,.61,'Persisted control missing');
  await page.getByRole('spinbutton',{name:'강약 대비',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/panel-wide.png`});
  await page.setViewportSize({width:390,height:844});await page.getByRole('spinbutton',{name:'강약 대비',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/panel-narrow.png`});
  assert.deepEqual(errors,[]);
  const report={status:'pass',inward,zeroContrastMAE:difference(before,off),contrastMAE:difference(off,on),lengthMAE:difference(on,long),motionMAE:difference(on,later),stillMAE:difference(still,stillLater),loopMAE:difference(loopStart,loopEnd),keyboardPersistence:'pass',errors};
  await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server.kill();}
