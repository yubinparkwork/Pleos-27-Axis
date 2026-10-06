import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
const dir=new URL('../artifacts/coex-gate/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text());});
await page.route('**/__pleos/optical-state**',r=>r.request().method()==='GET'?r.fulfill({status:204}):r.fulfill({status:204}));
await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
const url='http://127.0.0.1:5173/?look=coex-gate';
const capture=async(name,time,width=1312,height=528)=>{
  const data=await page.evaluate(({time,width,height})=>window.__pleosGate.capture(width,height,time),{time,width,height});
  const bytes=Buffer.from(data.split(',')[1],'base64');await writeFile(new URL(name,dir),bytes);return PNG.sync.read(bytes);
};
try{
  await page.goto(url);await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.frontWidth,120,'New width default');
  // Old payloads have no width fields; sanitization must preserve them and migrate defaults.
  await page.evaluate(()=>localStorage.setItem('pleos-coex-d-gate-v1',JSON.stringify({layers:12,depth:2.6})));
  await page.reload();await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.widthTaper,1.2);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.cornerRadius,120);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.bloomDirection,1);
  const initialState=(await page.evaluate(()=>window.__pleosGate.inspect())).state;
  // Newly introduced A/B controls migrate without replacing gate geometry.
  assert.equal(initialState.hybridDistortion,.55);
  const materialBase=await capture('ab-material-base.png',8);
  for(const [key,value] of Object.entries({hybridDistortion:1,hybridDensity:1,hybridColorMix:1,
    subPercent:30,ior:2,roughness:.3,reflection:.3,absorption:1.5,lightSpread:2.8,
    exposure:1,faceReflection:1.5,faceWidth:1,refractionOverlap:1})){
    await page.evaluate(patch=>window.__pleosGate.set(patch),{[key]:value});
    const changed=await capture(`ab-${key}.png`,8);
    assert.notDeepEqual(changed.data,materialBase.data,`${key} must affect rendered light`);
    await page.evaluate(s=>window.__pleosGate.set(s),initialState);
  }
  const distortion=page.getByRole('spinbutton',{name:'내부 굴절',exact:true});
  await distortion.fill('.8');await distortion.press('Tab');
  await distortion.press('Meta+z');assert.equal(await distortion.inputValue(),'0.55');
  await distortion.fill('.72');await distortion.press('Tab');await page.reload();
  await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.hybridDistortion,.72);
  await page.evaluate(s=>window.__pleosGate.set(s),initialState);
  await page.evaluate(()=>window.__pleosGate.set({layers:18,depth:3.7,speed:.09,softness:1,falloff:1,brightness:1.35,dispersion:0,frontWidth:140,widthTaper:2.05,cornerRadius:0,bloomDirection:1,introduction:1,stagger:0}));
  const uniform=await capture('uniform-depth-user-settings.png',4.99);
  let horizontalVariation=0;
  for(let y=5;y<140;y++)for(let x=180;x<1130;x+=19){
    for(let c=0;c<3;c++)horizontalVariation=Math.max(horizontalVariation,Math.abs(uniform.data[(y*1312+x)*4+c]-uniform.data[(y*1312+656)*4+c]));
  }
  assert(horizontalVariation<=1,`Each U layer must remain uniform along its length: ${horizontalVariation}`);
  await page.evaluate(s=>window.__pleosGate.set(s),initialState);
  await page.reload();await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  await page.evaluate(()=>window.__pleosGate.seek(0));
  const undo=page.getByRole('button',{name:'게이트 설정 되돌리기'});
  const redo=page.getByRole('button',{name:'게이트 설정 다시 실행'});
  assert(await undo.isDisabled());
  await page.evaluate(()=>window.__pleosGate.seek(7.25));
  const layers=page.getByRole('spinbutton',{name:'레이어 수',exact:true});
  await layers.fill('22');await layers.press('Tab');
  await page.keyboard.press('Control+z');assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,12);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).time,7.25,'Undo must preserve transport time');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pleos-coex-d-gate-v1')).layers),12,'Undone settings must be persisted');
  await page.keyboard.press('Control+Shift+z');assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,22);
  await layers.fill('28');await layers.press('Meta+z');
  assert.equal(await layers.inputValue(),'22');await layers.press('Tab');assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,22);
  await redo.click();assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,28);
  const slider=page.getByRole('slider',{name:'레이어 수 슬라이더'}),box=await slider.boundingBox();assert(box);
  await page.mouse.move(box.x+box.width*.55,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.85,box.y+box.height/2,{steps:12});await page.mouse.up();
  const dragged=(await page.evaluate(()=>window.__pleosGate.inspect())).state.layers;assert(dragged>30);
  await undo.click();assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,28,'Entire drag is one undo');
  await redo.click();assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,dragged);
  await page.evaluate(()=>window.__pleosGate.set({layers:12}));
  const widthInput=page.getByRole('spinbutton',{name:'앞쪽 빛 폭 (px)',exact:true});
  await widthInput.fill('200');await widthInput.press('Tab');await page.keyboard.press('Meta+z');
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.frontWidth,120);
  await page.evaluate(()=>window.__pleosGate.set({frontWidth:24}));
  const narrowWidth=await capture('width-narrow.png',8);
  await page.evaluate(()=>window.__pleosGate.set({frontWidth:200}));
  const wideWidth=await capture('width-wide.png',8);assert.notDeepEqual(narrowWidth.data,wideWidth.data);
  await widthInput.fill('320');await widthInput.press('Tab');
  const oldMaxWidth=await capture('width-320.png',8);
  await widthInput.fill('1280');await widthInput.press('Tab');
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.frontWidth,1280);
  const extendedWidth=await capture('width-1280.png',8);
  assert.notDeepEqual(oldMaxWidth.data,extendedWidth.data,'Extended width must not saturate at old cap');
  await page.keyboard.press('Meta+z');
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.frontWidth,320);
  await widthInput.fill('1280');await widthInput.press('Tab');await page.reload();
  await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.frontWidth,1280);
  await page.evaluate(()=>window.__pleosGate.set({frontWidth:120,widthTaper:0}));
  const untapered=await capture('width-taper-zero.png',8);
  await page.evaluate(()=>window.__pleosGate.set({widthTaper:2}));
  const tapered=await capture('width-taper-strong.png',8);assert.notDeepEqual(untapered.data,tapered.data);
  await page.reload();await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.widthTaper,2,'Taper persisted');
  await page.evaluate(()=>window.__pleosGate.set({widthTaper:1.2}));
  const savedGate=(await page.evaluate(()=>window.__pleosGate.inspect())).state;
  await page.evaluate(()=>window.__pleosGate.set({layers:1,frontWidth:120,widthTaper:.5}));
  const corner=await capture('corner-continuity.png',8);
  const z=(.35+(8-savedGate.introduction)*savedGate.speed)%1;
  const inset=(1-Math.exp(-z*savedGate.depth))/(1-Math.exp(-savedGate.depth))*.98;
  const radius=120+(24-120)*inset,cx=448*inset+radius,cy=576*inset+radius;
  let maximumJump=0,previousCorner;
  for(const side of ['left','right']){previousCorner=undefined;let baseline=0;for(let step=0;step<=45;step++){
    const angle=step/45*Math.PI/2,x=(cx-radius*Math.cos(angle))/4-.5,y=(cy-radius*Math.sin(angle))/4-.5;
    const sampleX=side==='left'?x:1311-x;
    // Interpolate at the geometric contour, not at independently rounded
    // pixels which jump between the bright crest and the inward release.
    const sx=Math.floor(sampleX),sy=Math.floor(y),fx=sampleX-sx,fy=y-sy;
    const pixel=[0,1,2].map(c=>{
      const at=(dx,dy)=>corner.data[((sy+dy)*1312+sx+dx)*4+c];
      return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
    });
    const luminance=pixel.reduce((a,b)=>a+b,0);if(step===0)baseline=luminance;
    // Different sides can reflect different source energy; test a local seam
    // relative to that side's core, not an arbitrary global brightness cutoff.
    assert(luminance>Math.max(3,baseline*.5),'Connected corner core must not have a dark seam');
    if(previousCorner)maximumJump=Math.max(maximumJump,...pixel.map((n,i)=>Math.abs(n-previousCorner[i])));
    previousCorner=pixel;
  }}
  assert(maximumJump<24,`Corner light must remain continuous: ${maximumJump}`);
  await page.evaluate(()=>window.__pleosGate.set({layers:12,depth:7,speed:.125,softness:.27,introduction:6,stagger:.43}));
  await capture('corner-joined.png',25.51);
  await page.evaluate(state=>window.__pleosGate.set(state),savedGate);
  const rounding=page.getByRole('spinbutton',{name:'모서리 라운딩 (px)',exact:true});
  await rounding.fill('240');await rounding.press('Tab');await page.keyboard.press('Meta+z');
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.cornerRadius,120);
  await page.evaluate(()=>window.__pleosGate.set({cornerRadius:0}));
  const square=await capture('rounding-zero.png',8);
  await page.evaluate(()=>window.__pleosGate.set({cornerRadius:240}));
  const rounded=await capture('rounding-wide.png',8);assert.notDeepEqual(square.data,rounded.data);
  await page.reload();await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.cornerRadius,240);
  await page.evaluate(()=>window.__pleosGate.set({layers:1,cornerRadius:120,widthTaper:.5,bloomDirection:1}));
  const inward=await capture('release-inward.png',1.8);
  await page.evaluate(()=>window.__pleosGate.set({bloomDirection:-1}));
  const outward=await capture('release-outward.png',1.8);assert.notDeepEqual(inward.data,outward.data);
  const probeZ=.35,probeInset=(1-Math.exp(-probeZ*2.6))/(1-Math.exp(-2.6))*.98;
  const coreY=Math.round(576*probeInset/4),probeX=656;
  const energy=(png,direction)=>{let sum=0;for(let delta=4;delta<=38;delta++){const y=coreY+direction*delta;if(y>=144)continue;const i=(y*1312+probeX)*4;sum+=png.data[i]+png.data[i+1]+png.data[i+2];}return sum;};
  const energyIn=[energy(inward,-1),energy(inward,1)],energyOut=[energy(outward,-1),energy(outward,1)];
  // One isolated ribbon must peak at its outer edge, then release inward
  // monotonically rather than forming a bright tubular centre or second lip.
  let previousRelease=Infinity;
  for(let d=1;d<=30;d++){
    const p=((coreY+d)*1312+probeX)*4;
    const value=inward.data[p]+inward.data[p+1]+inward.data[p+2];
    assert(value<=previousRelease+3,'Inward release must not develop a second highlight');
    previousRelease=value;
  }
  assert(energyIn[1]>energyIn[0]*1.3,'Positive direction releases downward/inward');
  assert(energyOut[0]>energyOut[1]*1.3,'Negative direction releases upward/outward');
  await page.evaluate(state=>window.__pleosGate.set(state),savedGate);
  await writeFile(new URL('rounding-release-validation.json',dir),JSON.stringify({status:'PASS',roundingZeroAndWide:true,commandZ:true,persistence:true,newDefaultsMigration:true,inwardOuterInnerEnergy:energyIn,outwardOuterInnerEnergy:energyOut},null,2));
  await writeFile(new URL('corner-validation.json',dir),JSON.stringify({status:'PASS',samples:92,corners:['left','right'],maximumAdjacentChannelJump:maximumJump,noDarkCorner:true,geometry:'One open rounded U signed-distance contour',lighting:'Continuous contour-local optical frame; cube diagonal flags omitted only in gate'},null,2));
  const black=await capture('black.png',0);assert(black.data.every((n,i)=>i%4===3||n===0));
  const first=await capture('first-layers.png',1),hero=await capture('hero.png',8),later=await capture('depth-flow.png',12);
  assert.notDeepEqual(first.data,hero.data);assert.notDeepEqual(later.data,hero.data);
  let lit=0;for(let y=150;y<528;y++)for(let x=120;x<1190;x++){const i=(y*1312+x)*4;assert.equal(hero.data[i]+hero.data[i+1]+hero.data[i+2],0,'Central passage must remain unlit');}
  for(let i=0;i<hero.data.length;i+=4)if(hero.data[i]+hero.data[i+1]+hero.data[i+2]>30)lit++;assert(lit>10000);
  for(const [name,t]of [['red.png',8],['green.png',17],['blue.png',23]])await capture(name,t);
  await page.evaluate(()=>window.__pleosGate.seek(8));await page.screenshot({path:new URL('panel-wide.png',dir).pathname});
  await page.getByRole('spinbutton',{name:'내부 굴절',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:new URL('ab-panel-wide.png',dir).pathname});
  await page.getByRole('spinbutton',{name:'레이어 수',exact:true}).fill('18');await page.getByRole('spinbutton',{name:'레이어 수',exact:true}).press('Tab');
  assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,18);
  await page.reload();await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);assert.equal((await page.evaluate(()=>window.__pleosGate.inspect())).state.layers,18);
  await page.evaluate(()=>{window.__pleosGate.set({layers:12});window.__pleosGate.seek(8);});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('panel-narrow.png',dir).pathname});
  await page.getByRole('spinbutton',{name:'내부 굴절',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:new URL('ab-panel-narrow.png',dir).pathname});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const native=await capture('native-5248.png',8,5248,2112);assert.equal(native.width,5248);
  await page.evaluate(()=>window.__pleosGate.set({speed:1/18}));
  const loopA=await capture('loop-start.png',72),loopB=await capture('loop-end.png',90);
  let loopError=0;for(let i=0;i<loopA.data.length;i++)loopError+=Math.abs(loopA.data[i]-loopB.data[i]);
  loopError/=loopA.data.length;assert(loopError<.1,'Loop phases must match');
  const mp4=await page.evaluate(async()=>{const blob=await window.__pleosGate.exportVideo(640,258,8,8.2);return Array.from(new Uint8Array(await blob.arrayBuffer()));});
  assert(mp4.length>1000);await writeFile(new URL('export-test.mp4',dir),Buffer.from(mp4));
  const uhd=await page.evaluate(async()=>{const blob=await window.__pleosGate.exportVideo(3840,1546,8,8.1);return Array.from(new Uint8Array(await blob.arrayBuffer()));});
  assert(uhd.length>1000);await writeFile(new URL('export-4k-test.mp4',dir),Buffer.from(uhd));
  await page.goto('http://127.0.0.1:5173/?look=hybrid-ab');await page.waitForFunction(()=>window.__pleosOptical?.inspect().ready);
  assert.equal(await page.evaluate(()=>!!window.__pleosGate),false);
  await page.getByRole('combobox',{name:'날짜별 사이트 버전'}).selectOption('live:coex-gate');
  await page.waitForFunction(()=>window.__pleosGate?.inspect().ready);
  assert.deepEqual(errors,[]);
  await writeFile(new URL('validation.json',dir),JSON.stringify({status:'PASS',undo:{controlZ:true,commandZ:true,redo:true,dragGrouped:true,inputFocus:true,persisted:true,transportPreserved:true},blackStart:true,stagger:true,depthMotion:true,centralMask:true,isolatedStorage:true,nativeDimensions:[5248,2112],mp4Bytes:mp4.length,uhdMp4Dimensions:[3840,1546],uhdMp4Bytes:uhd.length,loopMeanError:loopError,dropdownNavigation:true,existingHybridReady:true,errors},null,2));
  await writeFile(new URL('width-validation.json',dir),JSON.stringify({status:'PASS',legacyMigration:true,independentFrontWidth:true,independentTaper:true,commandZ:true,persisted:true,sourceProfile:'Shared studio emitters from optical.frag.glsl; gate omits cube diagonal flags',widthModel:'max(pixelFootprint * .65, frontWidth * exp(-z * widthTaper * 2.8)) in design pixels',defaultFrontWidthPx:120,defaultTaper:1.2,unfilteredWidthAtDepth:[120,120*Math.exp(-.5*1.2*2.8),120*Math.exp(-1.2*2.8)]},null,2));
  console.log('COEX gate PASS: width/taper/migration/undo/black/stagger/depth/mask/storage/native PNG/MP4/existing route/console');
}finally{await browser.close();}
