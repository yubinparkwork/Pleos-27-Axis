import { identityLayerTiming } from './IdentityLayerTiming';

export interface OpticalState {
  hybridDistortion: number; hybridDensity: number; hybridColorMix: number; hybridColorMode: number;
  hybridDepthFlow: number; hybridDepthCycles: number;
  hybridOpening: number;
  hybridFaceReflection: number; hybridFaceWidth: number; hybridRefractionOverlap: number;
  cameraFloat: number; cameraFloatX: number; cameraFloatY: number; cameraFloatSeconds: number;
  axisMotion: number; axisYaw: number; axisRoll: number; axisMoveSeconds: number;
  cameraMotion: number; cameraOrbitHorizontal: number; cameraOrbitVertical: number; cameraMoveSeconds: number;
  identityLayerStagger: number; identityEngraving: number; identityAxisAccent: number;
  identityTransition: number; identityHold: number; identityDissolve: number; identityCenterVersion: number;
  dimensionDelayTop: number; dimensionDelayLeft: number; dimensionDelayRight: number;
  lightMotionCycles: number; layerFadeAmount: number; layerFadeCycles: number; layerStagger: number;
  panX: number;
  gap: number; bevel: number; ior: number; dispersion: number; roughness: number; surfaceCurvature: number;
  reflection: number; absorption: number; lightIntensity: number; lightSpread: number;
  red: number; green: number; blue: number; exposure: number; zoom: number;
  azimuth: number; elevation: number; time: number; duration: number; speed: number;
  dimensionTop: number; dimensionLeft: number; dimensionRight: number; bloom: number;
  dimensionSpacing: number; dimensionSoftness: number; dimensionFalloff: number;
  dimensionSpacingTop: number; dimensionSpacingLeft: number; dimensionSpacingRight: number;
  lightColor: string;
  lightCycle: boolean; lightCycleOffset: number;
  bounces: number; playing: boolean; aspect: string;
  videoLongEdge: number; videoFps: number; videoSamples: number;
}

export const OPTICAL_ZOOM_RANGE = [0.4, 24] as const;
export const OPTICAL_DIMENSION_KEYS = ['dimensionTop', 'dimensionLeft', 'dimensionRight'] as const;
export const OPTICAL_SPACING_KEYS = ['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight'] as const;

export const OPTICAL_DEFAULTS: Readonly<OpticalState> = Object.freeze({
  hybridDistortion: .55, hybridDensity: .55, hybridColorMix: .6, hybridColorMode: 0,
  hybridDepthFlow: 0, hybridDepthCycles: 1,
  hybridOpening: 1,
  hybridFaceReflection: .7, hybridFaceWidth: .5, hybridRefractionOverlap: .55,
  cameraFloat: 0, cameraFloatX: 4, cameraFloatY: 3, cameraFloatSeconds: 15,
  axisMotion: 0, axisYaw: 24, axisRoll: 12, axisMoveSeconds: 8,
  cameraMotion: 0, cameraOrbitHorizontal: -24, cameraOrbitVertical: 6, cameraMoveSeconds: 8,
  identityLayerStagger: 0, identityEngraving: 1, identityAxisAccent: 1,
  identityTransition: 0, identityHold: 5.3, identityDissolve: 3, identityCenterVersion: 0,
  dimensionDelayTop: 0, dimensionDelayLeft: 0, dimensionDelayRight: 0,
  lightMotionCycles: 1, layerFadeAmount: 1, layerFadeCycles: 1, layerStagger: .32,
  panX: 0,
  gap: 0.025, bevel: 0.32, ior: 1.5, dispersion: 0.045, roughness: 0.12, surfaceCurvature: 0.065,
  reflection: 1, absorption: 0.04, lightIntensity: 0.9, lightSpread: 1,
  red: 1, green: 0, blue: 0, exposure: 1, zoom: .50,
  azimuth: 45, elevation: 35.264389682754654, time: 0, duration: 15, speed: 0.4,
  dimensionTop: 3, dimensionLeft: 4, dimensionRight: 3, bloom: 0.18,
  dimensionSpacing: 0.14, dimensionSoftness: 0.55, dimensionFalloff: 0.55, lightColor: '#FFFFFF',
  dimensionSpacingTop: .14, dimensionSpacingLeft: .14, dimensionSpacingRight: .14,
  bounces: 16, playing: true, aspect: "main",
  lightCycle: false, lightCycleOffset: 0,
  videoLongEdge: 3840, videoFps: 30, videoSamples: 4,
});

