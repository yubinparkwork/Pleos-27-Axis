import { identityLayerTiming } from './IdentityLayerTiming';

export interface OpticalCameraView {
  zoom: number;
  panX: number;
  azimuth: number;
  elevation: number;
}

/** A named artboard is a complete scene snapshot, not just a camera bookmark. */
export interface OpticalVariation {
  id: string;
  name: string;
  savedAt: string;
  settings: Partial<OpticalState>;
}

export interface OpticalState {
  cubeSurfaceLight: number; cubeThroughLight: number;
  cubeFaceLight: number;
  cubeSubPercent: number;
  axisFaceGap: number;
  hybridSubPercent: number;
  hybridDistortion: number; hybridDensity: number; hybridColorMix: number; hybridColorMode: number;
  hybridDepthFlow: number; hybridDepthCycles: number;
  hybridOpening: number;
  hybridFaceReflection: number; hybridFaceWidth: number; hybridRefractionOverlap: number;
  faceTopX:number; faceTopY:number; faceTopZ:number;
  faceLeftX:number; faceLeftY:number; faceLeftZ:number;
  faceRightX:number; faceRightY:number; faceRightZ:number; faceDimensionContrast:number;
  structureTopX:number; structureTopY:number; structureTopZ:number;
  structureLeftX:number; structureLeftY:number; structureLeftZ:number;
  structureRightX:number; structureRightY:number; structureRightZ:number; structureContrast:number;
  cameraFloat: number; cameraFloatX: number; cameraFloatY: number; cameraFloatSeconds: number;
  axisMotion: number; axisYaw: number; axisRoll: number; axisMoveSeconds: number;
  cameraMotion: number; cameraOrbitHorizontal: number; cameraOrbitVertical: number; cameraMoveSeconds: number;
  identityLayerStagger: number; identityEngraving: number; identityAxisAccent: number; identityTransitionBrightness: number;
  identityTransition: number; identityHold: number; identityDissolve: number; identityCenterVersion: number;
  dimensionDelayTop: number; dimensionDelayLeft: number; dimensionDelayRight: number;
  lightMotionCycles: number; layerFadeAmount: number; layerFadeCycles: number; layerStagger: number;
  layerLightContrast: number; layerLightLength: number; layerLightCycles: number;
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
  lightTimingCustom: number;
  lightHoldRed: number; lightHoldGreen: number; lightHoldBlue: number; lightCrossfade: number;
  bounces: number; playing: boolean; aspect: string;
  customAspectWidth: number; customAspectHeight: number;
  cameraProfiles: Record<string, OpticalCameraView>;
  cameraDrafts: Record<string, OpticalCameraView>;
  variations: OpticalVariation[];
  activeVariationId: string;
  videoLongEdge: number; videoFps: number; videoSamples: number;
}

export const OPTICAL_ZOOM_RANGE = [0.4, 24] as const;
export const OPTICAL_DIMENSION_KEYS = ['dimensionTop', 'dimensionLeft', 'dimensionRight'] as const;
export const OPTICAL_SPACING_KEYS = ['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight'] as const;
export const OPTICAL_CAMERA_KEYS = ['zoom', 'panX', 'azimuth', 'elevation'] as const;

export function opticalCameraView(state: Pick<OpticalState, typeof OPTICAL_CAMERA_KEYS[number]>): OpticalCameraView {
  return { zoom: state.zoom, panX: state.panX, azimuth: state.azimuth, elevation: state.elevation };
}

