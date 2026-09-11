import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

// A separate browser context: never overwrite the user's live saved settings.
const output = new URL('../artifacts/optical-macro/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
await page.route('**/favicon.ico', r => r.fulfill({ status: 204 }));
try {
  await page.goto(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(() => window.__pleosOptical.set({ playing: false, gap: 0, bevel: .08, ior: 1.91, zoom: 8, time: 3 }));
  const camera = page.locator('[data-optical-section="camera"]');
  if (await camera.getAttribute('open') === null) await camera.locator('summary').click();
  const input = page.locator('[data-optical-number="zoom"]');
  assert.equal(await input.getAttribute('max'), '24');
  await input.fill('12'); await input.press('Tab');
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.zoom), 12);
  await input.focus(); await input.press('ArrowUp');
  assert.equal(Number(await input.inputValue()), 12.01);
  await input.press('Tab');
  const canvas = page.locator('#optical-canvas');
  await canvas.hover(); await page.mouse.wheel(0, -100);
  const zoom = await page.evaluate(() => window.__pleosOptical.inspect().state.zoom);
  assert.ok(zoom > 12.01 && zoom <= 24);
  await page.reload(); await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().state.zoom), zoom);

  const results = {};
  for (const zoom of [4, 12, 24]) {
    await page.evaluate(z => window.__pleosOptical.set({ zoom: z, playing: false }), zoom);
    const captures = await page.evaluate(async () => {
      const { OpticalRenderer } = await import('/src/optical-studio/OpticalRenderer.ts');
      const canvas = document.createElement('canvas');
      const renderer = new OpticalRenderer(canvas);
      const state = window.__pleosOptical.inspect().state;
      try {
        renderer.draw(state, 480, 480);
        const single = canvas.toDataURL();
        renderer.draw(state, 480, 480, 480, 480, 0, 0, 2);
        const supersampled = canvas.toDataURL();
        const reference = await renderer.capture(state, 480, 480, 16);
        return { single, supersampled, reference };
      } finally { renderer.dispose(); }
    });
    const images = {};
    for (const [name, data] of Object.entries(captures)) {
      const bytes = Buffer.from(data.split(',')[1], 'base64');
      images[name] = PNG.sync.read(bytes);
      await writeFile(new URL(`zoom-${zoom}-${name}.png`, output), bytes);
    }
    const rmse = (a, b) => {
      let error = 0;
      for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) error += (a.data[i] - b.data[i]) ** 2;
      return Math.sqrt(error / (a.width * a.height * 3));
    };
    const before = rmse(images.single, images.reference), after = rmse(images.supersampled, images.reference);
    assert.ok(after < before, `Zoom ${zoom}: spatial supersampling must approach 16-sample reference (${before} -> ${after})`);
    results[zoom] = { singleSampleRMSE: before, macroSupersamplingRMSE: after, comparison: '16-subpixel reference at identical state; not a physical ground-truth claim' };
  }
  await page.evaluate(() => window.__pleosOptical.set({ zoom: 12, playing: false }));
  await page.waitForFunction(() => window.__pleosOptical.inspect().preview.sampleScale === 2);
  if (await camera.getAttribute('open') === null) await camera.locator('summary').click();
  await page.screenshot({ path: fileURLToPath(new URL('macro-ui.png', output)) });
  await page.setViewportSize({ width: 390, height: 844 });
  const panelButton = page.locator('[data-optical-action="inspector"]');
  if (await panelButton.getAttribute('aria-expanded') !== 'true') await panelButton.click();
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL('macro-narrow.png', output)) });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  const report = { status: 'pass', zoomRange: [.4, 24], keyboard: 'pass', wheel: 'pass', persistence: 'pass', results, errors };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
