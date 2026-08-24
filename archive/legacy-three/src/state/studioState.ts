export type RendererMode = "reference-3d" | "studio-3d" | "split-compare";
export type AxisFamily = "30deg" | "45deg";
export type AxisVariationId =
  | "30-basic" | "30-v1" | "30-v2" | "30-v3"
  | "45-basic" | "45-v1" | "45-v2" | "45-v3";
export type ExpressionLevel = "level-1-restrained" | "level-2-balanced" | "level-3-active";
export type ExpressionDirection = "indirect" | "direct";
export type ColorFamily = "grayscale" | "red" | "green" | "blue";
export type CameraMode = "reference-orthographic" | "perspective-exploration";
export type MotionPresetId =
  | "fold-breath" | "depth-pulse" | "layer-reveal" | "axis-light-sweep"
  | "material-scan" | "node-flow" | "circuit-build" | "orbit-loop";
export type MaterialPresetId =
  | "reference-matte" | "matte-graphite" | "brushed-aluminum" | "black-chrome"
  | "smoked-glass" | "frosted-acrylic" | "automotive-clearcoat"
  | "technical-polymer" | "paper-fiber" | "micro-perforated" | "carbon-weave";
export type SpectralPresetId = "optical-crystal" | "smoked-spectral-glass" | "pleos-blue-crystal" | "thin-film-crystal" | "black-optical-glass" | "experimental-prism" | "soft-spectral-caustic" | "pleos-blue-spectral" | "full-spectrum-experimental" | "dark-violet-caustic";
export type SpectralSurfaceMode = "flat" | "soft-curved" | "inflated" | "pinched" | "membrane";
export type SpectralOpticalMode = "projected-caustic" | "thin-film" | "dispersive-refraction" | "hybrid";
export type SpectralColorMode = "pleos-tone-on-tone" | "full-spectrum-experimental";
export type SpectralRenderQuality = "draft" | "balanced" | "high" | "ultra" | "final";
export type AxisStructureMode = "folded-surface" | "joined-hexahedra" | "corner-cubes" | "crystal-cluster";

export interface AxisStructureSettings {
  mode: AxisStructureMode;
  depth: number;
  cubeScale: number;
}

export interface SpectralSettings {
  enabled: boolean;
  preset: SpectralPresetId;
  surfaceMode: SpectralSurfaceMode;
  opticalMode: SpectralOpticalMode;
  colorMode: SpectralColorMode;
  quality: SpectralRenderQuality;
  geometryMode: "surface" | "optical-solid";
  bevelWidth: number;
  bevelSegments: number;
  bevelCurvature: number;
  edgeRoughness: number;
  edgeOpticalBoost: number;
  thicknessVariation: number;
  edgeThickness: number;
  centerThickness: number;
  volumeScale: number;
  surfaceWarp: number;
  fractureStrength: number;
  microDetail: number;
  bulge: number;
  curvature: number;
  tension: number;
  centerPinch: number;
  centerDepth: number;
  saddleStrength: number;
  edgeLockWidth: number;
  centerLockRadius: number;
  valleyWidth: number;
  asymmetry: number;
  spectralIntensity: number;
  spectralWidth: number;
  bandSoftness: number;
  bandCompression: number;
  spectralScale: number;
  spectralStretch: number;
  hueOffset: number;
  warmBias: number;
  violetBias: number;
  cyanAccent: number;
  whiteCore: number;
  causticContrast: number;
  curvatureInfluence: number;
  axisInfluence: number;
  centerInfluence: number;
  flowInfluence: number;
  dispersion: number;
  iridescence: number;
  spectralSamples: 3 | 5 | 7 | 9;
  iridescenceIOR: number;
  filmThicknessMin: number;
  filmThicknessMax: number;
  filmThicknessNoise: number;
  fresnelPower: number;
  roughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  attenuationDistance: number;
  internalDensity: number;
  absorptionStrength: number;
  imperfectionAmount: number;
  scratchScale: number;
  scratchDensity: number;
  surfaceWaviness: number;
  causticIntensity: number;
  finalSamples: 64 | 128 | 256;
  keyIntensity: number;
  warmCard: number;
  coolCard: number;
  centerAccent: number;
  bloom: number;
  haze: number;
  exposure: number;
  grain: number;
  dither: number;
  breath: number;
  flowSpeed: number;
  centerPulse: number;
  comparison: "render" | "reference" | "split" | "overlay" | "difference" | "luminance-difference";
  referenceOpacity: number;
}

