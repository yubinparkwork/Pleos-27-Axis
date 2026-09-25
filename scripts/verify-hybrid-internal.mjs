import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out=new URL('../artifacts/hybrid-internal/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--use-angle=metal']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:5173/';
const patch={playing:false,time:2,identityTransition:0,layerFadeAmount:.6,hybridColorMode:1};
async function open(path){await page.goto(base+path);await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);await page.evaluate(()=>window.__pleosOptical.reset());await page.evaluate(p=>window.__pleosOptical.set(p),patch);}
async function capture(name,bounces){await page.evaluate(b=>window.__pleosOptical.set({bounces:b}),bounces);const data=await page.evaluate(()=>window.__pleosOptical.capture(400,500,4));const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(new URL(name+'.png',out),bytes);return PNG.sync.read(bytes);}
function diff(a,b){let s=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)s+=Math.abs(a.data[i+c]-b.data[i+c]);return s/(a.width*a.height*3);}
try{
 await open('?look=hybrid-ab');const one=await capture('one-bounce',1),many=await capture('internal-faces',16);
 await open('versions/saved-20260922055654113-compatible/index.html?look=hybrid-ab');const oldOne=await capture('v4-one-bounce',1),oldMany=await capture('v4-sixteen-bounces',16);
 const checks={noUnreflectedProxy:diff(one,oldOne),reflectedFaces:diff(many,oldMany)};
 assert(checks.noUnreflectedProxy<.03,'No exterior or direct proxy contribution');assert(checks.reflectedFaces>1,'Actual internally reflected paths must be visible');assert.deepEqual(errors,[]);
 await writeFile(new URL('verification.json',out),JSON.stringify({status:'pass',checks,errors},null,2));console.log(checks);
}finally{await browser.close();}
