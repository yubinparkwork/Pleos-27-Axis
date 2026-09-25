import type { OpticalState } from './OpticalState';
import { transformAxisVector, writeWorldToAxis } from './OpticalAxisMotion';

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t*t*t*(10+t*(-15+6*t));
};

const radians = Math.PI / 180;
let cachedKey = '';
let cachedLoopLimits = { horizontal: 0, vertical: 0, scale: 1 };

/**
 * The Axis can move while the camera orbits, so evaluate the *combined* path
 * in Axis-local space before accepting the requested camera amplitudes.
 * One scale is applied to both axes, preserving the intended floating rhythm
 * and avoiding a clamp-induced pause at the safety boundary.
 */
export function axisCameraLoopLimits(state: Readonly<OpticalState>) {
  const key = [state.azimuth, state.elevation, state.cameraOrbitHorizontal, state.cameraOrbitVertical,
    state.cameraMoveSeconds, state.duration, state.identityHold, state.identityTransition,
    state.axisMotion, state.axisYaw, state.axisRoll, state.axisMoveSeconds].join(':');
  if (key === cachedKey) return cachedLoopLimits;
  const requestedHorizontal = Math.max(-18, Math.min(18, state.cameraOrbitHorizontal ?? -8));
  const requestedVertical = Math.max(-12, Math.min(12, state.cameraOrbitVertical ?? 4));
  const hold = state.identityHold ?? 5.3;
  const dissolve = state.identityDissolve ?? 3;
  const start = state.identityTransition ? hold * Math.min(1, state.duration / Math.max(.001, hold + dissolve)) : 0;
  const available = Math.max(.001, state.duration - start);
  const cycles = Math.max(1, Math.round(available / Math.max(1, state.cameraMoveSeconds ?? 10)));
  const baseAzimuth = state.azimuth * radians, baseElevation = state.elevation * radians;
  const baseView = [Math.sin(baseAzimuth) * Math.cos(baseElevation), Math.sin(baseElevation), Math.cos(baseAzimuth) * Math.cos(baseElevation)];
  const matrix = new Float32Array(9);
  const safe = (scale: number) => {
    for (let sample = 0; sample <= 192; sample++) {
      const u = sample / 192;
      const phase = 2 * Math.PI * cycles * u;
      const azimuth = (state.azimuth + requestedHorizontal * scale * Math.sin(phase)) * radians;
      const elevation = Math.max(-79.5, Math.min(79.5, state.elevation + requestedVertical * scale * Math.sin(phase * 2))) * radians;
      const world = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
      // Evaluate axis transform at the same absolute loop time.
      writeWorldToAxis({ ...state, time: start + u * available }, matrix);
      const local = transformAxisVector(matrix, world);
      for (let axis = 0; axis < 3; axis++) {
        const margin = Math.min(.075, Math.abs(baseView[axis]) * .35);
        if (local[axis] * Math.sign(baseView[axis] || 1) < margin) return false;
      }
    }
    return true;
  };
  let lo = 0, hi = 1;
  if (!safe(1)) for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (safe(mid)) lo = mid; else hi = mid; }
  else lo = 1;
  cachedKey = key;
  cachedLoopLimits = { horizontal: requestedHorizontal * lo, vertical: requestedVertical * lo, scale: lo };
  return cachedLoopLimits;
}

/** Deterministic camera-only arc. Saved angles remain the untouched anchor.
 * Hold the 25Axis shot; ease out during its handover, then return smoothly
 * before the loop boundary. Preview, scrub, PNG and MP4 evaluate the same time.
 */
export function opticalCameraPose(state: Readonly<OpticalState>) {
  const hold = state.identityHold ?? 5.3, dissolve = state.identityDissolve ?? 3;
  const fit = Math.min(1, state.duration / Math.max(.001, hold+dissolve));
  const start = state.identityTransition ? hold*fit : 0;
  const available = Math.max(.001,state.duration-start);
  const outward = Math.min(state.cameraMoveSeconds ?? 8,available*.55);
  const peak = start+outward;
  const time = Math.max(0,Math.min(state.duration,state.time));
  if (state.axisMotion) {
    const u = Math.max(0, Math.min(1, (time - start) / available));
    const cycles = Math.max(1, Math.round(available / Math.max(1, state.cameraMoveSeconds ?? 10)));
    const ramp = Math.min(.08, .25 / cycles);
    const envelope = !state.cameraMotion || u <= 0 || u >= 1 ? 0 : ease(u / ramp) * ease((1 - u) / ramp);
    const phase = Math.PI * 2 * cycles * u;
    const limits = axisCameraLoopLimits(state);
    const horizontal = limits.horizontal * Math.sin(phase) * envelope;
    const vertical = limits.vertical * Math.sin(phase * 2) * envelope;
    return { enabled: Boolean(state.cameraMotion), start, peak: start + available / (4 * cycles), end: state.duration,
      weight: envelope, azimuth: state.azimuth + horizontal, elevation: state.elevation + vertical,
      baseAzimuth: state.azimuth, baseElevation: state.elevation, horizontal, vertical, target: [0,0,0] as const,
      cycles, period: available / cycles, requestedHorizontal: state.cameraOrbitHorizontal, requestedVertical: state.cameraOrbitVertical,
      safeHorizontal: limits.horizontal, safeVertical: limits.vertical, safetyLimited: limits.scale < .999,
      method: 'eased closed camera orbit, synchronized with rigid Axis swing; combined view-octant safety envelope' };
  }
  const weight = !state.cameraMotion || time <= start || time >= state.duration ? 0
    : time <= peak ? ease((time-start)/outward)
    : 1-ease((time-peak)/(state.duration-peak));
  const horizontal = state.cameraOrbitHorizontal ?? -24;
  // Limit the endpoint, not each intermediate sample: no clamped velocity kink.
  const vertical = Math.min(80-state.elevation,Math.max(-80-state.elevation,state.cameraOrbitVertical ?? 6));
  return { enabled: Boolean(state.cameraMotion), start, peak, end: state.duration, weight,
    azimuth: state.azimuth+horizontal*weight, elevation: state.elevation+vertical*weight,
    baseAzimuth: state.azimuth, baseElevation: state.elevation,
    horizontal, vertical, target: [0,0,0] as const,
    method: 'fixed Axis geometry; eased out-and-back orthographic camera orbit; saved pan and zoom unchanged' };
}
