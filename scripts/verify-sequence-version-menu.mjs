import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const base = new URL(process.env.PLEOS_VERSION_URL ?? 'http://127.0.0.1:5173/');
base.search = ''; base.hash = '';
const catalog = await (await fetch(new URL('version-catalog.json', base))).json();
const versions = catalog.filter(version => version.sequence === 'pleos25').slice(0, 2);
assert.equal(versions.length, 2, 'Two separate Pleos25 sequence versions must be in the menu');
assert.notEqual(versions[0].id, versions[1].id);
assert.notEqual(versions[0].label, versions[1].label);
const legacy = catalog.find(version => !version.sequence);
assert(legacy, 'An ordinary archive is required to check legacy routing');
const output = 'artifacts/sequence-version-menu';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const errors = [], badAssets = [];
try {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/\.(css|js)(\?|$)/.test(response.url()) && (response.status() >= 400 || /text\/html/.test(response.headers()['content-type'] ?? ''))) badAssets.push(response.url());
  });
  const select = page.getByRole('combobox', { name: '날짜별 사이트 버전' });
  const ready = async () => {
    await page.waitForFunction(() => window.__pleosOptical?.inspect().ready);
    await page.waitForFunction(() => [...document.querySelectorAll('aside')].some(element => {
      const select = element.shadowRoot?.querySelector('select'); return select && !select.disabled;
    }));
  };
  const state = () => page.evaluate(() => window.__pleosOptical.inspect().state);
  const visit = async version => {
    const destination = new URL(version ? `versions/${version.routeId ?? version.id}/index.html` : '', base);
    if (version?.sequence === 'pleos25' || (!version && new URL(page.url()).searchParams.get('sequence') === 'pleos25')) destination.searchParams.set('sequence', 'pleos25');
    await select.selectOption(version?.id ?? '');
    await page.waitForURL(destination.href); await ready();
    assert.equal(await select.inputValue(), version?.id ?? '');
    assert.equal(await select.locator('option:checked').textContent(), version?.label ?? '현재 작업본');
    if (version?.sequence === 'pleos25') assert.equal((await state()).identityTransition, 1);
  };
  await page.goto(base.href); await ready();
  await page.evaluate(() => window.__pleosOptical.set({ gap: .09, playing: false, time: 0 }));
  const normal = await state();
  const named = JSON.stringify([{ id: 'menu-qa', name: '긴 한글 이름 · Pleos25 저장 설정', state: { gap: .21, playing: false } }]);
  await page.evaluate(value => localStorage.setItem('pleos-named-settings-v1', value), named);
  const currentSequence = new URL(base); currentSequence.searchParams.set('sequence', 'pleos25');
  await page.goto(currentSequence.href); await ready();
  await page.evaluate(() => window.__pleosOptical.set({ gap: .19, playing: false, time: 0 }));
  const current = await state();
  await page.goto(new URL('?unrelated=discard#discard', base).href); await ready();
  let reference;
  for (const [index, version] of versions.entries()) {
    await visit(version);
    if (index === 0) reference = await state();
    assert.equal(new URL(page.url()).search, '?sequence=pleos25');
    assert.equal(new URL(page.url()).hash, '');
    await page.evaluate(gap => window.__pleosOptical.set({ gap, playing: false, time: 7.2 }), .12 + index * .12);
    await select.focus();
    assert(await select.evaluate(element => element.matches(':focus-visible')), 'Keyboard focus must remain visible');
    await page.screenshot({ path: `${output}/${version.id}-wide.png` });
    await page.setViewportSize({ width: 600, height: 850 });
    const bounds = await select.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 600 && bounds.height >= 24);
    await page.screenshot({ path: `${output}/${version.id}-narrow.png` });
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  await visit(versions[0]); assert.equal((await state()).gap, .12);
  await visit(versions[1]); assert.equal((await state()).gap, .24);
  const versionUrl = page.url();
  await select.selectOption({ label: '긴 한글 이름 · Pleos25 저장 설정' });
  assert.equal(page.url(), versionUrl, 'Named settings must apply without navigation');
  assert.equal((await state()).gap, .21);
  await page.evaluate(() => window.__pleosOptical.set({ gap: .3 }));
  await page.getByRole('button', { name: '설정 불러오기' }).focus(); await page.keyboard.press('Enter');
  assert.equal((await state()).gap, .21, 'Keyboard setting reload must still work');
  const sharedStore = page.frameLocator('iframe[title="공유 설정 저장소"]');
  assert.equal(await sharedStore.locator('body').evaluate(() => localStorage.getItem('pleos-named-settings-v1')), named, 'Named settings must retain their exact saved bytes');
  await visit(null); assert.equal(page.url(), currentSequence.href); assert.deepEqual(await state(), current);
  await page.reload(); await ready(); assert.equal(await select.inputValue(), '');
  await visit(legacy); assert.equal(new URL(page.url()).search, '', 'Legacy archives must retain their original query-free routes');
  await visit(null); assert.equal(page.url(), base.href); assert.deepEqual(await state(), normal);
  assert.equal(await page.evaluate(() => localStorage.getItem('pleos-named-settings-v1')), named);
  const frames = [];
  for (const version of versions) {
    await visit(version);
    const captured = {};
    for (const time of [6.5, 15]) {
      const data = await page.evaluate(async ({ reference, time }) => {
        window.__pleosOptical.set({ ...reference, time, playing: false });
        return window.__pleosOptical.capture(512, 640, 1);
      }, { reference, time });
      const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
      await writeFile(`${output}/${version.id}-${time}s.png`, bytes);
      captured[time] = PNG.sync.read(bytes);
    }
    frames.push(captured);
  }
  let changedPixels = 0;
  for (let i = 0; i < frames[0][6.5].data.length; i += 4) {
    if ([0, 1, 2].some(channel => frames[0][6.5].data[i + channel] !== frames[1][6.5].data[i + channel])) changedPixels++;
  }
  assert(changedPixels > 0, 'Latest and previous lighting handovers must render differently at 6.5 seconds');
  assert.deepEqual(frames[0][15].data, frames[1][15].data, 'Both versions must retain the same final dimensions with identical optics');
  assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ status: 'pass', versions, legacyId: legacy.id, checks: ['separate selectable labels', 'sequence enabled', 'unrelated query dropped', 'archive storage isolation', 'named settings preserved', 'keyboard reload', 'return to current sequence and ordinary routes', 'wide and narrow UI'], renderedComparison: { width: 512, height: 640, midpointSeconds: 6.5, midpointChangedPixels: changedPixels, endpointSeconds: 15, endpointPixelIdentical: true }, errors, badAssets }, null, 2) + '\n');
  console.log('PASS: Pleos25 version menu, separate settings, named settings, keyboard, return routes, wide/narrow UI');
} finally { await context.close(); await browser.close(); }
