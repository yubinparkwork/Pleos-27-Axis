// Isolated visual QA for the shared Axis intersection. Never writes the live
// browser's localStorage or the repository's shared-settings endpoint.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'artifacts/axis-edge-diagnosis/render.png'));
const scenePatch = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const samples = Number(process.argv[4] ?? 16);
const width = Number(process.argv[5] ?? 1920);
const height = Number(process.argv[6] ?? 1080);
const savedPath = path.join(root, '.pleos/optical-state/pleos-optical-studio-v1%3Ahybrid-ab.json');
const saved = await readFile(savedPath, 'utf8').then(text => JSON.parse(text).state).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const url = 'http://127.0.0.1:51762/?look=hybrid-ab';
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '51762', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch { /* server is starting */ }
    if (server.exitCode !== null || attempt === 149) throw new Error('Isolated Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__pleos/optical-state?**', route => route.fulfill({ status: 204 }));
  if (saved) await page.addInitScript(state => localStorage.setItem('pleos-optical-studio-v1:hybrid-ab', JSON.stringify(state)), saved);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  const result = await page.evaluate(async patch => {
    const { __samples, __width, __height, ...scene } = patch;
    window.__pleosOptical.set({ aspect: '16x9', playing: false, time: 8.41, ...scene });
    const state = window.__pleosOptical.inspect().state;
    const png = await window.__pleosOptical.capture(__width, __height, __samples);
    return { state, png };
  }, { ...scenePatch, __samples: samples, __width: width, __height: height });
  if (errors.length) throw new Error(errors.join('\n'));
  const bytes = Buffer.from(result.png.slice(result.png.indexOf(',') + 1), 'base64');
  const decoded = PNG.sync.read(bytes);
  if (decoded.width !== width || decoded.height !== height) throw new Error('Unexpected dimensions');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  console.log(JSON.stringify({ status: 'pass', output, width: decoded.width, height: decoded.height, samples, camera: {
    zoom: result.state.zoom, panX: result.state.panX, azimuth: result.state.azimuth, elevation: result.state.elevation,
  }, errors }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
