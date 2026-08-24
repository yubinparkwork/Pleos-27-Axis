import type { EffectDefinition } from "./types";

export const refractionEffect: EffectDefinition = {
  type: "refraction", name: "Refraction / Displacement", category: "Distort", shaderId: 5,
  defaultMask: "global",
  defaults: { amount: 0.004, scale: 3, direction: 20, frequency: 2.5, speed: 0.06, axisAttraction: 0.35, animated: false },
  controls: [
    { type: "number", key: "amount", label: "Amount", min: 0, max: 0.04, step: 0.0005 },
    { type: "number", key: "scale", label: "Scale", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "direction", label: "Direction", min: -180, max: 180, step: 1 },
    { type: "number", key: "frequency", label: "Frequency", min: 0.1, max: 12, step: 0.1 },
    { type: "number", key: "speed", label: "Speed", min: 0, max: 2, step: 0.01 },
    { type: "number", key: "axisAttraction", label: "Axis Attraction", min: 0, max: 2, step: 0.01 },
    { type: "boolean", key: "animated", label: "Animate" },
  ],
};
