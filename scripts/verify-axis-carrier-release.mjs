// Isolated render check for the 25 Axis → dimension light transition.
// Reads the artist's current shared settings but never writes to that store.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'artifacts/axis-carrier-release');
const baseline=process.argv.includes('--baseline');
const url='http://127.0.0.1:51757/?look=hybrid-ab';
const times=[4.5,5,5.5,6,6.5,7,7.5,8,8.5];
let server,browser;
const report={status:'running',mode:baseline?'before':'after',frames:[],errors:[]};
const image=data=>PNG.sync.read(Buffer.from(data.split(',')[1],'base64'));
const meanDifference=(a,b)=>{
  let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);
  return sum/(a.width*a.height*3);
};
const neutralFraction=png=>{
  let count=0,total=0;
  // The lower-right wedge is the artist-reported lingering gray region.
  for(let y=Math.floor(png.height*.58);y<png.height;y++)for(let x=Math.floor(png.width*.55);x<png.width;x++){
    const i=(y*png.width+x)*4,r=png.data[i],g=png.data[i+1],b=png.data[i+2];
    const hi=Math.max(r,g,b),lo=Math.min(r,g,b);total++;
    if(hi>25&&hi-lo<hi*.18)count++;
  }
  return count/total;
};
try {
  await mkdir(output,{recursive:true});
  if(baseline){
    const response=await fetch('http://127.0.0.1:5173/__pleos/optical-state?key=pleos-optical-studio-v1%3Ahybrid-ab');
    assert(response.ok,'Artist settings endpoint unavailable');
    const saved=(await response.json()).state;
    assert(saved&&typeof saved==='object');
    await writeFile(path.join(output,'fixture.json'),JSON.stringify({...saved,playing:false},null,2));
  }
  const fixture=JSON.parse(await readFile(path.join(output,'fixture.json'),'utf8'));
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51757','--strictPort'],{cwd:root,stdio:'ignore'});
  const deadline=Date.now()+30000;
  while(true){try{if((await fetch(url)).ok)break;}catch{}if(Date.now()>deadline||server.exitCode!==null)throw Error('QA server unavailable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  const page=await browser.newPage({viewport:{width:960,height:760}});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto(url);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  async function capture(time,patch={}){
    const data=await page.evaluate(async state=>{window.__pleosOptical.set(state);return window.__pleosOptical.capture(480,600,8);},{...fixture,...patch,time,playing:false});
    return image(data);
  }
  for(const time of times){
    const png=await capture(time);
    await writeFile(path.join(output,`${baseline?'before':'after'}-${time}.png`),PNG.sync.write(png));
    const row={time,lowerRightNeutralFraction:neutralFraction(png)};
    if(!baseline){
      const before=PNG.sync.read(await readFile(path.join(output,`before-${time}.png`)));
      row.difference=meanDifference(png,before);
      if(time<=5||time>=8)assert(row.difference<.02,`Endpoint changed at ${time}s: ${row.difference}`);
    }
    report.frames.push(row);
  }
  if(!baseline){
    const old=PNG.sync.read(await readFile(path.join(output,'before-6.5.png')));
    const now=PNG.sync.read(await readFile(path.join(output,'after-6.5.png')));
    report.lowerRightNeutralReduction=neutralFraction(old)-neutralFraction(now);
    assert(report.lowerRightNeutralReduction>.02,'Lower-right gray still lingers at 6.5s');
    const early=await capture(6.49),late=await capture(6.51);
    report.twoFrameDifference=meanDifference(early,late);
    assert(report.twoFrameDifference<10,'New transition has an abrupt frame step');
  }
  assert.equal(report.errors.length,0);
  report.status='pass';
}catch(error){report.status='fail';report.failure=error.message;throw error;}
finally{await writeFile(path.join(output,`${baseline?'before':'after'}-report.json`),JSON.stringify(report,null,2));await browser?.close();server?.kill();console.log(JSON.stringify(report,null,2));}
