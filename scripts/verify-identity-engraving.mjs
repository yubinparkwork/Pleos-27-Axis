// Focused rendered QA for the gray-face → engraving → dimension handover.
// A new, disposable Chrome context uses the route's actual seeded defaults.
// No existing browser profile, tabs, or saved user settings are accessed.
// Run against Vite on 5173, or set PLEOS_OPTICAL_URL to another local server.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'identity-engraving');
const baseUrl = new URL(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
for (const key of ['sequence', 'scene', 'renderer']) baseUrl.searchParams.delete(key);
const sequenceUrl = new URL(baseUrl);
sequenceUrl.searchParams.set('sequence', 'pleos25');
const storageKey = 'pleos-optical-studio-v1';
const report = { status: 'running', baseUrl: baseUrl.href, sequenceUrl: sequenceUrl.href,
  checks: {}, captures: {}, errors: [], warnings: [] };
let browser, context, page;
await mkdir(output, { recursive: true });

function metrics(png) {
  let peak = 0, lit = 0, energy = 0, chromaMaximum = 0, colored = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const maximum = Math.max(r, g, b), chroma = maximum - Math.min(r, g, b);
    peak = Math.max(peak, maximum); chromaMaximum = Math.max(chromaMaximum, chroma);
    energy += (r + g + b) / 3;
    if (maximum > 20) lit++;
    if (maximum > 20 && chroma > 5) colored++;
  }
  const pixels = png.width * png.height;
  return { peak, litFraction: lit / pixels, meanChannel: energy / pixels,
    chromaMaximum, coloredFraction: colored / pixels };
}

function lightOnGray(lit, neutral) {
  assert.equal(lit.width, neutral.width); assert.equal(lit.height, neutral.height);
  let gray = 0, light = 0, overlap = 0, maximumContribution = 0;
  for (let i = 0; i < lit.data.length; i += 4) {
    const grayMaximum = Math.max(neutral.data[i], neutral.data[i + 1], neutral.data[i + 2]);
    const addition = Math.max(...[0, 1, 2].map(channel => lit.data[i + channel] - neutral.data[i + channel]));
    const isGray = grayMaximum > 20, isLight = addition > 5;
    if (isGray) gray++;
    if (isLight) light++;
    if (isGray && isLight) overlap++;
    maximumContribution = Math.max(maximumContribution, addition);
  }
  const pixels = lit.width * lit.height;
  return { grayFraction: gray / pixels, lightContributionFraction: light / pixels,
    lightOnGrayFraction: overlap / pixels, maximumContribution };
}

async function ready() {
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  await page.evaluate(() => window.__pleosOptical.pause());
}

async function capture(name, patch, width, height, save = true) {
  const data = await page.evaluate(async ({ patch, width, height }) => {
    window.__pleosOptical.set({ ...patch, playing: false });
    const url = await window.__pleosOptical.capture(width, height, 1);
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error during engraving capture');
    return url;
  }, { patch, width, height });
  assert(data.startsWith('data:image/png;base64,'), `${name} must be a PNG capture`);
  const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  const png = PNG.sync.read(bytes);
  assert.equal(png.width, width); assert.equal(png.height, height);
  report.captures[name] = { time: patch.time, width, height, samples: 1,
    sha256: createHash('sha256').update(png.data).digest('hex'), ...metrics(png) };
  if (save) {
    await writeFile(path.join(output, `${name}.png`), bytes);
    report.captures[name].file = `${name}.png`;
  }
  return png;
}

