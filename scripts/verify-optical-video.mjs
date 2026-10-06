// Real H.264/HEVC export QA in a disposable Chrome context. Never accesses user tabs.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'optical-video');
const baseUrl = 'http://127.0.0.1:51749/';
const url = `${baseUrl}?sequence=pleos25&transition=layered`;
const report = { status: 'running', generatedAt: new Date().toISOString(), url, checks: {}, captures: {}, errors: [], warnings: [] };
await mkdir(output, { recursive: true });
let browser, page;
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '51749', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '', serverError;
server.on('error', error => { serverError = error; });
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverOutput = (serverOutput + data).slice(-6000); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function difference(a, b, flip = false) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let absolute = 0, squared = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) for (let c = 0; c < 3; c++) {
    const i = (y * a.width + x) * 4 + c;
    const j = ((flip ? a.height - 1 - y : y) * a.width + x) * 4 + c;
    const d = a.data[i] - b.data[j]; absolute += Math.abs(d); squared += d * d;
  }
  const count = a.width * a.height * 3;
  return { meanAbsoluteChannelDifference: absolute / count, psnr: squared ? 10 * Math.log10(255 * 255 / (squared / count)) : 999 };
}

async function capturePng(name, width, height, samples = 4) {
  const data = await page.evaluate(async ({ width, height, samples }) => window.__pleosOptical.capture(width, height, samples), { width, height, samples });
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  const png = PNG.sync.read(bytes);
  assert.equal(png.width, width); assert.equal(png.height, height);
  await writeFile(path.join(output, name), bytes);
  return png;
}

async function readVideoResult(result) {
  return Buffer.from(await page.evaluate(async url => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }, result.url), 'base64');
}

async function exportVideo(name, options) {
  const started = performance.now();
  const result = await page.evaluate(async options => window.__pleosOptical.exportVideo(options, false), options);
  const bytes = await readVideoResult(result);
  assert(bytes.length > 1000, 'MP4 must contain a real encoded video');
  const filename = path.join(output, name);
  await writeFile(filename, bytes);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', filename]);
  const probe = JSON.parse(stdout), video = probe.streams.find(stream => stream.codec_type === 'video');
  assert(video, 'MP4 must have a video stream'); assert(['h264', 'hevc'].includes(video.codec_name));
  assert.equal(video.width, options.width); assert.equal(video.height, options.height);
  assert.equal(video.avg_frame_rate, `${options.fps}/1`);
  const frames = Math.ceil((options.end - options.start) * options.fps - 1e-7);
  assert.equal(Number(video.nb_read_frames), frames, 'All requested deterministic frames must be encoded');
  const duration = Number(video.duration ?? probe.format.duration);
  assert(Math.abs(duration - frames / options.fps) < .002, 'MP4 duration must match fixed frame timestamps');
  const browserDecode = await page.evaluate(url => new Promise((resolve, reject) => {
    const element = document.createElement('video'); element.muted = true; element.preload = 'auto';
    const timer = setTimeout(() => { element.removeAttribute('src'); element.load(); reject(new Error('Browser MP4 decode timed out')); }, 15000);
    element.onloadeddata = () => { clearTimeout(timer); const state = { width: element.videoWidth,
      height: element.videoHeight, duration: element.duration, readyState: element.readyState };
      element.removeAttribute('src'); element.load(); resolve(state); };
    element.onerror = () => { clearTimeout(timer); reject(new Error(`Browser MP4 decode failed: ${element.error?.message}`)); };
    element.src = url;
  }), result.url);
  assert.equal(browserDecode.width, options.width); assert.equal(browserDecode.height, options.height);
  assert(browserDecode.readyState >= 2);
  report.captures[name] = { options, result, browserDecode, bytes: bytes.length, seconds: (performance.now() - started) / 1000,
    stream: { codec: video.codec_name, width: video.width, height: video.height, pixelFormat: video.pix_fmt,
      frameRate: video.avg_frame_rate, frames: Number(video.nb_read_frames), duration, colorSpace: video.color_space, colorTransfer: video.color_transfer } };
  return filename;
}

