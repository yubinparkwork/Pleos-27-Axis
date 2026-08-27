import { SharedVertexPulseMotion } from "../modules/SharedVertexPulseMotion";
import type { MotionPreset } from "../types";

export const sharedVertexPulsePreset: MotionPreset = {
  id: "shared-vertex-pulse",
  label: "공유 꼭짓점 맥동",
  duration: 5.6,
  constraint: "strict",
  modules: [SharedVertexPulseMotion],
  parameters: { amount: 0.009, frequency: 1, phase: 0.01, hold: 0.24, materialResponse: 0.22, reflectionResponse: 0.2 },
};