export const OPTICAL_DEFAULTS: Readonly<OpticalState> = Object.freeze({
  cubeSurfaceLight: 1, cubeThroughLight: 1,
  cubeFaceLight: 1,
  cubeSubPercent: 10,
  axisFaceGap: .025,
  hybridSubPercent: 8,
  hybridDistortion: .55, hybridDensity: .55, hybridColorMix: .6, hybridColorMode: 0,
  hybridDepthFlow: 0, hybridDepthCycles: 1,
  hybridOpening: 1,
  hybridFaceReflection: .7, hybridFaceWidth: .5, hybridRefractionOverlap: .55,
  faceTopX:1,faceTopY:1,faceTopZ:1,faceLeftX:1,faceLeftY:1,faceLeftZ:1,
  faceRightX:1,faceRightY:1,faceRightZ:1,faceDimensionContrast:0,
  structureTopX:1,structureTopY:1,structureTopZ:1,structureLeftX:1,structureLeftY:1,structureLeftZ:1,
  structureRightX:1,structureRightY:1,structureRightZ:1,structureContrast:0,
  cameraFloat: 0, cameraFloatX: 4, cameraFloatY: 3, cameraFloatSeconds: 15,
  axisMotion: 0, axisYaw: 24, axisRoll: 12, axisMoveSeconds: 8,
  cameraMotion: 0, cameraOrbitHorizontal: -24, cameraOrbitVertical: 6, cameraMoveSeconds: 8,
  identityLayerStagger: 0, identityEngraving: 1, identityAxisAccent: 1, identityTransitionBrightness: 1,
  identityTransition: 0, identityHold: 5.3, identityDissolve: 3, identityCenterVersion: 0,
  dimensionDelayTop: 0, dimensionDelayLeft: 0, dimensionDelayRight: 0,
  lightMotionCycles: 1, layerFadeAmount: 1, layerFadeCycles: 1, layerStagger: .32,
  layerLightContrast: 0, layerLightLength: 1.5, layerLightCycles: 1,
  panX: 0,
  gap: 0.025, bevel: 0.32, ior: 1.5, dispersion: 0.045, roughness: 0.12, surfaceCurvature: 0.065,
  reflection: 1, absorption: 0.04, lightIntensity: 0.9, lightSpread: 1,
  red: 1, green: 0, blue: 0, exposure: 1, zoom: .50,
  azimuth: 45, elevation: 35.264389682754654, time: 0, duration: 15, speed: 0.4,
  dimensionTop: 3, dimensionLeft: 4, dimensionRight: 3, bloom: 0.18,
  dimensionSpacing: 0.14, dimensionSoftness: 0.55, dimensionFalloff: 0.55, lightColor: '#FFFFFF',
  dimensionSpacingTop: .14, dimensionSpacingLeft: .14, dimensionSpacingRight: .14,
  bounces: 16, playing: true, aspect: "main",
  customAspectWidth: 1, customAspectHeight: 1,
  cameraProfiles: {}, cameraDrafts: {},
  variations: [], activeVariationId: '',
  lightCycle: false, lightCycleOffset: 0,
  lightTimingCustom: 0, lightHoldRed: 2, lightHoldGreen: 2, lightHoldBlue: 2, lightCrossfade: 2,
  videoLongEdge: 3840, videoFps: 30, videoSamples: 4,
});

