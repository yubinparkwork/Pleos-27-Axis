import type { ArtboardState } from "../../artboard/ArtboardState";
import type { MotionSettings } from "../../motion/types";
import type { CrystalLook } from "../CrystalAssembly";
import { createLightingPreset, sanitizeLightingState, type LightingState } from "../LightingSystem";
import { createSpectralFlowState, type SpectralFlowState } from "../materials/SpectralFlowMaterial";
import { createSoftSpectralState, sanitizeSoftSpectralState, type SoftSpectralState } from "../materials/SoftSpectralMaterial";
import { PRISM_STYLE_PRESETS, type PhysicalLookParameters, type PrismStyleId } from "../presets/PrismStylePresets";

export interface VariationCameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

export interface StudioVariationSnapshot {
  setup: { gap: number; bevelRadius: number };
  look: {
    preset: CrystalLook;
    prismStyle: PrismStyleId;
    roughness: number;
    dispersion: number;
    physical: PhysicalLookParameters;
    spectralFlow: SpectralFlowState;
    softSpectral: SoftSpectralState;
  };
  lighting: LightingState;
  motion: MotionSettings;
  format: ArtboardState;
  camera: VariationCameraState;
  heroTime: number;
}

export interface StudioVariation {
  id: string;
  label: string;
  builtin: boolean;
  snapshot: StudioVariationSnapshot;
}

const STORAGE_KEY = "pleos-27-axis-user-variations-v1";
const camera = (): VariationCameraState => ({ position: [0, 0, -12], target: [0, .02, 0], zoom: 1 });
const motion = (preset: MotionSettings["preset"], enabled: boolean, strengthMode: MotionSettings["strengthMode"], strength: number, duration: number): MotionSettings => ({
  enabled, preset, strengthMode, strength, duration, fps: 30, speed: 1, seed: 27, loop: true,
  constraint: preset === "explode-rejoin" ? "anchored" : "strict", parameters: {},
});
const format = (id: ArtboardState["id"], width: number, height: number, scale: number, gridY: number): ArtboardState => ({
  id, width, height, fitMode: "contain", axisAnchor: { gridX: .5, gridY }, scale,
  background: "#050607", transparent: false, safeGuide: false, previewZoom: 1,
});

function prismSnapshot(style: PrismStyleId, artboard: ArtboardState): StudioVariationSnapshot {
  const preset = PRISM_STYLE_PRESETS[style];
  const lighting = createLightingPreset(preset.lightingPreset);
  Object.assign(lighting.globals, preset.lightingGlobals);
  return {
    setup: { gap: style === "immersive" ? .018 : 0, bevelRadius: style === "clean" ? .026 : .042 },
    look: { preset: "prism", prismStyle: style, roughness: preset.roughness, dispersion: preset.dispersion, physical: { ...preset.physical }, spectralFlow: createSpectralFlowState("balanced"), softSpectral: createSoftSpectralState("balanced") },
    lighting,
    motion: motion("spectral-axis-sweep", false, "restrained", .42, 6.8),
    format: artboard,
    camera: camera(),
    heroTime: 0,
  };
}

function spectralSnapshot(style: "subtle" | "balanced" | "active", artboard: ArtboardState): StudioVariationSnapshot {
  const prism = PRISM_STYLE_PRESETS.clean;
  const spectral = createSpectralFlowState(style);
  const lighting = createLightingPreset(style === "active" ? "dark-studio" : "pleos-prism");
  Object.assign(lighting.globals, style === "subtle"
    ? { masterIntensity: .72, environmentIntensity: .2, exposure: .92, bloomIntensity: .035, colorSaturation: .34 }
    : style === "balanced"
      ? { masterIntensity: .8, environmentIntensity: .24, exposure: .96, bloomIntensity: .06, colorSaturation: .62 }
      : { masterIntensity: .86, environmentIntensity: .2, exposure: .98, bloomIntensity: .08, colorSaturation: .78 });
  return {
    setup: { gap: 0, bevelRadius: .034 },
    look: { preset: "spectral-flow", prismStyle: "clean", roughness: prism.roughness, dispersion: prism.dispersion, physical: { ...prism.physical }, spectralFlow: spectral, softSpectral: createSoftSpectralState("balanced") },
    lighting,
    motion: motion("spectral-axis-sweep", true, style === "active" ? "balanced" : "restrained", style === "subtle" ? .32 : style === "balanced" ? .5 : .68, 7.2),
    format: artboard,
    camera: camera(),
    heroTime: style === "subtle" ? 2.6 : style === "balanced" ? 3.5 : 4.1,
  };
}

