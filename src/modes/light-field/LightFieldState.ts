import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type LightFieldPresetId = "iridescent-pulse" | "violet-membrane" | "spectral-white";

export interface LightFieldState {
  version: 4;
  preset: LightFieldPresetId;
  field: {
    massScale: number;
    membraneScale: number;
    foldFrequency: number;
    voidSize: number;
    rimWidth: number;
    echoStrength: number;
    diffusion: number;
  };
  geometry: { cubeGap: number; bevel: number };
  motion: { enabled: boolean; speed: number; strength: number; duration: number; seed: number; time: number };
  color: { darkness: number; violet: number; magenta: number; cyan: number; green: number; whiteCore: number; saturation: number };
  advanced: { asymmetry: number; depth: number; centerBias: number; warp: number; contactShadow: number; bloom: number; dither: number };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): LightFieldState => ({
  version: 4,
  preset: "iridescent-pulse",
  field: { massScale: 1.22, membraneScale: 1.08, foldFrequency: 3.15, voidSize: .48, rimWidth: .12, echoStrength: .38, diffusion: .62 },
  geometry: { cubeGap: 0, bevel: .045 },
  motion: { enabled: true, speed: 1, strength: .82, duration: 10, seed: 27, time: 0 },
  color: { darkness: .76, violet: .9, magenta: .72, cyan: .78, green: .48, whiteCore: .86, saturation: .92 },
  advanced: { asymmetry: .38, depth: .82, centerBias: .68, warp: .58, contactShadow: .7, bloom: .28, dither: .24 },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, scale: .96, background: "#020205" },
  export: { ppi: 300 },
});

export const LIGHT_FIELD_PRESETS: Readonly<Record<LightFieldPresetId, LightFieldState>> = {
  "iridescent-pulse": base(),
  "violet-membrane": {
    ...base(), preset: "violet-membrane",
    field: { massScale: 1.2, membraneScale: 1.16, foldFrequency: 3.55, voidSize: .58, rimWidth: .09, echoStrength: .56, diffusion: .56 },
    color: { darkness: .84, violet: 1, magenta: .76, cyan: .42, green: .16, whiteCore: .7, saturation: 1 },
    advanced: { asymmetry: .52, depth: .9, centerBias: .56, warp: .7, contactShadow: .78, bloom: .2, dither: .22 },
  },
  "spectral-white": {
    ...base(), preset: "spectral-white",
    field: { massScale: 1.24, membraneScale: .94, foldFrequency: 2.62, voidSize: .38, rimWidth: .17, echoStrength: .24, diffusion: .78 },
    color: { darkness: .63, violet: .68, magenta: .62, cyan: .8, green: .58, whiteCore: 1, saturation: .72 },
    advanced: { asymmetry: .28, depth: .7, centerBias: .82, warp: .44, contactShadow: .58, bloom: .36, dither: .18 },
  },
};

export function createLightFieldState(preset: LightFieldPresetId = "iridescent-pulse"): LightFieldState {
  return cloneLightFieldState(LIGHT_FIELD_PRESETS[preset]);
}

export function cloneLightFieldState(state: LightFieldState): LightFieldState {
  return JSON.parse(JSON.stringify(state)) as LightFieldState;
}

function migratedPreset(value: unknown): LightFieldPresetId {
  if (value === "violet-membrane" || value === "spectral-white" || value === "iridescent-pulse") return value;
  if (value === "blue-core") return "violet-membrane";
  if (value === "warm-fold") return "spectral-white";
  return "iridescent-pulse";
}

export function sanitizeLightFieldState(value: unknown): LightFieldState {
  const candidate = value as Partial<LightFieldState> | null;
  const preset = migratedPreset(candidate?.preset);
  const fallback = createLightFieldState(preset);
  const finite = (entry: unknown, defaultValue: number, min = 0, max = 1) => typeof entry === "number" && Number.isFinite(entry) ? Math.min(max, Math.max(min, entry)) : defaultValue;
  const current = candidate?.version === 4 ? candidate : null;
  return {
    version: 4,
    preset,
    field: {
      massScale: finite(current?.field?.massScale, fallback.field.massScale, .7, 1.8),
      membraneScale: finite(current?.field?.membraneScale, fallback.field.membraneScale, .5, 2),
      foldFrequency: finite(current?.field?.foldFrequency, fallback.field.foldFrequency, 1, 6),
      voidSize: finite(current?.field?.voidSize, fallback.field.voidSize, .08, .9),
      rimWidth: finite(current?.field?.rimWidth, fallback.field.rimWidth, .025, .3),
      echoStrength: finite(current?.field?.echoStrength, fallback.field.echoStrength),
      diffusion: finite(current?.field?.diffusion, fallback.field.diffusion),
    },
    geometry: { cubeGap: finite(candidate?.geometry?.cubeGap, fallback.geometry.cubeGap, 0, .4), bevel: finite(candidate?.geometry?.bevel, fallback.geometry.bevel, 0, .22) },
    motion: {
      enabled: candidate?.motion?.enabled !== false,
      speed: finite(candidate?.motion?.speed, fallback.motion.speed, .1, 3),
      strength: finite(candidate?.motion?.strength, fallback.motion.strength),
      duration: finite(candidate?.motion?.duration, fallback.motion.duration, 8, 16),
      seed: Math.round(finite(candidate?.motion?.seed, fallback.motion.seed, 0, 9999)),
      time: finite(candidate?.motion?.time, 0, 0, 16),
    },
    color: {
      darkness: finite(current?.color?.darkness, fallback.color.darkness), violet: finite(current?.color?.violet, fallback.color.violet),
      magenta: finite(current?.color?.magenta, fallback.color.magenta), cyan: finite(current?.color?.cyan, fallback.color.cyan),
      green: finite(current?.color?.green, fallback.color.green), whiteCore: finite(current?.color?.whiteCore, fallback.color.whiteCore),
      saturation: finite(current?.color?.saturation, fallback.color.saturation),
    },
    advanced: {
      asymmetry: finite(current?.advanced?.asymmetry, fallback.advanced.asymmetry), depth: finite(current?.advanced?.depth, fallback.advanced.depth, .2, 1),
      centerBias: finite(current?.advanced?.centerBias, fallback.advanced.centerBias), warp: finite(current?.advanced?.warp, fallback.advanced.warp),
      contactShadow: finite(current?.advanced?.contactShadow, fallback.advanced.contactShadow), bloom: finite(current?.advanced?.bloom, fallback.advanced.bloom, 0, .6),
      dither: finite(current?.advanced?.dither, fallback.advanced.dither),
    },
    artboard: { ...fallback.artboard, ...candidate?.artboard, axisAnchor: { ...fallback.artboard.axisAnchor, ...candidate?.artboard?.axisAnchor } },
    export: { ppi: Math.round(finite(candidate?.export?.ppi, 300, 72, 600)) },
  };
}
