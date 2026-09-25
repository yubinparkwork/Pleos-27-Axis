import type { OpticalState } from './OpticalState';

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t*t*t*(10+t*(-15+6*t));
};

/** One closed light envelope per handover, evaluated at export/playback time.
 * This reads (never changes) the existing fitted hold/dissolve timeline.
 */
export function identityAxisAccent(state: Readonly<OpticalState>) {
  const hold = state.identityHold ?? 5.3, dissolve = state.identityDissolve ?? 3;
  const fit = Math.min(1, state.duration / Math.max(.001, hold + dissolve));
  const held = hold * fit, length = Math.max(.001, dissolve * fit);
  const progress = Math.max(0, Math.min(1, (state.time - held) / length));
  const envelope = state.identityTransition
    ? smooth((progress-.04)/.26) * (1-smooth((progress-.42)/.54)) : 0;
  const intensity = state.identityAxisAccent ?? 1;
  return { enabled: Boolean(state.identityTransition && intensity > 0),
    progress, envelope, intensity, amount: intensity * envelope,
    start: held + length * .04, peak: held + length * .30,
    end: held + length * .96,
    role: 'single eased highlight on the existing animated Axis folds; no new geometry or change to layer timing' };
}
