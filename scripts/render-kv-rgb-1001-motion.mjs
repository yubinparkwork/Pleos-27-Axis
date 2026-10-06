// User-requested batch output. Isolated browser, artist settings never written.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const record=JSON.parse(await readFile(path.join(root,'.pleos/optical-state/pleos-optical-studio-v1%3Ahybrid-ab.json'),'utf8'));
const jobs=record.state.variations.filter(v=>/^(KV|KB) RGB (?:(?:1001 모션)|(?:모션 1001))$/.test(v.name));
if(jobs.length!==5)throw Error(`Expected five motion variations; found ${jobs.length}. Review the selection.`);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join('/Users/parkyubin/Downloads',`PLEOS-KV-RGB-1001-motion-2K-${stamp}`);
await mkdir(output,{recursive:true});
const report={status:'running',output,settings:{duration:15,longEdge:1920,fps:30,samples:4},jobs:[],errors:[]};
const saveReport=()=>writeFile(path.join(output,'render-report.json'),JSON.stringify(report,null,2));
await saveReport();console.log('OUTPUT',output);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
try{
 for(const job of jobs){
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.route('**/__pleos/optical-state**',r=>r.fulfill({status:204}));
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  let timer,rendering=false;const started=Date.now();
  const item={id:job.id,name:job.name,aspect:job.settings.aspect,status:'rendering',startedAt:new Date().toISOString()};
  report.jobs.push(item);await saveReport();console.log('START',item.name,item.aspect);
  try{
   await page.goto('http://127.0.0.1:5173/?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
   await page.evaluate(settings=>window.__pleosOptical.set({...settings,duration:15,time:0,playing:false,videoLongEdge:1920,videoFps:30,videoSamples:4}),job.settings);
   const applied=await page.evaluate(()=>window.__pleosOptical.inspect().state);
   if(applied.duration!==15)throw Error('Layer staggering requires longer duration; cannot silently change saved motion.');
   item.renderState=applied;rendering=true;
   timer=setInterval(async()=>{if(!rendering)return;try{const p=await page.evaluate(()=>window.__pleosOptical.inspect().videoExport);console.log('PROGRESS',item.aspect,Math.round(p.progress*100)+'%',p.status);item.progress=p.progress;await saveReport();}catch{}},15000);
   const result=await page.evaluate(()=>window.__pleosOptical.exportVideo({fps:30,samples:4,start:0,end:15},false));
   rendering=false;clearInterval(timer);
   const bytes=Buffer.from(await page.evaluate(async url=>{const a=new Uint8Array(await(await fetch(url)).arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);},result.url),'base64');
   const filename=`PLEOS-KV-RGB-1001-motion-${item.aspect}-${result.width}x${result.height}-15s-30fps-4spp.mp4`;
   const file=path.join(output,filename);await writeFile(file,bytes);
   const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
   const video=probe.streams.find(s=>s.codec_type==='video');
   if(!video||Number(video.nb_read_frames)!==450||video.avg_frame_rate!=='30/1'||Math.abs(Number(video.duration??probe.format.duration)-15)>.01||Math.max(video.width,video.height)!==1920)throw Error('Output verification failed');
   Object.assign(item,{status:'complete',file,bytes:bytes.length,width:video.width,height:video.height,frames:450,duration:15,fps:30,samples:4,codec:video.codec_name,elapsedSeconds:(Date.now()-started)/1000});
   console.log('DONE',JSON.stringify({aspect:item.aspect,file,seconds:item.elapsedSeconds}));
  }catch(error){rendering=false;clearInterval(timer);item.status='failed';item.error=error.message;report.errors.push({aspect:item.aspect,error:error.message});console.log('FAILED',item.aspect,error.message);}
  finally{await saveReport();await page.close();}
 }
 report.status=report.errors.length?'partial-failure':'complete';await saveReport();console.log('FINAL',JSON.stringify({status:report.status,output,jobs:report.jobs.map(j=>({aspect:j.aspect,status:j.status,file:j.file})),errors:report.errors}));
 if(report.errors.length)process.exitCode=1;
}finally{await browser.close();}
