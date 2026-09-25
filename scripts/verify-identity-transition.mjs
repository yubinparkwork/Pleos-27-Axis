// Dedicated Chrome context; the user's open tabs and browser storage are untouched.
// Reuses local Vite on 5173, or the explicit PLEOS_OPTICAL_URL server.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'identity-transition');
const baseUrl = new URL(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
baseUrl.searchParams.delete('sequence');
baseUrl.searchParams.delete('renderer');
baseUrl.searchParams.delete('scene');
const sequenceUrl = new URL(baseUrl);
sequenceUrl.searchParams.set('sequence', 'pleos25');
const storageKey = 'pleos-optical-studio-v1';
const sequenceStorageKey = `${storageKey}:identity25`;
const centerBackupKey = `${sequenceStorageKey}:before-centered-light-v2`;
const timing = { identityHold: 5.3, identityDissolve: 3, duration: 15 };
const midpoint = timing.identityHold + timing.identityDissolve / 2;
const report = { status: 'running', baseUrl: baseUrl.href, sequenceUrl: sequenceUrl.href, checks: {}, errors: [], warnings: [], captures: {}, tiled: {} };
let browser, context, page;
await mkdir(output, { recursive: true });

function metrics(png) {
  let peak = 0, lit = 0, chromaMaximum = 0, chromaTotal = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const rgb = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const maximum = Math.max(...rgb), chroma = maximum - Math.min(...rgb);
    peak = Math.max(peak, maximum);
    if (maximum > 20) lit++;
    chromaMaximum = Math.max(chromaMaximum, chroma); chromaTotal += chroma;
  }
  const pixels = png.width * png.height;
  return { peak, litFraction: lit / pixels, chromaMaximum, meanChroma: chromaTotal / pixels };
}

function difference(a, b, accept = () => true, referenceOffsetX = 0) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let sum = 0, max = 0, overOne = 0, pixels = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (!accept(x, y) || x + referenceOffsetX < 0 || x + referenceOffsetX >= a.width) continue;
    const offset = (y * a.width + x) * 4;
    const referenceOffset = (y * a.width + x + referenceOffsetX) * 4;
    let pixelMax = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a.data[referenceOffset + channel] - b.data[offset + channel]);
      sum += delta; max = Math.max(max, delta); pixelMax = Math.max(pixelMax, delta);
    }
    if (pixelMax > 1) overOne++;
    pixels++;
  }
  assert(pixels > 0, 'Image comparison region must contain pixels');
  return { meanAbsoluteChannelDifference: sum / (pixels * 3), max, overOneFraction: overOne / pixels, pixels };
}

async function saveCapture(name, url) {
  assert(url.startsWith('data:image/png;base64,'), `${name}: capture must be PNG`);
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const png = PNG.sync.read(bytes);
  await writeFile(path.join(output, `${name}.png`), bytes);
  report.captures[name] = { width: png.width, height: png.height, bytes: bytes.length,
    sha256: createHash('sha256').update(png.data).digest('hex'), ...metrics(png) };
  return png;
}

async function capture(name, patch = {}, width = 320, height = width, samples = 1) {
  const data = await page.evaluate(async ({ patch, width, height, samples }) => {
    window.__pleosOptical.set({ ...patch, playing: false });
    return window.__pleosOptical.capture(width, height, samples);
  }, { patch, width, height, samples });
  return saveCapture(name, data);
}

async function ready() {
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
}

