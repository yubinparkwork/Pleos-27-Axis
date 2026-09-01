import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type GlassPrismPresetId = "clear-glass" | "rgb-prism" | "frosted-prism" | "dark-crystal";
export type GlassPrismMotionId = "rotate" | "shared-pulse" | "explode-rejoin";

export interface GlassPrismState {
  version: 2;
  preset: GlassPrismPresetId;
  material: {
    ior: number; dispersion: number; roughness: number; reflection: number;
    refractionStrength: number; transparency: number; tint: string; absorption: number; internalBounces: number;
    surfaceTextureStrength: number; surfaceTextureScale: number;
  };
  content: {
    mode: "text" | "background"; text: string; textScale: number; lineHeight: number;
    letterSpacing: number; x: number; y: number; textColor: string; background: string;
  };
  environment: { enabled: boolean; intensity: number };
  geometry: { scale: number; gap: number; bevel: number };
  motion: { kind: GlassPrismMotionId; enabled: boolean; speed: number; strength: number; duration: number; time: number };
  camera: { yaw: number; pitch: number; zoom: number };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): GlassPrismState => ({
  version: 2, preset: "clear-glass",
  material: { ior: 1.45, dispersion: .008, roughness: .018, reflection: .86, refractionStrength: .82, transparency: .98, tint: "#FCFDFF", absorption: .025, internalBounces: 1, surfaceTextureStrength: .015, surfaceTextureScale: 5 },
  content: { mode: "background", text: "PLEOS\n27 AXIS", textScale: .16, lineHeight: .84, letterSpacing: .015, x: .5, y: .5, textColor: "#666A71", background: "#989BA1" },
  environment: { enabled: true, intensity: .92 },
  geometry: { scale: 1, gap: 0, bevel: .035 },
  motion: { kind: "rotate", enabled: true, speed: 1, strength: .38, duration: 10, time: 0 },
  camera: { yaw: 0, pitch: 0, zoom: 1 },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, background: "#989BA1" },
  export: { ppi: 300 },
});

export const GLASS_PRISM_PRESETS: Readonly<Record<GlassPrismPresetId, GlassPrismState>> = {
  "clear-glass": base(),
  "rgb-prism": { ...base(), preset: "rgb-prism", material: { ior: 1.47, dispersion: .055, roughness: .012, reflection: .92, refractionStrength: .92, transparency: .96, tint: "#FCFDFF", absorption: .035, internalBounces: 2, surfaceTextureStrength: .025, surfaceTextureScale: 5.2 }, environment: { enabled: true, intensity: 1 } },
  "frosted-prism": { ...base(), preset: "frosted-prism", material: { ior: 1.43, dispersion: .012, roughness: .18, reflection: .7, refractionStrength: .68, transparency: .64, tint: "#EDF2F3", absorption: .18, internalBounces: 1, surfaceTextureStrength: .16, surfaceTextureScale: 8 }, environment: { enabled: true, intensity: .72 } },
  "dark-crystal": { ...base(), preset: "dark-crystal", material: { ior: 1.51, dispersion: .018, roughness: .045, reflection: .94, refractionStrength: .72, transparency: .68, tint: "#4D5B69", absorption: .48, internalBounces: 2, surfaceTextureStrength: .06, surfaceTextureScale: 6 }, content: { ...base().content, background: "#050609" }, environment: { enabled: true, intensity: .88 } },
};

export const createGlassPrismState = (preset: GlassPrismPresetId = "clear-glass"): GlassPrismState => cloneGlassPrismState(GLASS_PRISM_PRESETS[preset]);
export const cloneGlassPrismState = (state: GlassPrismState): GlassPrismState => JSON.parse(JSON.stringify(state)) as GlassPrismState;

export function sanitizeGlassPrismState(value: unknown): GlassPrismState {
  const candidate = value as Partial<GlassPrismState> | null;
  const preset = candidate?.preset && candidate.preset in GLASS_PRISM_PRESETS ? candidate.preset : "clear-glass";
  const fallback = createGlassPrismState(preset);
  return {
    ...fallback, ...candidate, version: 2, preset,
    material: { ...fallback.material, ...candidate?.material },
    content: { ...fallback.content, ...candidate?.content },
    environment: { ...fallback.environment, ...candidate?.environment },
    geometry: { ...fallback.geometry, ...candidate?.geometry },
    motion: { ...fallback.motion, ...candidate?.motion },
    camera: { ...fallback.camera, ...candidate?.camera },
    artboard: { ...fallback.artboard, ...candidate?.artboard, axisAnchor: { ...fallback.artboard.axisAnchor, ...candidate?.artboard?.axisAnchor } },
    export: { ...fallback.export, ...candidate?.export },
  };
}