const ranges: Record<Exclude<keyof OpticalState, "playing" | "aspect" | "lightColor" | "lightCycle" | "cameraProfiles" | "cameraDrafts" | "variations" | "activeVariationId">, readonly [number, number]> = {
  cubeSurfaceLight: [0, 2], cubeThroughLight: [0, 2],
  cubeFaceLight: [0, 2],
  cubeSubPercent: [0, 33],
  axisFaceGap: [0, .15],
  hybridSubPercent: [0, 33],
  hybridDistortion:[0,1], hybridDensity:[0,1], hybridColorMix:[0,1], hybridColorMode:[0,4],
  hybridDepthFlow:[0,1], hybridDepthCycles:[1,4],
  hybridOpening:[0,1],
  hybridFaceReflection:[0,2], hybridFaceWidth:[0,1], hybridRefractionOverlap:[0,1],
  faceTopX:[0,3],faceTopY:[0,3],faceTopZ:[0,3],faceLeftX:[0,3],faceLeftY:[0,3],faceLeftZ:[0,3],
  faceRightX:[0,3],faceRightY:[0,3],faceRightZ:[0,3],faceDimensionContrast:[0,1],
  structureTopX:[0,3],structureTopY:[0,3],structureTopZ:[0,3],structureLeftX:[0,3],structureLeftY:[0,3],structureLeftZ:[0,3],
  structureRightX:[0,3],structureRightY:[0,3],structureRightZ:[0,3],structureContrast:[0,1],
  cameraFloat:[0,1],cameraFloatX:[0,10],cameraFloatY:[0,10],cameraFloatSeconds:[3,60],
  axisMotion: [0,1], axisYaw: [-90,90], axisRoll: [-45,45], axisMoveSeconds: [1,30],
  cameraMotion: [0,1], cameraOrbitHorizontal: [-90,90], cameraOrbitVertical: [-30,30], cameraMoveSeconds: [1,30],
  identityLayerStagger: [0,5], identityEngraving: [0,1], identityAxisAccent: [0,2], identityTransitionBrightness: [0,2],
  identityTransition: [0, 1], identityHold: [0, 15], identityDissolve: [.5, 12], identityCenterVersion: [0, 2],
  dimensionDelayTop: [0, 30], dimensionDelayLeft: [0, 30], dimensionDelayRight: [0, 30],
  lightMotionCycles: [0, 4], layerFadeAmount: [0, 1], layerFadeCycles: [0, 4], layerStagger: [0, 1],
  panX: [-100, 100],
  lightCycleOffset: [0, 1],
  lightTimingCustom: [0,1], lightHoldRed: [0,60], lightHoldGreen: [0,60], lightHoldBlue: [0,60], lightCrossfade: [.1,30],
  gap: [0, 0.4], bevel: [0, 0.6], ior: [1, 2.5], dispersion: [0, 0.15],
  roughness: [0, 0.3], surfaceCurvature: [0, 0.24], reflection: [0, 2], absorption: [0, 2], lightIntensity: [0, 5],
  lightSpread: [0.2, 2], red: [0, 2], green: [0, 2], blue: [0, 2], exposure: [0.25, 3],
  zoom: OPTICAL_ZOOM_RANGE, azimuth: [-180, 180], elevation: [-80, 80],
  time: [0, 300], duration: [1, 300], speed: [0, 1], bounces: [1, 16],
  dimensionTop: [0, 50], dimensionLeft: [0, 50], dimensionRight: [0, 50], bloom: [0, 1],
  dimensionSpacing: [0.06, 0.3], dimensionSoftness: [0.05, 1], dimensionFalloff: [0, 1],
  dimensionSpacingTop: [.06, .3], dimensionSpacingLeft: [.06, .3], dimensionSpacingRight: [.06, .3],
  layerLightContrast: [0, 1], layerLightLength: [.25, 6], layerLightCycles: [0, 6],
  videoLongEdge: [1920, 3840], videoFps: [24, 60], videoSamples: [4, 64],
  customAspectWidth: [1, 10000], customAspectHeight: [1, 10000],
};

