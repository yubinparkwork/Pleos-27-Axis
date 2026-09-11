// Test a copy of the user's setup on an isolated origin, never live port 5173.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';

const mixed = process.argv.includes('--mixed');
const out = mixed ? 'artifacts/mixed-light' : 'artifacts/simultaneous-rgb';
await mkdir(out, { recursive: true });
const state = JSON.parse(await readFile(mixed ? '.pleos/pre-mixed-light-state.json' : '.pleos/pre-simultaneous-rgb-state.json', 'utf8')).state.modeStates['dimention-r3f'];
if (!mixed) for (const [i, key] of ['red','green','blue'].entries()) Object.assign(state.lighting.rig[key], {
  intensity: [1.15,.95,1][i], angle: .85, penumbra: .92, distance: 28, decay: 1.35,
  orbitRadius: 5, orbitHeight: 3.1, phase: i * 120,
});
state.motion.playing = false;
if (!mixed) {
  state.lighting.white = .65;
  state.lighting.rig.whiteArea.intensity = 1.5;
}
state.artboard.width = 594; state.artboard.height = 841;
state.export.imageResolution = 'artboard';
const server = spawn('npm',['run','dev','--','--port','41748','--strictPort'],{stdio:'ignore'});
let browser;
try {
  for (let i=0;i<100;i++) { try {if((await fetch('http://127.0.0.1:41748/')).ok)break;}catch{} await new Promise(r=>setTimeout(r,200)); }
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.addInitScript(s=>localStorage.setItem('pleos-27-axis-studio-state-v3',JSON.stringify({version:1,updatedAt:new Date().toISOString(),state:{version:2,activeModeId:'dimention-r3f',modeStates:{'dimention-r3f':s},shared:{artboard:s.artboard}}})),state);
  await page.goto('http://127.0.0.1:41748/?renderer=studio');
  await page.waitForFunction(()=>window.__pleos27Axis?.inspect().ready);
  const frames=[];
  const times=[0,2.5,5,7.5,10,12.5,14.9];
  const sheet=new PNG({width:594*4,height:841*2});
  for(const [index,time] of times.entries()) {
    const url=await page.evaluate(async time=>{
      window.__pleos27Axis.pause();window.__pleos27Axis.seek(time);
      return window.__pleos27Axis.export({renderer:'raster',quality:'custom',download:false});
    },time);
    const buffer=Buffer.from(url.split(',')[1],'base64');
    const png=PNG.sync.read(buffer);
    await writeFile(`${out}/frame-${String(time).replace('.','-')}.png`,buffer);
    PNG.bitblt(png,sheet,0,0,png.width,png.height,(index%4)*594,Math.floor(index/4)*841);
    const dominant=[0,0,0];let lit=0;
    for(let p=0;p<png.data.length;p+=4){
      const rgb=[png.data[p],png.data[p+1],png.data[p+2]];
      const high=Math.max(...rgb),low=Math.min(...rgb);
      if(high<25)continue;lit++;
      if(high-low<20)continue;
      dominant[rgb.indexOf(high)]++;
    }
    frames.push({time,litFraction:lit/(png.width*png.height),colorFractions:dominant.map(n=>n/Math.max(1,lit))});
  }
  await writeFile(`${out}/contact-sheet.png`,PNG.sync.write(sheet));
  assert.deepEqual(errors,[]);
  // Presence, not equal pixel area: Fresnel, occlusion and the user's glass
  // parameters naturally change the visible area of each reflected hue.
  assert(frames.every(f => f.colorFractions.every(fraction => fraction > .005)), 'A brand hue disappears from a representative frame');
  let softboxContract, still4k;
  if (mixed) {
    softboxContract = await page.evaluate(async state => {
      const { createSoftboxes, updateSoftboxes } = await import('/src/modes/dimention-r3f/SpectralSoftboxes.ts');
      const boxes = createSoftboxes();
      updateSoftboxes(boxes, state, 0);
      const first = boxes[0].position.clone();
      const originalColor = boxes[0].color.clone();
      state.lighting.rig.red.positionX += 1;
      updateSoftboxes(boxes, state, 0);
      const translation = boxes[0].position.x - first.x;
      const colorUnchanged = boxes[0].color.equals(originalColor);
      for (const key of ['red','green','blue']) state.lighting.rig[key].enabled = false;
      updateSoftboxes(boxes, state, 2);
      return { count: boxes.length, translation, colorUnchanged, allOff: boxes.every(b => b.color.r === 0 && b.color.g === 0 && b.color.b === 0) };
    }, structuredClone(state));
    assert.equal(softboxContract.count, 18);
    assert(Math.abs(softboxContract.translation - 1) < 1e-6);
    assert(softboxContract.colorUnchanged && softboxContract.allOff);
  }
  if (process.argv.includes('--4k')) {
    await page.evaluate(() => {
      window.__pleos27Axis.seek(0);
      window.__pleos27Axis.modeApi('dimention-r3f').command('setArtboard', {width:2160,height:3840});
    });
    const url = await page.evaluate(() => window.__pleos27Axis.export({renderer:'raster',quality:'custom',download:false}));
    const buffer = Buffer.from(url.split(',')[1], 'base64');
    const png = PNG.sync.read(buffer);
    assert.equal(png.width,2160); assert.equal(png.height,3840);
    await writeFile(`${out}/native-4k.png`,buffer);
    still4k = {width:png.width,height:png.height,bytes:buffer.length};
  }
  assert.deepEqual(errors,[]);
  const runtime=await page.evaluate(()=>window.__pleos27Axis.inspect());
  assert.equal(runtime.rgbEnergyMode, 'simultaneous-balanced-rgb');
  await writeFile(`${out}/validation.json`,JSON.stringify({state,frames,softboxContract,still4k,errors,runtime},null,2));
  console.log(JSON.stringify({frames,softboxContract,still4k,errors},null,2));
}finally{await browser?.close();server.kill('SIGTERM');}
