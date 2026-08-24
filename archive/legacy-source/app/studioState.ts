import type { EffectInstance } from "../effects/types";

export type ComparisonMode = "baseline" | "variant" | "split" | "difference";
export type InspectorTab = "effect" | "texture" | "global" | "output";

export interface RenderPreset {
  id: string;
  name: string;
  locked: boolean;
  builtin: boolean;
  effects: EffectInstance[];
  thumbnail?: string;
}

export interface OutputSettings {
  preset: string;
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  quality: number;
  renderScale: number;
  filename: string;
}

export interface GlobalSettings {
  effectIntensity: number;
  seed: number;
  animationSpeed: number;
  paused: boolean;
  manualTime: number;
  masterContrast: number;
  masterBrightness: number;
  colorMode: "color" | "grayscale";
  backgroundLuminance: number;
  planeDebug: boolean;
  axisDebug: boolean;
}

export interface StudioState {
  baseline: { name: string; locked: true };
  activePresetId: string;
  presets: RenderPreset[];
  effectStack: EffectInstance[];
  selectedEffectId: string | null;
  comparisonMode: ComparisonMode;
  splitPosition: number;
  output: OutputSettings;
  global: GlobalSettings;
  ui: {
    leftPanelOpen: boolean;
    rightPanelOpen: boolean;
    hidden: boolean;
    activeInspectorTab: InspectorTab;
    compactPanel: "presets" | "inspector";
  };
}

export const defaultOutput: OutputSettings = {
  preset: "2800x2080", width: 2800, height: 2080, format: "png", quality: 0.92,
  renderScale: 1, filename: "new-axis",
};

export const defaultGlobal: GlobalSettings = {
  effectIntensity: 1, seed: 17, animationSpeed: 1, paused: false, manualTime: 0,
  masterContrast: 1, masterBrightness: 0, colorMode: "color", backgroundLuminance: 16,
  planeDebug: false, axisDebug: false,
};
