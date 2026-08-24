export type ParamValue = number | boolean | string;
export type EffectParams = Record<string, ParamValue>;

export type EffectMask =
  | "global"
  | "top-left"
  | "top-right"
  | "right-middle"
  | "bottom-right"
  | "bottom-left"
  | "all-axes"
  | "main-axis"
  | "top-axis"
  | "right-down-axis"
  | "soft-fold";

export type ControlSchema =
  | { type: "number"; key: string; label: string; min: number; max: number; step: number }
  | { type: "boolean"; key: string; label: string }
  | { type: "select"; key: string; label: string; options: Array<{ label: string; value: string }> }
  | { type: "color"; key: string; label: string };

export interface EffectInstance {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  opacity: number;
  mask: EffectMask;
  params: EffectParams;
}

export interface EffectDefinition {
  type: string;
  name: string;
  category: string;
  shaderId: number;
  defaults: EffectParams;
  defaultMask: EffectMask;
  controls: ControlSchema[];
}

export const MASK_OPTIONS: Array<{ label: string; value: EffectMask }> = [
  { label: "Global", value: "global" },
  { label: "Top Left", value: "top-left" },
  { label: "Top Right", value: "top-right" },
  { label: "Right Middle", value: "right-middle" },
  { label: "Bottom Right", value: "bottom-right" },
  { label: "Bottom Left", value: "bottom-left" },
  { label: "All Axes", value: "all-axes" },
  { label: "Main Axis", value: "main-axis" },
  { label: "Top Axis", value: "top-axis" },
  { label: "Right-down Axis", value: "right-down-axis" },
  { label: "Soft Fold", value: "soft-fold" },
];

export function createEffect(definition: EffectDefinition): EffectInstance {
  return {
    id: crypto.randomUUID(),
    type: definition.type,
    name: definition.name,
    enabled: true,
    opacity: 1,
    mask: definition.defaultMask,
    params: structuredClone(definition.defaults),
  };
}
