import type { EffectDefinition } from "./types";

export const chromaticMappingEffect: EffectDefinition = {
  type: "chromatic-mapping", name: "Chromatic Mapping", category: "Color", shaderId: 8,
  defaultMask: "global",
  defaults: { mode: "duotone", colorA: "#080000", colorB: "#ff341f", hue: 0, saturation: 1, intensity: 0, separation: 0.0015 },
  controls: [
    { type: "select", key: "mode", label: "Mode", options: [{ label: "Monochrome", value: "monochrome" }, { label: "Duotone", value: "duotone" }, { label: "Gradient Map", value: "gradient" }, { label: "RGB Separation", value: "rgb" }] },
    { type: "color", key: "colorA", label: "Shadow Color" },
    { type: "color", key: "colorB", label: "Highlight Color" },
    { type: "number", key: "hue", label: "Hue", min: -180, max: 180, step: 1 },
    { type: "number", key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
    { type: "number", key: "separation", label: "RGB Separation", min: 0, max: 0.02, step: 0.0005 },
  ],
};
