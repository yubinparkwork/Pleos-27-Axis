import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const file='.pleos/optical-state/pleos-optical-studio-v1%3Ahybrid-ab.json';
const original=await readFile(file,'utf8'),state={...JSON.parse(original).state,playing:false,time:10};
const out='artifacts/bevel-filter';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
const mae=(a,c)=>{let sum=0;for(let i=0;i<a.data.length;i+=4)for(let j=0;j<3;j++)sum+=Math.abs(a.data[i+j]-c.data[i+j]);return sum/(a.width*a.height*3);};
try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/__pleos/optical-state?*',r=>r.fulfill({status:204}));
  const frames={};
  for(const mode of ['before','after']){
    await p.goto('http://127.0.0.1:5173/'+(mode==='before'?'versions/saved-20260930182516452-compatible/index.html?look=hybrid-ab':'?look=hybrid-ab'));
    await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);await p.evaluate(s=>window.__pleosOptical.set(s),state);
    for(const spp of [16,64]){
      const url=await p.evaluate(async spp=>window.__pleosOptical.capture(1358,1920,spp),spp);
      const bytes=Buffer.from(url.split(',')[1],'base64');await writeFile(`${out}/${mode}-${spp}.png`,bytes);frames[`${mode}-${spp}`]=PNG.sync.read(bytes);
    }
  }
  const before=mae(frames['before-16'],frames['before-64']),after=mae(frames['after-16'],frames['after-64']);
  assert(after<before,`Sampling discrepancy did not improve: ${before} -> ${after}`);
  // Full-size 4K high-quality capture checks actual tiled output, not an upscale.
  const url=await p.evaluate(()=>window.__pleosOptical.capture(2716,3840,64));
  const bytes=Buffer.from(url.split(',')[1],'base64');await writeFile(out+'/after-4k-64.png',bytes);
  const png=PNG.sync.read(bytes);assert.equal(png.width,2716);assert.equal(png.height,3840);
  assert.deepEqual(errors,[]);assert.equal(await readFile(file,'utf8'),original,'User settings changed');
  const report={status:'pass',sampleDiscrepancyMAE:{before,after},reductionPercent:100*(1-after/before),dimensions:[png.width,png.height],errors};await writeFile(out+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await b.close();}
