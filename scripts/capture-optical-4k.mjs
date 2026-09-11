import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../artifacts/optical-rebuild/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
try {
  await page.goto(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(zoom => { window.__pleosOptical.reset(); window.__pleosOptical.set({ time: 3, playing: false, aspect: '9x16', ...(zoom ? { zoom } : {}) }); }, Number(process.env.PLEOS_OPTICAL_ZOOM) || undefined);
  const before = await page.evaluate(() => window.__pleosOptical.inspect());
  const start = performance.now();
  const data = await page.evaluate(() => window.__pleosOptical.capture(2160, 3840, 16));
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  const png = PNG.sync.read(buffer);
  if (png.width !== 2160 || png.height !== 3840) throw new Error('Native 4K dimensions changed');
  await writeFile(new URL('optical-native-4k.png', directory), buffer);
  const after = await page.evaluate(() => window.__pleosOptical.inspect());
  if (JSON.stringify(before.state) !== JSON.stringify(after.state)) throw new Error('Capture mutated optical state');
  await page.screenshot({ path: fileURLToPath(new URL('optical-ui-4k.png', directory)) });
  await page.evaluate(() => window.__pleosOptical.set({ aspect: 'main', zoom: 1.65 }));
  const hero = await page.evaluate(() => window.__pleosOptical.capture(1200, 1200, 16));
  await writeFile(new URL('optical-hero.png', directory), Buffer.from(hero.split(',')[1], 'base64'));
  const report = { generatedAt: new Date().toISOString(), width: png.width, height: png.height, samples: 16, upscaled: false, durationMs: Math.round(performance.now() - start), statePreserved: true, before, errors };
  await writeFile(new URL('native-4k-report.json', directory), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
