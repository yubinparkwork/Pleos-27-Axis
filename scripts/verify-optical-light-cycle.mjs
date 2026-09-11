// Dedicated browser/context: never rewrites the user's active tab or settings.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
const output = new URL('../artifacts/optical-light-cycle/', import.meta.url);
const url = process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:51744/';
await mkdir(output, { recursive: true });
let server, browser;
const report = { checks: {}, errors: [], captures: {} };
// Explicit phase keeps this test independent of the published starting scene.
const custom = { playing: false, lightCycleOffset: 0, time: 0, duration: 15, speed: .4, lightColor: '#0CFFA8',
  gap: .005, bevel: .055, dimensionTop: 12, dimensionLeft: 10, dimensionRight: 12,
  dimensionSpacing: .14, dimensionSoftness: .55, dimensionFalloff: .55,
  ior: 2.5, dispersion: .008, roughness: .2, surfaceCurvature: 0, reflection: 1,
  absorption: .03, bounces: 12, lightIntensity: 1.8, lightSpread: .2,
  exposure: 1, bloom: .18, zoom: 12.711, azimuth: 52.574, elevation: 19.057, aspect: '4x5' };
const decode = data => PNG.sync.read(Buffer.from(data.split(',')[1], 'base64'));
function mad(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / (a.width * a.height * 3);
}
try {
  if (!process.env.PLEOS_OPTICAL_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '51744', '--strictPort'], { stdio: 'ignore' });
    const deadline = Date.now() + 30000;
    while (true) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (Date.now() > deadline || server.exitCode !== null) throw new Error('Test server did not start');
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // This project has no favicon. Do not turn that known optional request into
  // a rendering failure; all application console/resource errors remain fatal.
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(s => window.__pleosOptical.set(s), custom);
  const pure = await page.evaluate(async () => {
    const { writeLightWeights, startingLightFamily } = await import('/src/optical-studio/OpticalLighting.ts');
    const s = window.__pleosOptical.inspect().state, w = new Float32Array(3);
    const stages = [];
    for (const time of [0, 5, 10, 15]) { writeLightWeights({ ...s, time }, w); stages.push([...w]); }
    let maxDelta = 0, sumError = 0, minimum = 1, previous;
    for (let frame = 0; frame <= 15000; frame++) {
      writeLightWeights({ ...s, time: frame / 1000 }, w);
      sumError = Math.max(sumError, Math.abs(w[0] + w[1] + w[2] - 1));
      minimum = Math.min(minimum, ...w);
      if (previous) maxDelta = Math.max(maxDelta, ...w.map((v, i) => Math.abs(v - previous[i])));
      previous = [...w];
    }
    return { stages, sumError, minimum, maxDelta, families: ['#FA293C', '#0CFFA8', '#2350FF'].map(startingLightFamily) };
  });
  assert.deepEqual(pure.families, [0, 1, 2]);
  assert.deepEqual(pure.stages.map(w => w.indexOf(Math.max(...w))), [1, 0, 2, 1]);
  assert(pure.sumError < 1e-6 && pure.minimum >= .09999 && pure.maxDelta < .001);
  report.checks.energyAndContinuity = pure;
  const render = async (name, patch, w = 432, h = 540, samples = 4) => {
    const data = await page.evaluate(async ({ patch, w, h, samples }) => {
      window.__pleosOptical.set(patch);
      return await window.__pleosOptical.capture(w, h, samples);
    }, { patch, w, h, samples });
    await writeFile(new URL(`${name}.png`, output), Buffer.from(data.split(',')[1], 'base64'));
    report.captures[name] = { width: w, height: h };
    return decode(data);
  };
  const manual = await render('manual-green', { lightCycle: false });
  // Keyboard control is real, and enabling at a nonzero frame anchors to it.
  await page.evaluate(() => window.__pleosOptical.seek(6.55));
  const toggle = page.getByRole('checkbox', { name: 'RGB 주도색 순환', exact: true });
  await toggle.focus(); await toggle.press('Space');
  let state = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert(state.lightCycle); assert(Math.abs(state.lightCycleOffset - 6.55 / 15) < 1e-9);
  for (const key of Object.keys(custom)) if (key !== 'time' && key !== 'lightCycleOffset') assert.equal(state[key], custom[key], `Preserve ${key}`);
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.equal(await toggle.isChecked(), true);
  state = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert(Math.abs(state.lightCycleOffset - 6.55 / 15) < 1e-9);
  report.checks.keyboardAnchorAndReload = 'pass';
  const green = await render('green-main', { time: 0, lightCycleOffset: 0 });
  const red = await render('red-main', { time: 5 });
  const blue = await render('blue-main', { time: 10 });
  const end = await render('loop-end', { time: 15 });
  assert.equal(mad(green, end), 0, 'Loop must close byte-identically');
  assert(mad(green, red) > 1 && mad(red, blue) > 1, 'Distinct lead colours');
  const restored = await render('manual-restored', { time: 0, lightCycle: false });
  assert.equal(mad(manual, restored), 0, 'Manual colour must remain unchanged');
  report.checks.loopAndManualRoundtrip = { loopDifference: mad(green, end), manualDifference: mad(manual, restored), greenRedDifference: mad(green, red), redBlueDifference: mad(red, blue) };
  const black = await render('lights-off', { lightCycle: true, lightCycleOffset: 0, lightIntensity: 0 });
  assert(black.data.every((v, i) => i % 4 === 3 || v === 0), 'No light means no cube emission');
  report.checks.zeroLightBlack = 'pass';
  await page.evaluate(() => window.__pleosOptical.set({ lightIntensity: 1.8, zoom: .63, azimuth: 45, elevation: 35.264389682754654 }));
  for (const [name, time] of [['green', 0], ['red', 5], ['blue', 10]]) await render(`overview-${name}`, { time }, 540, 675, 4);
  await page.screenshot({ path: fileURLToPath(new URL('panel-wide.png', output)) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.getByRole('button', { name: '설정 패널 펼치기' }).click();
  await toggle.scrollIntoViewIfNeeded();
  const bounds = await toggle.boundingBox(); assert(bounds.width >= 24 && bounds.height >= 24);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: fileURLToPath(new URL('panel-narrow.png', output)) });
  report.checks.responsive = 'pass';
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (error) { report.status = 'fail'; report.failure = String(error.stack ?? error); throw error; }
finally {
  await writeFile(new URL('verification.json', output), JSON.stringify(report, null, 2));
  await browser?.close(); server?.kill();
}
console.log(JSON.stringify(report, null, 2));
