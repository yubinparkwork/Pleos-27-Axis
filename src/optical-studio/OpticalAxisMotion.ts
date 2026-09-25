import type { OpticalState } from './OpticalState';

const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
const radians=Math.PI/180;
let cachedKey='',cachedLimits={yaw:0,roll:0,scale:1};

/** Limit the whole path, never clamp a moving sample (which causes a stop).
 * Keep the viewing ray in the same face octant, away from grazing planes.
 * Both signs of the coupled Y/Z rotation are checked before playback. */
export function axisSwingLimits(state: Readonly<OpticalState>) {
  const key=[state.azimuth,state.elevation,state.axisYaw,state.axisRoll].join(':');
  if(key===cachedKey)return cachedLimits;
  const az=state.azimuth*radians,el=state.elevation*radians;
  const view=[Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)];
  const yaw=Math.max(-20,Math.min(20,state.axisYaw??24));
  const roll=Math.max(-18,Math.min(18,state.axisRoll??12));
  const safe=(s:number)=>{
    for(const side of [-1,1]) {
      const y=yaw*s*side*radians,z=roll*s*side*radians;
      const xz=Math.cos(z)*view[0]+Math.sin(z)*view[1];
      const local=[Math.cos(y)*xz-Math.sin(y)*view[2],
        -Math.sin(z)*view[0]+Math.cos(z)*view[1],
        Math.sin(y)*xz+Math.cos(y)*view[2]];
      for(let i=0;i<3;i++) {
        // A grazing starting camera cannot safely straddle its face boundary.
        const margin=Math.min(.10,Math.abs(view[i])*.5);
        if(local[i]*Math.sign(view[i]||1)<margin+1e-8)return false;
      }
    }
    return true;
  };
  let scale=1;
  for(let i=1;i<=64;i++)if(!safe(i/64)) {
    let lo=(i-1)/64,hi=i/64;
    for(let j=0;j<16;j++){const mid=(lo+hi)/2;if(safe(mid))lo=mid;else hi=mid;}
    scale=lo;break;
  }
  cachedKey=key;cachedLimits={yaw:yaw*scale,roll:roll*scale,scale};
  return cachedLimits;
}

/** Rigid model rotation about the shared origin. Lights remain in model space.
 * Inverse-transforming rays is equivalent to rotating all analytic solids,
 * without deforming their distances, bevels or dimension coordinates. */
export function opticalAxisPose(state: Readonly<OpticalState>) {
  const hold=state.identityHold??5.3,dissolve=state.identityDissolve??3;
  const start=state.identityTransition?hold*Math.min(1,state.duration/Math.max(.001,hold+dissolve)):0;
  const available=Math.max(.001,state.duration-start);
  const cycles=Math.max(1,Math.round(available/(state.axisMoveSeconds??8)));
  const u=Math.max(0,Math.min(1,(state.time-start)/available));
  const ramp=Math.min(.08,.25/cycles);
  const weight=!state.axisMotion||u<=0||u>=1?0:
    Math.sin(2*Math.PI*cycles*u)*ease(u/ramp)*ease((1-u)/ramp);
  const limit=axisSwingLimits(state);
  const yaw=limit.yaw*weight,roll=limit.roll*weight;
  return { enabled: Boolean(state.axisMotion), yaw, roll, weight,
    start, peak:start+available/(4*cycles), end:state.duration, cycles, period:available/cycles,
    requestedYaw:state.axisYaw,requestedRoll:state.axisRoll,safeYaw:limit.yaw,safeRoll:limit.roll,
    safetyLimited:Math.abs(limit.yaw-(state.axisYaw??24))>.001||Math.abs(limit.roll-(state.axisRoll??12))>.001,
    pivot: [0,0,0],
    method: 'eased signed 0 → positive → 0 → negative → 0 swing; view-octant safety envelope; fixed camera; rigid shared Axis' };
}

/** Column-major inverse of Rz * Ry, suitable for a GLSL mat3. */
export function writeWorldToAxis(state: Readonly<OpticalState>, out: Float32Array): void {
  const pose = opticalAxisPose(state), y=pose.yaw*Math.PI/180, z=pose.roll*Math.PI/180;
  const cy=Math.cos(y), sy=Math.sin(y), cz=Math.cos(z), sz=Math.sin(z);
  out.set([cy*cz,-sz,sy*cz,cy*sz,cz,sy*sz,-sy,0,cy]);
}
export function transformAxisVector(m: ArrayLike<number>, v: ArrayLike<number>): number[] {
  return [m[0]*v[0]+m[3]*v[1]+m[6]*v[2],m[1]*v[0]+m[4]*v[1]+m[7]*v[2],m[2]*v[0]+m[5]*v[1]+m[8]*v[2]];
}
