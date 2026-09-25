// Compare the immutable closed-dimension checkpoint with the open expression.
// Isolated browser storage only; never modifies the user's live settings.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = 'http://127.0.0.1:5173/';
const dir = new URL('../artifacts/open-dimensions/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({channel: 'chrome', args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]});
const errors = [];
const patch = { zoom: .65, azimuth: 45, elevation: 35.264389682754654,
  panX: 0, gap: .08, bevel: .24, playing: false, time: 0, lightCycle: false,
  lightColor: '#FFFFFF', lightIntensity: 1, exposure: 1, bloom: 0,
  dimensionTop: 4, dimensionLeft: 4, dimensionRight: 4,
  dimensionSpacingTop: .14, dimensionSpacingLeft: .14, dimensionSpacingRight: .14 };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  async function capture(name, route, extra = {}) {
    await page.goto(root + route);
    await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
    const url = await page.evaluate(async state => {
      window.__pleosOptical.set(state);
      return window.__pleosOptical.capture(720, 720, 4);
    }, {...patch, ...extra});
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    await writeFile(new URL(name + '.png', dir), bytes);
    return PNG.sync.read(bytes);
  }
  const before = await capture('closed', 'versions/saved-20260914093551440/index.html');
  const after = await capture('open', '');
  let exteriorLightPixels = 0, centralDifference = 0, centralPixels = 0;
  for(let y = 0; y < 720; y++) for(let x = 0; x < 720; x++) {
    const i = (y * 720 + x) * 4;
    const r = Math.hypot(x - 359.5, y - 359.5) / 720;
    const a = Math.max(...before.data.subarray(i,i+3));
    const b = Math.max(...after.data.subarray(i,i+3));
    if(r > .38 && a < 3 && b > 15) exteriorLightPixels++;
    if(r < .07) { centralDifference += Math.abs(a-b); centralPixels++; }
  }
  assert.ok(exteriorLightPixels > 100, 'No dimension light extends beyond the closed cube region');
  const dark = await capture('layers-off', '', {dimensionTop: 0, dimensionLeft: 0, dimensionRight: 0});
  assert.ok(dark.data.every((v,i) => i % 4 === 3 || v === 0), 'Open carrier has unwanted surface illumination');
  assert.deepEqual(errors, []);
  const report = {status: 'pass', exteriorLightPixels, centralMeanMaxChannelDifference: centralDifference/centralPixels,
    note: 'Central difference reported, not asserted pixel-identical: open carrier normals and secondary visibility intentionally differ.', errors};
  await writeFile(new URL('verification.json',dir),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
