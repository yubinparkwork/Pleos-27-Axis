// Runs in a disposable Chrome context. Existing user tabs and saved settings
// are untouched. Requires the development server (for source-module checks).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'identity-layer-stagger');
const baseUrl = new URL(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
for (const key of ['sequence', 'transition', 'from', 'scene', 'renderer']) baseUrl.searchParams.delete(key);
const layeredUrl = new URL(baseUrl);
layeredUrl.searchParams.set('sequence', 'pleos25');
layeredUrl.searchParams.set('transition', 'layered');
layeredUrl.searchParams.set('from', 'saved-20260915065311136');
const normalKey = 'pleos-optical-studio-v1';
const sequenceKey = `${normalKey}:identity25`;
const archiveKey = `saved-20260915065311136:${sequenceKey}`;
const layeredKey = `${sequenceKey}:layered`;
const report = { status: 'running', url: layeredUrl.href, checks: {}, captures: {}, errors: [], warnings: [] };
let browser, context, page;
await mkdir(output, { recursive: true });

async function ready() {
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  await page.evaluate(() => window.__pleosOptical.pause());
}

async function capture(name, patch, width = 240, height = 300, samples = 1) {
  const url = await page.evaluate(async ({ patch, width, height, samples }) => {
    window.__pleosOptical.set({ ...patch, playing: false });
    const result = await window.__pleosOptical.capture(width, height, samples);
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error during stagger capture');
    return result;
  }, { patch, width, height, samples });
  assert(url.startsWith('data:image/png;base64,'), 'Export must be PNG');
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const png = PNG.sync.read(bytes);
  assert.equal(png.width, width); assert.equal(png.height, height);
  let lit = 0, peak = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const maximum = Math.max(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (maximum > 20) lit++;
    peak = Math.max(peak, maximum);
  }
  report.captures[name] = { file: `${name}.png`, width, height, samples, time: patch.time,
    peak, litFraction: lit / (width * height), sha256: createHash('sha256').update(png.data).digest('hex') };
  await writeFile(path.join(output, `${name}.png`), bytes);
  return png;
}

function sameFrame(actual, expected, reason) {
  assert(actual.data.equals(expected.data), reason);
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await context.newPage(); page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(baseUrl.href, { waitUntil: 'load' }); await ready();
  const normal = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(normal.identityTransition, 0);
  assert.equal(normal.identityLayerStagger, 0, 'Existing normal scene must retain simultaneous appearance');
  assert.equal(normal.identityEngraving, 1, 'Existing scene keeps engraving compatibility');
  const normalRaw = await page.evaluate(key => localStorage.getItem(key), normalKey);
  // Distinct settings prove that the archive is cloned once, including camera,
  // authored loop delays, and material values. These writes are disposable.
  const archived = { ...normal, identityTransition: 1, identityHold: 5.3, identityDissolve: 3,
    identityCenterVersion: 2, time: 4.2, playing: false, panX: -6.7, zoom: .65,
    lightColor: '#FA293C', layerStagger: .73, dimensionDelayLeft: 2.4,
    dimensionTop: 4, dimensionLeft: 3, dimensionRight: 6, duration: 15 };
  delete archived.identityLayerStagger; delete archived.identityEngraving;
  const archiveRaw = JSON.stringify(archived), sequenceRaw = JSON.stringify({ ...normal, panX: 12.5 });
  await page.evaluate(({ archiveKey, archiveRaw, sequenceKey, sequenceRaw }) => {
    localStorage.setItem(archiveKey, archiveRaw); localStorage.setItem(sequenceKey, sequenceRaw);
  }, { archiveKey, archiveRaw, sequenceKey, sequenceRaw });
  await page.goto(layeredUrl.href, { waitUntil: 'load' }); await ready();
  const seeded = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(seeded.identityLayerStagger, 1, 'New layer sequence defaults to a one-second interval');
  assert.equal(seeded.identityEngraving, 0, 'New sequence must use the pre-engraving appearance');
  const overrides = new Set(['identityTransition', 'identityEngraving', 'identityLayerStagger', 'identityCenterVersion', 'time', 'playing']);
  for (const [key, value] of Object.entries(archived)) if (!overrides.has(key)) {
    assert.deepEqual(seeded[key], value, `Archived ${key} must be preserved`);
  }
  report.checks.archiveClone = { defaultInterval: 1, preEngraving: true, cameraAndOpticsPreserved: true };
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), hdr: !!gl.getExtension('EXT_color_buffer_float') };
  });
  assert(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), 'Hardware GPU required');

  // State limits and timing invariants are exercised through the actual module
  // loaded by the browser. Rendering checks below independently verify gates.
  report.checks.timing = await page.evaluate(async () => {
    const { identityLayerTiming, identityLayerGate } = await import('/src/optical-studio/IdentityLayerTiming.ts');
    const { sanitizeOpticalState } = await import('/src/optical-studio/OpticalState.ts');
    const seed = window.__pleosOptical.inspect().state;
    const sample = { ...seed, identityTransition: 1, identityHold: 2, identityDissolve: 3,
      identityLayerStagger: 1, dimensionTop: 4, dimensionLeft: 3, dimensionRight: 2 };
    const timing = identityLayerTiming(sample);
    return { timing,
      layerSamples: [0, 1, 2, 3].map(order => ({ order, start: timing.firstStart + order,
        before: identityLayerGate({ ...sample, time: timing.firstStart + order - .001 }, order),
        atStart: identityLayerGate({ ...sample, time: timing.firstStart + order }, order),
        middle: identityLayerGate({ ...sample, time: timing.firstStart + order + .4 }, order),
        after: identityLayerGate({ ...sample, time: timing.firstStart + order + .801 }, order) })),
      zeroStaggerBefore: [0, 1, 49].map(order => identityLayerGate({ ...sample, identityLayerStagger: 0, time: 0 }, order)),
      zeroStaggerMiddle: [0, 1, 49].map(order => identityLayerGate({ ...sample, identityLayerStagger: 0, time: 2.4 }, order)),
      legacyEngraving: [0, 1, 49].map(order => identityLayerGate({ ...sample, identityEngraving: 1, identityLayerStagger: 0, time: 0 }, order)),
      disabled: identityLayerGate({ ...sample, identityTransition: 0, time: 0 }, 49),
      maximum: sanitizeOpticalState({ ...sample, identityHold: 15, identityDissolve: 12,
        dimensionTop: 50, identityLayerStagger: 5, duration: 1, time: 300 }),
      fractional: sanitizeOpticalState({ ...sample, identityHold: 1.23,
        dimensionTop: 4.01, identityLayerStagger: 1.25, duration: 1 }),
      clamps: sanitizeOpticalState({ ...sample, identityLayerStagger: 900, duration: 900, time: 900 }) };
  });
  const timing = report.checks.timing;
  assert.equal(timing.timing.firstStart, 2); assert.equal(timing.timing.fadeSeconds, .8);
  assert.equal(timing.timing.lastStart, 5); assert.equal(timing.timing.completeAt, 5.8);
  for (const sample of timing.layerSamples) {
    assert.equal(sample.before, 0); assert.equal(sample.atStart, 0);
    assert(Math.abs(sample.middle - .5) < 1e-12); assert.equal(sample.after, 1);
  }
  assert.deepEqual(timing.zeroStaggerBefore, [0, 0, 0]);
  for (const gate of timing.zeroStaggerMiddle) assert(Math.abs(gate - .5) < 1e-12);
  assert.deepEqual(timing.legacyEngraving, [1, 1, 1]); assert.equal(timing.disabled, 1);
  assert.equal(timing.maximum.duration, 260.8); assert.equal(timing.maximum.time, 260.8);
  assert.equal(timing.fractional.duration, 7.1, 'Fractional last layer must receive its own onset slot');
  assert.equal(timing.clamps.duration, 300); assert.equal(timing.clamps.time, 300);
  assert.equal(timing.clamps.identityLayerStagger, 5);

  const input = page.locator('[data-optical-number="identityLayerStagger"]');
  const slider = page.locator('[data-optical-range="identityLayerStagger"]');
  assert.equal(await input.inputValue(), '1');
  assert.equal(await input.getAttribute('min'), '0'); assert.equal(await input.getAttribute('max'), '5');
  assert.equal(await input.getAttribute('step'), '0.05');
  assert.equal(await input.getAttribute('aria-label'), '등장 스태거 (초)');
  assert.equal(await input.getAttribute('aria-describedby'), 'optical-identity-stagger-help');
  assert.match(await page.locator('#optical-identity-stagger-help').innerText(), /0초는 모든 층이 함께 시작/);
  await input.fill('1.25'); await input.press('Tab');
  await slider.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await input.inputValue(), '1.3');
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.layerStagger), .73,
    'Onset interval must not change existing loop stagger');
  report.checks.keyboardFocus = await slider.evaluate(node => ({
    active: node === document.activeElement, outlineStyle: getComputedStyle(node).outlineStyle,
    outlineWidth: getComputedStyle(node).outlineWidth, height: node.getBoundingClientRect().height }));
  assert(report.checks.keyboardFocus.active); assert.equal(report.checks.keyboardFocus.outlineStyle, 'solid');
  assert(Number.parseFloat(report.checks.keyboardFocus.outlineWidth) >= 2);
  assert(report.checks.keyboardFocus.height >= 24);
  await page.evaluate(async () => {
    const state = window.__pleosOptical.inspect().state;
    window.__pleosOptical.seek(state.identityHold + .4);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: path.join(output, 'panel-wide.png') });
  await page.setViewportSize({ width: 320, height: 760 });
  await input.scrollIntoViewIfNeeded();
  report.checks.minimumLayout = await input.evaluate(node => {
    const row = node.closest('.optical-control');
    const help = document.querySelector('#optical-identity-stagger-help');
    const bounds = row.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, viewport: innerWidth,
      helpWraps: help.clientHeight > 20, helpOverflow: help.scrollWidth > help.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(report.checks.minimumLayout.left >= 0 && report.checks.minimumLayout.right <= 320);
  assert(report.checks.minimumLayout.helpWraps); assert(!report.checks.minimumLayout.helpOverflow);
  assert(!report.checks.minimumLayout.horizontalOverflow);
  await page.screenshot({ path: path.join(output, 'panel-minimum.png') });
  report.checks.contrast = await input.evaluate(node => {
    const panel = getComputedStyle(document.querySelector('#optical-inspector'));
    const field = getComputedStyle(node), help = getComputedStyle(document.querySelector('#optical-identity-stagger-help'));
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    return { value: ratio(field.color, field.backgroundColor), help: ratio(help.color, panel.backgroundColor),
      fieldBoundary: ratio(field.borderTopColor, field.backgroundColor) };
  });
  assert(report.checks.contrast.value >= 4.5); assert(report.checks.contrast.help >= 4.5);
  assert(report.checks.contrast.fieldBoundary >= 3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload(); await ready();
  assert.equal(await input.inputValue(), '1.3', 'UI changes must persist after reload');
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).identityLayerStagger, layeredKey), 1.3);
  report.checks.controls = { numericAndKeyboard: true, persistedInterval: 1.3, existingLoopStagger: .73,
    wideScreenshot: 'panel-wide.png', minimumScreenshot: 'panel-minimum.png' };

  // Long sequences extend the actual transport and both duration controls.
  await page.evaluate(() => window.__pleosOptical.set({ identityHold: 15, identityDissolve: 12,
    dimensionTop: 50, identityLayerStagger: 5, duration: 1, time: 260.8 }));
  assert.equal(await page.locator('[data-optical-range="time"]').getAttribute('max'), '260.8');
  for (const control of await page.locator('[data-optical-number="duration"]').all()) {
    assert.equal(await control.getAttribute('max'), '300'); assert.equal(await control.inputValue(), '260.8');
  }
  assert.equal(await page.locator('[data-optical-duration]').innerText(), '04:20.80');
  report.checks.extendedTransport = { duration: 260.8, maximum: 300 };

  // Full render equality is stronger than checking a reported gate: arbitrary
  // future layers must contribute zero pixels, even while old loops are active.
  const renderState = { ...seeded, panX: 0, aspect: '4x5', zoom: .65,
    identityTransition: 1, identityEngraving: 0, identityLayerStagger: 1,
    identityHold: 1, identityDissolve: .5, duration: 15,
    dimensionTop: 8, dimensionLeft: 8, dimensionRight: 8,
    lightColor: '#FFFFFF', lightCycle: true, lightCycleOffset: .12,
    lightMotionCycles: 3, layerFadeCycles: 2, layerFadeAmount: .8, layerStagger: .73,
    dimensionDelayTop: .9, dimensionDelayLeft: 2.4, dimensionDelayRight: 4.1 };
  report.checks.futureLayers = [];
  for (const [time, eligible] of [[.9, 0], [1.4, 1], [1.8, 1], [2.25, 2], [4.25, 4]]) {
    const all = await capture(`future-${time}-all`, { ...renderState, time });
    const onlyEligible = await capture(`future-${time}-eligible`, { ...renderState, time,
      dimensionTop: eligible, dimensionLeft: eligible, dimensionRight: eligible });
    sameFrame(all, onlyEligible, `At ${time}s, layers beyond ${eligible} must have no rendered contribution`);
    report.checks.futureLayers.push({ time, eligible, exactPixelMatch: true });
  }
  const second = await capture('second-visible', { ...renderState, time: 2.4 });
  const firstOnly = await capture('second-excluded', { ...renderState, time: 2.4,
    dimensionTop: 1, dimensionLeft: 1, dimensionRight: 1 });
  assert(!second.data.equals(firstOnly.data), 'The second layer must contribute after its own start');
  const repeat = await capture('second-repeat', { ...renderState, time: 2.4 });
  sameFrame(repeat, second, 'Same-time export must be deterministic');
  const supersampled = await capture('second-supersampled', { ...renderState, time: 2.4 }, 320, 400, 4);
  const supersampledRepeat = await capture('second-supersampled-repeat', { ...renderState, time: 2.4 }, 320, 400, 4);
  sameFrame(supersampledRepeat, supersampled, 'Supersampled exports must share deterministic onset timing');
  report.checks.renderedOnset = { secondLayerContributes: true, deterministic: true, supersampledDeterministic: true };

  report.checks.endpoints = [];
  for (const time of [8.5, 15]) {
    const staggered = await capture(`endpoint-${time}-staggered`, { ...renderState, time });
    const simultaneous = await capture(`endpoint-${time}-simultaneous`, { ...renderState, time, identityLayerStagger: 0 });
    const ordinary = await capture(`endpoint-${time}-ordinary`, { ...renderState, time, identityTransition: 0 });
    sameFrame(staggered, simultaneous, 'After every gate is open, stagger must equal simultaneous rendering');
    sameFrame(staggered, ordinary, 'Completed layer appearance must equal the ordinary dimension frame');
    report.checks.endpoints.push({ time, simultaneousAndOrdinaryPixelIdentical: true });
  }

  // Isolate each arm with fades off, including after the main handover ends.
  report.checks.independentArms = [];
  for (const arm of ['dimensionTop', 'dimensionLeft', 'dimensionRight']) {
    const isolated = { ...renderState, dimensionTop: 0, dimensionLeft: 0, dimensionRight: 0,
      [arm]: 4, layerFadeAmount: 0, lightCycle: false, time: 1.8 };
    const all = await capture(`${arm}-first-only-gated`, isolated);
    const first = await capture(`${arm}-first-only-count`, { ...isolated, [arm]: 1 });
    sameFrame(all, first, `${arm}: three future layers must remain absent after global transition completion`);
    assert(report.captures[`${arm}-first-only-gated`].litFraction > .001, `${arm}: first layer must be visible`);
    report.checks.independentArms.push({ arm, firstVisible: true, futureLayersExcluded: true });
  }
  const source = await page.evaluate(key => localStorage.getItem(key), archiveKey);
  assert.equal(source, archiveRaw, 'Archive source must remain byte-for-byte untouched');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), sequenceKey), sequenceRaw, 'Existing engraving sequence must remain untouched');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), normalKey), normalRaw, 'Normal saved scene must remain untouched');
  report.checks.storageIsolation = { disposableContext: true, archivePreserved: true, engravingPreserved: true, normalPreserved: true };
  assert.deepEqual(report.errors, [], 'Browser errors detected');
  assert(!report.warnings.some(message => /too many active WebGL contexts|unexpected context lost/i.test(message)), 'GPU lifecycle warnings detected');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: path.join(output, 'verification.json'),
    failure: report.failure, checks: report.checks, errors: report.errors, warnings: report.warnings }, null, 2));
}
