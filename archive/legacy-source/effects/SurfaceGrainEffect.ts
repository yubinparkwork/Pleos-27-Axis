import type { EffectDefinition } from "./types";

export const surfaceGrainEffect: EffectDefinition = {
  type: "surface-grain", name: "Surface Grain", category: "Surface", shaderId: 1,
  defaultMask: "global",
  defaults: { scale: 3, intensity: 0.12, contrast: 1.4, seed: 17, monochrome: true, blendMode: "overlay", animated: false },
  controls: [
    { type: "number", key: "scale", label: "Scale", min: 0.5, max: 24, step: 0.1 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
    { type: "number", key: "contrast", label: "Contrast", min: 0.1, max: 4, step: 0.05 },
    { type: "number", key: "seed", label: "Seed", min: 0, max: 999, step: 1 },
    { type: "boolean", key: "monochrome", label: "Monochrome" },
    { type: "boolean", key: "animated", label: "Animate" },
    { type: "select", key: "blendMode", label: "Blend", options: [{ label: "Overlay", value: "overlay" }, { label: "Add", value: "add" }, { label: "Multiply", value: "multiply" }] },
  ],
};
