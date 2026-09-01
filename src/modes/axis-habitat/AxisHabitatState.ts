import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type AxisHabitatPresetId = "frosted-formation" | "obsidian-signal" | "blue-archive";
export type AxisHabitatQuality = "auto" | "performance" | "balanced" | "quality" | "ultra";
export type AxisHabitatMotionOrder = "clustered" | "center-out" | "solid-cascade";
export type AxisHabitatMotionEase = "cinematic" | "smooth" | "snappy" | "elastic";

export interface AxisHabitatState {
  version: 5;
  preset: AxisHabitatPresetId;
  structure: {
    scale: number;
    subdivisions: number;
    fragmentGap: number;
    bevel: number;
    explodeDistance: number;
    twist: number;
    connectorDensity: number;
  };
  material: {
    roughness: number;
    metalness: number;
    clearcoat: number;
    bump: number;
    transmission: number;
  };
  lines: {
    scaffoldOpacity: number;
    connectorOpacity: number;
    glow: number;
  };
  luminous: {
    structureDensity: number;
    longLineProbability: number;
    triangleProbability: number;
    gridRegularity: number;
    depthSpread: number;
    randomness: number;
    coreWidth: number;
    coreIntensity: number;
    glowWidth: number;
    glowIntensity: number;
    haloWidth: number;
    lineOpacity: number;
    colorVariation: number;
    brightnessRandomness: number;
    widthRandomness: number;
    revealRandomness: number;
    trailLength: number;
    flashIntensity: number;
    flareProbability: number;
    anamorphicStreak: number;
    chromaticDispersion: number;
    bloomThreshold: number;
    bloomRadius: number;
    vignette: number;
    grain: number;
  };
  atmosphere: {
    dust: number;
    fogDensity: number;
    floorReflectivity: number;
  };
  camera: {
    fov: number;
    distance: number;
    elevation: number;
    orbit: number;
    parallax: number;
  };
  lighting: {
    exposure: number;
    bloom: number;
    key: number;
    rim: number;
    ambient: number;
  };
  performance: {
    quality: AxisHabitatQuality;
    adaptiveDpr: boolean;
    postprocessing: boolean;
  };
  motion: {
    enabled: boolean;
    time: number;
    duration: number;
    speed: number;
    order: AxisHabitatMotionOrder;
    ease: AxisHabitatMotionEase;
    timing: {
      draw: number;
      assemble: number;
      drawAssembleOverlap: number;
      materialize: number;
      assembleMaterialOverlap: number;
      materialHold: number;
      explode: number;
      suspended: number;
      return: number;
      returnHold: number;
      dissolve: number;
      dissolveResetOverlap: number;
      reset: number;
      resetHold: number;
    };
    dynamics: {
      assembleStagger: number;
      explodeStagger: number;
      spawnSpread: number;
      turbulence: number;
      turbulenceSpeed: number;
      returnOvershoot: number;
      floatAmount: number;
      floatSpeed: number;
      surfaceFade: number;
      cameraPullback: number;
      connectorDelay: number;
      connectorPersistence: number;
    };
  };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): AxisHabitatState => ({
  version: 5,
  preset: "frosted-formation",
  structure: {
    scale: 1,
    subdivisions: 5,
    fragmentGap: .035,
    bevel: .055,
    explodeDistance: 1.55,
    twist: .48,
    connectorDensity: .3,
  },
  material: { roughness: .3, metalness: .03, clearcoat: .78, bump: .1, transmission: .04 },
  lines: { scaffoldOpacity: .18, connectorOpacity: .38, glow: .75 },
  luminous: {
    structureDensity: .52,
    longLineProbability: .22,
    triangleProbability: .2,
    gridRegularity: .36,
    depthSpread: .72,
    randomness: .62,
    coreWidth: .018,
    coreIntensity: 6.5,
    glowWidth: .056,
    glowIntensity: 2.2,
    haloWidth: .11,
    lineOpacity: .92,
    colorVariation: .34,
    brightnessRandomness: .58,
    widthRandomness: .52,
    revealRandomness: .48,
    trailLength: .26,
    flashIntensity: 8,
    flareProbability: .16,
    anamorphicStreak: .62,
    chromaticDispersion: .28,
    bloomThreshold: .88,
    bloomRadius: .56,
    vignette: .18,
    grain: .035,
  },
  atmosphere: { dust: 180, fogDensity: .01, floorReflectivity: .22 },
  camera: { fov: 30, distance: 12, elevation: 0, orbit: 0, parallax: .18 },
  lighting: { exposure: .92, bloom: .1, key: 3.4, rim: 3.6, ambient: .28 },
  performance: { quality: "quality", adaptiveDpr: false, postprocessing: true },
  motion: {
    enabled: true,
    time: 0,
    duration: 12,
    speed: 1,
    order: "clustered",
    ease: "cinematic",
    timing: {
      draw: 1.2,
      assemble: 1.55,
      drawAssembleOverlap: .48,
      materialize: .9,
      assembleMaterialOverlap: .65,
      materialHold: .83,
      explode: 1.45,
      suspended: .75,
      return: 1.58,
      returnHold: .59,
      dissolve: .72,
      dissolveResetOverlap: .46,
      reset: .9,
      resetHold: .35,
    },
    dynamics: {
      assembleStagger: .22,
      explodeStagger: .13,
      spawnSpread: 1,
      turbulence: .065,
      turbulenceSpeed: .82,
      returnOvershoot: .08,
      floatAmount: .025,
      floatSpeed: .48,
      surfaceFade: .18,
      cameraPullback: .12,
      connectorDelay: .19,
      connectorPersistence: .18,
    },
  },
  artboard: {
    ...DEFAULT_ARTBOARD,
    axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor },
    background: "#000000",
    transparent: false,
    scale: .98,
  },
  export: { ppi: 300 },
});

