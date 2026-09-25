// Freeze the emitter rig to distinguish layer fading from moving lighting.
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=new URL('../artifacts/layer-fades/',import.meta.url);
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,speed:0,lightCycle:false,lightColor:'#FFFFFF',bloom:0,zoom:.8,azimuth:45,elevation:35.264,panX:0,exposure:1,lightIntensity:1,dimensionTop:1,dimensionLeft:0,dimensionRight:0,duration:15}));
  const frames=[];
  for(const time of [0,7.5,15]){
    const url=await page.evaluate(async t=>{window.__pleosOptical.seek(t);return window.__pleosOptical.capture(540,540,4)},time);
    const bytes=Buffer.from(url.split(',')[1],'base64');await writeFile(new URL(`frame-${time}.png`,dir),bytes);frames.push(PNG.sync.read(bytes));
  }
  assert.deepEqual(frames[0].data,frames[2].data,'Loop endpoints differ');
  // Invert OpticalResolve's photographic shoulder and sRGB transform.
  // Residual differences come from output quantization and spatial AA.
  const linear=v=>{let s=v/255;let x=s<=.04045?s/12.92:((s+.055)/1.055)**2.4;let a=2.51-2.43*x,b=.03-.59*x;return (-b+Math.sqrt(b*b+4*a*.14*x))/(2*a);};
  let error=0,n=0;
  for(let i=0;i<frames[0].data.length;i+=4){let a=linear(frames[0].data[i]),b=linear(frames[1].data[i]);if(a>.03&&a<2){error+=Math.abs(b-a*.25);n++;}}
  assert.ok(n>100,'Insufficient lit samples');assert.ok(error/n<.02,'Layer moves or warps instead of fading uniformly');
  assert.deepEqual(errors,[]);
  const report={status:'pass',meanLinearFadeError:error/n,litSamples:n,loop:'pixel-identical',errors};
  await writeFile(new URL('verification.json',dir),JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
