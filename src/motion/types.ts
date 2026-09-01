export type MotionClockMode = "realtime" | "fixed";
export type AxisConstraintMode = "strict" | "anchored" | "experimental";
export type MotionPresetId = "off" | "spectral-axis-sweep" | "shared-vertex-pulse" | "explode-rejoin";
export type MotionStrengthMode = "restrained" | "balanced" | "active";

export interface MotionContext {
  time: number;
  duration: number;
  progress: number;
  frame: number;
  fps: number;
  speed: number;
  strength: number;
  seed: number;
  loop: boolean;
}

export interface MotionLightPatch {
  whitePulse: number;
  spectralIntensity: number;
  direction: number;
  travel: number;
  emitterLength: number;
  emitterWidth: number;
}

export interface MotionPatch {
  solidScale?: [number, number, number];
  solidPhase?: [number, number, number];
  gap?: number;
  microRotation?: [number, number, number];
  originPulse?: number;
  spectralSweep?: number;
  dispersionOffset?: number;
  reflectionOffset?: number;
  lightRig?: MotionLightPatch;
  bloomOffset?: number;
}

export interface MotionModule {
  id: string;
  evaluate(context: MotionContext, parameters: Record<string, number>): MotionPatch;
}

export interface MotionPreset {
  id: Exclude<MotionPresetId, "off">;
  label: string;
  duration: number;
  constraint: AxisConstraintMode;
  modules: MotionModule[];
  parameters: Record<string, number>;
}

export interface MotionSettings {
  enabled: boolean;
  preset: MotionPresetId;
  strengthMode: MotionStrengthMode;
  strength: number;
  duration: number;
  fps: number;
  speed: number;
  seed: number;
  loop: boolean;
  constraint: AxisConstraintMode;
  parameters: Record<string, number>;
}

export interface MotionRuntimeState {
  time: number;
  frame: number;
  playing: boolean;
  mode: MotionClockMode;
  patch: MotionPatch;
}

export const STRENGTH_VALUES: Record<MotionStrengthMode, number> = {
  restrained: 0.32,
  balanced: 0.56,
  active: 0.82,
};
