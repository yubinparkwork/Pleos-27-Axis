export type Vec3 = [number, number, number];
export type MattePresetId = "matte-reference" | "matte-graphite" | "matte-pleos-blue";
export type PrismPresetId = "prism-clear" | "prism-smoked" | "prism-pleos-blue" | "prism-full-spectrum";

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

export const MATTE_PRESETS: Record<MattePresetId, { name: string; state: MatteState }> = {
  "matte-reference": {
    name: "Matte Reference",
    state: { baseColor: [0.24, 0.24, 0.24], faceVariation: 0.34, roughness: 0.78, diffuseStrength: 1, specularStrength: 0.2, specularTint: [0.9, 0.9, 0.9], microStrength: 0.045, microScale: 310, ambientStrength: 0.42 },
  },
  "matte-graphite": {
    name: "Matte Graphite",
    state: { baseColor: [0.019382, 0.019382, 0.019382], faceVariation: 0.12, roughness: 0.72, diffuseStrength: 0.82, specularStrength: 0.13, specularTint: [0.72, 0.72, 0.72], microStrength: 0.075, microScale: 540, ambientStrength: 0.2 },
  },
  "matte-pleos-blue": {
    name: "Matte Pleos Blue",
    state: { baseColor: [0.004777, 0.016807, 0.102242], faceVariation: 0.1, roughness: 0.78, diffuseStrength: 0.92, specularStrength: 0.18, specularTint: [0.610496, 0.715694, 1], microStrength: 0.04, microScale: 360, ambientStrength: 0.24 },
  },
};

export const PRISM_PRESETS: Record<PrismPresetId, { name: string; state: PrismState }> = {
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
