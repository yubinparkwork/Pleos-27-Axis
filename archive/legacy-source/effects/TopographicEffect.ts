import type { EffectDefinition } from "./types";

export const topographicEffect: EffectDefinition = {
  type: "topographic", name: "Topographic Contour", category: "Data", shaderId: 6,
  defaultMask: "global",
  defaults: { source: "origin", spacing: 58, width: 1.2, softness: 1.6, intensity: 0.38, speed: 0.04, animated: false },
  controls: [
    { type: "select", key: "source", label: "Source", options: [{ label: "Origin", value: "origin" }, { label: "Axes", value: "axes" }] },
    { type: "number", key: "spacing", label: "Spacing", min: 8, max: 240, step: 1 },
    { type: "number", key: "width", label: "Width", min: 0.2, max: 8, step: 0.1 },
    { type: "number", key: "softness", label: "Softness", min: 0.1, max: 12, step: 0.1 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 2, step: 0.01 },
    { type: "number", key: "speed", label: "Speed", min: 0, max: 2, step: 0.01 },
    { type: "boolean", key: "animated", label: "Animate" },
  ],
};
