import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
const directory='artifacts/camera-continuity';
await mkdir(directory,{recursive:true});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.PLEOS_VERSION_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.set({playing:false,time:0,speed:0,zoom:1,lightCycle:true,lightColor:'#0ADC91',lightCycleOffset:0}));
  const rows=[];
  for(const [axis,center] of [['azimuth',0],['azimuth',90],['azimuth',-90],['azimuth',45],['elevation',0]]){
    const differences=[];
    for(const epsilon of [.1,.01,.001]){
      const images=[];
      for(const side of [-1,1]){
        const patch={azimuth:45,elevation:35,[axis]:center+side*epsilon};
        const url=await page.evaluate(async patch=>{window.__pleosOptical.set(patch);return window.__pleosOptical.capture(400,500,1)},patch);
        const buffer=Buffer.from(url.split(',')[1],'base64');images.push(PNG.sync.read(buffer));
        if(epsilon===.01)await writeFile(`${directory}/${axis}-${center}-${side}.png`,buffer);
      }
      let sum=0;for(let i=0;i<images[0].data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(images[0].data[i+c]-images[1].data[i+c])/3;
      differences.push(sum/200000);
    }
    rows.push({axis,center,steps:[.2,.02,.002],mae:differences});
    assert(differences[2]<.15,`${axis} ${center}: discontinuity at tiny rotation`);
    assert(differences[2]<differences[0]*.25+.01,`${axis} ${center}: difference does not converge`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${directory}/report.json`,JSON.stringify({rows,errors},null,2));console.log(JSON.stringify(rows,null,2));
} finally {await browser.close();}
