import type { EffectDefinition } from "./types";

export const axisLightSweepEffect: EffectDefinition = {
  type: "axis-light-sweep", name: "Axis Light Sweep", category: "Light", shaderId: 3,
  defaultMask: "all-axes",
  defaults: { axis: "main", width: 0.12, softness: 0.55, intensity: 0.28, speed: 0.08, direction: 1, repeat: 1, falloff: 0.72, animated: true },
  controls: [
    { type: "select", key: "axis", label: "Axis", options: [{ label: "Main", value: "main" }, { label: "Top", value: "top" }, { label: "Right-down", value: "rightDown" }, { label: "Soft Fold", value: "soft" }, { label: "All", value: "all" }] },
    { type: "number", key: "width", label: "Width", min: 0.01, max: 0.5, step: 0.01 },
    { type: "number", key: "softness", label: "Softness", min: 0.01, max: 1, step: 0.01 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 2, step: 0.01 },
    { type: "number", key: "speed", label: "Speed", min: 0, max: 2, step: 0.01 },
    { type: "number", key: "direction", label: "Direction", min: -1, max: 1, step: 2 },
    { type: "number", key: "repeat", label: "Repeat", min: 1, max: 8, step: 1 },
    { type: "number", key: "falloff", label: "Falloff", min: 0.05, max: 2, step: 0.01 },
    { type: "boolean", key: "animated", label: "Animate" },
  ],
};
