import { smoothstep } from "../easing";
import type { MotionModule, MotionPatch } from "../types";

export const ExplodeRejoinMotion: MotionModule = {
  id: "explode-rejoin",
  evaluate(context, parameters): MotionPatch {
    const p = context.progress;
    const outward = p < 0.42 ? smoothstep(0.15, 0.42, p) : 1;
    const inward = p < 0.58 ? 1 : 1 - smoothstep(0.58, 0.88, p);
    const amount = outward * inward;
    const distance = Math.min(0.2, parameters.distance ?? 0.08) * context.strength;
    const rotation = Math.min(2, parameters.microRotation ?? 0) * amount * context.strength;
    const impact = 1 - smoothstep(0.88, 0.96, Math.abs(p - 0.88) + 0.88);
    return {
      gap: amount * distance,
      microRotation: [rotation, -rotation, rotation * 0.5],
      originPulse: impact * (parameters.rejoinImpact ?? 0.35) * context.strength,
      reflectionOffset: impact * 0.18,
    };
  },
};
