import { SharedVertexPulseMotion } from "../modules/SharedVertexPulseMotion";
import type { MotionPreset } from "../types";

export const sharedVertexPulsePreset: MotionPreset = {
  id: "shared-vertex-pulse",
  label: "Shared Vertex Pulse",
  duration: 4,
  constraint: "strict",
  modules: [SharedVertexPulseMotion],
  parameters: { amount: 0.015, frequency: 1, phase: 0.03, hold: 0.1, materialResponse: 0.35, reflectionResponse: 0.4 },
};