export const AXIS_HABITAT_PRESETS: Readonly<Record<AxisHabitatPresetId, AxisHabitatState>> = {
  "frosted-formation": base(),
  "obsidian-signal": {
    ...base(),
    preset: "obsidian-signal",
    structure: { ...base().structure, fragmentGap: .07, explodeDistance: 1.9, connectorDensity: .42 },
    material: { roughness: .3, metalness: .24, clearcoat: .82, bump: .1, transmission: .02 },
    lines: { scaffoldOpacity: .84, connectorOpacity: .68, glow: 1.1 },
    luminous: { ...base().luminous, structureDensity: .68, longLineProbability: .3, gridRegularity: .22, randomness: .78, coreIntensity: 10.5, glowIntensity: 4.1, colorVariation: .42, flareProbability: .22, flashIntensity: 17, anamorphicStreak: .78 },
    atmosphere: { dust: 340, fogDensity: .025, floorReflectivity: .5 },
    camera: { fov: 31, distance: 12, elevation: 0, orbit: 0, parallax: .24 },
    lighting: { exposure: 1.12, bloom: .32, key: 3.5, rim: 4.1, ambient: .58 },
    motion: {
      ...base().motion,
      ease: "snappy",
      timing: { ...base().motion.timing, explode: 1.15, suspended: 1.05, return: 1.35 },
      dynamics: { ...base().motion.dynamics, explodeStagger: .22, turbulence: .11, turbulenceSpeed: 1.15, returnOvershoot: .14 },
    },
    artboard: { ...base().artboard, axisAnchor: { ...base().artboard.axisAnchor }, background: "#000000" },
  },
  "blue-archive": {
    ...base(),
    preset: "blue-archive",
    structure: { ...base().structure, subdivisions: 6, fragmentGap: .04, explodeDistance: 1.7, twist: .42, connectorDensity: .48 },
    material: { roughness: .4, metalness: .12, clearcoat: .68, bump: .12, transmission: .06 },
    lines: { scaffoldOpacity: .92, connectorOpacity: .74, glow: 1.22 },
    luminous: { ...base().luminous, structureDensity: .76, triangleProbability: .32, gridRegularity: .28, depthSpread: .86, coreIntensity: 9.2, glowIntensity: 3.8, colorVariation: .58, chromaticDispersion: .42, flareProbability: .2 },
    atmosphere: { dust: 420, fogDensity: .021, floorReflectivity: .4 },
    camera: { fov: 28, distance: 12, elevation: 0, orbit: 0, parallax: .16 },
    lighting: { exposure: 1.02, bloom: .3, key: 3.8, rim: 3.7, ambient: .88 },
    motion: {
      ...base().motion,
      order: "center-out",
      ease: "smooth",
      timing: { ...base().motion.timing, draw: 1.5, assemble: 1.8, materialHold: 1.1, return: 1.9 },
      dynamics: { ...base().motion.dynamics, assembleStagger: .32, spawnSpread: 1.16, floatAmount: .04, connectorPersistence: .3 },
    },
    artboard: { ...base().artboard, axisAnchor: { ...base().artboard.axisAnchor }, background: "#000000" },
  },
};