async function waitForFrame() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(baseUrl.href, { waitUntil: 'load' });
  await ready();
  await page.evaluate(() => window.__pleosOptical.pause());
  const initial = await page.evaluate(() => window.__pleosOptical.inspect());
  assert.equal(initial.state.identityTransition, 0, 'Normal route must default to transition disabled');
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), hdr: !!gl.getExtension('EXT_color_buffer_float') };
  });
  assert(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), 'Hardware GPU required for identity transition QA');

  // Distinct saved values make source-scene cloning observable independently
  // of defaults. Every write belongs to this disposable browser context.
  const normalState = { ...initial.state, ...timing, identityTransition: 0, playing: false, time: midpoint,
    zoom: .65, panX: 6.7, azimuth: 45, elevation: 35.264389682754654,
    lightColor: '#FA293C', lightCycle: false, lightIntensity: 1.2, bloom: .3,
    dimensionTop: 3, dimensionLeft: 7, dimensionRight: 4, aspect: 'main' };
  const normal = await capture('qa-normal-before', normalState);
  const normalSaved = await page.evaluate(key => localStorage.getItem(key), storageKey);
  assert(normalSaved, 'Normal state must be saved before cloning');

  await page.goto(sequenceUrl.href, { waitUntil: 'load' });
  await ready();
  await page.evaluate(() => window.__pleosOptical.pause());
  const cloned = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(cloned.identityTransition, 1, 'Sequence route must automatically enable the transition');
  assert.equal(cloned.panX, 0, 'New 25엑시스 sequence must center its camera once');
  assert.equal(cloned.identityCenterVersion, 2, 'New sequence must record completed center migration');
  const sequenceOverrides = new Set(['identityTransition', 'time', 'playing', 'identityHold', 'identityDissolve', 'duration', 'panX', 'identityCenterVersion']);
  for (const key of Object.keys(normalState)) if (!sequenceOverrides.has(key)) {
    assert.equal(cloned[key], normalState[key], `Sequence clone must preserve normal ${key}`);
  }
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), normalSaved, 'Opening sequence must preserve normal storage');
  report.checks.defaultAndClone = { defaultDisabled: true, autoEnabled: true, sequencePanX: cloned.panX, normalPanX: normalState.panX, normalStoragePreserved: true };

  report.checks.angularContinuity = await page.evaluate(async state => {
    const { Identity25 } = await import('/src/optical-studio/Identity25.ts');
    const model = new Identity25();
    let previous, maxStep = 0, worstTime = 0;
    for (let step = 0; step <= 3000; step++) {
      const time = state.identityHold + step / 1000;
      model.update({ ...state, identityTransition: 1, time });
      if (previous) for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(model.angles[axis] - previous[axis]) * 180 / Math.PI;
        if (delta > maxStep) { maxStep = delta; worstTime = time; }
      }
      previous = [...model.angles];
    }
    return { maxDegreesPerMillisecond: maxStep, worstTime };
  }, { ...cloned, ...timing });
  assert(report.checks.angularContinuity.maxDegreesPerMillisecond < .5, 'Dissolve axes must not switch target permutation abruptly');

  report.checks.handoverVelocity = await page.evaluate(async state => {
    const { Identity25 } = await import('/src/optical-studio/Identity25.ts');
    const model = new Identity25(), dt = .002;
    const sample = time => { model.update({ ...state, identityTransition: 1, time }); return [...model.angles]; };
    return [
      { identityHold: 5.3, identityDissolve: 3, duration: 15 },
      { identityHold: 4.75, identityDissolve: 2.5, duration: 15 },
      { identityHold: 5.3, identityDissolve: 3, duration: 4 },
    ].map(timing => {
      state = { ...state, ...timing };
      const fit = Math.min(1, timing.duration / (timing.identityHold + timing.identityDissolve));
      const held = timing.identityHold * fit, length = timing.identityDissolve * fit;
      const boundaries = [held * 3.8 / 5.3, held, held + length * .65].map(time => {
        const a=sample(time-dt), b=sample(time), c=sample(time+dt);
        const incoming=b.map((v,i)=>(v-a[i])/dt*180/Math.PI);
        const outgoing=c.map((v,i)=>(v-b[i])/dt*180/Math.PI);
        return { time, incoming, outgoing, jump: Math.max(...incoming.map((v,i)=>Math.abs(v-outgoing[i]))) };
      });
      let minimumGap = Infinity;
      for(let time=held*3.8/5.3;time<=held+length;time+=.005) {
        const a=sample(time);
        minimumGap=Math.min(minimumGap,a[1]-a[0],a[2]-a[1],a[0]+Math.PI-a[2]);
      }
      let minimumFormerHoldSpeed = Infinity;
      for(let sourceTime=4;sourceTime<=5;sourceTime+=.01) {
        const time=held*sourceTime/5.3, a=sample(time), b=sample(time+dt);
        for(let axis=0;axis<3;axis++) minimumFormerHoldSpeed=Math.min(minimumFormerHoldSpeed,
          (b[axis]-a[axis])/dt*180/Math.PI);
      }
      return { timing, boundaries, minimumGap, minimumFormerHoldSpeed };
    });
  }, { ...cloned, ...timing });
  report.checks.transitionEasing = await page.evaluate(async () => {
    const { identityHandoverEase: ease } = await import('/src/optical-studio/Identity25.ts');
    const derivative = t => (ease(t+.0001)-ease(t-.0001))/.0002;
    let minimumStep = Infinity;
    for(let i=1;i<=1000;i++) minimumStep=Math.min(minimumStep,ease(i/1000)-ease((i-1)/1000));
    return { start:ease(0), end:ease(1), early:derivative(.2), middle:derivative(.5), late:derivative(.8), minimumStep };
  });
  assert.equal(report.checks.transitionEasing.start,0);
  assert.equal(report.checks.transitionEasing.end,1);
  assert(report.checks.transitionEasing.minimumStep>0, 'Transition easing must not reverse');
  assert(report.checks.transitionEasing.middle>report.checks.transitionEasing.early*2
    && report.checks.transitionEasing.middle>report.checks.transitionEasing.late*2,
    'Transition must have a perceptible slow–fast–slow cadence');
  for (const result of report.checks.handoverVelocity) {
    assert(result.minimumFormerHoldSpeed>1, 'All axes must keep moving through the former 4–5s hold');
    for (const boundary of result.boundaries) assert(boundary.jump < 3,
      `Angular velocity must carry across the handover: ${JSON.stringify(boundary)}`);
    assert(result.minimumGap > .015, 'Handover must preserve ordered, non-collapsed planes');
  }

  const sequenceBaseline = await capture('qa-sequence-before', { ...timing, identityTransition: 0, time: midpoint, panX: 0 });
  await capture('qa-start-zero', { identityTransition: 1, time: 0 });
  const monochrome = await capture('qa-source-monochrome', { time: 3 });
  const sourceMetrics = metrics(monochrome);
  assert(sourceMetrics.peak > 80 && sourceMetrics.litFraction > .001, '25엑시스 at 3s must be visible');
  assert(sourceMetrics.chromaMaximum <= 2 && sourceMetrics.meanChroma < .01, '25엑시스 must remain monochrome before lighting develops');
  const middle = await capture('qa-dissolve-midpoint', { time: midpoint });
  assert(metrics(middle).peak > 40 && metrics(middle).litFraction > .001, 'Lighting transition midpoint must not go black');
  const repeated = await capture('qa-dissolve-repeat', { time: midpoint });
  assert.deepEqual(repeated.data, middle.data, 'Repeated same-state capture must be pixel-identical');
  const final = await capture('qa-final-enabled', { time: timing.duration });
  const finalDisabled = await capture('qa-final-disabled', { identityTransition: 0, time: timing.duration });
  assert.deepEqual(final.data, finalDisabled.data, 'Transition endpoint must equal the unmodified dimension renderer at the same time');
  const restored = await capture('qa-sequence-restored', { identityTransition: 0, time: midpoint });
  assert.deepEqual(sequenceBaseline.data, restored.data, 'Disabling the transition must restore the exact sequence scene at the same camera position');
  report.checks.frames = { monochrome: sourceMetrics, midpoint: metrics(middle), repeatPixelIdentical: true,
    finalPixelIdenticalToDisabled: true, disabledRoundtripPixelIdentical: true };

  // Pixel translation is a stronger center test than brightness centroids:
  // developing asymmetric light can move the centroid without moving geometry.
  // At a 320px width, pan 6.25 must move the image exactly 20px left at EVERY
  // phase. A pan multiplied by transition progress violates this relationship.
  const fixedPanPhases = [];
  for (const time of [3, timing.identityHold, midpoint, timing.identityHold + timing.identityDissolve, timing.duration]) {
    const width = 320, height = 240, shift = 20, panX = shift / width * 100;
    const name = time.toFixed(2).replace('.', 'p');
    const centered = await capture(`qa-center-${name}`, { ...timing, identityTransition: 1, time, panX: 0 }, width, height);
    const translated = await capture(`qa-pan-${name}`, { panX }, width, height);
    const current = await page.evaluate(() => window.__pleosOptical.inspect().state);
    assert.equal(current.panX, panX, `Pan must remain fixed at ${time}s`);
    const margin = Math.ceil(12 * height / 1080) + 4;
    const interior = (x, y) => x >= margin && x + shift < width - margin && y >= margin && y < height - margin;
    const result = difference(centered, translated, interior, shift);
    fixedPanPhases.push({ time, panX, shiftPixels: shift, ...result });
    assert(result.meanAbsoluteChannelDifference < .08 && result.overOneFraction < .004,
      `25엑시스 camera shift varies with transition phase at ${time}s: expected a fixed ${shift}px translation`);
  }
  report.checks.fixedCenter = { method: 'Constant camera translation at source, onset, midpoint, completion and end; asymmetric lighting does not determine the center', phases: fixedPanPhases };

  await page.evaluate(patch => window.__pleosOptical.set(patch), { ...timing, identityTransition: 1, time: midpoint, playing: false, panX: 0 });
  const tileState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  for (const scale of [1, 2]) {
    const width = 400, height = 320, margin = Math.ceil(12 * height / 1080) + 3;
    const direct = await page.evaluate(async ({ state, width, height, scale }) => {
      const { OpticalRenderer } = await import('/src/optical-studio/OpticalRenderer.ts');
      const canvas = document.createElement('canvas');
      const renderer = new OpticalRenderer(canvas);
      try {
        renderer.draw(state, width, height, width, height, 0, 0, scale);
        const url = canvas.toDataURL('image/png');
        if (canvas.getContext('webgl2').getError() !== 0) throw new Error('Direct identity capture emitted a WebGL error');
        return url;
      } finally { renderer.dispose(); }
    }, { state: tileState, width, height, scale });
    const full = await saveCapture(`qa-full-frame-${scale}x`, direct);
    const tiled = await capture(`qa-tiled-${scale}x`, tileState, width, height, scale * scale);
    const interior = (x, y) => x >= margin && y >= margin && x < width - margin && y < height - margin;
    const seams = (x, y) => interior(x, y) && ([192, 384].some(edge => Math.abs(x - edge) <= 2) || Math.abs(y - (height - 192)) <= 2);
    const result = { fullFrame: difference(full, tiled), interior: difference(full, tiled, interior), seams: difference(full, tiled, seams), margin };
    report.tiled[scale] = result;
    assert(result.fullFrame.max <= 2 && result.fullFrame.meanAbsoluteChannelDifference < .04,
      `${scale}x full-frame identity output, including its outer border, differs from guarded tiles`);
    for (const region of ['interior', 'seams']) assert(result[region].meanAbsoluteChannelDifference < .04 && result[region].overOneFraction < .002,
      `${scale}x identity ${region} differs beyond existing optical tolerance`);
  }

  // Exercise the actual number inputs and keyboard slider, then reload.
  const holdInput = page.locator('[data-optical-number="identityHold"]');
  const dissolveInput = page.locator('[data-optical-number="identityDissolve"]');
  assert.equal(await holdInput.getAttribute('aria-label'), '25엑시스 구간 (초)');
  assert.equal(await dissolveInput.getAttribute('aria-label'), '빛 전환 시간 (초)');
  await holdInput.fill('4.75'); await holdInput.press('Tab');
  await dissolveInput.fill('2.5'); await dissolveInput.press('Tab');
  const cameraSection = page.locator('[data-optical-section="camera"]');
  if (await cameraSection.getAttribute('open') === null) await cameraSection.locator('summary').click();
  const panInput = page.locator('[data-optical-number="panX"]');
  await panInput.fill('4.5'); await panInput.press('Tab');
  const beforeToggle = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const enableSlider = page.locator('[data-optical-range="identityTransition"]');
  await enableSlider.focus(); await enableSlider.press('Home');
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.identityTransition), 0);
  await enableSlider.press('End');
  const afterToggle = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(afterToggle.identityTransition, 1);
  for (const key of Object.keys(beforeToggle)) if (key !== 'identityTransition') assert.equal(afterToggle[key], beforeToggle[key], `Enabling transition must preserve ${key}`);
  await page.reload(); await ready();
  await page.evaluate(() => window.__pleosOptical.pause());
  const persisted = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(persisted.identityTransition, 1);
  assert.equal(persisted.identityHold, 4.75);
  assert.equal(persisted.identityDissolve, 2.5);
  assert.equal(persisted.panX, 4.5, 'Manually edited sequence pan must persist; centering is a one-time migration');
  assert.equal(persisted.identityCenterVersion, 2);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), normalSaved, 'Sequence edits/reload must preserve normal storage');
  report.checks.inputPersistence = { keyboardEnable: true, otherSettingsPreserved: true, reloadPreserved: true, manualPanX: persisted.panX, normalStoragePreserved: true };

  await page.evaluate(patch => window.__pleosOptical.set(patch), { ...timing, identityTransition: 1, playing: false, time: midpoint, panX: 0 });
  await holdInput.scrollIntoViewIfNeeded();
  await waitForFrame();
  await page.screenshot({ path: path.join(output, 'panel-wide.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await ready();
  await page.evaluate(() => window.__pleosOptical.set({ playing: false, time: 6.8 }));
  const openInspector = page.getByRole('button', { name: '설정 패널 펼치기', exact: true });
  if (await openInspector.isVisible()) await openInspector.click();
  await holdInput.scrollIntoViewIfNeeded();
  await holdInput.focus();
  assert(await holdInput.evaluate(input => document.activeElement === input), 'Narrow panel hold field must receive keyboard focus');
  const layout = await page.evaluate(() => {
    const section = document.querySelector('[data-optical-section="identity"]');
    const bounds = section.getBoundingClientRect();
    const inputs = [...section.querySelectorAll('input')].map(input => {
      const rect = input.getBoundingClientRect();
      return { label: input.getAttribute('aria-label'), left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    });
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, sectionWidth: section.clientWidth,
      sectionScrollWidth: section.scrollWidth, left: bounds.left, right: bounds.right, inputs };
  });
  assert(layout.documentWidth <= layout.viewport, 'Narrow page must not overflow horizontally');
  assert(layout.sectionScrollWidth <= layout.sectionWidth + 1, 'Long Korean timing help must wrap inside the section');
  for (const input of layout.inputs) assert(input.left >= -1 && input.right <= layout.viewport + 1 && input.width > 0 && input.height >= 24,
    `Narrow transition control is clipped or too short: ${input.label}`);
  await waitForFrame();
  await page.screenshot({ path: path.join(output, 'panel-narrow.png') });
  report.checks.responsive = layout;

  await page.setViewportSize({ width: 640, height: 480 });
  const loopStarted = performance.now();
  await page.evaluate(() => window.__pleosOptical.set({ identityTransition: 1, duration: 1, identityHold: .2, identityDissolve: .5, time: 0, playing: true }));
  await page.waitForFunction(() => {
    const state = window.__pleosOptical.inspect().state;
    return state.playing && state.time > .8;
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const state = window.__pleosOptical.inspect().state;
    return state.playing && state.time < .3;
  }, null, { timeout: 8000 });
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const stopped = await page.evaluate(() => window.__pleosOptical.inspect().state);
  await waitForFrame();
  const held = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(held.time, stopped.time); assert.equal(held.playing, false);
  await page.getByRole('button', { name: '재생', exact: true }).press('Enter');
  await page.waitForFunction(time => window.__pleosOptical.inspect().state.time > time+.1, held.time);
  await page.evaluate(() => window.__pleosOptical.pause());
  report.checks.loopPlayback = { wrapped: true, pauseHeld: true, keyboardResume: true,
    wallMs: Math.round(performance.now() - loopStarted) };

  await page.goto(baseUrl.href, { waitUntil: 'load' }); await ready();
  const normalAfterSequence = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(normalAfterSequence, normalState, 'Returning to the normal route must restore the untouched original state');
  const normalRestored = await capture('qa-normal-restored', {});
  assert.deepEqual(normalRestored.data, normal.data, 'Normal route must retain exact original pixels and camera after sequence edits');
  report.checks.returnToNormal = 'Original saved state and pixels remain exact';

  // Seed one old sequence in this disposable context to exercise the actual
  // migration. Its raw serialized state must survive intact in the backup.
  const legacyState = { ...cloned, identityCenterVersion: 1, identityTransition: 1,
    panX: -13.5, playing: false, time: 4.25, duration: 15, identityHold: 4.75, identityDissolve: 2.5 };
  const legacySaved = JSON.stringify(legacyState);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), centerBackupKey), null, 'Fresh v2 sequence must not create a legacy backup');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: sequenceStorageKey, value: legacySaved });
  await page.goto(sequenceUrl.href, { waitUntil: 'load' }); await ready();
  const migrated = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(migrated, { ...legacyState, panX: 0, identityCenterVersion: 2 }, 'Legacy migration must only center pan and mark version 2');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), centerBackupKey), legacySaved, 'Legacy backup must preserve exact raw saved state');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), normalSaved, 'Legacy sequence migration must preserve normal storage');
  await page.evaluate(() => window.__pleosOptical.set({ panX: -9.25 }));
  await page.reload(); await ready();
  const remigrated = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(remigrated, { ...migrated, panX: -9.25 }, 'Version 2 reload must preserve a subsequent manual pan edit');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), centerBackupKey), legacySaved, 'Version 2 reload must not replace the original backup');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), normalSaved, 'Migrated manual edits must preserve normal storage');
  report.checks.centerMigration = { oldVersion: 1, newVersion: 2, originalPanX: legacyState.panX, centeredPanX: migrated.panX,
    manualPanX: remigrated.panX, exactRawBackupPreserved: true, otherSettingsPreserved: true, normalStoragePreserved: true };
  assert.deepEqual(report.errors, [], 'Browser emitted errors');
  assert(!report.warnings.some(message => /too many active WebGL contexts|unexpected context lost/i.test(message)), 'GPU resource lifecycle warnings detected');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
