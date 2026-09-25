// Visual QA only. Uses a disposable Chrome context and the sequence route's
// actual seeded scene; no user's browser settings or live tabs are accessed.
// Usage: node scripts/capture-identity-transition.mjs [--video]
// PLEOS_OPTICAL_URL may override the running local Vite server on port 5173.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const options = process.argv.slice(2);
if (options.some(option => option !== '--video')) throw new Error('Usage: node scripts/capture-identity-transition.mjs [--video]');
const renderVideo = options.includes('--video');
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'identity-transition');
const url = new URL(process.env.PLEOS_OPTICAL_URL ?? 'http://127.0.0.1:5173/');
url.searchParams.delete('renderer');
url.searchParams.set('sequence', 'pleos25');
const timing = { identityHold: 5.3, identityDissolve: 3, duration: 15 };
const milestoneTimes = [2.5, 5.2, 6.3, 7.3, 8.3, 11];
const report = { status: 'running', url: url.href, captures: [], errors: [], warnings: [], video: null };
let browser, context, page, framesDirectory;
await mkdir(output, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12_000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}

async function capture(time, width, height) {
  const data = await page.evaluate(async ({ time, width, height }) => {
    window.__pleosOptical.seek(time);
    return window.__pleosOptical.capture(width, height, 1);
  }, { time, width, height });
  assert(data.startsWith('data:image/png;base64,'), `Capture at ${time}s must be PNG`);
  return Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
}

try {
  const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  if (renderVideo) await run(ffmpeg, ['-version']);
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  await page.evaluate(() => window.__pleosOptical.pause());
  report.seededRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
  await page.evaluate(timing => window.__pleosOptical.set({ ...timing, identityTransition: 1,
    playing: false, time: 0, aspect: '16x9' }), timing);
  report.captureRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
  const changedKeys = new Set(['identityTransition', 'identityHold', 'identityDissolve', 'duration', 'time', 'playing', 'aspect']);
  for (const [key, value] of Object.entries(report.seededRuntime.state)) if (!changedKeys.has(key)) {
    assert.deepEqual(report.captureRuntime.state[key], value, `Visual QA must preserve seeded optical setting ${key}`);
  }

  for (const time of milestoneTimes) {
    const filename = `milestone-${time.toFixed(1).replace('.', 'p')}s.png`;
    const bytes = await capture(time, 720, 405);
    await writeFile(path.join(output, filename), bytes);
    report.captures.push({ file: filename, time, width: 720, height: 405, samples: 1, bytes: bytes.length });
    console.log(`Captured ${time.toFixed(1)}s → ${filename}`);
  }

  if (renderVideo) {
    const width = 480, height = 270, fps = 10, duration = timing.duration;
    const totalFrames = fps * duration;
    framesDirectory = await mkdtemp(path.join(output, '.identity-frames-'));
    for (let frame = 0; frame < totalFrames; frame++) {
      const filename = `frame-${String(frame).padStart(6, '0')}.png`;
      await writeFile(path.join(framesDirectory, filename), await capture(frame / fps, width, height));
      if ((frame + 1) % fps === 0 || frame + 1 === totalFrames) console.log(`Video frames ${frame + 1}/${totalFrames}`);
    }
    const temporaryVideo = path.join(framesDirectory, 'transition-preview.mp4');
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
      '-framerate', String(fps), '-start_number', '0', '-i', path.join(framesDirectory, 'frame-%06d.png'),
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', temporaryVideo]);
    const bytes = (await stat(temporaryVideo)).size;
    assert(bytes > 0, 'Encoded transition preview must not be empty');
    const finalVideo = path.join(output, 'transition-preview.mp4');
    await rename(temporaryVideo, finalVideo);
    report.video = { file: 'transition-preview.mp4', width, height, fps, duration,
      frames: totalFrames, samples: 1, videoCodec: 'H.264', audioCodec: 'AAC', audio: 'silence', bytes };
    console.log(`Encoded ${report.video.file}`);
  }

  assert.deepEqual(report.errors, [], 'Visual capture emitted browser errors');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  // This exact directory was created above for this run; it contains only
  // disposable frames and the encoder's temporary output, never user files.
  if (framesDirectory) {
    await rm(framesDirectory, { recursive: true, force: true });
    report.temporaryFramesRemoved = true;
  }
  await writeFile(path.join(output, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
