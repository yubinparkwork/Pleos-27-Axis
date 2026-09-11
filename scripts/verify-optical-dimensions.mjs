// Isolated Playwright context: never accesses the user's saved studio or live tabs.
// Starts/stops its own Vite server by default. PLEOS_OPTICAL_URL explicitly reuses a server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'optical-refinement');
const baseUrl = process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:51743/';
const report = { status: 'running', baseUrl, errors: [], warnings: [], dimensions: {}, tiled: {}, checks: {}, captures: {} };
const keys = ['dimensionTop', 'dimensionLeft', 'dimensionRight'];
const state = {
  gap: .025, bevel: .24, ior: 1.5, dispersion: .008, roughness: .1, surfaceCurvature: .1,
  reflection: 1, absorption: .03, lightIntensity: .9, lightSpread: .85,
  red: 1, green: 0, blue: 0, exposure: 1, zoom: .65,
  azimuth: 45, elevation: 35.264389682754654, time: 0, duration: 15, speed: .4,
  dimensionTop: 3, dimensionLeft: 4, dimensionRight: 3, bloom: .3,
  lightColor: '#FFFFFF', dimensionSpacing: .14, dimensionSoftness: .55, dimensionFalloff: .55,
  bounces: 16, playing: false, aspect: 'main',
};

function difference(a, b, accept = () => true) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let sum = 0, max = 0, changed = 0, overOne = 0, count = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (!accept(x, y)) continue;
    const offset = (y * a.width + x) * 4;
    let pixelMax = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a.data[offset + channel] - b.data[offset + channel]);
      sum += delta; max = Math.max(max, delta); pixelMax = Math.max(pixelMax, delta);
    }
    if (pixelMax) changed++;
    if (pixelMax > 1) overOne++;
    count++;
  }
  return { meanAbsoluteChannelDifference: sum / (count * 3), max, changedFraction: changed / count, overOneFraction: overOne / count, pixels: count };
}

function metrics(png) {
  let peak = 0, lit = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const maximum = Math.max(png.data[offset], png.data[offset + 1], png.data[offset + 2]);
    peak = Math.max(peak, maximum);
    if (maximum > 20) lit++;
  }
  return { peak, litFraction: lit / (png.width * png.height) };
}

await mkdir(output, { recursive: true });
let browser, page, server;

async function startServer() {
  if (process.env.PLEOS_OPTICAL_URL) return;
  server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '51743', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOutput = '', spawnError;
  server.on('error', error => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-8000); });
  const deadline = Date.now() + 30_000;
  while (true) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Isolated Vite exited: ${serverOutput}`);
    try {
      if (serverOutput.includes('51743') && (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for this isolated server, not the user's development server. */ }
    if (Date.now() > deadline) throw new Error(`Isolated Vite did not start: ${serverOutput}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function saveCapture(name, url) {
  assert.ok(url.startsWith('data:image/png;base64,'), `${name}: capture is not PNG`);
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const png = PNG.sync.read(bytes);
  await writeFile(path.join(output, `${name}.png`), bytes);
  report.captures[name] = { width: png.width, height: png.height, bytes: bytes.length, ...metrics(png) };
  return png;
}

async function capture(name, patch, width = 360, height = width, samples = 1) {
  const url = await page.evaluate(async ({ next, width, height, samples }) => {
    window.__pleosOptical.set(next);
    return window.__pleosOptical.capture(width, height, samples);
  }, { next: { ...state, ...patch, playing: false }, width, height, samples });
  return saveCapture(name, url);
}

