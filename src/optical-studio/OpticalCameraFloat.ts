import type { OpticalState } from './OpticalState';

const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(10+t*(-15+6*t));};

/** Bounded screen-plane translation only: no yaw, depth travel or lens change.
 * Periodic figure-eight path with C2 entry/exit at the 25 Axis hold and loop. */
export function opticalCameraFloat(state: Readonly<OpticalState>) {
  const hold=state.identityHold??5.3,dissolve=state.identityDissolve??3;
  const start=state.identityTransition?hold*Math.min(1,state.duration/Math.max(.001,hold+dissolve)):0;
  const available=Math.max(.001,state.duration-start);
  const cycles=Math.max(1,Math.round(available/(state.cameraFloatSeconds??15)));
  const u=Math.max(0,Math.min(1,(state.time-start)/available));
  const ramp=Math.min(.12,.25/cycles);
  const gain=!state.cameraFloat||u<=0||u>=1?0:ease(u/ramp)*ease((1-u)/ramp);
  const phase=2*Math.PI*cycles*u;
  return {enabled:Boolean(state.cameraFloat),start,period:available/cycles,cycles,
    x:gain===0?0:gain*Math.max(0,Math.min(10,state.cameraFloatX??4))*Math.sin(phase),
    y:gain===0?0:gain*Math.max(0,Math.min(10,state.cameraFloatY??3))*Math.sin(phase*2),
    units:'percent of artboard width/height',method:'bounded image-plane translation; fixed viewing direction and depth'};
}
