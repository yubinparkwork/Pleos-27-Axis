// Isolated QA origin: never writes the user's live studio state on port 5173.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const baseline = process.argv.includes('--baseline');
const capture4k = process.argv.includes('--4k');
const out = 'artifacts/dimension-quality';
await mkdir(out, { recursive: true });
const saved = await readFile('.pleos/pre-dimension-quality-state.json', 'utf8').then(s => JSON.parse(s).state.modeStates['dimention-r3f']).catch(() => null);
let server;
try { await fetch('http://127.0.0.1:41748/'); } catch {
  server = spawn('npm', ['run','dev','--','--port','41748','--strictPort'], {stdio:'ignore'});
  for (let tries = 0; tries < 100; tries++) {
    try { if ((await fetch('http://127.0.0.1:41748/')).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.addInitScript(state => {
    if (!state) return;
    if (localStorage.getItem('dimension-quality-initialized')) return;
    state.motion.playing = false; state.motion.time = 11.023;
    state.artboard.width = 720; state.artboard.height = 1020;
    localStorage.setItem('pleos-27-axis-studio-state-v3', JSON.stringify({version:1, updatedAt:new Date().toISOString(), state:{version:2, activeModeId:'dimention-r3f', modeStates:{'dimention-r3f':state}, shared:{artboard:state.artboard}}}));
    localStorage.setItem('dimension-quality-initialized','1');
  }, saved);
  await page.goto('http://127.0.0.1:41748/?renderer=studio');
  await page.waitForFunction(() => Boolean(window.__pleos27Axis));
  await page.evaluate(() => window.__pleos27Axis.switchMode('dimention-r3f'));
  await page.waitForFunction(() => window.__pleos27Axis?.inspect().ready);
  await page.waitForTimeout(2000);
  const capture = async name => {
    const data = await page.evaluate(() => window.__pleos27Axis.export({ renderer: 'raster', quality: 'custom', download: false }));
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    const png = PNG.sync.read(bytes);
    let nonBlack = 0;
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i] + png.data[i+1] + png.data[i+2] > 20 && png.data[i+3] > 0) nonBlack++;
    await writeFile(`${out}/${name}.png`, bytes);
    assert(nonBlack / (png.width * png.height) > .05, `Blank export ${name}: ${JSON.stringify(errors)}`);
    return { width: png.width, height: png.height, bytes: bytes.length, nonBlackFraction: nonBlack / (png.width * png.height) };
  };
  const result = { baseline, still: await capture(baseline ? 'before' : 'after') };
  if (!baseline) {
    result.contracts = await page.evaluate(async () => {
      const {sanitizeDimentionR3FState} = await import('/src/modes/dimention-r3f/DimentionR3FState.ts');
      const {planDimentionCapture} = await import('/src/modes/dimention-r3f/DimentionCapturePlan.ts');
      const migrated = sanitizeDimentionR3FState({mirror:{bounces:19}});
      const bounded = sanitizeDimentionR3FState({mirror:{bounces:7,cubeBounces:[-1,12.6,999]}});
      const plan = planDimentionCapture(3840,2160,2,16384);
      let rejectsUpscale = false;
      try {planDimentionCapture(5940,8410,2,16384);} catch {rejectsUpscale = true;}
      return {migrated:migrated.mirror.cubeBounces, bounded:bounded.mirror.cubeBounces, plan, rejectsUpscale};
    });
    assert.deepEqual(result.contracts.migrated,[19,19,19]);
    assert.deepEqual(result.contracts.bounded,[0,13,24]);
    assert(result.contracts.rejectsUpscale && result.contracts.plan.scale >= 1);
    for (const [label, value] of [['큐브 1 · 위', '3'], ['큐브 2 · 왼쪽 아래', '12'], ['큐브 3 · 오른쪽 아래', '24']]) {
      await page.getByLabel(`${label} 값`, { exact: true }).fill(value);
    }
    await page.getByLabel('큐브 1 · 위 값', { exact: true }).press('ArrowUp');
    assert.deepEqual(await page.evaluate(() => window.__pleos27Axis.inspect().mirror.cubeBounces), [4,12,24]);
    result.independent = await capture('independent-dimensions');
    result.shaderLayers = await page.evaluate(() => window.__pleos27Axis.inspect().dimensionUniforms);
    assert.deepEqual(result.shaderLayers.map(cube => cube.layers), [4,12,24], 'Each cube must receive its own shader layer count');
    await page.waitForTimeout(600);
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('pleos-27-axis-studio-state-v3')).state.modeStates['dimention-r3f']);
    assert.deepEqual(persisted.mirror.cubeBounces, [4,12,24]);
    await page.reload();
    await page.waitForFunction(() => window.__pleos27Axis?.inspect().ready);
    assert.deepEqual(await page.evaluate(() => window.__pleos27Axis.inspect().mirror.cubeBounces), [4,12,24]);
    result.persistence = 'pass';
    if (capture4k) {
      await page.evaluate(() => window.__pleos27Axis.modeApi('dimention-r3f').command('setArtboard', { width: 2160, height: 3840 }));
      result.still4k = await capture('native-4k');
      const videoUrl = await page.evaluate(() => window.__pleos27Axis.modeApi('dimention-r3f').command('exportVideo', { download: false, duration: .125, fps: 24, width: 2160, height: 3840 }));
      const video = await page.evaluate(async url => {
        const blob = await (await fetch(url)).blob();
        return await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
      }, videoUrl);
      await writeFile(`${out}/native-4k.mp4`, Buffer.from(video.split(',')[1], 'base64'));
      result.video4k = 'encoded';
    }
    await page.evaluate(() => window.__pleos27Axis.modeApi('dimention-r3f').command('setArtboard', {width:720,height:1020,transparent:true}));
    result.transparent = await capture('transparent');
    const transparent = PNG.sync.read(await readFile(`${out}/transparent.png`));
    assert(transparent.data.some((value,index) => index % 4 === 3 && value === 0), 'Transparent output needs empty alpha');
    await page.getByLabel('투명 배경', {exact:true}).uncheck();
    await page.getByLabel('그래픽 크기 값', {exact:true}).fill('.82');
    await page.getByLabel('카메라 줌 값', {exact:true}).fill('1');
    await page.getByLabel('모션 타임라인', {exact:true}).fill('0');
    result.assembly = await capture('full-assembly');
    await page.setViewportSize({ width: 900, height: 800 });
    await page.getByRole('heading', {name:'디멘션',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/panel-narrow.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `${out}/panel-wide.png` });
  }
  result.runtime = await page.evaluate(() => window.__pleos27Axis.inspect());
  result.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(`${out}/${baseline ? 'baseline' : 'validation'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, runtime: undefined }, null, 2));
} finally { await browser.close(); server?.kill('SIGTERM'); }
