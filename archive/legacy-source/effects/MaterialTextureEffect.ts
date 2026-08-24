import type { EffectDefinition } from "./types";

export const materialTextureEffect: EffectDefinition = {
  type: "material-texture", name: "Material Texture", category: "Material", shaderId: 2,
  defaultMask: "global",
  defaults: { textureType: "brushed", scaleX: 1, scaleY: 7, rotation: -26, offsetX: 0, offsetY: 0, intensity: 0.22, contrast: 1.5, inversion: false, blendMode: "overlay", useUpload: false },
  controls: [
    { type: "select", key: "textureType", label: "Procedural", options: [{ label: "Fine Grain", value: "fine" }, { label: "Coarse Grain", value: "coarse" }, { label: "Brushed", value: "brushed" }, { label: "Paper Fiber", value: "paper" }, { label: "Cellular", value: "cellular" }, { label: "Scanline", value: "scanline" }, { label: "Speckle", value: "speckle" }, { label: "Directional", value: "directional" }] },
    { type: "number", key: "scaleX", label: "Scale X", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "scaleY", label: "Scale Y", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "rotation", label: "Rotation", min: -180, max: 180, step: 1 },
    { type: "number", key: "offsetX", label: "Offset X", min: -2, max: 2, step: 0.01 },
    { type: "number", key: "offsetY", label: "Offset Y", min: -2, max: 2, step: 0.01 },
    { type: "number", key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
    { type: "number", key: "contrast", label: "Contrast", min: 0.1, max: 4, step: 0.05 },
    { type: "boolean", key: "inversion", label: "Invert" },
    { type: "select", key: "blendMode", label: "Blend", options: [{ label: "Overlay", value: "overlay" }, { label: "Multiply", value: "multiply" }, { label: "Add", value: "add" }] },
  ],
};
