import { EFFECT_REGISTRY } from "../../effects/registry";
import type { EffectInstance, EffectMask, EffectParams } from "../../effects/types";
import type { RenderPreset } from "../../app/studioState";

function fx(type: string, params: EffectParams = {}, mask?: EffectMask, opacity = 1): EffectInstance {
  const definition = EFFECT_REGISTRY.get(type);
  if (!definition) throw new Error(`Unknown effect ${type}`);
  return {
    id: `${type}-${crypto.randomUUID()}`,
    type,
    name: definition.name,
    enabled: true,
    opacity,
    mask: mask ?? definition.defaultMask,
    params: { ...structuredClone(definition.defaults), ...params },
  };
}

export function createInitialPresets(): RenderPreset[] {
  return [
    { id: "base-original", name: "Base / Original", locked: true, builtin: true, effects: [] },
    { id: "soft-illumination", name: "Soft Illumination", locked: false, builtin: true, effects: [
      fx("plane-illumination", { brightness: 0.09, contrast: 1.02, angle: -18, softness: 1.2, originFalloff: 0.5 }, "top-right"),
      fx("axis-light-sweep", { axis: "main", width: 0.18, softness: 0.82, intensity: 0.18, speed: 0.025, repeat: 1, animated: true }, "main-axis", 0.8),
    ] },
    { id: "brushed-metal", name: "Brushed Metal", locked: false, builtin: true, effects: [
      fx("material-texture", { textureType: "brushed", scaleX: 1.2, scaleY: 11, rotation: -26, intensity: 0.3, contrast: 1.8 }, "global"),
      fx("surface-grain", { scale: 5, intensity: 0.08, contrast: 1.5, animated: false }, "global", 0.7),
      fx("chromatic-mapping", { mode: "monochrome", intensity: 0.86, saturation: 0 }, "global"),
    ] },
    { id: "frosted-glass", name: "Frosted Glass", locked: false, builtin: true, effects: [
      fx("refraction", { amount: 0.006, scale: 4.2, direction: 18, frequency: 3.5, axisAttraction: 0.55, animated: false }, "global"),
      fx("surface-grain", { scale: 2, intensity: 0.1, contrast: 1.2, animated: false }, "global", 0.8),
      fx("plane-illumination", { brightness: 0.06, contrast: 0.94, angle: 35, softness: 1.5, originFalloff: 0.35 }, "right-middle", 0.7),
    ] },
    { id: "topographic-field", name: "Topographic Field", locked: false, builtin: true, effects: [
      fx("topographic", { source: "origin", spacing: 64, width: 1.15, softness: 1.4, intensity: 0.48, animated: false }, "global"),
    ] },
    { id: "fine-dither", name: "Fine Dither", locked: false, builtin: true, effects: [
      fx("dither", { method: "bayer", dotScale: 2, intensity: 0.48, threshold: 0.5, preserveLuminance: true }, "global"),
    ] },
    { id: "axis-scan", name: "Axis Scan", locked: false, builtin: true, effects: [
      fx("axis-light-sweep", { axis: "main", width: 0.06, softness: 0.45, intensity: 0.42, speed: 0.07, repeat: 2, falloff: 0.8, animated: true }, "main-axis"),
      fx("axis-light-sweep", { axis: "rightDown", width: 0.05, softness: 0.5, intensity: 0.28, speed: 0.045, direction: -1, repeat: 1, animated: true }, "right-down-axis", 0.8),
    ] },
    { id: "data-pulse", name: "Data Pulse", locked: false, builtin: true, effects: [
      fx("axis-light-sweep", { axis: "all", width: 0.045, softness: 0.34, intensity: 0.5, speed: 0.11, repeat: 3, falloff: 0.6, animated: true }, "all-axes"),
      fx("topographic", { source: "origin", spacing: 118, width: 0.8, softness: 2.2, intensity: 0.18, speed: 0.08, animated: true }, "all-axes", 0.55),
    ] },
  ];
}
