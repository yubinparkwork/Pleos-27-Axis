import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const out=new URL('../artifacts/cube0914/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:5173/';
const fixture={playing:false,time:3,duration:15,zoom:.8,azimuth:45,elevation:35.264389682754654,
  gap:.015,bevel:.2,ior:1.5,dispersion:.045,roughness:.12,surfaceCurvature:.065,
  reflection:1,absorption:.04,lightIntensity:1.8,lightSpread:1,exposure:1,bloom:.18,
  dimensionTop:5,dimensionLeft:7,dimensionRight:9,dimensionSpacing:.14,dimensionSoftness:.55,dimensionFalloff:.55,
  lightColor:'#0ADC91',lightCycle:true,lightCycleOffset:0,cameraMotion:0,axisMotion:0,cameraFloat:0,identityTransition:0};
async function open(url){await page.goto(url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);await page.evaluate(s=>window.__pleosOptical.set(s),fixture);}
async function capture(name){const url=await page.evaluate(()=>window.__pleosOptical.capture(320,400,4));const bytes=Buffer.from(url.split(',')[1],'base64');await writeFile(new URL(name,out),bytes);return PNG.sync.read(bytes);}
try{
  await open(base+'versions/saved-20260914094839691-compatible/index.html');const old=await capture('original.png');
  await open(base+'?look=cube0914');const current=await capture('fork.png');
  let sum=0;for(let i=0;i<old.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(old.data[i+c]-current.data[i+c]);
  const mae=sum/(old.width*old.height*3);assert(mae<.1,`Original visual changed: ${mae}`);
  await page.locator('[data-optical-number="cameraMotion"]').fill('1');await page.locator('[data-optical-number="cameraMotion"]').press('Tab');
  await page.evaluate(()=>window.__pleosOptical.set({time:6,playing:false}));const moved=await capture('camera-midpoint.png');
  assert(!moved.data.equals(current.data));
  await page.screenshot({path:fileURLToPath(new URL('panel-wide.png',out))});
  await page.setViewportSize({width:760,height:900});await page.screenshot({path:fileURLToPath(new URL('panel-narrow.png',out))});
  const videos=[];
  for(const opt of [{width:320,height:400,fps:24,samples:4,start:0,end:1},{width:2160,height:3840,fps:24,samples:4,start:3,end:3+1/24}]){
    const result=await page.evaluate(o=>window.__pleosOptical.exportVideo(o,false),opt);
    const data=await page.evaluate(async url=>{const b=new Uint8Array(await(await fetch(url)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);},result.url);
    const file=new URL(`video-${opt.width}.mp4`,out);await writeFile(file,Buffer.from(data,'base64'));
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',fileURLToPath(file)],{encoding:'utf8'}));
    assert.equal(probe.streams[0].width,opt.width);assert.equal(probe.streams[0].height,opt.height);videos.push({options:opt,codec:probe.streams[0].codec_name});
  }
  assert.deepEqual(errors,[]);await writeFile(new URL('verification.json',out),JSON.stringify({status:'pass',mae,errors,videos},null,2));console.log(JSON.stringify({status:'pass',mae,videos}));
}finally{await browser.close();}
