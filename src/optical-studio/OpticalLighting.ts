import type { OpticalState } from './OpticalState';
import { identityLayerTiming } from './IdentityLayerTiming';

export const PLEOS_CYCLE_COLORS = ['#FA293C', '#0ADC91', '#2350FF'] as const;
export const CYCLE_NAMES = ['레드', '그린', '블루'] as const;

/** Custom seconds start at the first light, including the layer reveal.
 * Legacy automatic timing still waits for the complete dimension image. */
export function opticalColorStart(state: Readonly<OpticalState>): number {
  if (!state.identityTransition) return 0;
  const hold=state.identityHold??5.3, dissolve=state.identityDissolve??3;
  const fit=Math.min(1,state.duration/Math.max(.001,hold+dissolve));
  if (state.lightTimingCustom===1) return hold*fit;
  return Math.max((hold+dissolve)*fit,identityLayerTiming(state).completeAt);
}

export function opticalColorTiming(state: Readonly<OpticalState>) {
  const start=opticalColorStart(state);
  const custom=state.lightTimingCustom===1;
  const available=Math.max(.001,state.duration-start);
  const red=custom?state.lightHoldRed:available*.35/3;
  const green=custom?state.lightHoldGreen:red;
  const blue=custom?state.lightHoldBlue:red;
  const crossfade=custom?state.lightCrossfade:available*.65/3;
  return {custom,start,red,green,blue,crossfade,period:red+green+blue+3*crossfade};
}

/** The gray 25 Axis intro is a lead-in, not elapsed RGB/light-rig motion.
 * Use the same fitted handover start as Identity25 so preview, seeking and
 * fixed-time export agree. The artist's saved phase offset remains relative
 * to the first dimension-light frame.
 */
export function opticalLightPhase(state: Readonly<OpticalState>): number {
  const duration = Math.max(.001, state.duration);
  const hold = state.identityHold ?? 5.3;
  const dissolve = state.identityDissolve ?? 3;
  const fittedHold = state.identityTransition
    ? hold * Math.min(1, duration / Math.max(.001, hold + dissolve)) : 0;
  // Wrap the unshifted timeline first: frame 0 and the exact loop endpoint
  // must submit identical floating-point phases to the shader/export path.
  const loopTime = ((state.time % duration) + duration) % duration;
  const delayedTime = ((loopTime - fittedHold) % duration + duration) % duration;
  return delayedTime / duration * Math.PI * 2;
}

/** Keep the colour handover separate from the moving reflection clock.
 * During the gray-to-light reveal the red source is already present, but its
 * stage should not be spent before the dimension image is fully visible.
 * Fit the complete R→G→B cycle into the visible remainder of the same loop;
 * its last blue→red handover meets the red at the next loop boundary.
 */
export function opticalColorPhase(state: Readonly<OpticalState>): number {
  if (!state.identityTransition) return opticalLightPhase(state) / (Math.PI * 2);
  const duration = Math.max(.001, state.duration);
  // The gray carrier can be gone while staggered inner images are still
  // arriving. Give the first fully formed dimension frame a complete red hold.
  const fullyVisibleAt = opticalColorStart(state);
  const visibleDuration = duration - fullyVisibleAt;
  if (visibleDuration <= .001) return opticalLightPhase(state) / (Math.PI * 2);
  const loopTime = ((state.time % duration) + duration) % duration;
  return Math.max(0, loopTime - fullyVisibleAt) / visibleDuration;
}

/** Match the custom light colour to a palette family, not the cycle order. */
export function startingLightFamily(hex: string): number {
  const c = Number.parseInt(hex.slice(1), 16);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return g >= r && g >= b ? 1 : r >= b ? 0 : 2;
}

/** R/G/B power fractions. One closed, C2-smooth R→G→B loop per duration.
 * A short plateau lets each look settle; the final 65% of each stage dissolves.
 * Every channel stays >= 10%; summed power is exactly one, including transitions.
 * Accept caller-owned output so renderer updates allocate no arrays.
 */
export function writeLightWeights(state: Readonly<OpticalState>, out: Float32Array): void {
  const phase = ((opticalColorPhase(state) - state.lightCycleOffset) % 1 + 1) % 1;
  const stage = phase * 3, current = Math.floor(stage), fraction = stage - current;
  let lead=current;
  let t = Math.max(0, Math.min(1, (fraction - .35) / .65));
  if(state.lightTimingCustom===1) {
    // Absolute-second holds, not normalized percentages. Never stretch the
    // requested seconds to fit the video; display that distinction in the UI.
    const fade=Math.max(.1,state.lightCrossfade);
    const period=state.lightHoldRed+state.lightHoldGreen+state.lightHoldBlue+3*fade;
    const loopTime=((state.time%state.duration)+state.duration)%state.duration;
    const elapsed=Math.max(0,loopTime-opticalColorStart(state));
    let clock=((elapsed-state.lightCycleOffset*period)%period+period)%period;
    lead=0;
    if(clock>=state.lightHoldRed+fade) {clock-=state.lightHoldRed+fade;lead=1;}
    if(lead===1 && clock>=state.lightHoldGreen+fade) {clock-=state.lightHoldGreen+fade;lead=2;}
    const hold=lead===0?state.lightHoldRed:lead===1?state.lightHoldGreen:state.lightHoldBlue;
    t=Math.max(0,Math.min(1,(clock-hold)/fade));
  }
  const ease = t * t * t * (t * (t * 6 - 15) + 10);
  // The saved phase anchor starts Red, regardless of the edited palette colour.
  const next = (lead + 1) % 3;
  out.fill(.1);
  out[lead] += .7 * (1 - ease);
  out[next] += .7 * ease;
}

/** Linear-light spectral colours for the smooth studio reflection sources. */
export function writeLightPalette(state: Readonly<OpticalState>, out: Float32Array): void {
  const start = startingLightFamily(state.lightColor);
  for (let i = 0; i < 3; i++) {
    const c = Number.parseInt((i === start ? state.lightColor : PLEOS_CYCLE_COLORS[i]).slice(1), 16);
    for (let j = 0; j < 3; j++) {
      const v = ((c >> ((2 - j) * 8)) & 255) / 255;
      out[i * 3 + j] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }
  }
}

export function inspectLightCycle(state: Readonly<OpticalState>) {
  const weights = new Float32Array(3);
  writeLightWeights(state, weights);
  return { enabled: state.lightCycle, periodSeconds: opticalColorTiming(state).period, phaseOffset: state.lightCycleOffset,
    timing: opticalColorTiming(state),
    order: 'red → green → blue',
    powerFractionsRGB: Array.from(weights), dominant: CYCLE_NAMES[weights.indexOf(Math.max(...weights))],
    meaning: 'studio light power fractions, not guaranteed screen colour coverage' };
}