export interface FoldState {
  centerZ: number;
  rayDepth: Record<string, number>;
}

export interface LayerSettings {
  enabled: boolean;
  preset: "single-surface" | "double-lamina" | "glass-stack" | "technical-sandwich" | "offset-wireframe" | "data-overlay" | "depth-array";
  count: number;
  spacing: number;
  opacity: number;
}

export interface ElementSettings {
  grid: boolean;
  nodes: boolean;
  connections: boolean;
  circuit: boolean;
  orbit: boolean;
  arrows: boolean;
  density: number;
  opacity: number;
}

export interface MotionSettings {
  preset: MotionPresetId;
  playing: boolean;
  time: number;
  duration: number;
  speed: number;
  loop: boolean;
  intensity: number;
}

export interface CameraSettings {
  mode: CameraMode;
  preset: "reference-front" | "front-perspective" | "three-quarter-left" | "three-quarter-right" | "low-angle" | "high-angle" | "macro-center" | "venue-led-wide";
  parallax: boolean;
  fov: number;
}

export interface LightingSettings {
  keyAngle: number;
  keyHeight: number;
  keyIntensity: number;
  fillIntensity: number;
  environmentIntensity: number;
  exposure: number;
}

export interface OutputSettings {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp" | "exr";
  supersampling: 1 | 2;
  transparent: boolean;
  quality: "draft" | "balanced" | "high" | "final";
}

export interface StudioState {
  version: 2;
  rendererMode: RendererMode;
  axisFamily: AxisFamily;
  variationId: AxisVariationId;
  anchor: { gridX: number; gridY: number };
  colorFamily: ColorFamily;
  materialPreset: MaterialPresetId;
  expressionLevel: ExpressionLevel;
  expressionDirection: ExpressionDirection;
  structure: AxisStructureSettings;
  fold: FoldState;
  layers: LayerSettings;
  elements: ElementSettings;
  motion: MotionSettings;
  camera: CameraSettings;
  lighting: LightingSettings;
  output: OutputSettings;
  spectral: SpectralSettings;
  showGrid: boolean;
  showAxisGuide: boolean;
  showWireframe: boolean;
  selectedFace: number | null;
  seed: number;
}

export const DEFAULT_RAY_DEPTH: Record<string, number> = {
  up: 0.03,
  down: -0.1,
  upperRight: 0.17,
  lowerRight: -0.15,
  lowerLeft: 0.11,
  upperLeft: -0.04,
  right: 0.08,
  left: -0.07,
};

