// Isolated UI/browser regression for named artboards that carry full settings.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/optical-variations');
const base = 'http://127.0.0.1:51765/?look=hybrid-ab';
const errors = [];
let server, browser;

try {
  await mkdir(output, { recursive: true });
  const sharedDirectory = await mkdtemp(path.join(tmpdir(), 'pleos-variation-qa-'));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '51765', '--strictPort'],
    { cwd: root, stdio: 'ignore', env: { ...process.env, PLEOS_OPTICAL_STATE_TEST_DIR: sharedDirectory } });
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(base)).ok) break; } catch { /* Wait for Vite. */ }
    if (Date.now() > deadline || server.exitCode !== null) throw Error('QA server unavailable');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  const read = () => page.evaluate(() => window.__pleosOptical.inspect().state);
  const set = patch => page.evaluate(value => window.__pleosOptical.set(value), patch);
  const aspect = page.locator('[data-optical-aspect]');
  await page.locator('[data-optical-section="camera"]').evaluate(node => { node.open = true; });
  await set({ playing: false, aspect: '4x5', zoom: 1.7, panX: -6, lightIntensity: 1.15, dimensionTop: 8, lightColor: '#FA293C', videoSamples: 16 });
  await page.locator('[data-optical-action="save-camera"]').click();
  const original = await read();
  await page.locator('[data-optical-variation-name]').fill('포스터 · 레드 컷');
  await page.locator('[data-optical-action="save-variation"]').click();
  const first = (await read()).variations[0];
  assert.equal(first.settings.aspect, '4x5');
  assert.equal(first.settings.zoom, 1.7);
  assert.equal(first.settings.lightIntensity, 1.15);
  assert.equal(first.settings.dimensionTop, 8);
  assert.equal(first.settings.lightColor, '#FA293C');
  assert.equal(first.settings.videoSamples, 16);
  assert.equal(first.settings.cameraProfiles, undefined, 'A variation must not recursively store other artboard profiles');

  await aspect.selectOption('16x9');
  await set({ zoom: 2.3, panX: 10, lightIntensity: 0.6, dimensionTop: 3, lightColor: '#2350FF' });
  await page.locator('[data-optical-action="save-camera"]').click();
  await page.locator('[data-optical-variation]').selectOption(first.id);
  await page.locator('[data-optical-action="load-variation"]').click();
  const restored = await read();
  assert.equal(restored.aspect, '4x5');
  assert.equal(restored.zoom, 1.7);
  assert.equal(restored.panX, -6);
  assert.equal(restored.lightIntensity, 1.15);
  assert.equal(restored.dimensionTop, 8);
  assert.equal(restored.lightColor, '#FA293C');
  assert.equal(restored.videoSamples, 16);
  assert.equal(restored.cameraProfiles['16x9'].zoom, 2.3, 'Loading a snapshot erased a newer format camera');
  assert.equal(restored.cameraProfiles['4x5'].zoom, original.cameraProfiles['4x5'].zoom);

  await aspect.selectOption('custom');
  await page.locator('[data-optical-custom-width]').fill('21');
  await page.locator('[data-optical-custom-width]').dispatchEvent('change');
  await page.locator('[data-optical-custom-height]').fill('9');
  await page.locator('[data-optical-custom-height]').dispatchEvent('change');
  await set({ zoom: 3.1, lightColor: '#0ADC91' });
  await page.locator('[data-optical-variation-name]').fill('Hall D · 21:9');
  await page.locator('[data-optical-action="save-variation"]').click();
  const custom = (await read()).variations[1];
  assert.equal(custom.settings.aspect, 'custom');
  assert.equal(custom.settings.customAspectWidth, 21);
  assert.equal(custom.settings.customAspectHeight, 9);
  assert.equal(await page.locator('[data-optical-viewport-aspect]').textContent(), '21:9');
  assert.equal(await page.locator('[data-optical-resolution]').textContent(), '3840 × 1646 px');
  await set({ customAspectWidth: 10000, customAspectHeight: 1 });
  assert.equal((await read()).customAspectWidth, 20, 'An unsupported custom ratio must not be mislabeled');
  await page.locator('[data-optical-variation]').selectOption(custom.id);
  await page.locator('[data-optical-action="load-variation"]').click();
  assert.equal((await read()).customAspectWidth, 21);
  await page.waitForFunction(async () => {
    const response = await fetch('/__pleos/optical-state?key=pleos-optical-studio-v1%3Ahybrid-ab', { cache: 'no-store' });
    // 204 is expected while the debounced first save is still pending.
    return response.status === 200 && (await response.json()).state?.variations?.length === 2;
  });
  const secondBrowser = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  await secondBrowser.goto(base);
  await secondBrowser.waitForFunction(() => window.__pleosOptical?.inspect().state?.variations?.length === 2);
  assert.equal((await secondBrowser.evaluate(() => window.__pleosOptical.inspect().state)).variations[1].name,
    'Hall D · 21:9', 'Named artboards were not shared to a second browser profile');
  await secondBrowser.close();
  await page.screenshot({ path: path.join(output, 'wide.png') });

  await page.reload();
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.equal((await read()).variations.length, 2, 'Named variations did not survive reload');
  await page.locator('[data-optical-variation]').selectOption(first.id);
  await page.locator('[data-optical-action="load-variation"]').click();
  assert.equal((await read()).lightColor, '#FA293C');
  await set({ dimensionTop: 11 });
  await page.locator('[data-optical-variation]').selectOption(first.id);
  await page.locator('[data-optical-action="update-variation"]').click();
  assert.equal((await read()).variations[0].settings.dimensionTop, 11);
  await page.locator('[data-optical-variation]').selectOption(custom.id);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-optical-action="delete-variation"]').click();
  assert.equal((await read()).variations.length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  const inspector = page.locator('[data-optical-action="inspector"]');
  if ((await inspector.getAttribute('aria-expanded')) === 'false') await inspector.click();
  await page.locator('[data-optical-section="variations"]').evaluate(node => { node.open = true; });
  await page.screenshot({ path: path.join(output, 'narrow.png') });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow panel overflows');
  assert.equal(errors.length, 0, errors.join('\n'));
  const report = { status: 'pass', checks: ['full-scene snapshot', 'legacy camera inheritance', 'other format preservation', 'custom ratio', 'second browser profile', 'reload', 'update', 'delete', 'wide/narrow UI'], errors };
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}
