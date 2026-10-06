import './GateStudio.css';
import { GATE, defaults, limits, sanitize } from './GateState';
import type { GateState } from './GateState';
import { GateRenderer } from './GateRenderer';
import { download, exportGateVideo } from './GateExport';
import { GateHistory } from './GateHistory';
const key='pleos-coex-d-gate-v1';
export function mountGateStudio(root:HTMLElement):()=>void{
  let state={...defaults},time=0,playing=true,busy=false,frame=0,previous=performance.now(),abort:AbortController|undefined;
  try{state=sanitize(JSON.parse(localStorage.getItem(key)??'{}'));}catch{/* Isolated corrupt gate data never touches optical settings. */}
  root.innerHTML=`<main class="gate-studio"><header class="gate-header"><div><strong>PLEOS 27 AXIS</strong><small>코엑스 D홀 · 디멘션 게이트</small></div></header><section class="gate-view" aria-label="게이트 미리보기"></section><aside class="gate-panel" aria-label="게이트 설정"></aside><footer class="gate-transport"><button data-play>일시정지</button><button data-restart>처음부터</button><input data-seek aria-label="모션 시간" type="range" min="0" max="30" step=".01"><output data-time></output></footer></main>`;
  const panel=root.querySelector<HTMLElement>('.gate-panel')!,view=root.querySelector<HTMLElement>('.gate-view')!;
  let renderer:GateRenderer;
  try{renderer=new GateRenderer();view.append(renderer.canvas);}catch(error){view.textContent=String(error);return()=>{};}
  const range=(k:keyof GateState,label:string)=>{const r=limits[k]!;return `<label><span>${label}</span><input type="range" aria-label="${label} 슬라이더" data-key="${k}" min="${r[0]}" max="${r[1]}" step="${r[2]}"><input type="number" aria-label="${label}" data-key="${k}" min="${r[0]}" max="${r[1]}" step="${r[2]}"></label>`;};
  panel.innerHTML=`<details open><summary>디멘션 구조</summary>${range('layers','레이어 수')}${range('depth','깊이 압축')}${range('speed','안쪽 흐름 속도')}${range('softness','층 번짐')}${range('falloff','깊이 감쇠')}${range('brightness','빛 강도')}${range('dispersion','색 분산')}</details><details open><summary>검정에서 등장</summary>${range('introduction','등장 시간 (초)')}${range('stagger','층 간격 (초)')}<p>처음은 검정 → 앞쪽부터 층층이 생성 → 안쪽으로 지속 순환합니다. 재생은 끝나지 않으며 ‘처음부터’에서만 등장 모션을 다시 시작합니다.</p></details><details open><summary>RGB 순환</summary>${range('holdRed','레드 유지 (초)')}${range('holdGreen','그린 유지 (초)')}${range('holdBlue','블루 유지 (초)')}${range('colorFade','색 전환 (초)')}${['red','green','blue'].map((k,i)=>`<label><span>${['레드','그린','블루'][i]} 색상</span><input type="color" aria-label="${k} 색상" data-key="${k}"></label>`).join('')}<p>메인 컬러가 R → G → B로 바뀌며, 이전 색은 안쪽 층에 남습니다. 좌우 고정 RGB 배치가 아닙니다.</p></details><details open><summary>영상 · 이미지 내보내기</summary><p>공식 펼침 도면 5248×2112 · 상단 576px · 좌우 448px · 중앙 통로는 검정. 최종 납품 전 운영사 매핑 확인이 필요합니다.</p><select data-size aria-label="출력 해상도"><option value="2624">테스트 · 2624 × 1056</option><option value="3840">4K급 · 3840 × 1546</option><option value="5248">D홀 원본 · 5248 × 2112</option></select>${range('duration','출력 길이 (초)')}<select data-segment aria-label="출력 구간"><option value="intro">처음 등장 포함</option><option value="loop">등장 이후 완전한 순환 1회</option></select><div class="gate-actions"><button data-export="png">PNG 저장</button><button class="gate-primary" data-export="mp4">MP4 만들기</button><button data-cancel disabled>취소</button></div><progress max="1" value="0"></progress><div class="gate-status" role="status" aria-live="polite">게이트 설정은 별도로 자동 저장됩니다.</div><p>MP4는 30fps · 오프라인 고정 시간 렌더링. GPU/인코더가 원본 크기를 지원하지 않으면 오류를 표시하며 임의 축소하지 않습니다.</p></details>`;
  panel.querySelector('details')!.insertAdjacentHTML('beforeend',`${range('frontWidth','앞쪽 빛 폭 (px)')}${range('widthTaper','안쪽 좁아짐')}<p>앞쪽 폭은 5248×2112 원본 기준입니다. 깊이 원근에 따른 축소에 더해, 좁아짐을 높이면 안쪽 빛이 더 가늘어집니다.</p>`);
  panel.querySelector('details')!.insertAdjacentHTML('beforeend',`${range('cornerRadius','모서리 라운딩 (px)')}${range('bloomDirection','번짐 방향')}<p>라운딩 0은 직각이며 값을 높이면 부드럽게 꺾입니다. 번짐 방향 +1은 위·바깥쪽에 빛이 잡히고 아래·통로 쪽으로 풀어짐, 0은 양쪽 동일, −1은 반대 방향입니다. 번짐 폭은 ‘층 번짐’으로 조절합니다.</p>`);
  panel.querySelector('details')!.insertAdjacentHTML('afterend',`<details open><summary>A/B 통합 재질</summary><p>A/B 광원과 반사·굴절 특성을 ㄷ자 단면에 연결합니다. 같은 층의 둘레는 균일하며, 외곽에서 안쪽으로 광학 변화가 생깁니다.</p>${range('hybridDistortion','내부 굴절')}${range('hybridDensity','내부 광학 밀도')}${range('faceReflection','면 반사 강도')}${range('faceWidth','반사광 폭')}${range('refractionOverlap','굴절 중첩')}</details><details open><summary>광학 · 조명</summary>${range('ior','굴절률')}${range('roughness','광학 확산')}${range('reflection','반사 강도')}${range('absorption','흡수')}${range('lightSpread','광원 폭')}${range('exposure','노출')}<p>기존 ‘빛 강도’는 전체 광량입니다. 광학 확산은 반사광을 부드럽게 하고, 흡수는 깊은 층을 어둡게 합니다.</p></details>`);
  const rgbSection=[...panel.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent==='RGB 순환')!;
  rgbSection.insertAdjacentHTML('beforeend',`${range('hybridColorMix','RGB 혼합')}${range('subPercent','서브 컬러 각각 (%)')}<p>메인 비중 = 100 − 서브 × 2. 광원 비중이며 화면 면적 비율은 아닙니다.</p>`);
  const status=panel.querySelector<HTMLElement>('.gate-status')!,progress=panel.querySelector<HTMLProgressElement>('progress')!;
  const play=root.querySelector<HTMLButtonElement>('[data-play]')!,seek=root.querySelector<HTMLInputElement>('[data-seek]')!,output=root.querySelector<HTMLOutputElement>('[data-time]')!;
  const controls=[...panel.querySelectorAll<HTMLInputElement>('[data-key]')];
  const history=new GateHistory();
  const actions=document.createElement('div');actions.className='gate-actions';
  actions.innerHTML='<button data-undo aria-label="게이트 설정 되돌리기" title="Ctrl+Z / ⌘Z">되돌리기</button><button data-redo aria-label="게이트 설정 다시 실행" title="Ctrl+Shift+Z / ⌘⇧Z">다시 실행</button>';
  panel.prepend(actions);
  const undo=actions.querySelector<HTMLButtonElement>('[data-undo]')!,redo=actions.querySelector<HTMLButtonElement>('[data-redo]')!;
  const syncHistory=()=>{undo.disabled=!history.canUndo;redo.disabled=!history.canRedo;};
  const sync=()=>{for(const el of controls)el.value=String(state[el.dataset.key as keyof GateState]);seek.max=String(state.duration);syncHistory();};sync();
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{status.textContent='설정 저장 공간이 부족합니다. 브라우저 저장 공간을 확인하세요.';}};
  const set=(patch:Partial<GateState>)=>{const before=state;state=sanitize({...state,...patch});history.record(before,state);sync();save();};
  const endEdit=()=>{history.end(state);syncHistory();};
  const restore=(direction:'undo'|'redo')=>{
    const snapshot=history[direction](state);if(!snapshot){syncHistory();return false;}
    state=snapshot;sync();save();status.textContent=direction==='undo'?'설정을 되돌렸습니다.':'설정을 다시 적용했습니다.';return true;
  };
  undo.onclick=()=>restore('undo');redo.onclick=()=>restore('redo');
  const shortcuts=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.altKey||!(event.ctrlKey||event.metaKey))return;
    const target=event.composedPath()[0];
    if(target instanceof Element&&!root.contains(target)&&target!==document.body)return;
    const k=event.key.toLowerCase();
    const direction=k==='z'?(event.shiftKey?'redo':'undo'):k==='y'&&event.ctrlKey&&!event.metaKey?'redo':null;
    if(direction&&restore(direction))event.preventDefault();
  };
  window.addEventListener('keydown',shortcuts,{capture:true});
  window.addEventListener('pointerup',endEdit);window.addEventListener('pointercancel',endEdit);
  for(const el of controls){
    el.addEventListener('focus',()=>history.begin(state));
    el.addEventListener('pointerdown',()=>history.begin(state));
    el.addEventListener('change',endEdit);el.addEventListener('blur',endEdit);
    el.addEventListener('input',()=>{if(el.value==='')return;history.begin(state);set({[el.dataset.key!]:el.type==='color'?el.value:Number(el.value)});});
    if(el.type==='number')el.addEventListener('keydown',event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const k=el.dataset.key as keyof GateState;set({[k]:Number(el.value)+limits[k]![2]*(event.key==='ArrowUp'?1:-1)*(event.shiftKey?10:1)});}});}
  play.onclick=()=>{playing=!playing;play.textContent=playing?'일시정지':'재생';};
  root.querySelector<HTMLButtonElement>('[data-restart]')!.onclick=()=>{time=0;playing=true;play.textContent='일시정지';};
  seek.oninput=()=>{time=Number(seek.value);playing=false;play.textContent='재생';};
  const capture=(width:number,height:number,t=time)=>{
    const r=new GateRenderer();try{r.render(state,t,width,height);return r.canvas.toDataURL('image/png');}finally{r.dispose();}
  };
  const exportImage=async()=>{
    const width=Number(panel.querySelector<HTMLSelectElement>('[data-size]')!.value),height=width===5248?2112:Math.round(width*2112/5248/2)*2;
    const data=capture(width,height);download(await(await fetch(data)).blob(),`pleos-coex-d-${width}x${height}.png`);
  };
  const renderVideo=async(width:number,height:number,start:number,end:number,seamless=false)=>{
    if(busy)throw new Error('내보내기가 진행 중입니다.');busy=true;abort=new AbortController();
    panel.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(b=>b.disabled=true);
    panel.querySelector<HTMLButtonElement>('[data-cancel]')!.disabled=false;
    const snapshot={...state};
    if(seamless)snapshot.speed=Math.max(1,Math.round(snapshot.speed*(end-start)))/(end-start);
    try{return await exportGateVideo(snapshot,width,height,start,end,abort.signal,(text,v)=>{status.textContent=text;progress.value=v;});}
    finally{busy=false;panel.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(b=>b.disabled=false);panel.querySelector<HTMLButtonElement>('[data-cancel]')!.disabled=true;}
  };
  panel.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick=()=>abort?.abort();
  panel.querySelector<HTMLButtonElement>('[data-export="png"]')!.onclick=()=>{void exportImage().then(()=>status.textContent='PNG를 저장했습니다.').catch(e=>status.textContent=String(e));};
  panel.querySelector<HTMLButtonElement>('[data-export="mp4"]')!.onclick=()=>{
    const width=Number(panel.querySelector<HTMLSelectElement>('[data-size]')!.value),height=width===5248?2112:Math.round(width*2112/5248/2)*2;
    const loop=panel.querySelector<HTMLSelectElement>('[data-segment]')!.value==='loop';
    // Both geometry and colour must return to their starting phase: quantize travel
    // to whole turns over one complete RGB cycle only for the seamless loop export.
    const period=state.holdRed+state.holdGreen+state.holdBlue+3*state.colorFade;
    const start=loop?Math.ceil((state.introduction+state.layers*state.stagger+1/state.speed)/period)*period:0;
    const end=loop?start+period:state.duration;
    void renderVideo(width,height,start,end,loop).then(blob=>{download(blob,`pleos-coex-d-${width}x${height}-30fps.mp4`);status.textContent='MP4를 저장했습니다.';progress.value=1;}).catch(e=>status.textContent=String(e));
  };
  function tick(now:number){
    const delta=Math.min((now-previous)/1000,.1);previous=now;
    if(playing&&!busy)time+=delta;
    const width=Math.max(64,Math.min(1600,Math.round(view.clientWidth*devicePixelRatio))),height=Math.round(width*2112/5248);
    try{if(!busy)renderer.render(state,time,width,height);}catch(e){playing=false;status.textContent=String(e);}
    seek.value=String(time%state.duration);output.value=`${(time%state.duration).toFixed(2)}초`;
    frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
  const api={inspect:()=>({ready:true,renderer:'WebGL2 optical U-plane integrator',state:{...state},time,playing,busy,mapping:GATE}),
    set,seek:(t:number)=>{if(!Number.isFinite(t)||t<0)throw Error('Invalid time');time=t;playing=false;play.textContent='재생';renderer.render(state,time,Math.max(renderer.canvas.width,64),Math.max(renderer.canvas.height,26));},
    capture,exportVideo:renderVideo};
  window.__pleosGate=api;
  return()=>{cancelAnimationFrame(frame);abort?.abort();window.removeEventListener('keydown',shortcuts,{capture:true});window.removeEventListener('pointerup',endEdit);window.removeEventListener('pointercancel',endEdit);renderer.dispose();delete window.__pleosGate;};
}
declare global{interface Window{__pleosGate?:{
  inspect():{ready:boolean;renderer:string;state:GateState;time:number;playing:boolean;busy:boolean;mapping:typeof GATE};
  set(patch:Partial<GateState>):void;seek(time:number):void;capture(width:number,height:number,time?:number):string;
  exportVideo(width:number,height:number,start:number,end:number):Promise<Blob>;
};}}
