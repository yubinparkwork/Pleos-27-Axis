// Verify the immutable layered snapshot and its return route in a disposable
// browser, including the unchanged predecessor's state and rendered frame.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'identity-layer-stagger');
const base = new URL(process.env.PLEOS_VERSION_URL ?? 'http://127.0.0.1:5173/');
base.search = ''; base.hash = '';
const catalog = await (await fetch(new URL('version-catalog.json', base))).json();
const latest = catalog.find(version => version.id === 'saved-20260915071046349');
const previous = catalog.find(version => version.id === 'saved-20260915065311136');
assert(latest && previous, 'Both immutable versions must be in the catalog');
assert.equal(latest.sequence, 'pleos25'); assert.equal(latest.transition, 'layered');
assert.equal(previous.sequence, 'pleos25'); assert.equal(previous.transition, undefined);
const currentUrl = new URL('?sequence=pleos25&transition=layered', base);
const report = { status: 'running', latest, previous, checks: {}, routes: [], errors: [], badAssets: [] };
let browser, context, page;
await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage(); page.setDefaultTimeout(45_000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    if (/\.(css|js)(\?|$)/.test(response.url()) &&
      (response.status() >= 400 || /text\/html/.test(response.headers()['content-type'] ?? ''))) report.badAssets.push(response.url());
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  const ready = async () => {
    await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
    await page.waitForFunction(() => [...document.querySelectorAll('aside')].some(element => {
      const select = element.shadowRoot?.querySelector('select'); return select && !select.disabled;
    }));
    await page.evaluate(() => window.__pleosOptical.pause());
  };
  const select = page.getByRole('combobox', { name: '날짜별 사이트 버전' });
  const state = () => page.evaluate(() => window.__pleosOptical.inspect().state);
  const visit = async version => {
    const destination = new URL(version ? `versions/${version.routeId ?? version.id}/index.html` : '', base);
    const current = new URL(page.url());
    if (version?.sequence === 'pleos25' || (!version && current.searchParams.get('sequence') === 'pleos25')) destination.searchParams.set('sequence', 'pleos25');
    if (version?.transition === 'layered' || (!version && current.searchParams.get('transition') === 'layered')) destination.searchParams.set('transition', 'layered');
    await select.selectOption(version?.id ?? ''); await page.waitForURL(destination.href); await ready();
    assert.equal(await select.inputValue(), version?.id ?? '');
    report.routes.push({ version: version?.id ?? 'current', url: page.url() });
  };
  const capture = async filename => {
    const url = await page.evaluate(async () => {
      window.__pleosOptical.seek(6.5); return window.__pleosOptical.capture(320, 400, 1);
    });
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    await writeFile(path.join(output, filename), bytes);
    return createHash('sha256').update(PNG.sync.read(bytes).data).digest('hex');
  };
  await page.goto(currentUrl.href); await ready();
  assert.equal((await state()).identityLayerStagger, 1);
  await page.evaluate(() => window.__pleosOptical.set({ identityLayerStagger: 1.45, playing: false }));
  await visit(latest);
  const latestDefault = await state();
  assert.equal(new URL(page.url()).search, '?sequence=pleos25&transition=layered');
  assert.equal(latestDefault.identityLayerStagger, 1, 'New immutable version defaults to 1 second');
  assert.equal(latestDefault.identityEngraving, 0);
  assert.equal(await page.locator('[data-optical-number="identityLayerStagger"]').inputValue(), '1');
  await page.evaluate(() => window.__pleosOptical.set({ identityLayerStagger: 2.1, playing: false, time: 7.2 }));
  await page.screenshot({ path: path.join(output, 'snapshot-menu-latest.png') });
  await visit(null);
  assert.equal(page.url(), currentUrl.href);
  assert.equal((await state()).identityLayerStagger, 1.45, 'Returning from layered snapshot retains current layered settings');
  await visit(previous);
  assert.equal(new URL(page.url()).search, '?sequence=pleos25', 'Predecessor must retain its original sequence-only query');
  assert.equal(await page.locator('[data-optical-number="identityLayerStagger"]').count(), 0);
  const beforeHash = await capture('snapshot-predecessor-before.png');
  const before = await state();
  assert.equal(before.identityLayerStagger, undefined);
  await visit(latest);
  assert.equal((await state()).identityLayerStagger, 2.1, 'Immutable snapshot has independent persistent edits');
  await visit(null);
  assert.equal(page.url(), currentUrl.href); assert.equal((await state()).identityLayerStagger, 1.45);
  await visit(previous);
  const afterHash = await capture('snapshot-predecessor-after.png');
  assert.equal(afterHash, beforeHash, 'Predecessor pixels must remain unchanged after layered round trips');
  assert.deepEqual(await state(), before, 'Predecessor settings must remain unchanged');
  report.checks = { newSnapshotDefaultSeconds: 1, newSnapshotPreEngraving: true,
    currentLayeredSeconds: 1.45, snapshotEditedSeconds: 2.1, independentPersistence: true,
    returnCurrentPreservesLayeredQuery: true, predecessorSequenceOnly: true,
    predecessorHasNoStaggerControl: true, predecessorStatePreserved: true,
    predecessorFrame: { seconds: 6.5, width: 320, height: 400, sha256: beforeHash, unchanged: true } };
  assert.deepEqual(report.errors, []); assert.deepEqual(report.badAssets, []);
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  await writeFile(path.join(output, 'menu-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
