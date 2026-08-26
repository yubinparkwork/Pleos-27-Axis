export type Vec3 = [number, number, number];
export type MattePresetId = "matte-reference" | "matte-chromatic" | "matte-amber-flow" | "matte-graphite" | "matte-pleos-blue";
export type PrismPresetId = "prism-optical-cut" | "prism-clear" | "prism-smoked" | "prism-pleos-blue" | "prism-full-spectrum";

export interface MatteTextureState {
  pattern: "soft-caustic" | "amber-flow";
  enabled: boolean;
  strength: number;
  scale: number;
  rotation: number;
  flow: number;
  contrast: number;
  edgeGlow: number;
  edgeWidth: number;
  animationEnabled: boolean;
  animationPaused: boolean;
  animationSpeed: number;
  animationTravel: number;
  warpStrength: number;
  detailStrength: number;
  sheenStrength: number;
  darkColor: Vec3;
  hotColor: Vec3;
  softColor: Vec3;
  accentColor: Vec3;
}

export interface MatteState {
  baseColor: Vec3;
  faceVariation: number;
  roughness: number;
  diffuseStrength: number;
  specularStrength: number;
  specularTint: Vec3;
  microStrength: number;
  microScale: number;
  ambientStrength: number;
  texture: MatteTextureState;
}

export interface PrismState {
  baseIor: number;
  dispersion: number;
  spectralSamples: 3 | 5 | 7;
  spectrumStrength: number;
  edgeSpectrumStrength: number;
  internalSpectrumStrength: number;
  spectrumSaturation: number;
  spectrumSoftness: number;
  fresnelStrength: number;
  reflectionStrength: number;
  refractionStrength: number;
  absorptionColor: Vec3;
  absorptionDensity: number;
  absorptionDistance: number;
  internalDarkness: number;
  thicknessInfluence: number;
  surfaceRoughness: number;
  refractionRoughness: number;
  refractionBlur: number;
  iridescenceEnabled: boolean;
  iridescenceStrength: number;
  filmIor: number;
  filmThickness: number;
  filmThicknessVariation: number;
  experimental: boolean;
}

const referenceTexture = (overrides: Partial<MatteTextureState> = {}): MatteTextureState => ({
  pattern: "soft-caustic",
  enabled: false,
  strength: 0.86,
  scale: 2.4,
  rotation: -18,
  flow: 0.62,
  contrast: 1.25,
  edgeGlow: 0.48,
  edgeWidth: 0.055,
  animationEnabled: false,
  animationPaused: false,
  animationSpeed: 0.16,
  animationTravel: 1,
  warpStrength: 0.42,
  detailStrength: 0.58,
  sheenStrength: 0.62,
  darkColor: [0.0185, 0.0008, 0.0048],
  hotColor: [1, 0.0048, 0.0123],
  softColor: [1, 0.5271, 0.6038],
  accentColor: [0.5271, 0.0478, 0.402],
  ...overrides,
});

export const MATTE_PRESETS: Record<MattePresetId, { name: string; state: MatteState }> = {
  "matte-reference": {
    name: "Matte Reference",
    state: { baseColor: [0.24, 0.24, 0.24], faceVariation: 0.04, roughness: 0.82, diffuseStrength: 1, specularStrength: 0.14, specularTint: [0.9, 0.9, 0.9], microStrength: 0.035, microScale: 310, ambientStrength: 0.045, texture: referenceTexture() },
  },
  "matte-chromatic": {
    name: "Chromatic Texture",
    state: {
      baseColor: [0.025, 0.012, 0.09],
      faceVariation: 0.018,
      roughness: 0.64,
      diffuseStrength: 0.9,
      specularStrength: 0.28,
      specularTint: [0.34, 0.48, 1],
      microStrength: 0.025,
      microScale: 360,
      ambientStrength: 0.13,
      texture: referenceTexture({
        enabled: true,
        strength: 0.82,
        scale: 1.7,
        flow: 0.58,
        contrast: 1.02,
        edgeGlow: 0.72,
        edgeWidth: 0.085,
        animationEnabled: true,
        animationSpeed: 0.08,
        animationTravel: 0.72,
        warpStrength: 0.52,
        detailStrength: 0.28,
        sheenStrength: 0.48,
        darkColor: [0.0021, 0.0009, 0.0144],
        hotColor: [1, 0.025, 0.423],
        softColor: [0.485, 0.687, 1],
        accentColor: [0.068, 0.029, 0.807],
      }),
    },
  },
  "matte-amber-flow": {
    name: "Amber Flow",
    state: {
      baseColor: [0.012, 0.0035, 0.0007],
      faceVariation: 0.012,
      roughness: 0.56,
      diffuseStrength: 0.82,
      specularStrength: 0.42,
      specularTint: [1, 0.44, 0.08],
      microStrength: 0.018,
      microScale: 420,
      ambientStrength: 0.055,
      texture: referenceTexture({
        pattern: "amber-flow",
        enabled: true,
        strength: 0.96,
        scale: 2.15,
        rotation: 0,
        flow: 0.54,
        contrast: 1.22,
        edgeGlow: 1.28,
        edgeWidth: 0.034,
        animationEnabled: true,
        animationSpeed: 0.045,
        animationTravel: 0.46,
        warpStrength: 0.68,
        detailStrength: 0.32,
        sheenStrength: 0.76,
        darkColor: [0.0045, 0.0009, 0.00025],
        hotColor: [1, 0.19, 0.006],
        softColor: [1, 0.78, 0.25],
        accentColor: [0.42, 0.25, 0.009],
      }),
    },
  },
  "matte-graphite": {
    name: "Matte Graphite",
    state: { baseColor: [0.019382, 0.019382, 0.019382], faceVariation: 0.12, roughness: 0.72, diffuseStrength: 0.82, specularStrength: 0.13, specularTint: [0.72, 0.72, 0.72], microStrength: 0.075, microScale: 540, ambientStrength: 0.2, texture: referenceTexture() },
  },
  "matte-pleos-blue": {
    name: "Matte Pleos Blue",
    state: { baseColor: [0.004777, 0.016807, 0.102242], faceVariation: 0.1, roughness: 0.78, diffuseStrength: 0.92, specularStrength: 0.18, specularTint: [0.610496, 0.715694, 1], microStrength: 0.04, microScale: 360, ambientStrength: 0.24, texture: referenceTexture() },
  },
};

