import { AXIS_DIRECTION_FAMILIES } from "../../axis/angles";
import { bell, interval } from "../easing";
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
    const amplitude = Math.pow(context.strength, 1.15);
    const lightResponse = Math.min(1, .18 + context.strength * .82);
    const activeWindow = interval(progress, .12, .89, .12);
    const white = bell(progress, .43, width) * activeWindow;
    const spectral = bell(progress, .43 + lag, width * 1.12) * activeWindow;
    const origin = bell(progress, .49, .1) * activeWindow;
    return {
      solidPhase: [0, phaseOffset, phaseOffset * 2],
      originPulse: origin * amplitude * (parameters.originPulse ?? 0.4),
      spectralSweep: spectral * amplitude,
      dispersionOffset: spectral * amplitude * 0.055,
      reflectionOffset: white * lightResponse * 0.34,
      bloomOffset: white * lightResponse * 0.105,
      lightRig: {
        whitePulse: white * lightResponse,
        spectralIntensity: spectral * amplitude * (parameters.colorSaturation ?? 0.42),
        direction,
      },
    };
  },
};
