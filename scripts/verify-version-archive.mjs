import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base = process.env.PLEOS_VERSION_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({channel:'chrome',args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try {
  const page = await browser.newPage({viewport:{width:1400,height:950}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const badAssets=[];
  page.on('response',r=>{if(/\.(css|js)(\?|$)/.test(r.url()) && (r.status()>=400 || /text\/html/.test(r.headers()['content-type']??'')))badAssets.push(r.url());});
  const catalog=await (await fetch(new URL('version-catalog.json',base))).json();
  await mkdir('artifacts/version-archive',{recursive:true});
  await page.goto(base);
  const select = page.getByRole('combobox',{name:'날짜별 사이트 버전'});
  const visit = async id => {
    const target=catalog.find(v=>v.id===id);
    const destination=new URL(id?`versions/${target?.routeId??id}/index.html`:'',base);
    if(target?.sequence==='pleos25'||(!id&&new URL(page.url()).searchParams.get('sequence')==='pleos25'))destination.searchParams.set('sequence','pleos25');
    await select.selectOption(id);
    await page.waitForURL(destination.href);
    await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
    assert.equal(await page.locator('.optical-header').evaluate(el=>getComputedStyle(el).display),'flex','Historical optical CSS did not load');
    if(target?.sequence==='pleos25')assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.identityTransition),1,'Sequence archive must open with its transition enabled');
  };
  for(const version of catalog){
    await visit(version.id);
    assert.equal(await select.inputValue(),version.id);
    await page.screenshot({path:`artifacts/version-archive/${version.id}.png`});
  }
  await visit('20260911-b-settings');
  await page.evaluate(()=>window.__pleosOptical.set({gap:.123}));
  await visit('20260911-b');
  assert.notEqual(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.123);
  await visit('20260911-b-settings');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.123);
  await visit('');
  assert.equal(await select.inputValue(),'','Root must select current work, not an archive with missing routeId');
  assert.equal(await select.locator('option:checked').textContent(),'현재 작업본');
  await page.reload();
  await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await page.waitForFunction(()=>{const s=[...document.querySelectorAll('aside')].map(e=>e.shadowRoot?.querySelector('select')).find(Boolean);return s&&!s.disabled;});
  assert.equal(await select.inputValue(),'','Root label must survive reload');
  await select.focus();
  await page.screenshot({path:'/tmp/pleos-versions.png'});
  await page.setViewportSize({width:600,height:850});
  assert(await select.isVisible());
  await page.screenshot({path:'/tmp/pleos-versions-narrow.png'});
  assert.deepEqual(errors,[]);
  assert.deepEqual(badAssets,[],'Historical assets returned HTML or HTTP failures');
  await writeFile('artifacts/version-archive/verification.json',JSON.stringify({status:'pass',versions:catalog.map(v=>v.id),errors,badAssets},null,2));
  console.log('PASS: archive navigation, version-isolated persistence, return, narrow UI, no errors');
} finally {await browser.close();}
