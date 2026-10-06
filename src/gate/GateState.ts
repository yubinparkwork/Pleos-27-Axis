export const GATE = { width:5248, height:2112, top:576, side:448, physicalMetres:[13.12,5.28], topTiltDegrees:15,
  source:'https://business.coex.co.kr/wp-content/uploads/sites/2/2023/01/Coex-Exhibition-Halls-Media-Gate-Manual.pdf' } as const;
export interface GateState {
  hybridDistortion:number; hybridDensity:number; hybridColorMix:number; subPercent:number;
  ior:number; roughness:number; reflection:number; absorption:number; lightSpread:number; exposure:number;
  faceReflection:number; faceWidth:number; refractionOverlap:number;
  layers:number; depth:number; speed:number; softness:number; falloff:number; brightness:number;
  frontWidth:number; widthTaper:number; cornerRadius:number; bloomDirection:number;
  dispersion:number; introduction:number; stagger:number; holdRed:number; holdGreen:number;
  holdBlue:number; colorFade:number; red:string; green:string; blue:string; duration:number;
}
export const defaults:GateState={hybridDistortion:.55,hybridDensity:.55,hybridColorMix:.5,subPercent:8,
  ior:1.45,roughness:.06,reflection:1,absorption:.12,lightSpread:1.5,exposure:0,
  faceReflection:.35,faceWidth:.4,refractionOverlap:.35,layers:12,depth:2.6,speed:.065,softness:.5,falloff:.4,brightness:1.2,
  frontWidth:120,widthTaper:1.2,cornerRadius:120,bloomDirection:1,dispersion:.002,introduction:1.8,stagger:.22,holdRed:4,holdGreen:4,holdBlue:4,colorFade:2,
  red:'#FA293C',green:'#0ADC91',blue:'#2350FF',duration:30};
export const limits:Partial<Record<keyof GateState,[number,number,number]>>={layers:[1,50,1],depth:[1,7,.05],
  hybridDistortion:[0,1,.01],hybridDensity:[0,1,.01],hybridColorMix:[0,1,.01],subPercent:[0,33,1],
  ior:[1,2.5,.01],roughness:[0,.3,.005],reflection:[0,2,.01],absorption:[0,2,.01],lightSpread:[.3,3,.01],exposure:[-3,3,.05],
  faceReflection:[0,2,.01],faceWidth:[0,1,.01],refractionOverlap:[0,1,.01],
  cornerRadius:[0,320,1],bloomDirection:[-1,1,.05],frontWidth:[8,1280,1],widthTaper:[0,3,.05],speed:[.005,.25,.005],softness:[.1,1,.01],falloff:[0,1,.01],brightness:[0,5,.05],dispersion:[0,.06,.001],
  introduction:[.2,6,.1],stagger:[0,1,.01],holdRed:[.5,15,.1],holdGreen:[.5,15,.1],holdBlue:[.5,15,.1],colorFade:[.2,6,.1],duration:[5,120,1]};
export function sanitize(input:Partial<GateState>):GateState{
  const out={...defaults};
  for(const key of Object.keys(limits) as (keyof GateState)[]){const v=input[key],r=limits[key]!;
    if(typeof v==='number'&&Number.isFinite(v))(out as unknown as Record<string,unknown>)[key]=key==='layers'?Math.round(Math.min(r[1],Math.max(r[0],v))):Math.min(r[1],Math.max(r[0],v));}
  for(const key of ['red','green','blue'] as const)if(/^#[0-9a-f]{6}$/i.test(input[key]??''))out[key]=input[key]!;
  return out;
}
