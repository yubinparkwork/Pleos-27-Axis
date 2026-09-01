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
    const white = bell(progress, .43, width) * activeWindow * .55;
    const spectralPeak = bell(progress, .43 + lag, width * 1.12);
    // Brand light remains present throughout the visible sweep instead of
    // appearing only as a short RGB accent after the white pulse.
    const spectral = (.26 + spectralPeak * .74) * activeWindow;
    const origin = bell(progress, .49, .1) * activeWindow;
    return {
      solidPhase: [0, phaseOffset, phaseOffset * 2],
      originPulse: origin * amplitude * (parameters.originPulse ?? 0.4),
      spectralSweep: spectral * amplitude,
      dispersionOffset: spectral * amplitude * 0.055,
      reflectionOffset: (white * .35 + spectral * .65) * lightResponse * 0.28,
      bloomOffset: (white * .25 + spectral * .75) * lightResponse * 0.09,
      lightRig: {
        whitePulse: white * lightResponse,
        spectralIntensity: spectral * amplitude * (parameters.colorSaturation ?? 0.42),
        direction,
        // Traverse the complete approved axis once per deterministic loop.
        // Intensity fades at the loop boundaries, so the reset is invisible.
        travel: progress * 2 - 1,
        emitterLength: parameters.lightLength ?? .72,
        emitterWidth: parameters.lightWidth ?? .34,
      },
    };
  },
};
