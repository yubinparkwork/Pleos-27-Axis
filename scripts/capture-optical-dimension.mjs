import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2] ?? 'after';
const output = new URL('../artifacts/optical-dimension/', import.meta.url);
await mkdir(output, { recursive: true });
// Values read from the user's visible inspector before this task. A separate
// browser context lets us preserve and compare without editing their session.
const original = { absorption:1.15, azimuth:46.431, bevel:.01, blue:0, bounces:5,
  dispersion:.15, duration:15, elevation:25.784, exposure:.25, gap:0, green:0,
  ior:2.5, lightIntensity:5, lightSpread:2, red:2, reflection:2, roughness:.3,
  speed:.4, zoom:.961, time:.01, aspect:'4x5', playing:false };
const adjustment = { absorption:.03, bevel:.32, bounces:12, dispersion:.008,
  ior:1.52, lightIntensity:1.1, lightSpread:.85, reflection:1, roughness:.20, exposure:1 };
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  for (const [name, patch] of Object.entries({user:original,dimension:{...original,...adjustment},rgb:{...original,...adjustment,red:1,green:.82,blue:1.1}})) {
    // Historical RGB snapshots are migrated before patching the new runtime.
    // They are comparison inputs, not exact reproductions of the previous shader.
    await page.evaluate(async s=>{
      const { sanitizeOpticalState } = await import('/src/optical-studio/OpticalState.ts');
      window.__pleosOptical.set(sanitizeOpticalState(s));
    },patch);
    const data=await page.evaluate(()=>window.__pleosOptical.capture(800,1000,16));
    await writeFile(new URL(`${label}-${name}.png`,output),Buffer.from(data.split(',')[1],'base64'));
  }
  await writeFile(new URL(`${label}-state.json`,output),JSON.stringify({original,adjustment,errors},null,2));
  if(errors.length) throw new Error(errors.join('\n'));
} finally {await browser.close();}
