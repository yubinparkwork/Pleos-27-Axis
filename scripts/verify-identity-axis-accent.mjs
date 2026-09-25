// Disposable Chrome contexts and an isolated Vite origin. Saved user tabs and
// settings are never accessed. The reflection reference is an immutable archive.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:51753';
const currentUrl = process.env.PLEOS_OPTICAL_URL ?? `${origin}/?sequence=pleos25&transition=layered`;
const archiveUrl = new URL('/versions/saved-20260915085224893-compatible/index.html?sequence=pleos25&transition=layered', currentUrl).href;
const output = path.join(root, 'artifacts', 'identity-axis-accent');
const report = { status: 'running', currentUrl, archiveUrl, errors: [], captures: {}, checks: {} };
// Controlled reproduction of the user's saved control values. Fix both time and
// the otherwise hidden RGB phase offset; do not claim the current playing frame.
const fixture = {
  aspect: '4x5', lightColor: '#FA293C', lightCycle: true, lightCycleOffset: 0,
  time: 40, duration: 150.5, speed: .35, playing: false,
  identityTransition: 1, identityEngraving: 0, identityHold: 5.3, identityDissolve: 3,
  identityLayerStagger: .5, identityCenterVersion: 2, identityAxisAccent: 0,
  layerFadeAmount: 1, layerFadeCycles: 4, layerStagger: 0, lightMotionCycles: 1,
  dimensionDelayTop: 0, dimensionDelayLeft: 0, dimensionDelayRight: 0,
  gap: .015, bevel: .03, dimensionTop: 11.1, dimensionLeft: 16.75, dimensionRight: 34.05,
  dimensionSpacing: .14, dimensionSpacingTop: .2, dimensionSpacingLeft: .215,
  dimensionSpacingRight: .09, dimensionSoftness: 1, dimensionFalloff: 1,
  ior: 1.93, dispersion: .033, roughness: .3, surfaceCurvature: 0,
  reflection: 2, absorption: 0, bounces: 16, lightIntensity: 5,
  lightSpread: 1.12, exposure: .25, bloom: 1, zoom: .743, panX: 0,
  azimuth: 27.641, elevation: 16.087,
};
report.fixture = fixture;
let server, browser, current, reference;
await mkdir(output, { recursive: true });

