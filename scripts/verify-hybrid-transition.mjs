// Isolated browser; never changes the artist's live settings.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out=new URL('../artifacts/hybrid-transition/',import.meta.url);
await mkdir(out,{recursive:true});
const base=process.env.PLEOS_HYBRID_URL??'http://127.0.0.1:5173/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
const page=await browser.newPage();
const report={status:'running',errors:[],checks:{},frames:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
const diff=(a,b)=>{let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);return sum/(a.width*a.height*3);};
const mean=a=>{let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=a.data[i+c];return sum/(a.width*a.height*3);};
async function set(p){await page.evaluate(p=>window.__pleosOptical.set(p),p);}
async function open(url){await page.goto(url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);}
async function capture(time,name,w=320,h=400){
  await set({time,playing:false});
  const data=await page.evaluate(p=>window.__pleosOptical.capture(...p),[w,h,4]);
  const bytes=Buffer.from(data.split(',')[1],'base64');
  if(name)await writeFile(new URL(name+'.png',out),bytes);
  return PNG.sync.read(bytes);
}
try {
  await open(base+'?look=hybrid-ab');
  await page.evaluate(()=>window.__pleosOptical.reset());
  // Observed live panel values during the transition report, not fresh defaults.
  await set({playing:false,azimuth:52.847,elevation:22.678,zoom:.946,panX:-11.5,
    lightColor:'#FF4D5B',layerFadeAmount:1,identityTransition:1,identityHold:3,
    identityDissolve:4,identityEngraving:1,identityLayerStagger:0,hybridColorMode:0});
  const seed=await page.evaluate(()=>window.__pleosOptical.inspect().state);report.state=seed;
  const atStart=await capture(3,'start');
  const afterStart=await capture(3.001,'start-plus-1ms');
  report.checks.onsetDelta=diff(atStart,afterStart);
  assert(report.checks.onsetDelta<.5,'No full-strength reflection at the first transition millisecond');
  for(const time of [3.5,4,4.5,5,5.5,6,6.5,7])await capture(time,'t-'+time);
  let prev;
  for(let i=0;i<=120;i++){
    const time=3+i/30;const frame=await capture(time,null,160,200);
    report.frames.push({time,mean:mean(frame),delta:prev?diff(prev,frame):0});prev=frame;
  }
  report.checks.maxAdjacentDelta=Math.max(...report.frames.map(f=>f.delta));
  assert(report.checks.maxAdjacentDelta<8,'The observed handover must not contain an isolated frame flash');
  const ending=await capture(7,'end');
  const beforeEnding=await capture(6.999,'end-minus-1ms');
  report.checks.endingDelta=diff(beforeEnding,ending);assert(report.checks.endingDelta<.5);
  const stateAfter=await page.evaluate(()=>window.__pleosOptical.inspect().state);
  for(const key of ['azimuth','elevation','zoom','panX','lightColor','hybridFaceReflection','identityDissolve'])assert.equal(stateAfter[key],seed[key]);
  await open(base+'versions/saved-20260922055654113-compatible/index.html?look=hybrid-ab');
  await set(seed);const archivedStart=await capture(3,'old-start');
  const archivedOnset=await capture(3.001,'old-onset');
  const archivedEnd=await capture(7,'old-end');
  report.checks.oldOnsetDelta=diff(archivedStart,archivedOnset);
  report.checks.unchangedGray=diff(archivedStart,atStart);assert(report.checks.unchangedGray<.01);
  // V6 deliberately adds internal reflection transport; the gray intro stays
  // identical, but the completed expression must differ from archived V4.
  report.checks.internalFacesVsV4=diff(archivedEnd,ending);assert(report.checks.internalFacesVsV4>.1);
  await open(base+'?look=hybrid-ab');await set(seed);
  for(const patch of [{identityLayerStagger:1},{identityEngraving:0},
    {identityHold:1,identityDissolve:.5,duration:1.5}]){
    await set({...seed,...patch});const start=patch.identityHold??3;
    const a=await capture(start),b=await capture(start+.0001);
    const key=JSON.stringify(patch);report.checks[key]=diff(a,b);assert(diff(a,b)<.5,key);
  }
  await set(seed);
  const video=await page.evaluate(()=>window.__pleosOptical.exportVideo({width:320,height:400,fps:24,start:2.5,end:7.5,samples:4},false));
  const encoded=await page.evaluate(async url=>{const b=new Uint8Array(await(await fetch(url)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);},video.url);
  await writeFile(new URL('transition.mp4',out),Buffer.from(encoded,'base64'));
  report.checks.video={...video,url:undefined};
  assert.deepEqual(report.errors,[]);report.status='pass';
}catch(e){report.status='fail';report.failure=e.message;throw e;}
finally{await writeFile(new URL('verification.json',out),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,failure:report.failure},null,2));}
