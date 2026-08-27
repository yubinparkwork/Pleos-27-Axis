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
    label: "클린",
    description: "무채색 유리와 넓은 흰색 광학 조명",
    roughness: .052,
    dispersion: .045,
    physical: { ior: 1.51, thickness: 2.15, attenuationDistance: 5.2, iridescence: .035 },
    lightingPreset: "pleos-prism",
    lightingGlobals: { masterIntensity: .92, environmentIntensity: .72, exposure: 1.03, bloomIntensity: .055, reflectionStrength: 1.08, refractionStrength: 1, colorSaturation: .38 },
  },
  "rgb-edge": {
    id: "rgb-edge",
    label: "RGB 모서리",
    description: "어두운 광학 몸체와 절제된 색상 모서리",
    roughness: .04,
    dispersion: .145,
    physical: { ior: 1.535, thickness: 2.65, attenuationDistance: 2.8, iridescence: .09 },
    lightingPreset: "pleos-prism",
    lightingGlobals: { masterIntensity: .8, environmentIntensity: .28, exposure: .98, bloomIntensity: .07, reflectionStrength: 1.42, refractionStrength: 1.02, colorSaturation: .56 },
  },
  immersive: {
    id: "immersive",
    label: "몰입형",
    description: "공유 축 중심을 유지하는 확대 구도",
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
