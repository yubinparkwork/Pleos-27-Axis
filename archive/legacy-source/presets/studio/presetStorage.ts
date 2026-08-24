import type { EffectInstance } from "../../effects/types";
import type { RenderPreset } from "../../app/studioState";

const PRESET_KEY = "new-axis-studio-presets-v1";
const VARIATION_KEY = "new-axis-studio-variations-v1";

export type VariationSlots = Record<"A" | "B" | "C" | "D", EffectInstance[] | null>;

export function loadCustomPresets(): RenderPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]") as RenderPreset[]; }
  catch { return []; }
}

export function saveCustomPresets(presets: RenderPreset[]): void {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets.filter((preset) => !preset.builtin)));
}

export function loadVariations(): VariationSlots {
  try {
    return { A: null, B: null, C: null, D: null, ...JSON.parse(localStorage.getItem(VARIATION_KEY) ?? "{}") } as VariationSlots;
  } catch { return { A: null, B: null, C: null, D: null }; }
}

export function saveVariations(slots: VariationSlots): void {
  localStorage.setItem(VARIATION_KEY, JSON.stringify(slots));
}
