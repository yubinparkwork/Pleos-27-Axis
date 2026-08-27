import type { LightingGlobals, LightingPresetName } from "../LightingSystem";

export type PrismStyleId = "clean" | "rgb-edge" | "immersive";

export interface PhysicalLookParameters {
  ior: number;
  thickness: number;
  attenuationDistance: number;
  iridescence: number;
}

export interface PrismStylePreset {
  id: PrismStyleId;
  label: string;
  description: string;
  roughness: number;
  dispersion: number;
  physical: PhysicalLookParameters;
  lightingPreset: Exclude<LightingPresetName, "custom">;
  lightingGlobals: Partial<LightingGlobals>;
}

export const PRISM_STYLE_PRESETS: Readonly<Record<PrismStyleId, PrismStylePreset>> = {
  clean: {
    id: "clean",
    label: "Clean",
    description: "Neutral glass and broad white optical light",
    roughness: .052,
    dispersion: .045,
    physical: { ior: 1.51, thickness: 2.15, attenuationDistance: 5.2, iridescence: .035 },
    lightingPreset: "pleos-prism",
    lightingGlobals: { masterIntensity: .92, environmentIntensity: .72, exposure: 1.03, bloomIntensity: .055, reflectionStrength: 1.08, refractionStrength: 1, colorSaturation: .38 },
  },
  "rgb-edge": {
    id: "rgb-edge",
    label: "RGB Edge",
    description: "Dark optical body with restrained chromatic edges",
    roughness: .04,
    dispersion: .145,
    physical: { ior: 1.535, thickness: 2.65, attenuationDistance: 2.8, iridescence: .09 },
    lightingPreset: "pleos-prism",
    lightingGlobals: { masterIntensity: .8, environmentIntensity: .28, exposure: .98, bloomIntensity: .07, reflectionStrength: 1.42, refractionStrength: 1.02, colorSaturation: .56 },
  },
  immersive: {
    id: "immersive",
    label: "Immersive",
    description: "Large crop with a protected shared Axis origin",
    roughness: .034,
    dispersion: .175,
    physical: { ior: 1.55, thickness: 2.8, attenuationDistance: 2.5, iridescence: .12 },
    lightingPreset: "pleos-rgb",
    lightingGlobals: { masterIntensity: .88, environmentIntensity: .34, exposure: 1, bloomIntensity: .095, reflectionStrength: 1.5, refractionStrength: .98, colorSaturation: .78 },
  },
};

export function sanitizePrismStyle(value: unknown): PrismStyleId {
  return value === "rgb-edge" || value === "immersive" ? value : "clean";
}
