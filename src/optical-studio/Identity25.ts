import reference from './identity25-keyframes.json';
import type { OpticalState } from './OpticalState';

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t*t*t*(10+t*(-15+6*t)); };
// Slow–fast–slow time warp; unit endpoint tangents and zero endpoint
// acceleration preserve the incoming handover without a stop/restart.
export function identityHandoverEase(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t - 24 * t**3 * (1-t)**3 * (1-2*t);
}
const PI = Math.PI;

/** Compact analytic plane parameters fitted to the official video, not pixels/textures. */
export class Identity25 {
  readonly angles = new Float32Array(3);
  readonly targets = new Float32Array(3);
  readonly angular = new Float32Array(24);
  readonly radial = new Float32Array(12);
  readonly strokes = new Float32Array(18);
  mix = 1;
  sourceTime = 0;

  update(state: Readonly<OpticalState>, basis?: { right: ArrayLike<number>; up: ArrayLike<number> }): void {
    if (!state.identityTransition) { this.mix = 1; return; }
    // Keep every transition reachable, even when duration is shorter than its controls.
    const hold = state.identityHold ?? 5.3, dissolve = state.identityDissolve ?? 3;
    const fit = Math.min(1, state.duration / Math.max(.001, hold + dissolve));
    const held = hold * fit, length = Math.max(.001, dissolve * fit);
    const progress = Math.max(0, Math.min(1, (state.time - held) / length));
    this.mix = smooth(progress);
    // Anticipate the handover before the reference's late acceleration. Carry
    // its incoming velocity through the lighting onset instead of freezing at
    // 5.3s and starting a second ease from rest. Earlier source frames are exact.
    // Start before the reference's 4.2–4.5s held pose, not after it.
    const bridgeSource = 3.8;
    const bridgeStart = held * bridgeSource / 5.3;
    const bridgeEnd = held + length * .65;
    const bridgeLength = Math.max(.001, bridgeEnd - bridgeStart);
    const sourceClock = state.time / Math.max(held,.001) * 5.3;
    const lightStopStart = 4.8;
    const lightClock = Math.max(0, Math.min(1, sourceClock - lightStopStart));
    this.sourceTime = sourceClock <= lightStopStart ? sourceClock
      : lightStopStart + .5 * (2 * lightClock - lightClock * lightClock);
    const frames = reference.frames;
    let index = 0;
    while (index < frames.length - 2 && frames[index + 1].time < this.sourceTime) index++;
    const a = frames[index], b = frames[index + 1];
    const f = Math.max(0, Math.min(1, (this.sourceTime - a.time) / Math.max(.001, b.time - a.time)));
    for (let axis = 0; axis < 3; axis++) this.angles[axis] = a.angles[axis] + (b.angles[axis] - a.angles[axis]) * f;
    // Do not combine the video's fade-to-black with our dissolve: that would
    // briefly empty the screen. Retain its last lit planes under the new light.
    const litTime = Math.min(this.sourceTime, 5.3);
    let litIndex = 0;
    while (litIndex < frames.length - 2 && frames[litIndex + 1].time < litTime) litIndex++;
    const litA = frames[litIndex], litB = frames[litIndex + 1];
    const litF = Math.max(0, Math.min(1, (litTime - litA.time) / Math.max(.001, litB.time - litA.time)));
    for (let plane = 0; plane < 6; plane++) {
      for(let c=0;c<3;c++) this.strokes[plane*3+c]=litA.rays[plane][c]+(litB.rays[plane][c]-litA.rays[plane][c])*litF;
      for (let c = 0; c < 6; c++) {
        const v = litA.planes[plane][c] + (litB.planes[plane][c] - litA.planes[plane][c]) * litF;
        if (c < 4) this.angular[plane * 4 + c] = v;
        else this.radial[plane * 2 + c - 4] = v;
      }
    }
    if (state.time > bridgeStart) {
      // Match the same three projected world axes before the old image vanishes.
      const az = state.azimuth * PI / 180, el = state.elevation * PI / 180;
      const right = basis ? Array.from(basis.right) : [Math.cos(az), 0, -Math.sin(az)];
      const up = basis ? Array.from(basis.up) : [-Math.sin(az)*Math.sin(el), Math.cos(el), -Math.cos(az)*Math.sin(el)];
      const targets = right.map((x,i)=>(Math.atan2(-up[i],x)%PI+PI)%PI).sort((x,y)=>x-y);
      let best = [...targets], cost = Infinity;
      // Choose once from the fixed last-lit pose, never from its animated
      // intermediate position. Nearest-target switches cause visible snaps.
      const endAngles = frames.find(frame => frame.time === 5.3)!.angles;
      const revolution = Math.floor(endAngles[0] / PI) * 3;
      for (let offset=revolution-3;offset<=revolution+3;offset++) {
        const candidate = [0,1,2].map(i=>{const k=i+offset; return targets[((k%3)+3)%3] + Math.floor(k/3)*PI;});
        const score=candidate.reduce((s,v,i)=>s+(v-endAngles[i])**2,0);
        if(score<cost){cost=score;best=candidate;}
      }
      const startIndex = frames.findIndex(frame => frame.time === bridgeSource);
      const start = frames[startIndex], before = frames[startIndex - 1];
      const u = identityHandoverEase((state.time - bridgeStart) / bridgeLength);
      const u2=u*u, u3=u2*u, u4=u3*u, u5=u4*u;
      // Quintic Hermite: source position/velocity and zero incoming acceleration
      // at the splice, exact destination with zero velocity/acceleration at end.
      const travel = 10*u3 - 15*u4 + 6*u5;
      const tangent = u - 6*u3 + 8*u4 - 3*u5;
      for(let i=0;i<3;i++) {
        this.targets[i] = best[i];
        const velocity = (start.angles[i]-before.angles[i]) / (start.time-before.time)
          * 5.3 / Math.max(held,.001);
        this.angles[i] = start.angles[i] + (best[i]-start.angles[i])*travel
          + velocity * bridgeLength * tangent;
      }
    } else {
      this.targets.set(this.angles);
    }
  }
}
