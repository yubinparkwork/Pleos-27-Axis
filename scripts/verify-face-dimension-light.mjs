import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out='artifacts/face-dimension-light';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text());});
await page.route('**/__pleos/optical-state**',r=>r.fulfill({status:204}));
await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
const keys=['faceTopX','faceTopY','faceTopZ','faceLeftX','faceLeftY','faceLeftZ','faceRightX','faceRightY','faceRightZ'];
const capture=async(name,patch={})=>{const data=await page.evaluate(async patch=>{window.__pleosOptical.set(patch);return window.__pleosOptical.capture(480,600,4);},patch);const b=Buffer.from(data.split(',')[1],'base64');await writeFile(`${out}/${name}.png`,b);return PNG.sync.read(b);};
const difference=(a,b)=>{let sum=0;for(let i=0;i<a.data.length;i++)sum+=Math.abs(a.data[i]-b.data[i]);return sum/a.data.length;};
try{
  await page.goto('http://127.0.0.1:5173/?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:8.4,identityTransition:0,axisMotion:0,cameraMotion:0,layerFadeAmount:0,hybridColorMode:1}));
  const initial=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  for(const k of keys)assert.equal(initial[k],1);assert.equal(initial.faceDimensionContrast,0);
  const baseline=await capture('baseline');
  const contrast=await capture('contrast',{faceDimensionContrast:1});assert(difference(baseline,contrast)>.02);
  await page.evaluate(()=>window.__pleosOptical.set({faceDimensionContrast:0}));
  const changes={};
  for(const region of ['Top','Left','Right']){
    const patch=Object.fromEntries(['X','Y','Z'].map(axis=>[`face${region}${axis}`,0]));
    const image=await capture(`${region}-off`,patch);changes[region]=difference(baseline,image);assert(changes[region]>.01);
    await page.evaluate(keys=>window.__pleosOptical.set(Object.fromEntries(keys.map(k=>[k,1]))),keys);
  }
  const section=page.locator('[data-optical-section="face-dimension"]');
  const input=section.locator('[data-optical-number="faceLeftY"]');await input.fill('.35');await input.press('Tab');
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).faceLeftY,.35);
  await page.keyboard.press('Meta+z');assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).faceLeftY,1);
  await input.fill('.45');await input.press('Tab');
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosOptical.inspect().state)).faceLeftY,.45);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:8.4,faceLeftY:.35}));
  await section.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/panel-wide.png`});
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/panel-narrow.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Evaluate the production gain helper on actual GPU basis normals. This
  // checks every control independently even if its face is hidden in a view.
  const source=await readFile('src/optical-studio/hybridOptics.glsl','utf8');
  const helper=source.slice(source.indexOf('float dimensionFaceGain'),source.indexOf('float hybridDimensionLayers'));
  const basis=await page.evaluate(helper=>{
    const gl=document.createElement('canvas').getContext('webgl2');
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const vs=compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}');
    const fs=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform vec3 uFaceGainTop,uFaceGainLeft,uFaceGainRight,uN;uniform float uFaceDimensionContrast;uniform int uId;out vec4 color;'+helper+'\nvoid main(){color=vec4(dimensionFaceGain(uN,uId)/3.,0,0,1);}');
    const p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.useProgram(p);gl.viewport(0,0,1,1);
    const gains=[[.3,.6,.9],[1.2,1.5,1.8],[2.1,2.4,2.7]];
    gains.forEach((v,i)=>gl.uniform3fv(gl.getUniformLocation(p,['uFaceGainTop','uFaceGainLeft','uFaceGainRight'][i]),v));
    const values=[];for(let id=0;id<3;id++)for(let axis=0;axis<3;axis++){
      gl.uniform1i(gl.getUniformLocation(p,'uId'),id);gl.uniform3fv(gl.getUniformLocation(p,'uN'),[0,1,2].map(i=>i===axis?1:0));
      gl.drawArrays(gl.TRIANGLES,0,3);const b=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);values.push(b[0]);}
    gl.deleteProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);gl.getExtension('WEBGL_lose_context')?.loseContext();return values;
  },helper);
  basis.forEach((v,i)=>assert(Math.abs(v-(i+1)*.1*255)<2));
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/validation.json`,JSON.stringify({status:'PASS',defaultsNeutral:true,regionPixelDifferences:changes,nineFaceBasis:basis,commandZ:true,persisted:true,narrowNoOverflow:true,errors},null,2));
  console.log('Face dimension lighting PASS');
}finally{await browser.close();}
