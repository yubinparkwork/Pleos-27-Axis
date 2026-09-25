import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.PLEOS_VERSION_URL??'http://127.0.0.1:5173/';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1400,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('named-settings-store.html',base).href);
  const originals=await page.evaluate(()=>{
    const entries={
      'pleos-named-settings-v1':[{id:'same',name:'현재 저장',state:{gap:.123}}],
      'saved-20260914100301996:pleos-named-settings-v1':[{id:'same',name:'이전 저장',state:{gap:.234}}],
      'pleos-history:20260911-b:pleos-named-settings-v1':[{id:'third',name:'오래된 저장',state:{gap:.345}}]
    };for(const [k,v]of Object.entries(entries))localStorage.setItem(k,JSON.stringify(v));return entries;
  });
  const select=page.getByRole('combobox',{name:'날짜별 사이트 버전'});
  const ready=async()=>{await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);await page.waitForFunction(()=>[...document.querySelectorAll('aside')].some(e=>e.shadowRoot?.querySelector('optgroup')?.children.length===3));};
  await page.goto(new URL('versions/saved-20260914100301996-compatible/index.html',base).href);await ready();
  await select.selectOption({label:'현재 저장'});
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.123);
  await page.evaluate(()=>window.__pleosOptical.set({gap:.456}));
  await page.getByRole('button',{name:'설정 불러오기'}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.123);
  await select.selectOption({label:'이전 저장'});
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.234);
  await page.getByRole('textbox',{name:'설정 이름'}).fill('긴 한글 이름을 가진 새로운 설정');
  await page.getByRole('button',{name:'설정 저장',exact:true}).click();
  await page.screenshot({path:'/tmp/pleos-settings-wide.png'});
  await page.setViewportSize({width:600,height:850});await page.screenshot({path:'/tmp/pleos-settings-narrow.png'});
  await page.goto(base);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await select.selectOption({label:'긴 한글 이름을 가진 새로운 설정'});
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.234);
  await page.reload();await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  await select.selectOption({label:'오래된 저장'});
  assert.equal(await page.evaluate(()=>window.__pleosOptical.inspect().state.gap),.345);
  for(const [key,value]of Object.entries(originals))assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),value);
  assert.deepEqual(errors,[]);
  console.log('PASS: root/archive sharing, historical keys preserved, duplicate ids preserved, repeated keyboard load, named save and reload, browser errors');
}finally{await browser.close();}
