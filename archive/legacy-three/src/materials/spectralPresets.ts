import type { SpectralPresetId, SpectralSettings } from "../state/studioState";

export interface SpectralPresetDefinition {
  id: SpectralPresetId;
  name: string;
  description: string;
  experimental: boolean;
  patch: Partial<SpectralSettings>;
}

export const SPECTRAL_PRESETS: SpectralPresetDefinition[] = [
  {
    id: "optical-crystal", name: "Optical Crystal", description: "Neutral high-clarity solid · restrained spectral edges", experimental: false,
    patch: { enabled: true, geometryMode: "optical-solid", surfaceMode: "soft-curved", opticalMode: "dispersive-refraction", colorMode: "pleos-tone-on-tone", quality: "high",
      bevelWidth: 0.044, bevelSegments: 2, bevelCurvature: 0.76, edgeRoughness: 0.065, edgeOpticalBoost: 1.62, surfaceWarp: 0.028, fractureStrength: 0.014, microDetail: 0.003,
      spectralIntensity: 1.08, spectralWidth: 0.18, bandSoftness: 0.48, bandCompression: 1.62, dispersion: 0.24, spectralSamples: 9, iridescence: 0.16, roughness: 0.07, transmission: 0.82, thickness: 0.84, ior: 1.54,
      attenuationDistance: 1.65, internalDensity: 0.46, absorptionStrength: 0.58, imperfectionAmount: 0.045, surfaceWaviness: 0.018, causticIntensity: 1.28, warmCard: 1.02, coolCard: 1.28, violetBias: 0.18, cyanAccent: 0.92, whiteCore: 1.08, bloom: 0.025, haze: 0.006 },
  },
  {
    id: "smoked-spectral-glass", name: "Smoked Spectral Glass", description: "Dense neutral smoke · colored internal return", experimental: false,
    patch: { enabled: true, geometryMode: "optical-solid", opticalMode: "hybrid", colorMode: "pleos-tone-on-tone", quality: "high", bevelWidth: 0.05, bevelSegments: 7,
      edgeRoughness: 0.16, edgeOpticalBoost: 1.3, surfaceWarp: 0.055, fractureStrength: 0.03, spectralIntensity: 0.62, dispersion: 0.16, spectralSamples: 7,
      iridescence: 0.14, roughness: 0.18, transmission: 0.58, thickness: 1.1, ior: 1.56, attenuationDistance: 0.72, internalDensity: 0.9,
      absorptionStrength: 1.2, imperfectionAmount: 0.045, causticIntensity: 0.72, warmCard: 0.72, coolCard: 0.82, bloom: 0.02, haze: 0.01 },
  },
  {
    id: "pleos-blue-crystal", name: "Pleos Blue Crystal", description: "Brand blue volume · white optical core", experimental: false,
    patch: { enabled: true, geometryMode: "optical-solid", opticalMode: "hybrid", colorMode: "pleos-tone-on-tone", quality: "ultra", bevelWidth: 0.045, bevelSegments: 8,
      edgeRoughness: 0.1, edgeOpticalBoost: 1.28, surfaceWarp: 0.045, fractureStrength: 0.025, spectralIntensity: 1.05, dispersion: 0.12, spectralSamples: 9,
      iridescence: 0.16, roughness: 0.11, transmission: 0.78, thickness: 0.86, ior: 1.52, attenuationDistance: 1.4, internalDensity: 0.52,
      absorptionStrength: 0.82, imperfectionAmount: 0.035, causticIntensity: 1.0, warmCard: 0.32, coolCard: 1.35, violetBias: 0.34, bloom: 0.035, haze: 0.018 },
  },
  {
    id: "thin-film-crystal", name: "Thin Film Crystal", description: "Angle-driven film interference · clear body", experimental: true,
    patch: { enabled: true, geometryMode: "optical-solid", opticalMode: "thin-film", colorMode: "full-spectrum-experimental", quality: "ultra", bevelWidth: 0.035, bevelSegments: 8,
      edgeRoughness: 0.09, edgeOpticalBoost: 1.1, spectralIntensity: 0.58, dispersion: 0.1, spectralSamples: 9, iridescence: 0.72, iridescenceIOR: 1.38,
      filmThicknessMin: 160, filmThicknessMax: 640, filmThicknessNoise: 0.22, roughness: 0.08, transmission: 0.92, thickness: 0.56, ior: 1.5,
      attenuationDistance: 3.2, internalDensity: 0.12, absorptionStrength: 0.18, imperfectionAmount: 0.02, causticIntensity: 0.65, violetBias: 0.66, bloom: 0.025 },
  },
  {
    id: "black-optical-glass", name: "Black Optical Glass", description: "Near-black absorption · sharp edge reflections", experimental: false,
    patch: { enabled: true, geometryMode: "optical-solid", opticalMode: "dispersive-refraction", colorMode: "pleos-tone-on-tone", quality: "high", bevelWidth: 0.055, bevelSegments: 7,
      edgeRoughness: 0.12, edgeOpticalBoost: 1.7, surfaceWarp: 0.025, spectralIntensity: 0.25, dispersion: 0.06, spectralSamples: 5, iridescence: 0.05,
      roughness: 0.14, transmission: 0.22, thickness: 1.25, ior: 1.62, attenuationDistance: 0.28, internalDensity: 1.5, absorptionStrength: 2.1,
      imperfectionAmount: 0.03, causticIntensity: 0.3, warmCard: 0.52, coolCard: 0.72, bloom: 0.0, haze: 0.0 },
  },
  {
    id: "experimental-prism", name: "Experimental Prism", description: "Full dispersion · maximum optical expression", experimental: true,
    patch: { enabled: true, geometryMode: "optical-solid", opticalMode: "hybrid", colorMode: "full-spectrum-experimental", quality: "ultra", bevelWidth: 0.045, bevelSegments: 9,
      edgeRoughness: 0.07, edgeOpticalBoost: 1.55, surfaceWarp: 0.065, fractureStrength: 0.045, microDetail: 0.01, spectralIntensity: 1.45,
      dispersion: 0.42, spectralSamples: 9, iridescence: 0.42, iridescenceIOR: 1.42, filmThicknessMin: 140, filmThicknessMax: 760, filmThicknessNoise: 0.28,
      roughness: 0.08, transmission: 0.9, thickness: 0.8, ior: 1.58, attenuationDistance: 2.1, internalDensity: 0.28, absorptionStrength: 0.36,
      imperfectionAmount: 0.04, surfaceWaviness: 0.05, causticIntensity: 1.35, warmCard: 1.05, coolCard: 1.15, violetBias: 0.72, bloom: 0.05, haze: 0.02 },
  },
  {
    id: "soft-spectral-caustic",
    name: "Soft Spectral Caustic",
    description: "Neutral prism body · soft warm/cool caustics",
    experimental: true,
    patch: {
      enabled: true, surfaceMode: "soft-curved", opticalMode: "hybrid", colorMode: "full-spectrum-experimental", quality: "balanced",
      bulge: 0.34, curvature: 0.78, tension: 0.74, centerPinch: 0.76, centerDepth: 0.22, saddleStrength: 0.17,
      spectralIntensity: 1.08, spectralWidth: 0.24, bandSoftness: 0.72, bandCompression: 1.34, spectralScale: 1.18, hueOffset: 0.23,
      warmBias: 1.02, violetBias: 0.58, cyanAccent: 0.68, whiteCore: 0.82, causticContrast: 1.16,
      dispersion: 0.2, iridescence: 0.34, roughness: 0.16, transmission: 0.72, thickness: 0.58, ior: 1.52, bloom: 0.08, haze: 0.04,
    },
  },
  {
    id: "pleos-blue-spectral",
    name: "Pleos Blue Spectral",
    description: "Brand-safe Blue 4 → Blue 1 → white",
    experimental: false,
    patch: {
      enabled: true, surfaceMode: "inflated", opticalMode: "hybrid", colorMode: "pleos-tone-on-tone", quality: "high",
      bulge: 0.38, curvature: 0.82, centerPinch: 0.68, centerDepth: 0.18, saddleStrength: 0.13,
      spectralIntensity: 1.04, spectralWidth: 0.28, bandSoftness: 0.78, bandCompression: 1.18, spectralScale: 1.08,
      warmBias: 0.12, violetBias: 1.34, cyanAccent: 0.72, whiteCore: 0.5, causticContrast: 1.06,
      dispersion: 0.06, iridescence: 0.2, roughness: 0.2, transmission: 0.58, thickness: 0.52, ior: 1.5, bloom: 0.06, haze: 0.035,
    },
  },
  {
    id: "full-spectrum-experimental",
    name: "Full Spectrum Experimental",
    description: "Wide optical gamut · brand review required",
    experimental: true,
    patch: {
      enabled: true, surfaceMode: "membrane", opticalMode: "hybrid", colorMode: "full-spectrum-experimental", quality: "high",
      bulge: 0.4, curvature: 0.9, centerPinch: 0.82, centerDepth: 0.24, saddleStrength: 0.2,
      spectralIntensity: 1.5, spectralWidth: 0.2, bandSoftness: 0.6, bandCompression: 1.55, spectralScale: 1.42,
      warmBias: 1.08, violetBias: 1.12, cyanAccent: 0.72, whiteCore: 0.86, causticContrast: 1.28,
      dispersion: 0.3, iridescence: 0.46, roughness: 0.12, transmission: 0.78, thickness: 0.64, ior: 1.54, bloom: 0.1, haze: 0.05,
    },
  },
  {
    id: "dark-violet-caustic",
    name: "Dark Violet Caustic",
    description: "Near-black violet · restrained luminous center",
    experimental: true,
    patch: {
      enabled: true, surfaceMode: "pinched", opticalMode: "projected-caustic", colorMode: "full-spectrum-experimental", quality: "high",
      bulge: 0.3, curvature: 0.84, centerPinch: 0.9, centerDepth: 0.28, saddleStrength: 0.22,
      spectralIntensity: 0.86, spectralWidth: 0.18, bandSoftness: 0.74, bandCompression: 1.5, spectralScale: 1.3,
      warmBias: 0.68, violetBias: 1.48, cyanAccent: 0.28, whiteCore: 0.46, causticContrast: 1.24,
      dispersion: 0.1, iridescence: 0.22, roughness: 0.24, transmission: 0.46, thickness: 0.7, ior: 1.5, bloom: 0.06, haze: 0.035,
    },
  },
];

export function applySpectralPreset(current: SpectralSettings, id: SpectralPresetId): SpectralSettings {
  const definition = SPECTRAL_PRESETS.find((item) => item.id === id) ?? SPECTRAL_PRESETS[0];
  return { ...current, ...definition.patch, enabled: true, preset: definition.id };
}
