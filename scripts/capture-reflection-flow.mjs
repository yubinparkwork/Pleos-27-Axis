import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.argv[2]??'after';if(!/^[a-z-]+$/.test(label))throw Error('Invalid label');
const dir=new URL(`../artifacts/reflection-flow/${label}/`,import.meta.url);await mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'chrome',args:['--enable-gpu',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173/');await p.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
for(const time of [0,5,10,15]){const png=await p.evaluate(async time=>{window.__pleosOptical.seek(time);return window.__pleosOptical.capture(720,900,4)},time);await writeFile(new URL(`frame-${time}.png`,dir),Buffer.from(png.split(',')[1],'base64'));}
await writeFile(new URL('state.json',dir),JSON.stringify({runtime:await p.evaluate(()=>window.__pleosOptical.inspect()),errors},null,2));if(errors.length)throw Error(errors.join('\n'));
console.log('Captured '+label);
}finally{await b.close();}
