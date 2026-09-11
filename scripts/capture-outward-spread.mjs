import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] || 'after';
const output = new URL('../artifacts/optical-layers/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(() => window.__pleosOptical.set({ playing: false, time: 0, zoom: .63, dimensionTop: 4, dimensionLeft: 4, dimensionRight: 4 }));
  for (const spacing of [.06, .14, .3]) {
    await page.evaluate(s => window.__pleosOptical.set({ dimensionSpacing: s }), spacing);
    const url = await page.evaluate(() => window.__pleosOptical.capture(720, 720, 16));
    await writeFile(new URL(`outward-${label}-${spacing}.png`, output), Buffer.from(url.split(',')[1], 'base64'));
  }
  await writeFile(new URL(`outward-${label}.json`, output), JSON.stringify({ errors, runtime: await page.evaluate(() => window.__pleosOptical.inspect()) }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
