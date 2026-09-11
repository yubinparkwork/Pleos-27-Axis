import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../artifacts/optical-layers/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const captures = [];
try {
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(process.env.PLEOS_OPTICAL_URL || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
  await page.evaluate(async () => {
    const { LUMINOUS_REFERENCE } = await import('/src/optical-studio/LuminousReference.ts');
    window.__pleosOptical.set({ ...LUMINOUS_REFERENCE, playing: false, time: 0 });
  });
  const baseline = await page.evaluate(() => window.__pleosOptical.inspect().state);
  const variants = process.env.PLEOS_4K ? { 'layers-4k': { zoom: .65, aspect: '4x5' } } : {
    'layers-overview': {}, 'layers-close': { zoom: 1.2 },
    'layers-zero': { dimensionTop: 0, dimensionLeft: 0, dimensionRight: 0 },
    'layers-eight': { dimensionTop: 8, dimensionLeft: 8, dimensionRight: 8 },
    'layers-red': { lightColor: '#FFCDD7' },
  };
  for (const [name, patch] of Object.entries(variants)) {
    await page.evaluate(state => window.__pleosOptical.set(state), { ...baseline, ...patch });
    const width = process.env.PLEOS_4K ? 3072 : 720, height = process.env.PLEOS_4K ? 3840 : 720;
    const start = performance.now();
    const url = await page.evaluate(async ({ width, height }) => window.__pleosOptical.capture(width, height, 16), { width, height });
    await writeFile(new URL(`${name}.png`, output), Buffer.from(url.split(',')[1], 'base64'));
    const wallMs = Math.round(performance.now() - start);
    captures.push({ name, width, height, samples: 16, wallMs, patch }); console.log(name, wallMs);
  }
  await writeFile(new URL(process.env.PLEOS_4K ? 'capture-4k.json' : 'capture.json', output), JSON.stringify({ baseline, captures, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
