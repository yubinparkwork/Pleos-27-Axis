import type { Vec3 } from "../materials/materialPresets";

export interface DirectLightState {
  enabled: boolean;
  color: Vec3;
  intensity: number;
  azimuth: number;
  elevation: number;
  distance: number;
  falloff: number;
  influenceRadius: number;
  target: Vec3;
}

export interface ReflectionCardState {
  enabled: boolean;
  azimuth: number;
  elevation: number;
  rotation: number;
  width: number;
  height: number;
  softness: number;
  color: Vec3;
  intensity: number;
}

export interface SoftAreaLightState {
  enabled: boolean;
  sourceSize: number;
  falloffExponent: number;
  penumbraWidth: number;
  edgeSoftness: number;
  ambientIntensity: number;
  grazingStrength: number;
  contactDarkening: number;
  contactRadius: number;
  lowerFaceBias: Vec3;
}

export interface LightingState {
  preset: LightingPresetId;
  key: DirectLightState;
  fill: DirectLightState;
  rim: DirectLightState;
  upperLeft: DirectLightState;
  lowerRight: DirectLightState;
  cards: ReflectionCardState[];
  environmentIntensity: number;
  environmentRotation: number;
  backgroundColor: Vec3;
  backgroundExposure: number;
  softArea: SoftAreaLightState;
}

export type LightingPresetId = "pleos-axis-contrast" | "reference-flat" | "softbox-studio" | "prism-studio" | "high-contrast" | "dark-optical";

const light = (
  intensity: number,
  azimuth: number,
  elevation: number,
  color: Vec3 = [1, 1, 1],
  placement: Partial<Pick<DirectLightState, "distance" | "falloff" | "influenceRadius" | "target">> = {},
): DirectLightState => ({
  enabled: intensity > 0,
  color,
  intensity,
  azimuth,
  elevation,
  distance: placement.distance ?? 8,
  falloff: placement.falloff ?? 0.0125,
  influenceRadius: placement.influenceRadius ?? 0,
  target: placement.target ?? [0, 0, 0],
});
const card = (azimuth: number, elevation: number, width: number, height: number, softness: number, intensity: number, color: Vec3): ReflectionCardState => ({ enabled: true, azimuth, elevation, rotation: 0, width, height, softness, intensity, color });

const DEFAULT_SOFT_AREA: SoftAreaLightState = {
  enabled: false,
  sourceSize: 0.8,
  falloffExponent: 1,
  penumbraWidth: 0.72,
  edgeSoftness: 0.92,
  ambientIntensity: 0.008,
  grazingStrength: 0.7,
  contactDarkening: 0.16,
  contactRadius: 0.16,
  lowerFaceBias: [1, 0.16, 0.24],
};

function makeState(
  preset: LightingPresetId,
  background: Vec3,
  environmentIntensity: number,
  key: DirectLightState,
  fill: DirectLightState,
  rim: DirectLightState,
  cards: ReflectionCardState[],
  softArea: Partial<SoftAreaLightState> = {},
  upperLeft: DirectLightState = light(0, 145, 35),
  lowerRight: DirectLightState = light(0, 35, -28),
): LightingState {
  return {
    preset,
    backgroundColor: background,
    backgroundExposure: 1,
    environmentIntensity,
    environmentRotation: 0,
    key,
    fill,
    rim,
    upperLeft,
    lowerRight,
    cards,
    softArea: { ...DEFAULT_SOFT_AREA, ...softArea },
  };
}