const ranges: Record<Exclude<keyof OpticalState, "playing" | "aspect" | "lightColor" | "lightCycle">, readonly [number, number]> = {
  hybridDistortion:[0,1], hybridDensity:[0,1], hybridColorMix:[0,1], hybridColorMode:[0,4],
  hybridDepthFlow:[0,1], hybridDepthCycles:[1,4],
  hybridOpening:[0,1],
  hybridFaceReflection:[0,2], hybridFaceWidth:[0,1], hybridRefractionOverlap:[0,1],
  cameraFloat:[0,1],cameraFloatX:[0,10],cameraFloatY:[0,10],cameraFloatSeconds:[3,60],
  axisMotion: [0,1], axisYaw: [-90,90], axisRoll: [-45,45], axisMoveSeconds: [1,30],
  cameraMotion: [0,1], cameraOrbitHorizontal: [-90,90], cameraOrbitVertical: [-30,30], cameraMoveSeconds: [1,30],
  identityLayerStagger: [0,5], identityEngraving: [0,1], identityAxisAccent: [0,2],
  identityTransition: [0, 1], identityHold: [0, 15], identityDissolve: [.5, 12], identityCenterVersion: [0, 2],
  dimensionDelayTop: [0, 30], dimensionDelayLeft: [0, 30], dimensionDelayRight: [0, 30],
  lightMotionCycles: [0, 4], layerFadeAmount: [0, 1], layerFadeCycles: [0, 4], layerStagger: [0, 1],
  panX: [-100, 100],
  lightCycleOffset: [0, 1],
  gap: [0, 0.4], bevel: [0, 0.6], ior: [1, 2.5], dispersion: [0, 0.15],
  roughness: [0, 0.3], surfaceCurvature: [0, 0.24], reflection: [0, 2], absorption: [0, 2], lightIntensity: [0, 5],
  lightSpread: [0.2, 2], red: [0, 2], green: [0, 2], blue: [0, 2], exposure: [0.25, 3],
  zoom: OPTICAL_ZOOM_RANGE, azimuth: [-180, 180], elevation: [-80, 80],
  time: [0, 300], duration: [1, 300], speed: [0, 1], bounces: [1, 16],
  dimensionTop: [0, 50], dimensionLeft: [0, 50], dimensionRight: [0, 50], bloom: [0, 1],
  dimensionSpacing: [0.06, 0.3], dimensionSoftness: [0.05, 1], dimensionFalloff: [0, 1],
  dimensionSpacingTop: [.06, .3], dimensionSpacingLeft: [.06, .3], dimensionSpacingRight: [.06, .3],
  videoLongEdge: [1920, 3840], videoFps: [24, 60], videoSamples: [4, 16],
};

export function normalizeLightColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