function difference(a, b) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let sum = 0, maximum = 0, changed = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) {
    const delta = Math.abs(a.data[i] - b.data[i]);
    sum += delta; maximum = Math.max(maximum, delta); if (delta > 1) changed++;
  }
  const channels = a.width * a.height * 3;
  return { mae: sum / channels, maximum, changedChannelFraction: changed / channels };
}
async function saveImage(name, data) {
  const bytes = Buffer.from(data.split(',')[1], 'base64'), png = PNG.sync.read(bytes);
  await writeFile(path.join(output, `${name}.png`), bytes);
  report.captures[name] = { width: png.width, height: png.height, bytes: bytes.length };
  return png;
}
async function capture(page, name, patch, width = 256, height = 320, samples = 1) {
  const data = await page.evaluate(async ({ state, width, height, samples }) => {
    window.__pleosOptical.set(state);
    return window.__pleosOptical.capture(width, height, samples);
  }, { state: { ...fixture, ...patch, playing: false }, width, height, samples });
  return saveImage(name, data);
}
async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(url); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(() => window.__pleosOptical.pause());
  return page;
}
try {
  if (!process.env.PLEOS_OPTICAL_URL) {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host', '127.0.0.1', '--port', '51753', '--strictPort'], { cwd: root, stdio: 'ignore' });
    const deadline = Date.now() + 30_000;
    while (true) {
      if (server.exitCode !== null) throw new Error('Isolated Vite exited before startup');
      try { if ((await fetch(currentUrl)).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Isolated Vite did not start');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  current = await open(currentUrl);
  reference = await open(archiveUrl);
  report.checks.range = await current.evaluate(async () => {
    const { sanitizeOpticalState, OPTICAL_DEFAULTS } = await import('/src/optical-studio/OpticalState.ts');
    return { default: OPTICAL_DEFAULTS.identityAxisAccent,
      low: sanitizeOpticalState({ identityAxisAccent: -1 }).identityAxisAccent,
      high: sanitizeOpticalState({ identityAxisAccent: 3 }).identityAxisAccent };
  });
  assert.deepEqual(report.checks.range, { default: 1, low: 0, high: 2 });
  report.checks.timeline = await current.evaluate(async fixture => {
    const { identityAxisAccent } = await import('/src/optical-studio/IdentityAxisAccent.ts');
    return [
      { identityHold: 5.3, identityDissolve: 3, duration: 150.5 },
      { identityHold: 5.3, identityDissolve: 3, duration: 4 },
      { identityHold: 1, identityDissolve: 2, duration: 15 },
      { identityHold: 5, identityDissolve: 5, duration: 150.5 },
    ].map(timing => {
      const state = Object.freeze({ ...fixture, ...timing, identityAxisAccent: 1 });
      const fit = Math.min(1, timing.duration / (timing.identityHold + timing.identityDissolve));
      const held = timing.identityHold * fit, length = timing.identityDissolve * fit;
      const samples = [0, .04, .17, .30, .36, .42, .69, .96, 1].map(progress => {
        const time = held + length * progress;
        return { requestedProgress: progress, ...identityAxisAccent({ ...state, time }) };
      });
      return { timing, samples,
        zero: identityAxisAccent({ ...state, time: held + length * .36, identityAxisAccent: 0 }).amount,
        double: identityAxisAccent({ ...state, time: held + length * .36, identityAxisAccent: 2 }).amount,
        disabled: identityAxisAccent({ ...state, time: held + length * .36, identityTransition: 0 }).amount };
    });
  }, fixture);
  for (const timeline of report.checks.timeline) {
    assert.equal(timeline.zero, 0); assert.equal(timeline.disabled, 0);
    assert(Math.abs(timeline.double - 2) < 1e-10);
    const expected = [0, 0, .5, 1, 1, 1, .5, 0, 0];
    timeline.samples.forEach((sample, i) => assert(Math.abs(sample.amount - expected[i]) < 1e-10,
      `Single fitted pulse at progress ${sample.requestedProgress}`));
  }
  const regular = report.checks.timeline[0].samples[0];
  assert(Math.abs(regular.start - 5.42) < 1e-10 && Math.abs(regular.peak - 6.2) < 1e-10
    && Math.abs(regular.end - 8.18) < 1e-10, 'Default accent must use the existing 5.3s + 3s transition');
  report.checks.archiveParity = [];
  for (const [name, time] of [['before', 3], ['middle', 6.8], ['completed', 40]]) {
    const archived = await capture(reference, `archive-${name}`, { time }, 320, 400, 4);
    const restored = await capture(current, `accent-zero-${name}`, { time, identityAxisAccent: 0 }, 320, 400, 4);
    const delta = difference(archived, restored);
    assert(delta.maximum <= 1 && delta.mae < .001, `Accent 0 differs from reflection archive at ${time}s`);
    report.checks.archiveParity.push({ name, time, difference: delta });
  }
  await reference.close(); reference = undefined;

  const start = fixture.identityHold, end = start + fixture.identityDissolve;
  report.checks.pulse = [];
  for (let sample = 0; sample <= 20; sample++) {
    const time = start + fixture.identityDissolve * sample / 20;
    const off = await capture(current, `pulse-${sample}-off`, { time, identityAxisAccent: 0 });
    const on = await capture(current, `pulse-${sample}-on`, { time, identityAxisAccent: 1 });
    report.checks.pulse.push({ time, difference: difference(off, on) });
  }
  const active = report.checks.pulse.map(row => row.difference.mae > .0001);
  const peak = report.checks.pulse.reduce((best, row) => row.difference.mae > best.difference.mae ? row : best);
  assert(peak.difference.mae > .01, 'Axis accent has no visible transition effect');
  assert(!active[0] && !active.at(-1), 'Accent must be zero at transition endpoints');
  let intervals = 0;
  for (let i = 0; i < active.length; i++) if (active[i] && !active[i - 1]) intervals++;
  assert.equal(intervals, 1, 'Axis lighting must have one continuous pulse per transition');
  report.checks.singlePulse = { activeIntervals: intervals, peakTime: peak.time, peakDifference: peak.difference };
  for (const time of [0, 3, start, end, 40, fixture.duration]) {
    const off = await capture(current, `outside-${time}-off`, { time, identityAxisAccent: 0 });
    const on = await capture(current, `outside-${time}-on`, { time, identityAxisAccent: 2 });
    assert.deepEqual(on.data, off.data, `Accent leaked outside transition at ${time}s`);
  }
  const inactiveOff = await capture(current, 'transition-disabled-off', { time: peak.time, identityTransition: 0, identityAxisAccent: 0 });
  const inactiveOn = await capture(current, 'transition-disabled-on', { time: peak.time, identityTransition: 0, identityAxisAccent: 2 });
  assert.deepEqual(inactiveOff.data, inactiveOn.data, 'Axis accent leaked into the normal reflection scene');
  report.checks.transitionOnly = true;
  report.checks.updatedTiming = [];
  const updated = { identityHold: 5, identityDissolve: 5, layerFadeAmount: 0, layerFadeCycles: 1, layerStagger: 1 };
  for (const [name, time] of [['before', 5], ['peak', 6.5], ['completed', 10]]) {
    const off = await capture(current, `hold5-dissolve5-${name}-off`, { ...updated, time, identityAxisAccent: 0 }, 320, 400, 4);
    const on = await capture(current, `hold5-dissolve5-${name}-on`, { ...updated, time, identityAxisAccent: 1 }, 320, 400, 4);
    const delta = difference(off, on);
    if (name === 'peak') assert(delta.mae > .01, 'Accent disappeared with the updated 5s hold and 5s dissolve');
    else assert.deepEqual(on.data, off.data, `Updated timing leaked accent ${name}`);
    report.checks.updatedTiming.push({ name, time, difference: delta });
  }

  report.checks.continuity = [];
  for (const time of [start, peak.time, end]) {
    const before = await capture(current, `continuity-${time}-before`, { time: time - .001, identityAxisAccent: 1 });
    const after = await capture(current, `continuity-${time}-after`, { time: time + .001, identityAxisAccent: 1 });
    const delta = difference(before, after);
    assert(delta.mae < .5, `Accent creates a frame discontinuity at ${time}s`);
    report.checks.continuity.push({ time, difference: delta });
  }
  const tileState = { ...fixture, time: peak.time, identityAxisAccent: 1 };
  await current.evaluate(state => window.__pleosOptical.set(state), tileState);
  const beforeControl = await current.evaluate(() => window.__pleosOptical.inspect().state);
  await current.evaluate(() => window.__pleosOptical.set({ identityAxisAccent: 1.35 }));
  const afterControl = await current.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(afterControl, { ...beforeControl, identityAxisAccent: 1.35 }, 'Accent control modified unrelated saved settings');
  await current.reload(); await current.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.deepEqual(await current.evaluate(() => window.__pleosOptical.inspect().state), afterControl, 'Accent value or saved settings changed on reload');
  report.checks.statePreservation = 'Only accent strength changes; exact state survives reload';

  const width = 400, height = 500, scale = 2;
  await current.evaluate(state => window.__pleosOptical.set(state), tileState);
  const sanitized = await current.evaluate(() => window.__pleosOptical.inspect().state);
  const data = await current.evaluate(async ({ state, width, height, scale }) => {
    const { OpticalRenderer } = await import('/src/optical-studio/OpticalRenderer.ts');
    const canvas = document.createElement('canvas'), renderer = new OpticalRenderer(canvas);
    try { renderer.draw(state, width, height, width, height, 0, 0, scale); return canvas.toDataURL(); }
    finally { renderer.dispose(); }
  }, { state: sanitized, width, height, scale });
  const full = await saveImage('accent-full-frame', data);
  const tiled = await capture(current, 'accent-tiled', tileState, width, height, scale * scale);
  report.checks.tiled = difference(full, tiled);
  assert(report.checks.tiled.maximum <= 2 && report.checks.tiled.mae < .04, 'Accent does not match in full-frame and tiled export');
  const repeat = await capture(current, 'accent-repeated', tileState, width, height, scale * scale);
  assert.deepEqual(repeat.data, tiled.data, 'Accent frame is not deterministic');
  const loop0 = await capture(current, 'normal-loop-start', { time: 0, identityTransition: 0, identityAxisAccent: 1 });
  const loopEnd = await capture(current, 'normal-loop-end', { time: fixture.duration, identityTransition: 0, identityAxisAccent: 1 });
  assert.deepEqual(loop0.data, loopEnd.data, 'Normal reflection loop endpoints changed');
  report.checks.loopAndExport = 'Normal reflection loop and repeated export frames are pixel-identical; transition pulse is evaluated from scene time';
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await browser?.close(); server?.kill('SIGTERM');
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks,
    captureCount: Object.keys(report.captures).length, errors: report.errors, failure: report.failure }, null, 2));
}