export const cloneAxisHabitatState = (state: AxisHabitatState): AxisHabitatState => JSON.parse(JSON.stringify(state)) as AxisHabitatState;
export const createAxisHabitatState = (preset: AxisHabitatPresetId = "frosted-formation"): AxisHabitatState => cloneAxisHabitatState(AXIS_HABITAT_PRESETS[preset]);

const presetIds = new Set<AxisHabitatPresetId>(["frosted-formation", "obsidian-signal", "blue-archive"]);
const qualityIds = new Set<AxisHabitatQuality>(["auto", "performance", "balanced", "quality", "ultra"]);
const motionOrderIds = new Set<AxisHabitatMotionOrder>(["clustered", "center-out", "solid-cascade"]);
const motionEaseIds = new Set<AxisHabitatMotionEase>(["cinematic", "smooth", "snappy", "elastic"]);

export function sanitizeAxisHabitatState(value: unknown): AxisHabitatState {
  const candidate = value as (Partial<AxisHabitatState> & { version?: number }) | null;
  const preset = candidate?.preset && presetIds.has(candidate.preset) ? candidate.preset : "frosted-formation";
  const fallback = createAxisHabitatState(preset);
  const source = candidate?.version === 5 || candidate?.version === 4 || candidate?.version === 3 ? candidate : null;
  const quality = source?.performance?.quality && qualityIds.has(source.performance.quality) ? source.performance.quality : fallback.performance.quality;
  const order = source?.motion?.order && motionOrderIds.has(source.motion.order) ? source.motion.order : fallback.motion.order;
  const ease = source?.motion?.ease && motionEaseIds.has(source.motion.ease) ? source.motion.ease : fallback.motion.ease;
  return {
    ...fallback,
    ...source,
    version: 5,
    preset,
    structure: { ...fallback.structure, ...source?.structure },
    material: { ...fallback.material, ...source?.material },
    lines: { ...fallback.lines, ...source?.lines },
    luminous: { ...fallback.luminous, ...source?.luminous },
    atmosphere: { ...fallback.atmosphere, ...source?.atmosphere },
    camera: { ...fallback.camera, ...source?.camera },
    lighting: { ...fallback.lighting, ...source?.lighting },
    performance: { ...fallback.performance, ...source?.performance, quality },
    motion: {
      ...fallback.motion,
      ...source?.motion,
      order,
      ease,
      timing: { ...fallback.motion.timing, ...source?.motion?.timing },
      dynamics: { ...fallback.motion.dynamics, ...source?.motion?.dynamics },
    },
    artboard: {
      ...fallback.artboard,
      ...source?.artboard,
      transparent: false,
      axisAnchor: { ...fallback.artboard.axisAnchor, ...source?.artboard?.axisAnchor },
    },
    export: { ...fallback.export, ...source?.export },
  };
}