async function decodeFirst(filename, name) {
  const target = path.join(output, name);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', filename, '-frames:v', '1', target]);
  return PNG.sync.read(await readFile(target));
}

try {
  await run('ffprobe', ['-version']); await run('ffmpeg', ['-version']);
  const deadline = Date.now() + 30_000;
  while (true) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Isolated server exited: ${serverOutput}`);
    try { if ((await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* Server startup. */ }
    if (Date.now() > deadline) throw new Error(`Server timeout: ${serverOutput}`);
    await wait(100);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    const key = 'pleos-optical-studio-v1:identity25:layered';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ playing: false, time: 6.5,
      identityTransition: 1, identityEngraving: 0, identityCenterVersion: 2, identityLayerStagger: .5,
      axisMotion: 1, cameraMotion: 0, identityHold: 5.3, identityDissolve: 3, dimensionTop: 4, dimensionLeft: 4, dimensionRight: 4,
      aspect: '4x5', duration: 15, panX: -.17, zoom: .72, lightCycle: true }));
    const contexts = [], original = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = original.apply(this, args);
      if (!gl || args[0] !== 'webgl2' || seen.has(gl)) return gl;
      seen.add(gl);
      const resources = {};
      for (const kind of ['Program', 'Shader', 'VertexArray', 'Buffer', 'Texture', 'Framebuffer', 'Renderbuffer']) {
        const alive = new Set(), create = gl[`create${kind}`].bind(gl), remove = gl[`delete${kind}`].bind(gl);
        gl[`create${kind}`] = (...values) => { const item = create(...values); if (item) alive.add(item); return item; };
        gl[`delete${kind}`] = item => { remove(item); alive.delete(item); };
        resources[kind] = alive;
      }
      const item = { gl, resources, readbacks: 0 }, readPixels = gl.readPixels.bind(gl);
      gl.readPixels = (...values) => { const result = readPixels(...values); item.readbacks++; return result; };
      contexts.push(item); return gl;
    };
    window.__videoQaResources = () => ({ contextsCreated: contexts.length,
      activeContexts: contexts.filter(item => !item.gl.isContextLost()).length,
      readbacks: contexts.map(item => item.readbacks),
      resources: Object.fromEntries(['Program', 'Shader', 'VertexArray', 'Buffer', 'Texture', 'Framebuffer', 'Renderbuffer']
        .map(kind => [kind, contexts.reduce((sum, item) => sum + item.resources[kind].size, 0)])),
      errors: contexts.filter(item => !item.gl.isContextLost()).map(item => item.gl.getError()) });
  });
  page = await context.newPage(); page.setDefaultTimeout(60_000);
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') report.warnings.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready && typeof window.__pleosOptical.exportVideo === 'function');
  await page.evaluate(() => window.__pleosOptical.pause());
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), webCodecs: typeof VideoEncoder !== 'undefined' };
  });
  assert(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), 'Hardware GPU required');
  assert(report.gpu.webCodecs, 'WebCodecs required');
  report.resourcesBefore = await page.evaluate(() => window.__videoQaResources());
  const sourceState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const sourceRaw = await page.evaluate(() => localStorage.getItem('pleos-optical-studio-v1:identity25:layered'));
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().rendering.emission), false,
    'Current video must use the restored environmental reflections, not emissive dimensions');
  assert.match(await page.locator('[data-optical-section="lighting"] > summary').innerText(), /조명/);
  assert.match(await page.locator('[data-optical-section="optics"] > summary').innerText(), /광학/);
  const lightRange = page.locator('[data-optical-range="lightIntensity"]');
  const lightNumber = page.locator('[data-optical-number="lightIntensity"]');
  assert.equal(await lightNumber.getAttribute('aria-label'), '조명 강도');
  await lightRange.focus(); await lightRange.press('ArrowRight');
  assert(Math.abs(Number(await lightNumber.inputValue()) - sourceState.lightIntensity - .05) < 1e-8,
    'Lighting slider keyboard adjustment must update the matching numeric value');
  await page.evaluate(state => window.__pleosOptical.set(state), sourceState);
  const accentRange = page.locator('[data-optical-range="identityAxisAccent"]');
  const accentNumber = page.locator('[data-optical-number="identityAxisAccent"]');
  assert.equal(sourceState.identityAxisAccent, 1, 'Axis accent defaults to the intended single transition highlight');
  assert.equal(await accentNumber.getAttribute('aria-label'), '축 강조 강도');
  assert.equal(await accentRange.getAttribute('min'), '0'); assert.equal(await accentRange.getAttribute('max'), '2');
  assert.equal(await accentRange.getAttribute('step'), '0.05');
  assert.equal(await accentNumber.getAttribute('aria-describedby'), 'optical-identity-accent-help');
  assert.match(await page.locator('#optical-identity-accent-help').innerText(), /한 번/);
  await accentRange.focus(); await accentRange.press('ArrowRight');
  assert.equal(Number(await accentNumber.inputValue()), 1.05);
  const accentState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  // The first edit can legitimately initialize an aspect camera draft cache.
  // Its creation is independent of the authored lighting and render settings.
  const { cameraDrafts: _sourceDrafts, ...sourceAuthored } = sourceState;
  const { cameraDrafts: _accentDrafts, ...accentAuthored } = accentState;
  assert.deepEqual(accentAuthored, { ...sourceAuthored, identityAxisAccent: 1.05 }, 'Accent adjustment must preserve all other authored settings');
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.deepEqual(await page.evaluate(() => window.__pleosOptical.inspect().state), accentState, 'Accent value must survive reload');
  await page.evaluate(state => window.__pleosOptical.set(state), sourceState);
  await accentRange.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'axis-accent-wide.png') });
  await page.setViewportSize({ width: 320, height: 900 }); await accentRange.scrollIntoViewIfNeeded();
  const accentLayout = await accentNumber.evaluate(node => ({ left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    helpOverflow: document.querySelector('#optical-identity-accent-help').scrollWidth > document.querySelector('#optical-identity-accent-help').clientWidth }));
  assert(accentLayout.left >= 0 && accentLayout.right <= 320);
  assert(!accentLayout.horizontalOverflow && !accentLayout.helpOverflow);
  await page.screenshot({ path: path.join(output, 'axis-accent-minimum.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const assertLegacyLocked = async stage => {
    for (const kind of ['number', 'range']) {
      assert(!(await page.locator(`[data-optical-${kind}="ior"]`).isDisabled()), `${stage}: reflection IOR must remain active`);
      const key = 'bounces';
      const field = page.locator(`[data-optical-${kind}="${key}"]`);
      assert(await field.isDisabled(), `${stage}: preserved ${key} ${kind} must stay disabled`);
      assert.equal(Number(await field.inputValue()), sourceState[key], `${stage}: preserved ${key} value changed`);
    }
  };
  await assertLegacyLocked('initial');
  report.checks.reflectionUi = { semanticLabels: true, keyboardSliderToNumber: true, reflectionIorEnabled: true,
    legacyBouncesReadOnly: true, axisAccentDefault: 1, axisAccentRange: [0, 2], accentKeyboardStep: .05,
    accentSavedAndOtherSettingsPreserved: true, accentLayout,
    wide: 'axis-accent-wide.png', minimum: 'axis-accent-minimum.png' };
  const longEdge = page.locator('[data-optical-video="videoLongEdge"]');
  const fps = page.locator('[data-optical-video="videoFps"]');
  const samples = page.locator('[data-optical-video="videoSamples"]');
  const exportButton = page.locator('[data-optical-action="export-video"]');
  const cancelButton = page.locator('[data-optical-action="cancel-video"]');
  await page.locator('[data-optical-section="output"] > summary').click();
  assert.equal(await longEdge.inputValue(), '3840'); assert.equal(await fps.inputValue(), '30');
  assert.equal(await samples.inputValue(), '4');
  assert.match(await page.locator('[data-optical-video-size]').innerText(), /3072 × 3840/);
  await longEdge.selectOption('1920'); await samples.selectOption('16'); await fps.selectOption('24');
  // Headless macOS Chrome does not operate native popup choices by synthetic
  // ArrowDown (also reproducible on a bare <select>); check focus/Tab and use
  // selectOption for the native value-change path. Enter activation is tested
  // on the real export button in the unsupported-browser recovery case below.
  await fps.selectOption('30'); await fps.focus();
  report.checks.keyboardFocus = await fps.evaluate(node => ({ active: node === document.activeElement,
    outlineStyle: getComputedStyle(node).outlineStyle, outlineWidth: getComputedStyle(node).outlineWidth,
    hitHeight: node.getBoundingClientRect().height }));
  assert(report.checks.keyboardFocus.active); assert.equal(report.checks.keyboardFocus.outlineStyle, 'solid');
  assert(Number.parseFloat(report.checks.keyboardFocus.outlineWidth) >= 2); assert(report.checks.keyboardFocus.hitHeight >= 24);
  await page.reload();
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(() => window.__pleosOptical.pause());
  await page.locator('[data-optical-section="output"] > summary').click();
  assert.equal(await longEdge.inputValue(), '1920'); assert.equal(await fps.inputValue(), '30');
  assert.equal(await samples.inputValue(), '16');
  await longEdge.selectOption('3840'); await samples.selectOption('4');
  await samples.selectOption('64');
  assert.equal(await samples.inputValue(), '64', 'Precision video quality must be selectable');
  await samples.selectOption('4');
  const afterControls = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const { cameraDrafts: _controlDrafts, ...afterControlsAuthored } = afterControls;
  assert.deepEqual(afterControlsAuthored, sourceAuthored, 'Export settings must not alter camera, lighting, motion, or final appearance');
  await longEdge.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'panel-wide.png') });
  await page.setViewportSize({ width: 320, height: 900 });
  await longEdge.scrollIntoViewIfNeeded();
  report.checks.minimumLayout = await longEdge.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const note = document.querySelector('#optical-video-quality-help');
    return { left: bounds.left, right: bounds.right, viewport: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      helpOverflow: note.scrollWidth > note.clientWidth };
  });
  assert(report.checks.minimumLayout.left >= 0 && report.checks.minimumLayout.right <= 320);
  assert(!report.checks.minimumLayout.horizontalOverflow); assert(!report.checks.minimumLayout.helpOverflow);
  await page.screenshot({ path: path.join(output, 'panel-minimum.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(state => window.__pleosOptical.set(state), sourceState);
  report.checks.ui = { default4K: true, nativeSelectChanges: true, keyboardFocus: true, savedExportPreferences: true,
    settingsDoNotChangeScene: true, wide: 'panel-wide.png', minimum: 'panel-minimum.png' };

  // Full quality, native portrait-4K pixels, not a screenshot of the viewport.
  const nativeOptions = { width: 3072, height: 3840, fps: 30, samples: 4, start: 6.5, end: 6.5 + 2 / 30 };
  console.log('Rendering real native 4K two-frame MP4...');
  const nativeFile = await exportVideo('native-4k-4x5.mp4', nativeOptions);
  const afterExportState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const { cameraDrafts: _exportDrafts, ...afterExportAuthored } = afterExportState;
  assert.deepEqual(afterExportAuthored, sourceAuthored,
    'Successful export must restore exact paused source state');
  const afterExportRaw = await page.evaluate(() => localStorage.getItem('pleos-optical-studio-v1:identity25:layered'));
  const { cameraDrafts: _beforeSaveDrafts, ...beforeSavedValues } = JSON.parse(sourceRaw);
  const { cameraDrafts: _afterSaveDrafts, ...afterSavedValues } = JSON.parse(afterExportRaw);
  assert.deepEqual(afterSavedValues, beforeSavedValues,
    'Fixed export timestamps must never leak into autosaved settings');
  const first = await decodeFirst(nativeFile, 'native-4k-first-frame.png');
  const reference = await capturePng('native-4k-png-reference.png', nativeOptions.width, nativeOptions.height, 4);
  const expectedDifference = difference(reference, first), flippedDifference = difference(reference, first, true);
  assert(expectedDifference.meanAbsoluteChannelDifference < 4, 'Encoded MP4 differs excessively from clean same-time PNG');
  assert(expectedDifference.psnr > 32, 'Encoded MP4 PSNR is unexpectedly low');
  assert(flippedDifference.meanAbsoluteChannelDifference > expectedDifference.meanAbsoluteChannelDifference * 3,
    'Video must preserve vertical orientation');
  report.checks.native4K = { nativeDimensions: true, sameShaderAndCamera: true,
    uiExcluded: true, sameTimePngDifference: expectedDifference, wrongOrientationDifference: flippedDifference };

  const preciseOptions = { width: 640, height: 360, fps: 30, samples: 64,
    start: 6.5, end: 6.5 + 1 / 30 };
  const preciseFile = await exportVideo('precision-64spp.mp4', preciseOptions);
  const preciseFrame = await decodeFirst(preciseFile, 'precision-64spp-first-frame.png');
  const precisePng = await capturePng('precision-64spp-reference.png', 640, 360, 64);
  report.checks.precision64 = difference(precisePng, preciseFrame);
  assert(report.checks.precision64.meanAbsoluteChannelDifference < 4,
    '64-sample encoded frame must match the clean same-time PNG');

  // Invalid requests fail safely before output work and leave the app usable.
  report.checks.invalidRequests = [];
  for (const patch of [{ start: 4, end: 4 }, { start: -1, end: 1 }, { width: 3841 }, { fps: 0 }]) {
    const result = await page.evaluate(async patch => {
      const before = window.__pleosOptical.inspect().state;
      try { await window.__pleosOptical.exportVideo({ width: 320, height: 400, fps: 30, samples: 4, start: 6.5, end: 6.6, ...patch }, false); return { rejected: false }; }
      catch (error) { return { rejected: true, message: error.message, before, after: window.__pleosOptical.inspect().state,
        locked: window.__pleosOptical.inspect().exporting }; }
    }, patch);
    assert(result.rejected && result.message); assert.deepEqual(result.after, result.before); assert.equal(result.locked, false);
    report.checks.invalidRequests.push({ patch, message: result.message });
  }

  // Cancel after actual GPU readback, not just during the codec check. All
  // source options stay frozen, then exact time and playing state are restored.
  const beforeCancelResources = await page.evaluate(() => window.__videoQaResources());
  await page.evaluate(() => {
    const api = window.__pleosOptical;
    api.set({ playing: true, time: 6.5 });
    window.__videoQaCancelBefore = api.inspect().state;
    window.__videoQaCancelRaw = localStorage.getItem('pleos-optical-studio-v1:identity25:layered');
    window.__videoQaPending = api.exportVideo({ width: 3072, height: 3840, fps: 30, samples: 4, start: 6.5, end: 8.5 }, false)
      .then(result => ({ ok: true, result }), error => ({ ok: false, name: error.name, message: error.message }))
      .then(result => ({ ...result, after: api.inspect(), raw: localStorage.getItem('pleos-optical-studio-v1:identity25:layered') }));
  });
  await page.waitForFunction(previous => {
    const resources = window.__videoQaResources();
    return window.__pleosOptical.inspect().exporting && resources.contextsCreated > previous && resources.readbacks.at(-1) > 0;
  }, beforeCancelResources.contextsCreated, { timeout: 120_000 });
  assert(await exportButton.isDisabled()); assert(!(await cancelButton.isDisabled()));
  assert(await page.locator('[data-optical-action="export"]').isDisabled());
  assert(await longEdge.isDisabled());
  report.checks.whileBusy = await page.evaluate(async () => {
    const api = window.__pleosOptical, before = api.inspect();
    api.set({ zoom: 20, time: 10 }); api.pause(); api.seek(0);
    const reject = async work => { try { await work(); return null; } catch (error) { return error.message; } };
    return { before, after: api.inspect(), secondVideo: await reject(() => api.exportVideo({}, false)),
      png: await reject(() => api.capture(320, 400, 4)) };
  });
  assert.deepEqual(report.checks.whileBusy.after.state, report.checks.whileBusy.before.state);
  assert(report.checks.whileBusy.secondVideo && report.checks.whileBusy.png);
  assert.equal(report.checks.whileBusy.before.videoExport.busy, true);
  await cancelButton.click();
  const cancelled = await page.evaluate(async () => ({ result: await window.__videoQaPending,
    before: window.__videoQaCancelBefore, raw: window.__videoQaCancelRaw }));
  assert.equal(cancelled.result.ok, false); assert.equal(cancelled.result.name, 'AbortError');
  assert.equal(cancelled.result.after.exporting, false);
  assert.deepEqual(cancelled.result.after.state, cancelled.before, 'Cancel must restore exact authored play state and time');
  assert.equal(cancelled.result.raw, cancelled.raw, 'Cancelled export timestamps must not be autosaved');
  await page.waitForFunction(time => window.__pleosOptical.inspect().state.time > time, cancelled.before.time);
  await page.evaluate(() => window.__pleosOptical.pause());
  assert(!(await exportButton.isDisabled())); assert(await cancelButton.isDisabled());
  await assertLegacyLocked('after cancel');
  report.checks.cancellation = { duringRealGpuTiles: true, name: cancelled.result.name,
    exactStateRestored: true, savedSettingsPreserved: true, playbackResumed: true };

  // Reuse after cancel, and deterministic source time/color/orientation at a
  // different point in the fully formed dimensions.
  await page.evaluate(() => window.__pleosOptical.seek(9));
  const smallOptions = { width: 320, height: 400, fps: 30, samples: 4, start: 9, end: 9.1 };
  const afterCancelFile = await exportVideo('after-cancel.mp4', smallOptions);
  const afterCancelFrame = await decodeFirst(afterCancelFile, 'after-cancel-first-frame.png');
  const afterCancelPng = await capturePng('after-cancel-reference.png', 320, 400, 4);
  report.checks.repeatAfterCancel = difference(afterCancelPng, afterCancelFrame);
  assert(report.checks.repeatAfterCancel.meanAbsoluteChannelDifference < 5);
  assert(report.checks.repeatAfterCancel.psnr > 30);

  // Exercise the highest exposed quality/fps at the same native 4:5 dimensions,
  // after all staggered dimensions have arrived (not only the gray intro).
  await page.evaluate(() => window.__pleosOptical.set({ time: 12, playing: false,
    lightColor: '#0ADC91', lightIntensity: 3.25, reflection: 2, dimensionSoftness: .85,
    dimensionTop: 8, dimensionLeft: 8, dimensionRight: 8, layerFadeAmount: .6 }));
  report.highestQualityState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const highestOptions = { width: 3072, height: 3840, fps: 60, samples: 16, start: 12, end: 12 + 2 / 60 };
  console.log('Rendering native 4K at 16 samples / 60 fps...');
  const highestFile = await exportVideo('native-4k-16spp-60fps.mp4', highestOptions);
  const highestFrame = await decodeFirst(highestFile, 'native-4k-16spp-first-frame.png');
  const highestPng = await capturePng('native-4k-16spp-reference.png', 3072, 3840, 16);
  report.checks.highestQuality = difference(highestPng, highestFrame);
  let coloured = 0;
  for (let i = 0; i < highestPng.data.length; i += 4) {
    const maximum = Math.max(highestPng.data[i], highestPng.data[i + 1], highestPng.data[i + 2]);
    const minimum = Math.min(highestPng.data[i], highestPng.data[i + 1], highestPng.data[i + 2]);
    if (maximum > 20 && maximum - minimum > 10) coloured++;
  }
  report.checks.highestQuality.colouredFraction = coloured / (3072 * 3840);
  assert(report.checks.highestQuality.colouredFraction > .001, 'The late 4K comparison must include genuinely coloured dimensions');
  assert(report.checks.highestQuality.meanAbsoluteChannelDifference < 4);
  assert(report.checks.highestQuality.psnr > 32);

  // Trigger the actual visible button and a real browser download. A shorter
  // disposable regular loop keeps this interaction QA bounded without using
  // custom API range options or replacing the action with a stub.
  await page.evaluate(() => window.__pleosOptical.set({ identityTransition: 0, duration: 1, time: 0, playing: false,
    videoLongEdge: 1920, videoFps: 24, videoSamples: 4 }));
  assert.match(await exportButton.innerText(), /2K MP4/);
  await exportButton.focus();
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.keyboard.press('Enter');
  const download = await downloadPromise;
  const uiFilename = path.join(output, 'ui-button-loop.mp4');
  await download.saveAs(uiFilename); assert.equal(await download.failure(), null);
  const uiProbe = JSON.parse((await run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', uiFilename])).stdout);
  const uiVideo = uiProbe.streams.find(stream => stream.codec_type === 'video');
  assert.equal(uiVideo.width, 1536); assert.equal(uiVideo.height, 1920);
  assert.equal(uiVideo.codec_name, 'h264'); assert.equal(uiVideo.avg_frame_rate, '24/1');
  assert.equal(Number(uiVideo.nb_read_frames), 24);
  await page.waitForFunction(() => !window.__pleosOptical.inspect().exporting);
  await assertLegacyLocked('after successful MP4');
  report.checks.uiDownload = { filename: 'ui-button-loop.mp4', suggestedFilename: download.suggestedFilename(),
    keyboardEnter: true, width: uiVideo.width, height: uiVideo.height, frames: 24, fps: 24,
    fullZeroToDurationLoop: true, status: await page.locator('[data-optical-video-status]').innerText() };

  report.resourcesAfter = await page.evaluate(() => window.__videoQaResources());
  assert.equal(report.resourcesAfter.activeContexts, 1, 'Only the live preview context may remain');
  assert.deepEqual(report.resourcesAfter.resources, report.resourcesBefore.resources, 'GPU programs and render targets must not accumulate');
  assert(report.resourcesAfter.errors.every(error => error === 0));

  // Unsupported WebCodecs branch is tested in another fresh context before
  // mediabunny can cache support, without altering the actual encoder above.
  const unsupported = await browser.newContext({ viewport: { width: 900, height: 800 } });
  await unsupported.addInitScript(() => { delete window.VideoEncoder;
    localStorage.setItem('pleos-optical-studio-v1:identity25:layered', JSON.stringify({ playing: false, identityTransition: 1, identityEngraving: 0, identityCenterVersion: 2 })); });
  const unsupportedPage = await unsupported.newPage();
  await unsupportedPage.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await unsupportedPage.goto(url, { waitUntil: 'load' });
  await unsupportedPage.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  const unsupportedBefore = await unsupportedPage.evaluate(() => window.__pleosOptical.inspect().state);
  await unsupportedPage.locator('[data-optical-action="export-video"]').focus();
  await unsupportedPage.keyboard.press('Enter');
  await unsupportedPage.waitForFunction(() => /실패/.test(document.querySelector('[data-optical-video-status]')?.textContent ?? ''));
  const unsupportedMessage = await unsupportedPage.locator('[data-optical-video-status]').innerText();
  assert.match(unsupportedMessage, /Chrome|Edge|브라우저/);
  assert.equal(await unsupportedPage.evaluate(() => window.__pleosOptical.inspect().exporting), false);
  assert.deepEqual(await unsupportedPage.evaluate(() => window.__pleosOptical.inspect().state), unsupportedBefore);
  assert(!(await unsupportedPage.locator('[data-optical-action="export-video"]').isDisabled()));
  await unsupportedPage.screenshot({ path: path.join(output, 'unsupported-browser-message.png') });
  report.checks.unsupportedBrowser = { message: unsupportedMessage, statePreserved: true, retryEnabled: true };
  await unsupported.close();

  assert.deepEqual(report.errors, [], 'No new browser errors allowed');
  assert(!report.warnings.some(message => /too many active WebGL|INVALID_OPERATION|GL_INVALID|context.*lost/i.test(message)), 'No GPU resource warnings allowed');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
  await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