try {
  await startServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(message.text());
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  // Seed once, so a later reload genuinely verifies persistence instead of reseeding.
  await page.addInitScript(initial => {
    const key = 'pleos-optical-studio-v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
  }, state);
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  report.runtime = await page.evaluate(() => window.__pleosOptical.inspect());
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), hdr: !!gl.getExtension('EXT_color_buffer_float') };
  });
  assert.ok(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), 'Hardware GPU required for this optical QA');
  const allZero = Object.fromEntries(keys.map(key => [key, 0]));
  const direct = await capture('dimensions-all-zero', allZero);
  assert.ok(metrics(direct).litFraction > .01, 'Zero dimension depth must preserve direct glass');
  for (const key of keys) {
    const three = await capture(`${key}-3`, { ...allZero, [key]: 3 });
    const eight = await capture(`${key}-8`, { ...allZero, [key]: 8 });
    const zeroToThree = difference(direct, three), threeToEight = difference(three, eight);
    report.dimensions[key] = { zeroToThree, threeToEight };
    assert.ok(zeroToThree.meanAbsoluteChannelDifference > .005 && zeroToThree.changedFraction > .0001, `${key}: 0→3 has no measurable visual effect`);
    assert.ok(threeToEight.meanAbsoluteChannelDifference > .0005 && threeToEight.changedFraction > .0001, `${key}: 3→8 has no measurable visual effect`);
    const current = await page.evaluate(() => window.__pleosOptical.inspect().state);
    assert.deepEqual(keys.map(name => current[name]), keys.map(name => name === key ? 8 : 0), `${key}: other cube controls changed`);
  }
  report.checks.perCubeStateIndependence = 'pass';

  const spacingKeys = ['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight'];
  for (const key of spacingKeys) {
    const low = await capture(`${key}-low`, { [key]: .07 }, 240);
    const high = await capture(`${key}-high`, { [key]: .27 }, 240);
    const current = await page.evaluate(() => window.__pleosOptical.inspect().state);
    assert.deepEqual(spacingKeys.map(k => current[k]), spacingKeys.map(k => k === key ? .27 : .14));
    const delta = difference(low, high);
    assert.ok(delta.meanAbsoluteChannelDifference > .02, `${key}: no visible change`);
    report.checks[key] = delta;
  }
  const inherited = await capture('spacing-shared-legacy', { dimensionSpacing: .22 }, 240);
  const explicit = await capture('spacing-explicit-equal', Object.fromEntries(spacingKeys.map(key => [key, .22])), 240);
  assert.deepEqual(inherited.data, explicit.data, 'Equal per-cube values changed legacy shared spacing appearance');
  const spacingMigration = await page.evaluate(async () => {
    const { sanitizeOpticalState } = await import('/src/optical-studio/OpticalState.ts');
    const s = sanitizeOpticalState({ dimensionSpacing: .225, dimensionSpacingLeft: .1 });
    return [s.dimensionSpacingTop, s.dimensionSpacingLeft, s.dimensionSpacingRight];
  });
  assert.deepEqual(spacingMigration, [.225, .1, .225]);
  await page.locator('.optical-layer-advanced > summary').click();
  const spacingTop = page.getByRole('spinbutton', { name: '상단 층 간격', exact: true });
  await spacingTop.fill('.12'); await spacingTop.press('ArrowUp'); await spacingTop.press('Tab');
  const spacingLeft = page.getByRole('slider', { name: '왼쪽 층 간격 슬라이더', exact: true });
  await spacingLeft.focus(); await spacingLeft.press('ArrowRight');
  await page.getByRole('spinbutton', { name: '오른쪽 층 간격', exact: true }).fill('.285');
  await page.getByRole('spinbutton', { name: '오른쪽 층 간격', exact: true }).press('Tab');
  const spaced = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(spacingKeys.map(key => spaced[key]), [.125, .225, .285]);
  await page.screenshot({ path: path.join(output, 'spacing-ui-wide.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await spacingTop.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'spacing-ui-narrow.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.deepEqual(await page.evaluate(() => window.__pleosOptical.inspect().state), spaced);
  report.checks.perCubeSpacing = 'independent rendered changes; legacy equal-spacing pixel match; custom migration; three UI inputs, keyboard, wide/narrow screenshots and reload pass';

  const flatSurface = await capture('surface-curvature-zero', { surfaceCurvature: 0 });
  const geometryBefore = await page.evaluate(async () => {
    const { getAxisCubes } = await import('/src/optical-studio/AxisGeometry.ts');
    const current = window.__pleosOptical.inspect();
    return { geometry: getAxisCubes(current.state.gap), bevel: current.state.bevel, axis: current.axis };
  });
  const curvedSurface = await capture('surface-curvature-point-one', { surfaceCurvature: .1 });
  const geometryAfter = await page.evaluate(async () => {
    const { getAxisCubes } = await import('/src/optical-studio/AxisGeometry.ts');
    const current = window.__pleosOptical.inspect();
    return { geometry: getAxisCubes(current.state.gap), bevel: current.state.bevel, axis: current.axis };
  });
  const curvatureDifference = difference(flatSurface, curvedSurface);
  assert.ok(curvatureDifference.meanAbsoluteChannelDifference > .005 && curvatureDifference.changedFraction > .001, 'Surface curvature has no measurable optical effect');
  assert.deepEqual(geometryAfter, geometryBefore, 'Surface curvature modified the three-cube geometry, bevel, or Axis projection');
  report.checks.surfaceCurvature = { opticalDifference: curvatureDifference, geometryUnchanged: true, geometry: geometryAfter };

  // Exercise actual DOM inputs and keyboard controls, not just runtime set().
  await page.evaluate(({ state, allZero }) => window.__pleosOptical.set({ ...state, ...allZero, dimensionRight: 8 }), { state, allZero });
  const top = page.locator('[data-optical-number="dimensionTop"]');
  await top.fill('5'); await top.press('ArrowUp'); await top.press('Tab');
  await page.locator('[data-optical-range="dimensionLeft"]').focus(); await page.keyboard.press('ArrowRight');
  const saved = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(saved.dimensionTop, 5.05); assert.equal(saved.dimensionLeft, .05); assert.equal(saved.dimensionRight, 8);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  assert.deepEqual(await page.evaluate(() => window.__pleosOptical.inspect().state), saved, 'Cube-specific UI edits did not survive reload');
  report.checks.uiPersistence = 'number input + ArrowUp, range ArrowRight, reload: pass';

  // A fractional budget never relocates existing reflection images; adding a
  // layer across an integer boundary is a smooth, monotonic activation.
  const two = await capture('layers-continuity-2', { ...allZero, dimensionTop: 2 }, 240);
  const below = await capture('layers-continuity-2-99', { ...allZero, dimensionTop: 2.99 }, 240);
  const exact = await capture('layers-continuity-3', { ...allZero, dimensionTop: 3 }, 240);
  const above = await capture('layers-continuity-3-01', { ...allZero, dimensionTop: 3.01 }, 240);
  report.checks.continuity = { wholeLayer: difference(two, exact), below: difference(below, exact), above: difference(exact, above) };
  assert.ok(report.checks.continuity.wholeLayer.meanAbsoluteChannelDifference > .01);
  assert.ok(report.checks.continuity.below.meanAbsoluteChannelDifference < .03);
  assert.ok(report.checks.continuity.above.meanAbsoluteChannelDifference < .03);

  for (const [key, a, b] of [['dimensionSpacing', .06, .3], ['dimensionSoftness', .05, 1], ['dimensionFalloff', 0, 1]]) {
    const first = await capture(`layers-${key}-low`, { [key]: a }, 240);
    const second = await capture(`layers-${key}-high`, { [key]: b }, 240);
    const delta = difference(first, second);
    assert.ok(delta.meanAbsoluteChannelDifference > .02, `${key} has no visible effect`);
    report.checks[key] = delta;
  }

  await page.locator('[data-optical-color-hex]').fill('#2350ff');
  await page.locator('[data-optical-color-hex]').press('Tab');
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.lightColor), '#2350FF');
  await page.locator('[data-optical-color-hex]').fill('invalid');
  assert.equal(await page.locator('[data-optical-color-hex]').getAttribute('aria-invalid'), 'true');
  await page.locator('[data-optical-color-hex]').press('Tab');
  assert.equal(await page.locator('[data-optical-color-hex]').inputValue(), '#2350FF');
  await page.getByRole('button', { name: 'Pleos 레드 1', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.lightColor), '#FFCDD7');
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.equal(await page.locator('[data-optical-color-hex]').inputValue(), '#FFCDD7');
  assert.equal(await page.locator('[data-optical-range="red"], [data-optical-range="green"], [data-optical-range="blue"]').count(), 0);
  report.checks.unifiedColor = 'HEX normalization, invalid input recovery, accessible Pleos swatch, reload, no legacy RGB sliders: pass';

  const migration = await page.evaluate(async () => {
    const { sanitizeOpticalState } = await import('/src/optical-studio/OpticalState.ts');
    const legacy = sanitizeOpticalState({ red: 1, green: 0, blue: 0, dimensionTop: 4.35 });
    const explicit = sanitizeOpticalState({ red: 1, green: 0, blue: 0, lightColor: '#abcdef' });
    return { legacy, explicit };
  });
  assert.equal(migration.legacy.lightColor, '#FA293C'); assert.equal(migration.legacy.dimensionTop, 4.35);
  assert.equal(migration.explicit.lightColor, '#ABCDEF');
  report.checks.colorMigration = 'old RGB conversion; explicit new HEX takes precedence; fractional layers retained';

  const oldState = { ...state, red: 0, green: 1, blue: 0 };
  delete oldState.lightColor; delete oldState.dimensionSpacing; delete oldState.dimensionSoftness; delete oldState.dimensionFalloff;
  const migrationPage = await browser.newPage();
  try {
    await migrationPage.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
    await migrationPage.addInitScript(old => {
      if (!localStorage.getItem('pleos-optical-studio-v1')) localStorage.setItem('pleos-optical-studio-v1', JSON.stringify(old));
    }, oldState);
    await migrationPage.goto(baseUrl); await migrationPage.waitForFunction(() => window.__pleosOptical?.inspect().ready);
    const migrated = await migrationPage.evaluate(() => {
      const before = window.__pleosOptical.inspect().state;
      window.__pleosOptical.set({ dimensionTop: 7.25 });
      return { before, backup: JSON.parse(localStorage.getItem('pleos-optical-before-dimension-layers-v1')) };
    });
    assert.equal(migrated.before.lightColor, '#0ADC91');
    assert.deepEqual(migrated.backup.state, oldState, 'Legacy state not preserved exactly before first overwrite');
    await migrationPage.reload(); await migrationPage.waitForFunction(() => window.__pleosOptical?.inspect().ready);
    const persisted = await migrationPage.evaluate(() => ({ state: window.__pleosOptical.inspect().state, backup: JSON.parse(localStorage.getItem('pleos-optical-before-dimension-layers-v1')) }));
    assert.equal(persisted.state.dimensionTop, 7.25); assert.deepEqual(persisted.backup, migrated.backup);
    report.checks.originalRGBBackup = 'exact original saved before overwrite; new settings and first backup persist on reload';
  } finally { await migrationPage.close(); }

  // Apply the real appearance-only button, including recoverable backup failure.
  // Sentinels live only in this disposable browser context, never in user storage.
  const referenceInfo = await page.evaluate(async () => {
    const { LUMINOUS_REFERENCE, BEFORE_LUMINOUS_STORAGE_KEY } = await import('/src/optical-studio/LuminousReference.ts');
    const sentinels = {
      'pleos-27-axis-studio-state-v3': JSON.stringify({ mode: 'dimention-r3f', marker: 'preserve-old-studio' }),
      'pleos-27-axis-manual-save-v1': JSON.stringify({ name: 'A세팅', marker: 'preserve-named-setting' }),
      'pleos-27-axis-user-variations-v1': JSON.stringify([{ name: '플레오스 디멘션 초안', marker: 'preserve-draft-setting' }]),
    };
    for (const [key, value] of Object.entries(sentinels)) localStorage.setItem(key, value);
    window.__pleosOptical.set({ azimuth: 22.3, elevation: 17.8, zoom: .9, gap: .07, aspect: '4x5', time: 6.25, duration: 20, speed: .2, playing: false });
    const before = window.__pleosOptical.inspect().state;
    window.__opticalQaOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === BEFORE_LUMINOUS_STORAGE_KEY) throw new DOMException('Intentional QA backup failure', 'QuotaExceededError');
      return window.__opticalQaOriginalSetItem.call(this, key, value);
    };
    return { preset: LUMINOUS_REFERENCE, backupKey: BEFORE_LUMINOUS_STORAGE_KEY, before, sentinels };
  });
  const referenceButton = page.getByRole('button', { name: '레퍼런스 무드 적용', exact: true });
  await referenceButton.click();
  const failedReference = await page.evaluate(backupKey => ({
    state: window.__pleosOptical.inspect().state,
    status: document.querySelector('[data-optical-status]').textContent,
    backup: localStorage.getItem(backupKey),
  }), referenceInfo.backupKey);
  await page.evaluate(() => { Storage.prototype.setItem = window.__opticalQaOriginalSetItem; delete window.__opticalQaOriginalSetItem; });
  assert.deepEqual(failedReference.state, referenceInfo.before, 'Backup failure still applied the reference settings');
  assert.equal(failedReference.backup, null, 'Failed backup unexpectedly exists');
  assert.match(failedReference.status, /백업.*중단|실패|오류/, 'Backup failure did not show an understandable status');
  assert.ok(!failedReference.status.includes('적용했습니다'), 'Reference success overwrote the backup failure status');

  await referenceButton.click();
  const firstReference = await page.evaluate(({ backupKey, sentinels }) => ({
    state: window.__pleosOptical.inspect().state,
    backup: localStorage.getItem(backupKey),
    status: document.querySelector('[data-optical-status]').textContent,
    otherSaved: Object.fromEntries(Object.keys(sentinels).map(key => [key, localStorage.getItem(key)])),
  }), referenceInfo);
  assert.deepEqual(firstReference.state, { ...referenceInfo.before, ...referenceInfo.preset }, 'Reference button changed state outside its appearance patch');
  assert.deepEqual(JSON.parse(firstReference.backup).state, referenceInfo.before, 'Reference backup is not the exact prior optical state');
  assert.deepEqual(firstReference.otherSaved, referenceInfo.sentinels, 'Reference button overwrote another named/legacy saved state');
  assert.match(firstReference.status, /레퍼런스 무드를 적용했습니다/, 'Successful reference action has no confirmation');
  await page.evaluate(() => window.__pleosOptical.set({ ior: 1.8, dimensionLeft: 9 }));
  await referenceButton.click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), referenceInfo.backupKey), firstReference.backup, 'Repeated reference action overwrote the first backup');
  const preservedKeys = ['azimuth', 'elevation', 'zoom', 'gap', 'aspect', 'time', 'duration', 'speed', 'playing'];
  for (const key of preservedKeys) assert.equal(firstReference.state[key], referenceInfo.before[key], `Reference mood changed preserved ${key}`);
  report.checks.referenceAction = { backupFailureRecovered: true, firstBackupPreserved: true, preservedKeys, otherNamedStatesPreserved: Object.keys(referenceInfo.sentinels), clickedAccessibleName: '레퍼런스 무드 적용' };

  // Compare full-frame and guarded tile rendering at identical subpixel sample scales.
  // Both paths integrate off-artboard light before cropping, including the
  // outside image border, not just seams between export tiles.
  for (const scale of [1, 2, 4]) {
    const size = 400, margin = Math.ceil(12 * size / 1080) + 3;
    const directUrl = await page.evaluate(async ({ state, size, scale }) => {
      const { OpticalRenderer } = await import('/src/optical-studio/OpticalRenderer.ts');
      const canvas = document.createElement('canvas');
      const renderer = new OpticalRenderer(canvas);
      try {
        renderer.draw(state, size, size, size, size, 0, 0, scale);
        const url = canvas.toDataURL('image/png');
        if (canvas.getContext('webgl2').getError() !== 0) throw new Error('Direct capture emitted a WebGL error');
        return url;
      } finally { renderer.dispose(); }
    }, { state, size, scale });
    const full = await saveCapture(`full-frame-${scale}x`, directUrl);
    const tiled = await capture(`tiled-${scale}x`, {}, size, size, scale * scale);
    const interior = (x, y) => x >= margin && y >= margin && x < size - margin && y < size - margin;
    const seam = (x, y) => interior(x, y) && ([192, 384].some(seam => Math.abs(x - seam) <= 2) || [size - 192, size - 384].some(seam => Math.abs(y - seam) <= 2));
    const result = { fullFrame: difference(full, tiled), interior: difference(full, tiled, interior), seams: difference(full, tiled, seam), boundaryMargin: margin };
    report.tiled[scale] = result;
    assert.ok(result.fullFrame.max <= 2 && result.fullFrame.meanAbsoluteChannelDifference < .04, `${scale}x full-frame including outer border differs from tiled output`);
    // Quantized FP16 and GPU interpolation can differ by a few isolated code
    // values. Assert the measured global/seam error, and report the exact max.
    assert.ok(result.interior.meanAbsoluteChannelDifference < .04 && result.interior.overOneFraction < .002, `${scale}x tiled output differs from full-frame beyond tolerance`);
    assert.ok(result.seams.meanAbsoluteChannelDifference < .04 && result.seams.overOneFraction < .002, `${scale}x tile seams are visible`);
  }

  const dark = await capture('dimensions-lights-off', { lightIntensity: 0 });
  assert.equal(metrics(dark).peak, 0, 'With no incident light, glass and bloom must be black');
  report.checks.noEmission = 'all RGB bytes zero';
  const start = await capture('dimensions-loop-start', { time: 0 });
  const end = await capture('dimensions-loop-end', { time: 15 });
  assert.deepEqual(start.data, end.data, 'Deterministic loop endpoints differ');
  report.checks.loop = '0s and 15s pixel-identical';
  assert.deepEqual(report.errors, [], 'Browser emitted errors');
  assert.ok(!report.warnings.some(message => /too many active WebGL contexts|unexpected context lost/i.test(message)), 'GPU resource warnings detected');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  await writeFile(path.join(output, 'dimension-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