function softSpectralSnapshot(style: "subtle" | "balanced" | "active", artboard: ArtboardState): StudioVariationSnapshot {
  const prism = PRISM_STYLE_PRESETS.clean;
  const softSpectral = createSoftSpectralState(style);
  const lighting = createLightingPreset("soft-glass");
  lighting.lights.forEach((light, index) => { light.color = index % 3 === 0 ? "#CDDCFF" : index % 2 === 0 ? "#F2F2F2" : "#FFFFFF"; });
  Object.assign(lighting.globals, style === "subtle"
    ? { masterIntensity: .58, environmentIntensity: .18, exposure: .92, bloomIntensity: .02, colorSaturation: .18 }
    : style === "balanced"
      ? { masterIntensity: .68, environmentIntensity: .22, exposure: .96, bloomIntensity: .035, colorSaturation: .24 }
      : { masterIntensity: .76, environmentIntensity: .2, exposure: .98, bloomIntensity: .05, colorSaturation: .3 });
  return {
    setup: { gap: 0, bevelRadius: style === "subtle" ? .072 : style === "balanced" ? .092 : .112 },
    look: { preset: "soft-spectral", prismStyle: "clean", roughness: prism.roughness, dispersion: prism.dispersion, physical: { ...prism.physical }, spectralFlow: createSpectralFlowState("balanced"), softSpectral },
    lighting,
    motion: motion("spectral-axis-sweep", true, style === "active" ? "balanced" : "restrained", style === "subtle" ? .28 : style === "balanced" ? .46 : .64, 8),
    format: artboard,
    camera: camera(),
    heroTime: 4,
  };
}

function builtins(): StudioVariation[] {
  return [
    { id: "builtin-prism-clean", label: "01  Prism Clean", builtin: true, snapshot: prismSnapshot("clean", format("square", 1080, 1080, .82, .5)) },
    { id: "builtin-prism-rgb-edge", label: "02  Prism RGB Edge", builtin: true, snapshot: prismSnapshot("rgb-edge", format("instagram-portrait", 1080, 1350, .8, .46)) },
    { id: "builtin-prism-immersive", label: "03  Prism Immersive", builtin: true, snapshot: prismSnapshot("immersive", format("vertical-9-16", 1080, 1920, 1.08, .49)) },
    { id: "builtin-spectral-dark", label: "04  Spectral Dark", builtin: true, snapshot: spectralSnapshot("subtle", format("square", 1080, 1080, .82, .5)) },
    { id: "builtin-spectral-balanced", label: "05  Spectral Balanced", builtin: true, snapshot: spectralSnapshot("balanced", format("instagram-portrait", 1080, 1350, .8, .46)) },
    { id: "builtin-spectral-active", label: "06  Spectral Active", builtin: true, snapshot: spectralSnapshot("active", format("vertical-9-16", 1080, 1920, .7, .48)) },
    { id: "builtin-soft-spectral-subtle", label: "07  Soft Spectral Subtle", builtin: true, snapshot: softSpectralSnapshot("subtle", format("square", 1080, 1080, .82, .5)) },
    { id: "builtin-soft-spectral-balanced", label: "08  Soft Spectral Balanced", builtin: true, snapshot: softSpectralSnapshot("balanced", format("instagram-portrait", 1080, 1350, .8, .46)) },
    { id: "builtin-soft-spectral-active", label: "09  Soft Spectral Active", builtin: true, snapshot: softSpectralSnapshot("active", format("vertical-9-16", 1080, 1920, .7, .48)) },
  ];
}

function cloneSnapshot(snapshot: StudioVariationSnapshot): StudioVariationSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as StudioVariationSnapshot;
}

export class StudioVariationStore {
  private users: StudioVariation[] = [];

  constructor() { this.load(); }

  list(): StudioVariation[] { return [...builtins(), ...this.users].map((item) => ({ ...item, snapshot: cloneSnapshot(item.snapshot) })); }
  get(id: string): StudioVariation | null { return this.list().find((item) => item.id === id) ?? null; }

  save(label: string, snapshot: StudioVariationSnapshot): StudioVariation {
    const variation: StudioVariation = { id: `user-${Date.now().toString(36)}`, label: label.slice(0, 48), builtin: false, snapshot: cloneSnapshot(snapshot) };
    this.users.push(variation); this.persist(); return variation;
  }

  duplicate(id: string): StudioVariation | null {
    const source = this.get(id); if (!source) return null;
    return this.save(`${source.label.replace(/^\d+\s+/, "")} Copy`, source.snapshot);
  }

  rename(id: string, label: string): boolean {
    const item = this.users.find((variation) => variation.id === id); if (!item) return false;
    item.label = label.slice(0, 48); this.persist(); return true;
  }

  remove(id: string): boolean {
    const index = this.users.findIndex((variation) => variation.id === id); if (index < 0) return false;
    this.users.splice(index, 1); this.persist(); return true;
  }

  sanitizeSnapshot(snapshot: StudioVariationSnapshot): StudioVariationSnapshot {
    const cloned = cloneSnapshot(snapshot);
    cloned.look.softSpectral = sanitizeSoftSpectralState(cloned.look.softSpectral);
    return { ...cloned, lighting: sanitizeLightingState(snapshot.lighting) };
  }

  private load(): void {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as StudioVariation[];
      this.users = Array.isArray(parsed) ? parsed.filter((item) => item && !item.builtin && typeof item.id === "string" && typeof item.label === "string" && item.snapshot).slice(0, 24) : [];
    } catch { this.users = []; }
  }

  private persist(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.users)); }
}
