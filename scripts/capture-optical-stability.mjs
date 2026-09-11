import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const label = process.argv[2] ?? 'after';
const output = new URL('../artifacts/optical-stability/', import.meta.url);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
const page = await browser.newPage({viewport:{width:1463,height:1204}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.evaluate(()=>window.__pleosOptical.set({gap:0,bevel:.08,ior:1.91,dispersion:.025,roughness:.06,reflection:1,absorption:.075,lightIntensity:.9,lightSpread:.64,lightColor:'#FF2A3D',exposure:3,zoom:2.4,azimuth:25.4,elevation:27.146,time:13.69,duration:15,speed:.4,bounces:8,aspect:'main',playing:false}));
  for (const samples of [1,16]) {
    const data=await page.evaluate(s=>window.__pleosOptical.capture(960,960,s),samples);
    await writeFile(new URL(`${label}-${samples}s.png`,output),Buffer.from(data.split(',')[1],'base64'));
  }
  await page.locator('#optical-canvas').screenshot({path:fileURLToPath(new URL(`${label}-preview.png`,output))});
  const state=await page.evaluate(()=>window.__pleosOptical.inspect());
  await writeFile(new URL(`${label}.json`,output),JSON.stringify({state,errors},null,2));
} finally { await browser.close(); }
