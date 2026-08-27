import { AXIS_DIRECTION_FAMILIES } from "../../axis/angles";
import { bell } from "../easing";
import type { MotionModule, MotionPatch } from "../types";

export const SpectralAxisSweepMotion: MotionModule = {
  id: "spectral-axis-sweep",
  evaluate(context, parameters): MotionPatch {
    const width = parameters.sweepWidth ?? 0.2;
    const lag = parameters.spectralLag ?? 0.08;
    const phaseOffset = parameters.phaseOffset ?? 0.12;
    const directionIndex = Math.round(parameters.direction ?? 0);
    const directions = AXIS_DIRECTION_FAMILIES["30deg"];
    const direction = directions[((directionIndex % directions.length) + directions.length) % directions.length];
    const progress = context.progress;
    const white = bell(progress, 0.34, width);
    const spectral = bell(progress, 0.34 + lag, width * 1.15);
    const origin = bell(progress, 0.08, 0.075) + bell(progress, 0.92, 0.075);
    return {
      solidPhase: [0, phaseOffset, phaseOffset * 2],
      originPulse: origin * context.strength * (parameters.originPulse ?? 0.75),
      spectralSweep: spectral * context.strength,
      dispersionOffset: spectral * context.strength * 0.08,
      reflectionOffset: white * context.strength * 0.45,
      bloomOffset: white * context.strength * 0.18,
      lightRig: {
        whitePulse: white * context.strength,
        spectralIntensity: spectral * context.strength * (parameters.colorSaturation ?? 0.55),
        direction,
      },
    };
  },
};
