import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 51768;
const url = `http://127.0.0.1:${port}/?look=hybrid-ab`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error('Isolated Vite server stopped');
    try { ready = (await fetch(url)).ok; } catch { /* Still starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Isolated Vite server did not start');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    const key = 'pleos-optical-studio-v1:hybrid-ab';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ playing: false, time: 2, gap: .025 }));
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  const state = () => page.evaluate(() => window.__pleosOptical.inspect().state);
  const undo = page.getByRole('button', { name: '설정 실행 취소' });
  const redo = page.getByRole('button', { name: '설정 다시 실행' });
  assert(await undo.isDisabled());
  await page.locator('[data-optical-section="geometry"] > summary').click();
  const gap = page.getByRole('spinbutton', { name: '큐브 간격', exact: true });
  await gap.fill('0.15');
  await gap.press('Tab');
  assert.equal((await state()).gap, .15);
  assert(await undo.isEnabled());
  await undo.click();
  assert.equal((await state()).gap, .025);
  assert(await redo.isEnabled());
  await redo.click();
  assert.equal((await state()).gap, .15);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal((await state()).gap, .025);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  assert.equal((await state()).gap, .15);
  // A new edit after undo invalidates redo; UI and persisted state agree.
  await undo.click();
  await gap.fill('0.1');
  await gap.press('Tab');
  assert.equal((await state()).gap, .1);
  assert(await redo.isDisabled());
  const gapSlider = page.getByRole('slider', { name: '큐브 간격 슬라이더' });
  const bounds = await gapSlider.boundingBox();
  assert(bounds);
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + bounds.width * .25, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .7, y, { steps: 8 });
  await page.mouse.up();
  const draggedGap = (await state()).gap;
  assert(draggedGap > .15, 'Slider drag did not adjust the gap');
  await undo.click();
  assert.equal((await state()).gap, .1, 'One undo should reverse the entire slider drag');
  await redo.click();
  assert.equal((await state()).gap, draggedGap);
  const canvas = page.locator('#optical-canvas');
  const artboard = await canvas.boundingBox();
  assert(artboard);
  const startAzimuth = (await state()).azimuth;
  await page.mouse.move(artboard.x + artboard.width / 2, artboard.y + artboard.height / 2);
  await page.mouse.down();
  await page.mouse.move(artboard.x + artboard.width / 2 + 35, artboard.y + artboard.height / 2, { steps: 6 });
  await page.mouse.up();
  assert((await state()).azimuth > startAzimuth + 5);
  await undo.click();
  assert.equal((await state()).azimuth, startAzimuth, 'One undo should reverse a camera drag');
  const startZoom = (await state()).zoom;
  await page.mouse.move(artboard.x + artboard.width / 2, artboard.y + artboard.height / 2);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(250);
  assert((await state()).zoom > startZoom);
  await undo.click();
  assert.equal((await state()).zoom, startZoom, 'One undo should reverse a wheel zoom burst');
  // Undo while an editor owns focus must also refresh the visible numeric value.
  await gap.fill('0.2');
  await gap.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal((await state()).gap, draggedGap);
  assert.equal(await gap.inputValue(), String(draggedGap));
  await page.locator('.optical-identity').click();
  assert.equal((await state()).gap, draggedGap, 'Blurring an undone numeric edit must not reapply it');
  await page.screenshot({ path: '/tmp/pleos-optical-undo-wide.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/pleos-optical-undo-narrow.png' });
  await page.reload();
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  assert.equal((await state()).gap, draggedGap);
  assert(await page.locator('[data-optical-action="undo"]').isDisabled(), 'History should be session-only; saved settings persist');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'pass', keyboard: true, redo: true, persistentSetting: true, errors }));
} finally {
  await browser?.close();
  server.kill();
}
