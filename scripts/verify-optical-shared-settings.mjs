import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const directory = await mkdtemp(path.join(tmpdir(), 'pleos-optical-sync-'));
const port = 51769;
const url = `http://127.0.0.1:${port}/?look=hybrid-ab`;
const key = 'pleos-optical-studio-v1:hybrid-ab';
const endpoint = `http://127.0.0.1:${port}/__pleos/optical-state?key=${encodeURIComponent(key)}`;
const filename = path.join(directory, 'optical-state', `${encodeURIComponent(key)}.json`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: 'ignore', env: { ...process.env, PLEOS_OPTICAL_STATE_TEST_DIR: directory },
});
let browser;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${description}`);
}
try {
  await until(async () => { try { return (await fetch(url)).ok; } catch { return false; } }, 'isolated Vite startup');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu'] });
  const chrome = await browser.newContext();
  const inApp = await browser.newContext();
  const chromePage = await chrome.newPage();
  const inAppPage = await inApp.newPage();
  const errors = [];
  for (const page of [chromePage, inAppPage]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  }
  await chromePage.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ playing: false, gap: .123, lightColor: '#FA293C' }));
  }, key);
  // An empty second browser must not seed defaults over an existing Chrome save.
  await inAppPage.goto(url);
  await inAppPage.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  assert.equal((await fetch(endpoint)).status, 204);
  await chromePage.goto(url);
  await chromePage.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  await until(async () => (await fetch(endpoint)).status === 200, 'Chrome save migration');
  let stored = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(stored.state.gap, .123);
  assert.equal(stored.state.lightColor, '#FA293C');
  await inAppPage.reload();
  await inAppPage.waitForFunction(() => window.__pleosOptical?.inspect().state.gap === .123);
  assert.equal((await inAppPage.evaluate(() => window.__pleosOptical.inspect().state)).lightColor, '#FA293C');
  await chromePage.evaluate(() => window.__pleosOptical.set({ gap: .245 }));
  await until(async () => JSON.parse(await readFile(filename, 'utf8')).state.gap === .245, 'Chrome live edit');
  // The idle in-app tab keeps its old local state, but must not write it back.
  await wait(300);
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).state.gap, .245);
  await inAppPage.reload();
  await inAppPage.waitForFunction(() => window.__pleosOptical?.inspect().state.gap === .245);
  await inAppPage.evaluate(() => window.__pleosOptical.set({ lightColor: '#2350FF' }));
  await until(async () => JSON.parse(await readFile(filename, 'utf8')).state.lightColor === '#2350FF', 'in-app live edit');
  await chromePage.reload();
  await chromePage.waitForFunction(() => window.__pleosOptical?.inspect().state.lightColor === '#2350FF');
  stored = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(stored.state.gap, .245);
  assert.equal(stored.state.lightColor, '#2350FF');
  // A locally preserved historical build uses a prefixed localStorage wrapper.
  // Its shared version menu must bridge that wrapper without modifying the build.
  const archiveId = 'saved-20260926035641749';
  const archivePath = path.join(root, 'public', 'versions', `${archiveId}-compatible`, 'index.html');
  let archiveSync = 'not-installed';
  if (await access(archivePath).then(() => true).catch(() => false)) {
    const archiveUrl = `http://127.0.0.1:${port}/versions/${archiveId}-compatible/index.html?look=hybrid-ab`;
    const archiveKey = `pleos-optical-studio-v1:archive:${archiveId}:hybrid-ab`;
    const archiveFile = path.join(directory, 'optical-state', `${encodeURIComponent(archiveKey)}.json`);
    const archivedChrome = await chrome.newPage();
    const archivedInApp = await inApp.newPage();
    for (const page of [archivedChrome, archivedInApp]) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
    }
    await archivedChrome.addInitScript(id => {
      const key = `${id}:pleos-optical-studio-v1:hybrid-ab`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ playing: false, gap: .314, lightColor: '#0ADC91' }));
    }, archiveId);
    await archivedInApp.goto(archiveUrl);
    await archivedInApp.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
    assert.equal((await fetch(`http://127.0.0.1:${port}/__pleos/optical-state?key=${encodeURIComponent(archiveKey)}`)).status, 204);
    await archivedChrome.goto(archiveUrl);
    await archivedChrome.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
    await until(async () => readFile(archiveFile, 'utf8').then(text => JSON.parse(text).state.gap === .314).catch(() => false), 'archived Chrome migration');
    await archivedInApp.reload();
    await archivedInApp.waitForFunction(() => window.__pleosOptical?.inspect().state.gap === .314);
    await archivedInApp.evaluate(() => window.__pleosOptical.set({ gap: .321 }));
    await until(async () => JSON.parse(await readFile(archiveFile, 'utf8')).state.gap === .321, 'archived in-app edit');
    await archivedChrome.reload();
    await archivedChrome.waitForFunction(() => window.__pleosOptical?.inspect().state.gap === .321);
    const archiveUndo = archivedChrome.getByRole('button', { name: '설정 되돌리기' });
    assert(await archiveUndo.isDisabled());
    await archivedChrome.locator('[data-optical-section="geometry"] > summary').click();
    const archiveGap = archivedChrome.getByRole('spinbutton', { name: '큐브 간격', exact: true });
    await archiveGap.fill('0.35');
    assert.equal((await archivedChrome.evaluate(() => window.__pleosOptical.inspect().state)).gap, .35);
    assert(await archiveUndo.isEnabled());
    await archiveGap.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.equal((await archivedChrome.evaluate(() => window.__pleosOptical.inspect().state)).gap, .321);
    assert.equal(Number(await archiveGap.inputValue()), .321);
    await archiveGap.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    assert.equal((await archivedChrome.evaluate(() => window.__pleosOptical.inspect().state)).gap, .35);
    const archiveSlider = archivedChrome.getByRole('slider', { name: '큐브 간격 슬라이더' });
    const sliderBounds = await archiveSlider.boundingBox();
    assert(sliderBounds);
    await archivedChrome.mouse.move(sliderBounds.x + sliderBounds.width * .25, sliderBounds.y + sliderBounds.height / 2);
    await archivedChrome.mouse.down();
    await archivedChrome.mouse.move(sliderBounds.x + sliderBounds.width * .65, sliderBounds.y + sliderBounds.height / 2, { steps: 8 });
    await archivedChrome.mouse.up();
    assert.notEqual((await archivedChrome.evaluate(() => window.__pleosOptical.inspect().state)).gap, .35);
    await archiveSlider.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.equal((await archivedChrome.evaluate(() => window.__pleosOptical.inspect().state)).gap, .35,
      'A slider drag must be undone as one setting edit');
    await archivedChrome.setViewportSize({ width: 390, height: 844 });
    const inspectorBounds = await archivedChrome.locator('#optical-inspector').boundingBox();
    const undoBounds = await archiveUndo.boundingBox();
    assert(inspectorBounds && undoBounds && undoBounds.x >= inspectorBounds.x
      && undoBounds.x + undoBounds.width <= inspectorBounds.x + inspectorBounds.width,
    'Archive undo must remain inside the narrow inspector');
    archiveSync = 'pass';
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'pass', separateBrowserProfiles: true, migration: true, twoWayRestore: true, archiveSync, file: filename, errors }));
} finally {
  await browser?.close();
  server.kill();
}