export const DEFAULT_STATE: StudioState = {
  version: 2,
  rendererMode: "studio-3d",
  axisFamily: "30deg",
  variationId: "30-basic",
  anchor: { gridX: 10, gridY: 10 },
  colorFamily: "grayscale",
  materialPreset: "reference-matte",
  expressionLevel: "level-2-balanced",
  expressionDirection: "indirect",
  // The approved Axis remains the construction skeleton. The two optical
  // solids meet at the Axis origin, so the projected Axis is read from real
  // cube edges instead of being replaced by a decorative radial cluster.
  structure: { mode: "corner-cubes", depth: 0.42, cubeScale: 0.42 },
  fold: { centerZ: 0.06, rayDepth: { ...DEFAULT_RAY_DEPTH } },
  layers: { enabled: false, preset: "single-surface", count: 1, spacing: 0.08, opacity: 0.42 },
  elements: { grid: false, nodes: false, connections: false, circuit: false, orbit: false, arrows: false, density: 0.45, opacity: 0.7 },
  motion: { preset: "fold-breath", playing: false, time: 0, duration: 8, speed: 1, loop: true, intensity: 0.35 },
  camera: { mode: "reference-orthographic", preset: "reference-front", parallax: false, fov: 34 },
  lighting: { keyAngle: -38, keyHeight: 3.6, keyIntensity: 3.2, fillIntensity: 0.52, environmentIntensity: 0.62, exposure: 1 },
  output: { width: 2800, height: 2080, format: "png", supersampling: 1, transparent: false, quality: "high" },
  spectral: {
    enabled: false,
    preset: "soft-spectral-caustic",
    surfaceMode: "soft-curved",
    opticalMode: "hybrid",
    colorMode: "full-spectrum-experimental",
    quality: "balanced",
    geometryMode: "optical-solid",
    bevelWidth: 0.035,
    bevelSegments: 4,
    bevelCurvature: 0.72,
    edgeRoughness: 0.12,
    edgeOpticalBoost: 0.7,
    thicknessVariation: 0.22,
    edgeThickness: 0.34,
    centerThickness: 0.62,
    volumeScale: 1,
    surfaceWarp: 0.08,
    fractureStrength: 0.035,
    microDetail: 0.012,
    bulge: 0.32,
    curvature: 0.76,
    tension: 0.72,
    centerPinch: 0.72,
    centerDepth: 0.2,
    saddleStrength: 0.16,
    edgeLockWidth: 0.09,
    centerLockRadius: 0.075,
    valleyWidth: 0.3,
    asymmetry: 0.18,
    spectralIntensity: 1.2,
    spectralWidth: 0.23,
    bandSoftness: 0.66,
    bandCompression: 1.3,
    spectralScale: 1.25,
    spectralStretch: 0.58,
    hueOffset: 0.08,
    warmBias: 0.86,
    violetBias: 1.15,
    cyanAccent: 0.52,
    whiteCore: 0.72,
    causticContrast: 1.18,
    curvatureInfluence: 0.72,
    axisInfluence: 0.62,
    centerInfluence: 0.9,
    flowInfluence: 0.22,
    dispersion: 0.18,
    iridescence: 0.28,
    spectralSamples: 5,
    iridescenceIOR: 1.32,
    filmThicknessMin: 180,
    filmThicknessMax: 520,
    filmThicknessNoise: 0.08,
    fresnelPower: 3.2,
    roughness: 0.38,
    transmission: 0.12,
    thickness: 0.42,
    ior: 1.46,
    attenuationDistance: 1.8,
    internalDensity: 0.24,
    absorptionStrength: 0.42,
    imperfectionAmount: 0.08,
    scratchScale: 180,
    scratchDensity: 0.08,
    surfaceWaviness: 0.025,
    causticIntensity: 0.65,
    finalSamples: 128,
    keyIntensity: 1.25,
    warmCard: 1.1,
    coolCard: 0.94,
    centerAccent: 0.72,
    bloom: 0.12,
    haze: 0.06,
    exposure: 1,
    grain: 0.012,
    dither: 0.007,
    breath: 0.1,
    flowSpeed: 0.08,
    centerPulse: 0.05,
    comparison: "render",
    referenceOpacity: 0.5,
  },
  showGrid: false,
  showAxisGuide: false,
  showWireframe: false,
  selectedFace: null,
  seed: 27,
};

export function cloneState(state: StudioState): StudioState {
  return structuredClone(state);
}

export interface ExplorationPreset {
  id: string;
  name: string;
  level: 1 | 2 | 3;
  description: string;
  patch: Partial<StudioState>;
}