export const LIGHTING_PRESETS: Record<LightingPresetId, { name: string; state: LightingState }> = {
  "pleos-axis-contrast": { name: "Pleos Axis Contrast", state: makeState("pleos-axis-contrast", [0.001, 0.001, 0.0015], 0.025,
    // A near, fast-falloff key sits over the upper-right cube. The lower-left
    // cube remains outside the key pool and only retains a narrow readable face.
    light(5.2, 90, 18, [1, 1, 1], { distance: 8, falloff: 0.0125, influenceRadius: 1.78, target: [1.04, 0.6, -0.42] }),
    light(0.08, -35, 8, [0.88, 0.92, 1], { distance: 7, falloff: 0.04 }),
    light(0.16, 155, 48, [1, 1, 1], { distance: 7, falloff: 0.04 }),
    [], { enabled: true, sourceSize: 1.1, falloffExponent: 1.15, penumbraWidth: 0.82, edgeSoftness: 0.96, ambientIntensity: 0.006, grazingStrength: 0.82, contactDarkening: 0.18, contactRadius: 0.18, lowerFaceBias: [1, 0.13, 0.22] },
    light(0.38, 145, 35, [1, 0.97, 0.92], { distance: 7, falloff: 0.025 }),
    light(0.3, 35, -28, [0.9, 0.94, 1], { distance: 7, falloff: 0.025 })) },
  "reference-flat": { name: "Reference Flat", state: makeState("reference-flat", [0.012, 0.012, 0.012], 0.36, light(2.2, -38, 46), light(0.85, 42, 18), light(0.3, 165, 48), [card(-40, 30, 0.58, 0.58, 0.28, 1.8, [1, 1, 1]), card(45, 10, 0.2, 0.64, 0.18, 0.5, [1, 1, 1]), card(120, -10, 0.2, 0.45, 0.24, 0, [1, 1, 1]), card(-120, 5, 0.2, 0.45, 0.24, 0, [1, 1, 1]), card(180, 45, 0.12, 0.7, 0.18, 0.25, [1, 1, 1])]) },
  "softbox-studio": { name: "Softbox Studio", state: makeState("softbox-studio", [0.008, 0.009, 0.01], 0.72, light(3.8, -45, 42), light(1.4, 38, 16), light(0.9, 155, 52), [card(-35, 25, 0.72, 0.62, 0.34, 3.2, [1, 1, 1]), card(52, 8, 0.18, 0.74, 0.12, 1.1, [1, 1, 1]), card(126, 4, 0.2, 0.5, 0.22, 0, [1, 1, 1]), card(-118, 2, 0.2, 0.52, 0.22, 0, [1, 1, 1]), card(176, 54, 0.12, 0.74, 0.14, 0.7, [1, 1, 1])]) },
  "prism-studio": { name: "Prism Studio", state: makeState("prism-studio", [0.0015, 0.002, 0.006], 1.15, light(3.3, -52, 38), light(0.55, 38, 8, [0.86, 0.94, 1]), light(1.8, 148, 54), [card(-34, 22, 0.58, 0.5, 0.18, 4.4, [1, 1, 1]), card(44, 4, 0.085, 0.82, 0.08, 5.8, [1, 1, 1]), card(116, -5, 0.12, 0.7, 0.12, 3.6, [1, 0.37, 0.12]), card(-112, 2, 0.13, 0.7, 0.12, 4, [0.08, 0.4, 1]), card(178, 48, 0.08, 0.9, 0.09, 4.2, [1, 1, 1])]) },
  "high-contrast": { name: "High Contrast", state: makeState("high-contrast", [0.002, 0.002, 0.003], 0.58, light(6, -60, 36), light(0.18, 25, 12), light(2.6, 154, 60), [card(-48, 20, 0.48, 0.44, 0.12, 5, [1, 1, 1]), card(54, 2, 0.08, 0.72, 0.06, 4, [1, 1, 1]), card(118, -8, 0.1, 0.6, 0.1, 1.5, [1, 0.6, 0.3]), card(-110, 0, 0.1, 0.6, 0.1, 1.8, [0.3, 0.6, 1]), card(180, 52, 0.07, 0.8, 0.07, 5, [1, 1, 1])]) },
  "dark-optical": { name: "Dark Optical", state: makeState("dark-optical", [0, 0, 0.001], 0.42, light(2.6, -68, 26), light(0.1, 18, 6), light(3.2, 162, 46), [card(-52, 18, 0.25, 0.36, 0.1, 2.8, [1, 1, 1]), card(58, 0, 0.045, 0.76, 0.05, 5.5, [1, 1, 1]), card(122, -10, 0.075, 0.56, 0.08, 0, [1, 1, 1]), card(-116, 0, 0.075, 0.58, 0.08, 0, [1, 1, 1]), card(178, 50, 0.04, 0.8, 0.05, 4.8, [1, 1, 1])]) },
};

export function cloneLightingPreset(id: LightingPresetId): LightingState {
  return structuredClone(LIGHTING_PRESETS[id].state);
}