// Legacy RGB weights belonged to the light rig, not to cube albedo. Convert
// once when loading old state; explicit new colour always takes precedence.
function legacyLightColor(data: Partial<OpticalState>): string {
  const weights = [data.red, data.green, data.blue].map(v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0);
  const palette = [[250, 41, 60], [10, 220, 145], [35, 80, 255]];
  const rgb = [0, 1, 2].map(channel => weights.reduce((sum, weight, i) => sum + weight * palette[i][channel], 0));
  const scale = 255 / Math.max(255, ...rgb);
  return '#' + rgb.map(v => Math.round(v * scale).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function sanitizeOpticalState(input: unknown): OpticalState {
  const state = { ...OPTICAL_DEFAULTS };
  if (!input || typeof input !== "object") return state;
  const data = input as Partial<OpticalState>;
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      state[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
    }
  }
  state.identityTransition = Math.round(state.identityTransition);
  state.hybridColorMode = Math.round(state.hybridColorMode);
  state.hybridDepthCycles = Math.round(state.hybridDepthCycles);
  state.cameraMotion = Math.round(state.cameraMotion);
  state.axisMotion = Math.round(state.axisMotion);
  state.cameraFloat = Math.round(state.cameraFloat);
  state.identityEngraving = Math.round(state.identityEngraving);
  state.identityCenterVersion = Math.round(state.identityCenterVersion);
  state.bounces = Math.round(state.bounces);
  state.lightMotionCycles = Math.round(state.lightMotionCycles);
  state.layerFadeCycles = Math.round(state.layerFadeCycles);
  // Export preferences are discrete choices, independent of scene appearance.
  state.videoLongEdge = [1920, 3840].includes(data.videoLongEdge ?? 0) ? data.videoLongEdge! : OPTICAL_DEFAULTS.videoLongEdge;
  state.videoFps = [24, 30, 60].includes(data.videoFps ?? 0) ? data.videoFps! : OPTICAL_DEFAULTS.videoFps;
  state.videoSamples = [4, 16].includes(data.videoSamples ?? 0) ? data.videoSamples! : OPTICAL_DEFAULTS.videoSamples;
  // Older saves contain only a shared spacing. Inherit it without changing
  // the appearance; explicit per-cube values always win.
  for (const key of OPTICAL_SPACING_KEYS) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) state[key] = state.dimensionSpacing;
  }
  // Continuous layer budget: fractional last layer fades instead of popping.
  state.lightColor = normalizeLightColor(data.lightColor) ??
    (['red', 'green', 'blue'].some(key => key in data) ? legacyLightColor(data) : OPTICAL_DEFAULTS.lightColor);
  const layerTiming=identityLayerTiming(state);
  // Never compress a user-entered one-second stagger to fit an old duration.
  if (layerTiming.enabled) state.duration=Math.max(state.duration,
    Math.ceil(Math.max(layerTiming.completeAt,state.identityHold+state.identityDissolve)*10)/10);
  state.time = Math.min(state.time, state.duration);
  if (typeof data.playing === "boolean") state.playing = data.playing;
  if (typeof data.lightCycle === 'boolean') state.lightCycle = data.lightCycle;
  if (OPTICAL_ASPECTS.some(preset => preset.id === data.aspect)) state.aspect = data.aspect!;
  return state;
}

export const OPTICAL_ASPECTS = [
  { id: 'main', label: '1:1', ratio: 1 },
  { id: '4x5', label: '4:5', ratio: 4/5 },
  { id: '9x16', label: '9:16', ratio: 9/16 },
  { id: '16x9', label: '16:9', ratio: 16/9 },
  { id: 'a-series', label: 'A시리즈 · 세로', ratio: 1/Math.SQRT2 },
  { id: '3x2', label: '3:2', ratio: 3/2 },
] as const;

export function opticalDimensions(aspect: string, longEdge = 3840): [number, number] {
  const ratio = OPTICAL_ASPECTS.find(preset => preset.id === aspect)?.ratio ?? 1;
  return ratio >= 1 ? [longEdge, Math.round(longEdge / ratio)] : [Math.round(longEdge * ratio), longEdge];
}

/** H.264/HEVC requires even dimensions. PNG keeps nearest-pixel rounding. */
export function opticalVideoDimensions(aspect: string, longEdge = 3840): [number, number] {
  const [w,h] = opticalDimensions(aspect,longEdge);
  return [w+w%2,h+h%2];
}
