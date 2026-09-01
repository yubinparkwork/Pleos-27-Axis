import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";
import { PLEOS_COLORS } from "../../brand/colors";

export type AxisMegastructurePresetId = "abyssal-core" | "violet-foundry" | "cold-archive";
export type AxisMegastructureQuality = "low" | "medium" | "high" | "ultra";

export interface AxisMegastructureState {
  version: 3;
  preset: AxisMegastructurePresetId;
  seed: number;
  axis: {
    positionX: number; positionY: number; positionZ: number;
    rotationX: number; rotationY: number; rotationZ: number;
    length: number; width: number; depth: number; visualMass: number;
    channelCount: number; channelSpacing: number; surfaceComplexity: number;
    emission: number; localIllumination: number; visibilityHierarchy: number;
  };
  camera: {
    positionX: number; positionY: number; positionZ: number;
    targetX: number; targetY: number; targetZ: number;
    fov: number; roll: number; near: number; far: number;
    drift: number; motionSpeed: number; parallax: number;
  };
  macro: {
    density: number; wallProximity: number; leftMass: number; rightMass: number;
    upperMass: number; foregroundMass: number; macroScale: number; macroDepth: number;
    canyonWidth: number; irregularity: number; voidAmount: number;
  };
  subdivision: {
    enabled: boolean; depth: number; probability: number; minCellSize: number; maxCellSize: number;
    horizontalProbability: number; verticalProbability: number; irregularity: number;
    inset: number; gap: number; localDensityVariation: number;
  };
  panels: {
    extrusionProbability: number; extrusionMin: number; extrusionMax: number;
    recessProbability: number; recessMin: number; recessMax: number;
    density: number; thickness: number; scaleVariation: number; depthVariation: number;
  };
  greeble: {
    enabled: boolean; density: number; minScale: number; maxScale: number; height: number;
    recessProbability: number; repetition: number; irregularity: number; orientationBias: number;
  };
  micro: {
    enabled: boolean; density: number;
    frequency1: number; frequency2: number; frequency3: number; frequency4: number; frequency5: number;
    lineThickness: number; pathComplexity: number; pathInterruption: number; branching: number;
    nodeProbability: number; brightness: number; emissivePercentage: number;
    cyanPercentage: number; magentaPercentage: number; surfaceContrast: number;
  };
  material: {
    baseDarkness: number; roughness: number; roughnessVariation: number; metalness: number;
    specular: number; reflectionStrength: number; normalStrength: number; surfaceMicroVariation: number;
  };
  lighting: {
    exposure: number; ambientIntensity: number; magentaInternal: number; violetInternal: number;
    coolHighlight: number; rimStrength: number; bounceStrength: number;
    cavityIllumination: number; lightFalloff: number;
  };
  bloom: { enabled: boolean; threshold: number; strength: number; radius: number; softKnee: number };
  ao: { enabled: boolean; intensity: number; radius: number; distanceFalloff: number; cavityStrength: number };
  atmosphere: {
    fogEnabled: boolean; fogDensity: number; fogStart: number; fogFalloff: number;
    fogDarkness: number; violetContribution: number; distanceContrast: number;
  };
  generation: {
    enabled: boolean; radius: number; influenceFalloff: number; activationSpeed: number;
    activationFrequency: number; propagationSpeed: number; recursionResponse: number;
    panelResponse: number; greebleResponse: number; circuitResponse: number; emissionResponse: number;
    stagger: number; randomness: number; loopEnabled: boolean; duration: number; time: number;
    debugInfluence: boolean;
  };
  performance: { quality: AxisMegastructureQuality; postprocessing: boolean };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): AxisMegastructureState => ({
  version: 3, preset: "abyssal-core", seed: 27127,
  axis: {
    positionX: 0, positionY: -1.35, positionZ: -80, rotationX: 0, rotationY: 0, rotationZ: 0,
    length: 220, width: 3.45, depth: 2.15, visualMass: 1.08, channelCount: 5, channelSpacing: .24,
    surfaceComplexity: .78, emission: 2.35, localIllumination: 1.02, visibilityHierarchy: 1.18,
  },
  camera: {
    positionX: 1.65, positionY: 2.8, positionZ: 13, targetX: 0, targetY: -1.2, targetZ: -96,
    fov: 72, roll: -.25, near: .06, far: 380, drift: .065, motionSpeed: .14, parallax: .14,
  },
  macro: {
    density: .9, wallProximity: .82, leftMass: 1, rightMass: 1, upperMass: .86, foregroundMass: .9,
    macroScale: 1, macroDepth: 1.12, canyonWidth: .94, irregularity: .3, voidAmount: .075,
  },
  subdivision: {
    enabled: true, depth: 5, probability: .88, minCellSize: .12, maxCellSize: 1,
    horizontalProbability: .52, verticalProbability: .48, irregularity: .74,
    inset: .035, gap: .028, localDensityVariation: .4,
  },
  panels: {
    extrusionProbability: .44, extrusionMin: .035, extrusionMax: .48,
    recessProbability: .38, recessMin: .025, recessMax: .34,
    density: .9, thickness: .1, scaleVariation: .34, depthVariation: .72,
  },
  greeble: {
    enabled: true, density: .84, minScale: .035, maxScale: .28, height: .28,
    recessProbability: .18, repetition: .42, irregularity: .66, orientationBias: .82,
  },
  micro: {
    enabled: true, density: .96, frequency1: 1.6, frequency2: 4.8, frequency3: 13,
    frequency4: 34, frequency5: 91, lineThickness: .038, pathComplexity: .86,
    pathInterruption: .42, branching: .68, nodeProbability: .035, brightness: 4.2,
    emissivePercentage: .11, cyanPercentage: .07, magentaPercentage: .2, surfaceContrast: .88,
  },
  material: {
    baseDarkness: .94, roughness: .46, roughnessVariation: .38, metalness: .42,
    specular: .82, reflectionStrength: 1.35, normalStrength: .46, surfaceMicroVariation: .72,
  },
  lighting: {
    exposure: 1.02, ambientIntensity: .09, magentaInternal: 4.8, violetInternal: 2.9,
    coolHighlight: 3.4, rimStrength: 5.8, bounceStrength: .72,
    cavityIllumination: .64, lightFalloff: 1.4,
  },
  bloom: { enabled: true, threshold: 1.18, strength: .36, radius: .18, softKnee: .26 },
  ao: { enabled: true, intensity: 1.18, radius: .36, distanceFalloff: 1.25, cavityStrength: .9 },
  atmosphere: {
    fogEnabled: true, fogDensity: .011, fogStart: 26, fogFalloff: 1.2,
    fogDarkness: .96, violetContribution: .16, distanceContrast: .78,
  },
  generation: {
    enabled: true, radius: 16, influenceFalloff: .72, activationSpeed: .82,
    activationFrequency: 1, propagationSpeed: .74, recursionResponse: .88,
    panelResponse: .92, greebleResponse: .82, circuitResponse: 1, emissionResponse: .86,
    stagger: .52, randomness: .18, loopEnabled: true, duration: 18, time: 0,
    debugInfluence: false,
  },
  performance: { quality: "ultra", postprocessing: true },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, background: PLEOS_COLORS.black, transparent: false, scale: 1 },
  export: { ppi: 300 },
});

