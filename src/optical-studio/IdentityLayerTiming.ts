import type { OpticalState } from './OpticalState';

/** Absolute seconds, independent of easing, playback rate or render resolution. */
export function identityLayerTiming(state: Readonly<OpticalState>) {
  const staggerSeconds = state.identityTransition ? (state.identityLayerStagger ?? 0) : 0;
  const count = Math.ceil(Math.max(state.dimensionTop, state.dimensionLeft, state.dimensionRight));
  const firstStart = state.identityHold;
  const fadeSeconds = Math.min(.8, state.identityDissolve);
  const lastStart = firstStart + Math.max(0,count-1)*staggerSeconds;
  const enabled=Boolean(state.identityTransition && (state.identityEngraving===0 || staggerSeconds>0));
  return { enabled, staggerSeconds, count, firstStart, fadeSeconds, lastStart,
    completeAt: count>0 ? lastStart+fadeSeconds : firstStart };
}

export function identityLayerGate(state: Readonly<OpticalState>, order: number): number {
  const timing=identityLayerTiming(state);
  if (!timing.enabled) return 1;
  const t=Math.max(0,Math.min(1,(state.time-timing.firstStart-order*timing.staggerSeconds)/timing.fadeSeconds));
  return t*t*(3-2*t);
}
