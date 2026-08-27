import { loopSine } from "../easing";
import type { MotionModule, MotionPatch } from "../types";

export const SharedVertexPulseMotion: MotionModule = {
  id: "shared-vertex-pulse",
  evaluate(context, parameters): MotionPatch {
    const amount = Math.min(0.04, parameters.amount ?? 0.015) * context.strength;
    const frequency = parameters.frequency ?? 1;
    const phase = parameters.phase ?? 0.03;
    const response = parameters.materialResponse ?? 0.35;
    const values = [0, 1, 2].map((index) => 1 + Math.max(0, loopSine(context.progress * frequency, index * phase)) * amount) as [number, number, number];
    const pulse = Math.max(0, loopSine(context.progress * frequency));
    return {
      solidScale: values,
      originPulse: pulse * amount * 8,
      reflectionOffset: pulse * response * context.strength * 0.16,
    };
  },
};
