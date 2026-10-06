import type { OpticalState } from './OpticalState';
import { startingLightFamily } from './OpticalLighting';

/** Separate expression fork; the immutable September 14 checkpoint is untouched. */
export const CUBE0914 = typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === 'cube0914';
export const CUBE0914_SOURCE = 'saved-20260914094839691';

/** Original archived light power sequence, including its chosen-colour anchor. */
export function writeCube0914Weights(state: Readonly<OpticalState>, out: Float32Array): void {
  const stage = ((state.time / state.duration - state.lightCycleOffset) % 1 + 1) % 1 * 3;
  const i = Math.floor(stage), fraction = stage - i;
  const t = Math.max(0, Math.min(1, (fraction - .35) / .65));
  const ease = t*t*t*(t*(t*6-15)+10);
  const lead = (startingLightFamily(state.lightColor)-i+3)%3, next = (lead+2)%3;
  // Preserve the original 80/10/10 result for older saved settings.
  const sub=state.cubeSubPercent/100, mainRemainder=1-3*sub;
  out.fill(sub); out[lead] += mainRemainder*(1-ease); out[next] += mainRemainder*ease;
}