export const PRISM_PRESETS: Record<PrismPresetId, { name: string; state: PrismState }> = {
  "prism-optical-cut": {
    name: "Optical Cut Glass",
    state: {
      baseIor: 1.5,
      dispersion: 0.09,
      spectralSamples: 5,
      spectrumStrength: 0.2,
      edgeSpectrumStrength: 0.92,
      internalSpectrumStrength: 0.035,
      spectrumSaturation: 0.34,
      spectrumSoftness: 0.66,
      fresnelStrength: 1.16,
      reflectionStrength: 0.94,
      refractionStrength: 0.98,
      absorptionColor: [0.97, 0.985, 1],
      absorptionDensity: 0.1,
      absorptionDistance: 4.2,
      internalDarkness: 0.07,
      thicknessInfluence: 1.12,
      surfaceRoughness: 0.075,
      refractionRoughness: 0.05,
      refractionBlur: 0.028,
      iridescenceEnabled: true,
      iridescenceStrength: 0.055,
      filmIor: 1.34,
      filmThickness: 315,
      filmThicknessVariation: 0.14,
      experimental: false,
    },
  },
  "prism-clear": {
    name: "Clear Prism",
    state: { baseIor: 1.5, dispersion: 0.08, spectralSamples: 3, spectrumStrength: 0.35, edgeSpectrumStrength: 0.62, internalSpectrumStrength: 0.16, spectrumSaturation: 0.48, spectrumSoftness: 0.5, fresnelStrength: 1, reflectionStrength: 1, refractionStrength: 0.92, absorptionColor: [1, 1, 1], absorptionDensity: 0.16, absorptionDistance: 4, internalDarkness: 0.12, thicknessInfluence: 1, surfaceRoughness: 0.055, refractionRoughness: 0.045, refractionBlur: 0.03, iridescenceEnabled: false, iridescenceStrength: 0, filmIor: 1.3, filmThickness: 280, filmThicknessVariation: 0.1, experimental: false },
  },
  "prism-smoked": {
    name: "Smoked Prism",
    state: { baseIor: 1.56, dispersion: 0.06, spectralSamples: 3, spectrumStrength: 0.22, edgeSpectrumStrength: 0.54, internalSpectrumStrength: 0.1, spectrumSaturation: 0.32, spectrumSoftness: 0.62, fresnelStrength: 1.18, reflectionStrength: 1.2, refractionStrength: 0.68, absorptionColor: [0.074214, 0.074214, 0.074214], absorptionDensity: 0.72, absorptionDistance: 1.2, internalDarkness: 0.62, thicknessInfluence: 1.08, surfaceRoughness: 0.11, refractionRoughness: 0.16, refractionBlur: 0.12, iridescenceEnabled: false, iridescenceStrength: 0, filmIor: 1.3, filmThickness: 300, filmThicknessVariation: 0.1, experimental: false },
  },
  "prism-pleos-blue": {
    name: "Pleos Blue Prism",
    state: { baseIor: 1.52, dispersion: 0.055, spectralSamples: 5, spectrumStrength: 0.32, edgeSpectrumStrength: 0.76, internalSpectrumStrength: 0.12, spectrumSaturation: 0.54, spectrumSoftness: 0.58, fresnelStrength: 1.08, reflectionStrength: 1.08, refractionStrength: 0.82, absorptionColor: [0.061246, 0.127438, 1], absorptionDensity: 0.48, absorptionDistance: 2, internalDarkness: 0.3, thicknessInfluence: 1, surfaceRoughness: 0.075, refractionRoughness: 0.09, refractionBlur: 0.06, iridescenceEnabled: false, iridescenceStrength: 0, filmIor: 1.3, filmThickness: 320, filmThicknessVariation: 0.1, experimental: false },
  },
  "prism-full-spectrum": {
    name: "Full Spectrum Prism",
    state: { baseIor: 1.58, dispersion: 0.46, spectralSamples: 7, spectrumStrength: 1.12, edgeSpectrumStrength: 1.5, internalSpectrumStrength: 0.72, spectrumSaturation: 1.08, spectrumSoftness: 0.34, fresnelStrength: 1.12, reflectionStrength: 1.18, refractionStrength: 1.12, absorptionColor: [1, 1, 1], absorptionDensity: 0.22, absorptionDistance: 3, internalDarkness: 0.2, thicknessInfluence: 1.2, surfaceRoughness: 0.035, refractionRoughness: 0.035, refractionBlur: 0.02, iridescenceEnabled: true, iridescenceStrength: 0.2, filmIor: 1.38, filmThickness: 460, filmThicknessVariation: 0.24, experimental: true },
  },
};