function assertVisible(png, name) {
  const result = metrics(png);
  // This only detects an empty handover, not an aesthetic brightness target.
  assert(result.peak > 20 && result.litFraction > .001, `${name}: handover became blank`);
  return result;
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(baseUrl.href, { waitUntil: 'load' }); await ready();
  const normalState = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const normalSaved = await page.evaluate(key => localStorage.getItem(key), storageKey);
  assert.equal(normalState.identityTransition, 0);
  assert(normalSaved, 'Disposable normal scene must be saved before cloning');
  await page.goto(sequenceUrl.href, { waitUntil: 'load' }); await ready();
  report.seededRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
  const seed = report.seededRuntime.state;
  assert.equal(seed.identityTransition, 1);
  const sequenceOverrides = new Set(['identityTransition', 'identityHold', 'identityDissolve',
    'identityCenterVersion', 'duration', 'time', 'playing', 'panX']);
  for (const [key, value] of Object.entries(normalState)) if (!sequenceOverrides.has(key)) {
    assert.deepEqual(seed[key], value, `Sequence must preserve seeded optical setting ${key}`);
  }
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#optical-canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      hdr: !!gl.getExtension('EXT_color_buffer_float') };
  });
  assert(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), 'Hardware GPU required');
  const dimensions = await page.evaluate(async aspect => {
    const { opticalDimensions } = await import('/src/optical-studio/OpticalState.ts');
    return { review: opticalDimensions(aspect, 640), check: opticalDimensions(aspect, 240) };
  }, seed.aspect);
  const [width, height] = dimensions.review, [checkWidth, checkHeight] = dimensions.check;
  const fit = Math.min(1, seed.duration / (seed.identityHold + seed.identityDissolve));
  const onset = seed.identityHold * fit, length = seed.identityDissolve * fit, completion = onset + length;
  const phases = [
    { name: 'source-gray', time: onset * 3 / 5.3 },
    { name: 'onset-gray', time: onset },
    { name: 'marked-face', time: onset + length * .3 },
    { name: 'erosion', time: onset + length * .5 },
    { name: 'settled-light', time: onset + length * 2.3 / 3 },
    { name: 'dimension-complete', time: completion },
  ];
  report.phases = phases;
  const reviewFrames = [];
  for (const phase of phases) {
    const png = await capture(phase.name, { identityTransition: 1, time: phase.time }, width, height);
    assertVisible(png, phase.name);
    reviewFrames.push(png);
    console.log(`Captured ${phase.name} at ${phase.time.toFixed(2)}s`);
  }
  assert(metrics(reviewFrames[0]).chromaMaximum <= 2, 'Source gray faces must remain monochrome');
  const gutter = 12;
  const sheet = new PNG({ width: width * 3 + gutter * 2, height: height * 2 + gutter });
  for (let i = 0; i < sheet.data.length; i += 4) sheet.data[i + 3] = 255;
  reviewFrames.forEach((png, index) => PNG.bitblt(png, sheet, 0, 0, width, height,
    index % 3 * (width + gutter), Math.floor(index / 3) * (height + gutter)));
  await writeFile(path.join(output, 'stages-contact-sheet.png'), PNG.sync.write(sheet));
  report.contactSheet = { file: 'stages-contact-sheet.png', order: phases.map(phase => phase.name), columns: 3 };

  const repeated = await capture('marked-face-repeat', { time: phases[2].time }, width, height, false);
  assert.deepEqual(repeated.data, reviewFrames[2].data, 'Same-state marked-face capture must be pixel-identical');
  report.checks.determinism = { stage: 'marked-face', pixelIdentical: true };
  report.checks.endpoints = [];
  for (const time of [completion, seed.duration]) {
    const enabled = await capture(`endpoint-${time.toFixed(2)}-enabled`, { identityTransition: 1, time }, checkWidth, checkHeight);
    const disabled = await capture(`endpoint-${time.toFixed(2)}-ordinary`, { identityTransition: 0, time }, checkWidth, checkHeight);
    assert.deepEqual(enabled.data, disabled.data, `At ${time}s the transition must equal ordinary dimension exactly`);
    report.checks.endpoints.push({ time, pixelIdenticalToOrdinaryDimension: true });
  }

  // Capture the same defaults with only reflected radiance disabled. This
  // leaves the contour/engraving evaluation active and isolates the remaining
  // gray surface. Setting incident intensity to zero would skip that evaluation.
  // It is a
  // diagnostic pass, not an alternative visual preset or reference screenshot.
  report.checks.surfaceAndLight = [];
  for (const phase of [phases[2], phases[3], phases[4], phases[5]]) {
    const lit = await capture(`diagnostic-${phase.name}-lit`, { identityTransition: 1, time: phase.time,
      reflection: seed.reflection }, checkWidth, checkHeight);
    const neutral = await capture(`diagnostic-${phase.name}-no-reflected-light`, { time: phase.time,
      reflection: 0 }, checkWidth, checkHeight);
    report.checks.surfaceAndLight.push({ stage: phase.name, time: phase.time,
      neutral: metrics(neutral), lit: metrics(lit), ...lightOnGray(lit, neutral) });
  }
  const [marked, , settled, complete] = report.checks.surfaceAndLight;
  assert(marked.grayFraction > .001, 'Gray surface must remain present when light marks it');
  assert(marked.lightOnGrayFraction > .0001, 'Marked stage must contain incident light on surviving gray surface');
  assert(settled.neutral.meanChannel < marked.neutral.meanChannel,
    'Gray surface must diminish between the marked stage and settled light');
  assert.equal(complete.neutral.peak, 0, 'Completed handover must leave no gray surface when reflected light is disabled');

  // Sample the entire handover; one visible midpoint alone can miss a brief gap.
  report.checks.handoverSamples = [];
  for (let step = 0; step <= 20; step++) {
    const time = onset + length * step / 20;
    const png = await capture(`handover-${String(step).padStart(2, '0')}`, { identityTransition: 1,
      time, reflection: seed.reflection }, checkWidth, checkHeight, false);
    report.checks.handoverSamples.push({ time, ...assertVisible(png, `Handover sample ${step}`) });
    if (step % 5 === 0) console.log(`Checked handover ${step}/20`);
  }
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), normalSaved,
    'Sequence captures must preserve normal-scene storage');
  await page.goto(baseUrl.href, { waitUntil: 'load' }); await ready();
  assert.deepEqual(await page.evaluate(() => window.__pleosOptical.inspect().state), normalState,
    'Returning to normal route must preserve seeded normal state');
  report.checks.storage = { disposableContext: true, normalStatePreserved: true, actualDefaultOpticsPreserved: true };
  assert.deepEqual(report.errors, [], 'Browser emitted errors');
  assert(!report.warnings.some(message => /too many active WebGL contexts|unexpected context lost/i.test(message)),
    'GPU lifecycle warning detected');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: path.join(output, 'verification.json'),
    failure: report.failure, checks: report.checks, errors: report.errors, warnings: report.warnings }, null, 2));
}