export function snapshotOpticalSettings(state: OpticalState): Partial<OpticalState> {
  // Other artboards' saved/draft cameras and the variation catalogue are
  // workspace data. Keeping them out prevents recursive snapshots and avoids
  // replacing profiles created after this variation was saved.
  const { cameraProfiles: _profiles, cameraDrafts: _drafts,
    variations: _variations, activeVariationId: _active, ...settings } = state;
  return { ...settings };
}

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
  state.customAspectWidth = Math.round(state.customAspectWidth);
  state.customAspectHeight = Math.round(state.customAspectHeight);
  // Keep the displayed custom ratio identical to the rendered one. Beyond
  // 20:1 the 4K long-edge format becomes too thin to be a useful artboard.
  if (state.customAspectWidth > state.customAspectHeight * 20) state.customAspectWidth = state.customAspectHeight * 20;
  if (state.customAspectHeight > state.customAspectWidth * 20) state.customAspectHeight = state.customAspectWidth * 20;
  for (const field of ['cameraProfiles', 'cameraDrafts'] as const) {
    const source = data[field];
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const normalized: Record<string, OpticalCameraView> = {};
    for (const preset of OPTICAL_ASPECTS) {
      const view = source[preset.id];
      if (!view || typeof view !== 'object') continue;
      if (!OPTICAL_CAMERA_KEYS.every(key => typeof view[key] === 'number' && Number.isFinite(view[key]))) continue;
      normalized[preset.id] = {
        zoom: Math.max(ranges.zoom[0], Math.min(ranges.zoom[1], view.zoom)),
        panX: Math.max(ranges.panX[0], Math.min(ranges.panX[1], view.panX)),
        azimuth: Math.max(ranges.azimuth[0], Math.min(ranges.azimuth[1], view.azimuth)),
        elevation: Math.max(ranges.elevation[0], Math.min(ranges.elevation[1], view.elevation)),
      };
    }
    state[field] = normalized;
  }
  state.identityTransition = Math.round(state.identityTransition);
  state.hybridColorMode = Math.round(state.hybridColorMode);
  state.lightTimingCustom = Math.round(state.lightTimingCustom);
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
  state.videoSamples = [4, 16, 64].includes(data.videoSamples ?? 0) ? data.videoSamples! : OPTICAL_DEFAULTS.videoSamples;
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
  if (Array.isArray(data.variations)) {
    const seen = new Set<string>();
    state.variations = data.variations.slice(0, 60).flatMap(candidate => {
      if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(candidate.id) || seen.has(candidate.id) ||
        typeof candidate.name !== 'string' || !candidate.name.trim() ||
        !candidate.settings || typeof candidate.settings !== 'object' || Array.isArray(candidate.settings)) return [];
      seen.add(candidate.id);
      const settings = sanitizeOpticalState({ ...candidate.settings, variations: [] });
      return [{ id: candidate.id, name: candidate.name.trim().slice(0, 60),
        savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt.slice(0, 40) : '',
        settings: snapshotOpticalSettings(settings) }];
    });
  }
  if (typeof data.activeVariationId === 'string' && state.variations.some(v => v.id === data.activeVariationId)) {
    state.activeVariationId = data.activeVariationId;
  }
  return state;
}

export const OPTICAL_ASPECTS = [
  { id: 'main', label: '1:1', ratio: 1 },
  { id: '4x5', label: '4:5', ratio: 4/5 },
  { id: '9x16', label: '9:16', ratio: 9/16 },
  { id: '16x9', label: '16:9', ratio: 16/9 },
  { id: 'a-series', label: 'A시리즈 · 세로', ratio: 1/Math.SQRT2 },
  { id: '3x2', label: '3:2', ratio: 3/2 },
  { id: 'custom', label: '직접 입력', ratio: 1 },
] as const;

export function opticalAspectRatio(state: Pick<OpticalState, 'aspect' | 'customAspectWidth' | 'customAspectHeight'>): number {
  return state.aspect === 'custom'
    ? Math.max(1 / 20, Math.min(20, state.customAspectWidth / state.customAspectHeight))
    : OPTICAL_ASPECTS.find(preset => preset.id === state.aspect)?.ratio ?? 1;
}

export function opticalAspectLabel(state: Pick<OpticalState, 'aspect' | 'customAspectWidth' | 'customAspectHeight'>): string {
  return state.aspect === 'custom' ? `${state.customAspectWidth}:${state.customAspectHeight}`
    : OPTICAL_ASPECTS.find(preset => preset.id === state.aspect)?.label ?? '1:1';
}

export function opticalDimensions(aspect: string | Pick<OpticalState, 'aspect' | 'customAspectWidth' | 'customAspectHeight'>, longEdge = 3840): [number, number] {
  const ratio = typeof aspect === 'string'
    ? OPTICAL_ASPECTS.find(preset => preset.id === aspect)?.ratio ?? 1
    : opticalAspectRatio(aspect);
  return ratio >= 1 ? [longEdge, Math.round(longEdge / ratio)] : [Math.round(longEdge * ratio), longEdge];
}

/** H.264/HEVC requires even dimensions. PNG keeps nearest-pixel rounding. */
export function opticalVideoDimensions(aspect: string | Pick<OpticalState, 'aspect' | 'customAspectWidth' | 'customAspectHeight'>, longEdge = 3840): [number, number] {
  const [w,h] = opticalDimensions(aspect,longEdge);
  return [w+w%2,h+h%2];
}
