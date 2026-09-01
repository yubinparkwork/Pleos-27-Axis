import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type KineticGlassPresetId = "clear-attraction" | "pleos-prism" | "dark-mass";

export interface KineticGlassState {
  version: 7;
  preset: KineticGlassPresetId;
  physics: {
    attraction: number;
    damping: number;
    restitution: number;
    interactionRadius: number;
    interactionStrength: number;
  };
  geometry: { scale: number; gap: number; bevel: number };
  material: {
    roughness: number;
    transmission: number;
    thickness: number;
    ior: number;
    dispersion: number;
    opacity: number;
    environment: number;
  };
  lighting: { exposure: number; bloom: number };
  motion: { enabled: boolean; time: number; duration: number };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): KineticGlassState => ({
  version: 7,
  preset: "clear-attraction",
  physics: { attraction: 7.5, damping: 2.4, restitution: .38, interactionRadius: .78, interactionStrength: 2.8 },
  geometry: { scale: 1, gap: .04, bevel: .095 },
  material: { roughness: .055, transmission: 1, thickness: 1.85, ior: 1.48, dispersion: .075, opacity: .92, environment: 1.9 },
  lighting: { exposure: 1.58, bloom: .28 },
  motion: { enabled: true, time: 0, duration: 10 },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, background: "#020304" },
  export: { ppi: 300 },
});

export const KINETIC_GLASS_PRESETS: Readonly<Record<KineticGlassPresetId, KineticGlassState>> = {
  "clear-attraction": base(),
  "pleos-prism": {
    ...base(), preset: "pleos-prism",
    material: { ...base().material, roughness: .032, thickness: 2.05, dispersion: .24, opacity: .95, environment: 2.25 },
    lighting: { exposure: 1.7, bloom: .38 },
  },
  "dark-mass": {
    ...base(), preset: "dark-mass",
    material: { ...base().material, roughness: .07, transmission: .9, thickness: 2.2, ior: 1.5, dispersion: .035, opacity: .62, environment: .72 },
    lighting: { exposure: 1.02, bloom: .035 },
    artboard: { ...base().artboard, background: "#000000" },
  },
};

export const cloneKineticGlassState = (state: KineticGlassState): KineticGlassState => JSON.parse(JSON.stringify(state)) as KineticGlassState;
export const createKineticGlassState = (preset: KineticGlassPresetId = "clear-attraction"): KineticGlassState => cloneKineticGlassState(KINETIC_GLASS_PRESETS[preset]);

export function sanitizeKineticGlassState(value: unknown): KineticGlassState {
  const candidate = value as Partial<KineticGlassState> | null;
  const preset = candidate?.preset && candidate.preset in KINETIC_GLASS_PRESETS ? candidate.preset : "clear-attraction";
  const fallback = createKineticGlassState(preset);
  const legacyLighting = candidate?.version !== 7;
  return {
    ...fallback, ...candidate, version: 7, preset,
    physics: { ...fallback.physics, ...candidate?.physics },
    geometry: { ...fallback.geometry, ...candidate?.geometry },
    material: legacyLighting ? { ...fallback.material } : { ...fallback.material, ...candidate?.material },
    lighting: legacyLighting ? { ...fallback.lighting } : { ...fallback.lighting, ...candidate?.lighting },
    motion: { ...fallback.motion, ...candidate?.motion },
    artboard: { ...fallback.artboard, ...candidate?.artboard, axisAnchor: { ...fallback.artboard.axisAnchor, ...candidate?.artboard?.axisAnchor } },
    export: { ...fallback.export, ...candidate?.export },
  };
}
