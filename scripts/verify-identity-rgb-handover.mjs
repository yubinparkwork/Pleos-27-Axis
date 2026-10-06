// Isolated browser context: the artist's open Chrome tab and saved settings are untouched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:51754';
const currentUrl = `${origin}/?look=hybrid-ab`;
const archivedUrl = `${origin}/versions/saved-20260926035641749-compatible/index.html?look=hybrid-ab`;
const output = path.join(root, 'artifacts', 'identity-rgb-handover');
const state = {
  hybridSubPercent: 5, // Compare with the archived 90/5/5 look.
  playing: false, time: 0, identityTransition: 1, identityHold: 5,
  identityDissolve: 3, identityEngraving: 1, identityLayerStagger: 0,
  lightCycle: true, lightCycleOffset: 0, lightColor: '#FA293C',
  hybridColorMode: 0, hybridColorMix: .41, hybridFaceReflection: 0,
  duration: 20, speed: 0, dimensionTop: 5.05, dimensionLeft: 11.85,
  dimensionRight: 12, dimensionDelayTop: 5.6, dimensionDelayLeft: 7.7,
  dimensionDelayRight: 0, layerFadeAmount: 1, layerFadeCycles: 4,
  aspect: '4x5', zoom: 1.54, azimuth: 72.3, elevation: 22.08,
};
const report = { status: 'running', checks: {}, frames: [], errors: [] };
let server, browser;
const png = data => PNG.sync.read(Buffer.from(data.split(',')[1], 'base64'));
const mean = image => {
  let sum = 0;
  for (let i = 0; i < image.data.length; i += 4) sum += image.data[i] + image.data[i + 1] + image.data[i + 2];
  return sum / (image.width * image.height * 3);
};
const difference = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / (a.width * a.height * 3);
};
async function open(url) {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(url);
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(() => window.__pleosOptical.pause());
  return page;
}
async function capture(page, name, patch) {
  const data = await page.evaluate(async ({ state, patch }) => {
    window.__pleosOptical.set({ ...state, ...patch });
    return window.__pleosOptical.capture(240, 300, 4);
  }, { state, patch });
  if (name) await writeFile(path.join(output, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  return png(data);
}
try {
  await mkdir(output, { recursive: true });
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '51754', '--strictPort'],
    { cwd: root, stdio: 'ignore' });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { if ((await fetch(currentUrl)).ok) break; } catch {}
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Isolated Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const current = await open(currentUrl);
  const archive = await open(archivedUrl);
  report.checks.clock = await current.evaluate(async state => {
    const { opticalLightPhase, opticalColorPhase, writeLightWeights } = await import('/src/optical-studio/OpticalLighting.ts');
    const { writeHybridWeights } = await import('/src/optical-studio/HybridAB.ts');
    const red = new Float32Array(3), ordinary = new Float32Array(3);
    const atReveal = { ...window.__pleosOptical.inspect().state, ...state, time: state.identityHold };
    writeHybridWeights(atReveal, red);
    const off = { ...atReveal, identityTransition: 0 };
    writeHybridWeights(off, ordinary);
    const custom = { ...atReveal, lightCycleOffset: .125 };
    const shifted = new Float32Array(3);
    writeLightWeights(custom, shifted);
    const fullyVisibleAt = state.identityHold + state.identityDissolve;
    const fullyVisible = new Float32Array(3);
    const settledRed = new Float32Array(3);
    const green = new Float32Array(3);
    const blue = new Float32Array(3);
    const loopEnd = new Float32Array(3);
    writeHybridWeights({ ...atReveal, time: fullyVisibleAt }, fullyVisible);
    writeHybridWeights({ ...atReveal, time: fullyVisibleAt + 1.5 }, settledRed);
    writeHybridWeights({ ...atReveal, time: fullyVisibleAt + 6 }, green);
    writeHybridWeights({ ...atReveal, time: fullyVisibleAt + 10 }, blue);
    writeHybridWeights({ ...atReveal, time: state.duration - 0.00001 }, loopEnd);
    return { phaseAtReveal: opticalLightPhase(atReveal), weightsAtReveal: [...red],
      ordinaryPhase: opticalLightPhase(off), ordinaryWeights: [...ordinary],
      shiftedWeights: [...shifted], colorPhaseAtFullReveal: opticalColorPhase({ ...atReveal, time: fullyVisibleAt }),
      fullyVisible: [...fullyVisible], settledRed: [...settledRed], green: [...green], blue: [...blue], loopEnd: [...loopEnd] };
  }, state);
  assert(Math.abs(report.checks.clock.phaseAtReveal) < 1e-9);
  assert(report.checks.clock.weightsAtReveal[0] > .89, 'Dimension light must start with Red');
  assert.equal(report.checks.clock.colorPhaseAtFullReveal, 0, 'Red must not be spent behind the gray reveal');
  assert(report.checks.clock.fullyVisible[0] > .89 && report.checks.clock.settledRed[0] > .89,
    'Red must remain dominant after the dimension becomes fully visible');
  assert(report.checks.clock.green[1] > report.checks.clock.green[0]
    && report.checks.clock.blue[2] > report.checks.clock.blue[1], 'Visible RGB order must remain Red → Green → Blue');
  assert(Math.abs(report.checks.clock.loopEnd[0] - report.checks.clock.weightsAtReveal[0]) < .00001,
    'The last blue-to-red handover must meet the next loop without a colour step');
  assert(report.checks.clock.ordinaryPhase > 0, 'Ordinary mode keeps its elapsed light clock');
  assert(report.checks.clock.shiftedWeights[0] < .9, 'Saved phase edits remain meaningful');
  const ordinary = await capture(current, 'ordinary-current', { identityTransition: 0, time: 6 });
  const ordinaryArchive = await capture(archive, 'ordinary-v7', { identityTransition: 0, time: 6 });
  report.checks.ordinaryParity = difference(ordinary, ordinaryArchive);
  // The current renderer uses improved output-edge filtering, so allow a
  // sub-code-value image difference while guarding against a look change.
  assert(report.checks.ordinaryParity < .5, 'The disabled 25 Axis look must remain unchanged');
  const gray = await capture(current, 'intro-gray', { time: 4.9 });
  const grayArchive = await capture(archive, 'intro-v7', { time: 4.9 });
  report.checks.grayParity = difference(gray, grayArchive);
  assert(report.checks.grayParity < .5, 'The source gray 25 Axis must remain unchanged');
  const oldAtStart = await capture(archive, null, { time: 5 });
  const oldAfterStart = await capture(archive, null, { time: 5.05 });
  report.checks.sourceMotionOnsetDelta = difference(oldAtStart, oldAfterStart);
  let prior;
  for (const time of [5, 5.05, 5.1, 5.2, 5.35, 5.5, 5.75, 6, 6.5, 7, 7.5, 8]) {
    const image = await capture(current, `transition-${time.toFixed(2)}`, { time });
    report.frames.push({ time, mean: mean(image), delta: prior ? difference(prior, image) : 0 });
    prior = image;
  }
  report.checks.onsetDelta = report.frames[1].delta;
  assert(report.checks.onsetDelta <= report.checks.sourceMotionOnsetDelta + .5,
    'Light onset must not jump beyond the unchanged gray Axis motion');
  const oldMid = await capture(archive, 'middle-v7', { time: 6.5 });
  report.checks.middleBrightness = { archived: mean(oldMid), current: report.frames.find(frame => frame.time === 6.5).mean };
  assert(report.checks.middleBrightness.current < report.checks.middleBrightness.archived,
    'The gray carrier must no longer stack as brightly with the new optical light');
  assert.equal(report.errors.length, 0, 'Browser console and page must have no errors');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.message;
  throw error;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill();
  console.log(JSON.stringify({ status: report.status, checks: report.checks, frames: report.frames, errors: report.errors, failure: report.failure }, null, 2));
}