export const EXPLORATION_PRESETS: ExplorationPreset[] = [
  {
    id: "quiet-precision", name: "Quiet Precision", level: 1,
    description: "30° · matte · strict projection",
    patch: { axisFamily: "30deg", variationId: "30-basic", colorFamily: "grayscale", materialPreset: "reference-matte", expressionLevel: "level-1-restrained", camera: { ...DEFAULT_STATE.camera }, elements: { ...DEFAULT_STATE.elements }, layers: { ...DEFAULT_STATE.layers }, motion: { ...DEFAULT_STATE.motion, preset: "fold-breath", intensity: 0.14 } },
  },
  {
    id: "material-accuracy", name: "Material Accuracy", level: 1,
    description: "45° · brushed aluminum · light sweep",
    patch: { axisFamily: "45deg", variationId: "45-basic", materialPreset: "brushed-aluminum", expressionLevel: "level-1-restrained", motion: { ...DEFAULT_STATE.motion, preset: "axis-light-sweep", intensity: 0.26 } },
  },
  {
    id: "data-connection", name: "Data Connection", level: 2,
    description: "30° · blue polymer · node flow",
    patch: { axisFamily: "30deg", variationId: "30-v1", colorFamily: "blue", materialPreset: "technical-polymer", expressionLevel: "level-2-balanced", elements: { ...DEFAULT_STATE.elements, nodes: true, connections: true, density: 0.52 }, motion: { ...DEFAULT_STATE.motion, preset: "node-flow", playing: true } },
  },
  {
    id: "layered-ecosystem", name: "Layered Ecosystem", level: 2,
    description: "45° · glass stack · circuit",
    patch: { axisFamily: "45deg", variationId: "45-v1", colorFamily: "green", materialPreset: "smoked-glass", expressionLevel: "level-2-balanced", layers: { enabled: true, preset: "glass-stack", count: 3, spacing: 0.12, opacity: 0.28 }, elements: { ...DEFAULT_STATE.elements, grid: true, circuit: true, opacity: 0.52 }, motion: { ...DEFAULT_STATE.motion, preset: "layer-reveal", playing: true } },
  },
  {
    id: "pace-motion", name: "Pace Motion", level: 2,
    description: "30° · red clearcoat · depth pulse",
    patch: { axisFamily: "30deg", variationId: "30-v2", colorFamily: "red", materialPreset: "automotive-clearcoat", expressionLevel: "level-2-balanced", elements: { ...DEFAULT_STATE.elements, arrows: true }, motion: { ...DEFAULT_STATE.motion, preset: "depth-pulse", playing: true, intensity: 0.48 } },
  },
  {
    id: "flywheel-orbit", name: "Flywheel Orbit", level: 3,
    description: "45° · chrome · orbit system",
    patch: { axisFamily: "45deg", variationId: "45-v2", colorFamily: "grayscale", materialPreset: "black-chrome", expressionLevel: "level-3-active", camera: { mode: "perspective-exploration", preset: "three-quarter-left", parallax: true, fov: 36 }, elements: { ...DEFAULT_STATE.elements, nodes: true, connections: true, orbit: true, density: 0.7 }, motion: { ...DEFAULT_STATE.motion, preset: "orbit-loop", playing: true, intensity: 0.62 } },
  },
  {
    id: "material-shift", name: "Material Shift", level: 3,
    description: "30° · frosted acrylic · material scan",
    patch: { axisFamily: "30deg", variationId: "30-v3", colorFamily: "blue", materialPreset: "frosted-acrylic", expressionLevel: "level-3-active", camera: { mode: "perspective-exploration", preset: "front-perspective", parallax: true, fov: 32 }, motion: { ...DEFAULT_STATE.motion, preset: "material-scan", playing: true, intensity: 0.44 } },
  },
  {
    id: "spatial-circuit", name: "Spatial Circuit", level: 3,
    description: "45° · layered polymer · venue wide",
    patch: { axisFamily: "45deg", variationId: "45-v3", colorFamily: "green", materialPreset: "technical-polymer", expressionLevel: "level-3-active", layers: { enabled: true, preset: "technical-sandwich", count: 4, spacing: 0.16, opacity: 0.3 }, elements: { ...DEFAULT_STATE.elements, grid: true, nodes: true, circuit: true, connections: true, density: 0.78 }, camera: { mode: "perspective-exploration", preset: "venue-led-wide", parallax: false, fov: 42 }, motion: { ...DEFAULT_STATE.motion, preset: "circuit-build", playing: true, intensity: 0.58 } },
  },
];

export interface StaticCut {
  id: string;
  name: string;
  time: number;
  anchor: { gridX: number; gridY: number };
  cameraPreset: StudioState["camera"]["preset"];
}

export const STATIC_CUTS: StaticCut[] = [
  { id: "cut-01", name: "Cut 01", time: 0.08, anchor: { gridX: 10, gridY: 10 }, cameraPreset: "reference-front" },
  { id: "cut-02", name: "Cut 02", time: 0.27, anchor: { gridX: 14, gridY: 9 }, cameraPreset: "front-perspective" },
  { id: "cut-03", name: "Cut 03", time: 0.48, anchor: { gridX: 10, gridY: 10 }, cameraPreset: "macro-center" },
  { id: "cut-04", name: "Cut 04", time: 0.68, anchor: { gridX: 12, gridY: 12 }, cameraPreset: "low-angle" },
  { id: "cut-05", name: "Cut 05", time: 0.86, anchor: { gridX: 12, gridY: 10 }, cameraPreset: "three-quarter-right" },
];
