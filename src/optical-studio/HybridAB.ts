import { OPTICAL_DEFAULTS, sanitizeOpticalState, type OpticalState } from './OpticalState';
import { writeLightWeights } from './OpticalLighting';

/** Separate expression and persistence; neither approved A nor B is replaced. */
export const HYBRID_AB = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('look') === 'hybrid-ab';
export const HYBRID_COLOR_NAMES = ['RGB 순환', '메인 · RGB 균형', '서브 · 레드 우세', '서브 · 그린 우세', '서브 · 블루 우세'] as const;

// Fallback composition observed in B on 2026-09-21. On first local use, the
// visitor's B camera, geometry, timing and layer settings take precedence.
export const HYBRID_DEFAULTS: Readonly<OpticalState> = Object.freeze(sanitizeOpticalState({
  ...OPTICAL_DEFAULTS, duration:20, speed:0, lightCycle:true, lightColor:'#FA293C',
  gap:.015, bevel:.03, ior:1.86, dispersion:.008, roughness:.2, surfaceCurvature:0,
  reflection:2, absorption:0, lightIntensity:3.25, lightSpread:1.14, exposure:.59,
  dimensionTop:5.05, dimensionLeft:11.85, dimensionRight:12,
  dimensionSpacingTop:.3, dimensionSpacingLeft:.085, dimensionSpacingRight:.06,
  dimensionSoftness:1, dimensionFalloff:1, layerFadeCycles:4,
  dimensionDelayTop:5.6, dimensionDelayLeft:7.7, dimensionDelayRight:0,
  zoom:1.485, panX:-11.5, azimuth:32.275, elevation:40.055, aspect:'4x5',
  hybridDistortion:.55, hybridDensity:.55, hybridColorMix:.6, hybridColorMode:0,
  hybridDepthFlow:0, hybridDepthCycles:1,
}));

export function createHybridState(source?: unknown): OpticalState {
  const base = source && typeof source === 'object' ? sanitizeOpticalState(source) : HYBRID_DEFAULTS;
  return sanitizeOpticalState({ ...base, hybridDistortion:.55, hybridDensity:.55,
    hybridColorMix:.6, hybridColorMode:0, hybridDepthFlow:0, hybridDepthCycles:1,
    lightCycle:true, time:0, playing:true });
}

/** Energy fractions, not a guarantee of screen-area percentages. No allocations in draw(). */
export function writeHybridWeights(state: Readonly<OpticalState>, out: Float32Array): void {
  if (state.hybridColorMode === 0) writeLightWeights(state, out);
  // A balanced image is not equal source wattage: red has a narrower reflected
  // footprint in this rig. Fixed art-direction compensation, never view-based.
  else if (state.hybridColorMode === 1) { out[0]=.48; out[1]=.26; out[2]=.26; }
  else { out.fill(.04); out[state.hybridColorMode - 2] = .92; }
  if (state.hybridColorMode !== 1) {
    // Preserve the main/sub relationship while making both secondary colours legible.
    const blend = state.hybridColorMix * .38;
    for (let i=0;i<3;i++) out[i] = out[i] * (1-blend) + blend/3;
  }
}

export function inspectHybrid(state: Readonly<OpticalState>) {
  const weights = new Float32Array(3); writeHybridWeights(state, weights);
  return { look:'hybrid-ab', revision:6, base:'A closed optical proxy internal-reflection paths + open B anchor and motion',
    internalFaceTransport:'secondary closed rounded-cube proxy; no exterior or unreflected transmission; art-directed open-domain mapping',
    opening:state.hybridOpening, openAtFull:true,
    transitionRevision:1, transition:'shared contour formation, optical shoulder growth and gray-carrier release',
    faceReflection:{strength:state.hybridFaceReflection,width:state.hybridFaceWidth,overlap:state.hybridRefractionOverlap,maxImages:8},
    color:HYBRID_COLOR_NAMES[state.hybridColorMode], powerFractionsRGB:Array.from(weights),
    outerAxisLocked:true, shellRadiance:true, exteriorReflectionScale:.035,
    directTransmissionScale:.12, internalBounceBudget:state.bounces, physicalPathTracing:false,
    distortion:state.hybridDistortion, density:state.hybridDensity,
    depthStudy:{amount:state.hybridDepthFlow, cycles:state.hybridDepthCycles,
      calibratedHallD:false, note:'concept only; screen geometry and viewing position required'},
  };
}
