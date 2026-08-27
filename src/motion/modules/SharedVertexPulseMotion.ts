import { bell } from "../easing";
import type { MotionModule, MotionPatch } from "../types";

export const SharedVertexPulseMotion: MotionModule = {
  id: "shared-vertex-pulse",
  evaluate(context, parameters): MotionPatch {
    const amount = Math.min(0.02, parameters.amount ?? 0.009) * Math.pow(context.strength, 1.35);
    const response = parameters.materialResponse ?? 0.35;
    const pulse = bell(context.progress, .5, .29);
    const values = [1 + pulse * amount, 1 + pulse * amount * .94, 1 + pulse * amount * .97] as [number, number, number];
    return {
      solidScale: values,
      originPulse: pulse * amount * 4.5,
      reflectionOffset: pulse * response * Math.sqrt(context.strength) * .08,
    };
  },
};