export const AXIS_MEGASTRUCTURE_PRESETS: Readonly<Record<AxisMegastructurePresetId, AxisMegastructureState>> = {
  "abyssal-core": base(),
  "violet-foundry": {
    ...base(), preset: "violet-foundry", seed: 27403,
    axis: { ...base().axis, width: 3.25, depth: 2.7, channelCount: 7, emission: 3.1 },
    camera: { ...base().camera, positionX: -1.25, positionY: 2.2, targetY: -1.2, targetZ: -104, fov: 78, roll: -1.1 },
    macro: { ...base().macro, wallProximity: .94, upperMass: 1, foregroundMass: 1, canyonWidth: .7, irregularity: .46 },
    subdivision: { ...base().subdivision, depth: 6, probability: .92, irregularity: .82, localDensityVariation: .52 },
    panels: { ...base().panels, extrusionProbability: .54, recessProbability: .46, density: .96 },
    greeble: { ...base().greeble, density: .96, height: .36, irregularity: .78 },
    micro: { ...base().micro, density: 1, frequency4: 42, frequency5: 118, brightness: 4.8, magentaPercentage: .25 },
    lighting: { ...base().lighting, magentaInternal: 5.2, violetInternal: 4.6, bounceStrength: .82 },
    bloom: { ...base().bloom, strength: .42, threshold: 1.26 },
    atmosphere: { ...base().atmosphere, fogDensity: .014, violetContribution: .24 },
  },
  "cold-archive": {
    ...base(), preset: "cold-archive", seed: 27661,
    axis: { ...base().axis, width: 3.5, depth: 2.9, visualMass: 1.18, channelCount: 4, emission: 2.1 },
    camera: { ...base().camera, positionX: 1.6, positionY: .4, targetY: -1.6, targetZ: -116, fov: 67, roll: .55 },
    macro: { ...base().macro, wallProximity: .8, leftMass: .92, rightMass: 1, upperMass: .72, macroDepth: 1.28, canyonWidth: .94, irregularity: .2 },
    subdivision: { ...base().subdivision, depth: 5, probability: .8, horizontalProbability: .62, verticalProbability: .38, gap: .02 },
    panels: { ...base().panels, extrusionProbability: .32, recessProbability: .56, extrusionMax: .3, recessMax: .48 },
    greeble: { ...base().greeble, density: .68, maxScale: .38, repetition: .58, irregularity: .38 },
    micro: { ...base().micro, brightness: 5, emissivePercentage: .075, cyanPercentage: .18, magentaPercentage: .08, surfaceContrast: 1.05 },
    material: { ...base().material, baseDarkness: .96, roughness: .36, metalness: .58, reflectionStrength: 1.6 },
    lighting: { ...base().lighting, magentaInternal: 2.2, violetInternal: 2.8, coolHighlight: 5.8, rimStrength: 7.2, bounceStrength: .52 },
    bloom: { ...base().bloom, strength: .26, threshold: 1.34, radius: .12 },
    atmosphere: { ...base().atmosphere, fogDensity: .008, violetContribution: .08, distanceContrast: .92 },
  },
};

