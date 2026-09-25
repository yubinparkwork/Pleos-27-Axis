import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out=new URL('../artifacts/optical-aspects/',import.meta.url);await mkdir(out,{recursive:true});
const url='http://127.0.0.1:51756/?sequence=pleos25&transition=layered';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','51756','--strictPort'],{stdio:'ignore'});
let browser;const report={errors:[],formats:[]};
try{
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
  const p=await browser.newPage({viewport:{width:1440,height:1000}});
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await p.route('**/favicon.ico',r=>r.fulfill({status:204}));await p.goto(url);
  await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await p.evaluate(()=>window.__pleosOptical.set({playing:false,time:12,axisMotion:1,videoLongEdge:3840,videoSamples:4}));
  report.dimensions=await p.evaluate(async()=>{
    const {OPTICAL_ASPECTS,opticalDimensions,opticalVideoDimensions,sanitizeOpticalState}=await import('/src/optical-studio/OpticalState.ts');
    return OPTICAL_ASPECTS.map(a=>({id:a.id,png:opticalDimensions(a.id),video:opticalVideoDimensions(a.id),saved:sanitizeOpticalState({aspect:a.id}).aspect}));
  });
  assert.deepEqual(report.dimensions.map(a=>a.png),[[3840,3840],[3072,3840],[2160,3840],[3840,2160],[2715,3840],[3840,2560]]);
  for(const a of report.dimensions){assert.equal(a.id,a.saved);assert(a.video.every(n=>n%2===0));}
  for(const id of ['a-series','3x2']){
    const before=await p.evaluate(()=>window.__pleosOptical.inspect().state);
    await p.getByRole('combobox',{name:'화면 비율',exact:true}).selectOption(id);
    const state=await p.evaluate(()=>window.__pleosOptical.inspect().state);
    for(const key of ['azimuth','elevation','zoom','panX','axisMotion','lightColor','dimensionTop'])assert.deepEqual(state[key],before[key]);
    await p.reload();await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
    assert.equal(await p.getByRole('combobox',{name:'화면 비율',exact:true}).inputValue(),id);
    const result=await p.evaluate(async()=>{
      const api=window.__pleosOptical;api.pause();api.seek(12);
      const {width,height}=api.inspect().artboard;
      const png=await api.capture(width,height,1);
      const video=await api.exportVideo({start:12,end:12+2/30,fps:30,samples:4});
      return {png,video};
    });
    const bytes=Buffer.from(result.png.split(',')[1],'base64'),png=PNG.sync.read(bytes);
    assert.deepEqual([png.width,png.height],report.dimensions.find(a=>a.id===id).png);
    assert.deepEqual([result.video.width,result.video.height],report.dimensions.find(a=>a.id===id).video);
    await writeFile(new URL(`${id}.png`,out),bytes);
    report.formats.push({id,png:[png.width,png.height],video:result.video});
    await p.screenshot({path:fileURLToPath(new URL(`${id}-wide.png`,out))});
    await p.setViewportSize({width:390,height:844});await p.screenshot({path:fileURLToPath(new URL(`${id}-narrow.png`,out))});
    await p.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(report.errors,[]);report.status='pass';
}finally{await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser?.close();server.kill();}
console.log(JSON.stringify({status:report.status,errors:report.errors}));
