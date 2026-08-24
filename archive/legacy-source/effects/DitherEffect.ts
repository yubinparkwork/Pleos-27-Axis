import type { EffectDefinition } from "./types";

export const ditherEffect: EffectDefinition = {
  type: "dither", name: "Dither", category: "Print", shaderId: 7,
  defaultMask: "global",
  defaults: { method: "bayer", dotScale: 2, intensity: 0.42, threshold: 0.5, preserveLuminance: true },
  controls: [
    { type: "select", key: "method", label: "Method", options: [{ label: "Bayer", value: "bayer" }, { label: "Ordered", value: "ordered" }, { label: "Noise Threshold", value: "noise" }] },
    { type: "number", key: "dotScale", label: "Dot Scale", min: 1, max: 12, step: 1 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
    { type: "number", key: "threshold", label: "Threshold", min: 0, max: 1, step: 0.01 },
    { type: "boolean", key: "preserveLuminance", label: "Preserve Luminance" },
  ],
};
