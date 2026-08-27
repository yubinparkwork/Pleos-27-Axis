import { bell, smootherstep } from "../easing";
import type { MotionModule, MotionPatch } from "../types";

export const ExplodeRejoinMotion: MotionModule = {
  id: "explode-rejoin",
  evaluate(context, parameters): MotionPatch {
    const p = context.progress;
    const outward = p < 0.46 ? smootherstep(0.16, 0.46, p) : 1;
    const inward = p < 0.6 ? 1 : 1 - smootherstep(0.6, 0.9, p);
    const amount = outward * inward;
    const distance = Math.min(0.12, parameters.distance ?? 0.055) * Math.pow(context.strength, 1.2);
    const rotation = Math.min(.5, parameters.microRotation ?? 0) * amount * Math.pow(context.strength, 1.3);
    const impact = bell(p, .91, .035);
    return {
      gap: amount * distance,
      microRotation: [rotation, -rotation, rotation * 0.5],
      originPulse: impact * (parameters.rejoinImpact ?? 0.08) * context.strength,
      reflectionOffset: impact * .06,
    };
  },
};
