import type { EffectDefinition } from "./types";

export const planeIlluminationEffect: EffectDefinition = {
  type: "plane-illumination", name: "Plane Illumination", category: "Light", shaderId: 4,
  defaultMask: "top-right",
  defaults: { brightness: 0.08, contrast: 1.05, angle: -26, softness: 0.7, originFalloff: 0.45 },
  controls: [
    { type: "number", key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.01 },
    { type: "number", key: "contrast", label: "Contrast", min: 0.1, max: 3, step: 0.01 },
    { type: "number", key: "angle", label: "Light Angle", min: -180, max: 180, step: 1 },
    { type: "number", key: "softness", label: "Softness", min: 0.01, max: 2, step: 0.01 },
    { type: "number", key: "originFalloff", label: "Origin Falloff", min: 0, max: 2, step: 0.01 },
  ],
};
