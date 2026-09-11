import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../artifacts/optical-refinement/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu', ...(process.platform==='darwin'?['--use-angle=metal']:[])]});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const captures=[];
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  const baseline={bevel:.32,ior:1.5,roughness:.18,surfaceCurvature:.065,dispersion:.004,absorption:.04,lightIntensity:.9,lightSpread:1,reflection:1,lightColor:'#FFCDD7',exposure:1,bloom:.5,bounces:16,dimensionTop:3,dimensionLeft:4,dimensionRight:3,dimensionSpacing:.14,dimensionSoftness:.55,dimensionFalloff:.55,zoom:.5,playing:false,time:0,aspect:'main'};
  const variants=process.env.PLEOS_4K ? { 'luminous-4k': {...baseline,zoom:.63,aspect:'4x5'} } : {
    'luminous-overview':baseline,
    'luminous-close': {...baseline,zoom:1.15},
    'luminous-layers': {...baseline,dimensionTop:8,dimensionLeft:8,dimensionRight:8},
    'luminous-white': {...baseline,lightColor:'#FFFFFF'},
  };
  for (const [name,state] of Object.entries(variants)) {
    await page.evaluate(s=>window.__pleosOptical.set(s),state);
    const w=process.env.PLEOS_4K?3072:840,h=process.env.PLEOS_4K?3840:840;
    const started=performance.now();
    const url=await page.evaluate(async({w,h})=>window.__pleosOptical.capture(w,h,16),{w,h});
    await writeFile(new URL(`${name}.png`,output),Buffer.from(url.split(',')[1],'base64'));
    const wallMs=Math.round(performance.now()-started);
    captures.push({file:`${name}.png`,width:w,height:h,samples:16,wallMs});
    console.log(name, wallMs+'ms');
  }
  await writeFile(new URL(process.env.PLEOS_4K?'luminous-4k-state.json':'luminous-state.json',output),JSON.stringify({baseline,captures,errors,runtime:await page.evaluate(()=>window.__pleosOptical.inspect())},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
} finally {await browser.close();}