export function cloneAxisMegastructureState(state: AxisMegastructureState): AxisMegastructureState { return JSON.parse(JSON.stringify(state)) as AxisMegastructureState; }
export function createAxisMegastructureState(preset: AxisMegastructurePresetId = "abyssal-core"): AxisMegastructureState { return cloneAxisMegastructureState(AXIS_MEGASTRUCTURE_PRESETS[preset]); }
function merge<T extends object>(fallback: T, candidate: unknown): T { return { ...fallback, ...(candidate && typeof candidate === "object" ? candidate : {}) }; }

export function sanitizeAxisMegastructureState(value: unknown): AxisMegastructureState {
  const candidate = value as Partial<AxisMegastructureState> | null;
  const preset = candidate?.preset && candidate.preset in AXIS_MEGASTRUCTURE_PRESETS ? candidate.preset : "abyssal-core";
  const fallback = createAxisMegastructureState(preset);
  const source = candidate?.version === 3 ? candidate : { ...candidate, axis: fallback.axis, camera: fallback.camera, macro: fallback.macro };
  return {
    ...fallback, ...source, version: 3, preset,
    axis: merge(fallback.axis, source?.axis), camera: merge(fallback.camera, source?.camera), macro: merge(fallback.macro, source?.macro),
    subdivision: merge(fallback.subdivision, source?.subdivision), panels: merge(fallback.panels, source?.panels), greeble: merge(fallback.greeble, source?.greeble),
    micro: merge(fallback.micro, source?.micro), material: merge(fallback.material, source?.material), lighting: merge(fallback.lighting, source?.lighting),
    bloom: merge(fallback.bloom, source?.bloom), ao: merge(fallback.ao, source?.ao), atmosphere: merge(fallback.atmosphere, source?.atmosphere),
    generation: merge(fallback.generation, source?.generation), performance: merge(fallback.performance, source?.performance),
    artboard: { ...fallback.artboard, ...source?.artboard, transparent: false, background: PLEOS_COLORS.black, axisAnchor: { ...fallback.artboard.axisAnchor, ...source?.artboard?.axisAnchor } },
    export: merge(fallback.export, source?.export),
  };
}
