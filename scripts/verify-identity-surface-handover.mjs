// Isolated-origin visual regression; never writes the artist's shared settings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/identity-surface-handover');
const baseline = process.argv.includes('--baseline');
const url = 'http://127.0.0.1:51755/?look=hybrid-ab';
const times = [4.5, 5, 5.4, 5.9, 6.4, 6.9, 7.4, 8, 10.8, 14];
let browser, server;
const report = { status: 'running', errors: [], frames: [], continuity: [] };
const difference = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i+c]-b.data[i+c]);
  return sum/(a.width*a.height*3);
};
const stats = image => {
  let mean = 0, neutral = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const rgb = [...image.data.subarray(i,i+3)], hi = Math.max(...rgb), lo = Math.min(...rgb);
    mean += (rgb[0]+rgb[1]+rgb[2])/3;
    if (hi > 145 && (hi-lo)/hi < .22) neutral++;
  }
  return { mean: mean/(image.width*image.height), brightNeutralFraction: neutral/(image.width*image.height) };
};
try {
  await mkdir(output, { recursive: true });
  if (baseline) {
    const saved = await (await fetch('http://127.0.0.1:5173/__pleos/optical-state?key=pleos-optical-studio-v1%3Ahybrid-ab')).json();
    assert(saved.state && typeof saved.state === 'object', 'Need actual artist state for reproduction');
    await writeFile(path.join(output, 'fixture.json'), JSON.stringify({ ...saved.state, playing:false }, null, 2));
  }
  const fixture = JSON.parse(await readFile(path.join(output, 'fixture.json'), 'utf8'));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','51755','--strictPort'], {cwd:root,stdio:'ignore'});
  const deadline = Date.now()+30000;
  while (true) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (Date.now()>deadline || server.exitCode!==null) throw new Error('Test server unavailable');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser = await chromium.launch({ channel:'chrome',headless:true,args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])] });
  const page = await browser.newPage({viewport:{width:1000,height:800}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.goto(url);
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  async function capture(time, patch = {}) {
    const data = await page.evaluate(async state=>{
      window.__pleosOptical.set(state);
      return window.__pleosOptical.capture(360,510,4);
    }, {...fixture,...patch,time,playing:false});
    return PNG.sync.read(Buffer.from(data.split(',')[1],'base64'));
  }
  for (const time of times) {
    const image = await capture(time);
    await writeFile(path.join(output,`${baseline?'before':'after'}-${time}.png`),PNG.sync.write(image));
    const row = {time,...stats(image)};
    if (!baseline) {
      const previous = PNG.sync.read(await readFile(path.join(output,`before-${time}.png`)));
      row.previous = stats(previous); row.mae = difference(image,previous);
      if (time<=5 || time>=14) assert(row.mae<.03,`Unchanged endpoint ${time}s, got ${row.mae}`);
    }
    report.frames.push(row);
  }
  if(!baseline) for(const time of [5.9,6.4,6.9]) {
    const row=report.frames.find(frame=>frame.time===time);
    assert(row.brightNeutralFraction<row.previous.brightNeutralFraction*.5,
      `Neutral highlight stacking was not reduced at ${time}s`);
  }
  // Catch discontinuities at the pose splice, global handover end and stagger arrivals.
  for (const time of [5,5.8,6.95,8,8.6,9.4,10.2]) {
    const before=await capture(time-1/60), after=await capture(time+1/60);
    report.continuity.push({time,mae:difference(before,after)});
    assert(report.continuity.at(-1).mae<12,'Unexpected one-frame discontinuity');
  }
  const disabled=await capture(6.4,{identityTransition:0});
  const offPath=path.join(output,'before-disabled.png');
  if(baseline)await writeFile(offPath,PNG.sync.write(disabled));
  else {
    report.disabledMAE=difference(disabled,PNG.sync.read(await readFile(offPath)));
    assert(report.disabledMAE<.03,'Ordinary look changed');
  }
  assert.equal(report.errors.length,0);
  report.status='pass';
} catch(error) {report.status='fail';report.failure=error.message;throw error;}
finally {
  await writeFile(path.join(output,`${baseline?'before':'after'}-report.json`),JSON.stringify(report,null,2));
  await browser?.close();server?.kill();console.log(JSON.stringify(report,null,2));
}
