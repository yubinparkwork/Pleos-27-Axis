import { SpectralAxisSweepMotion } from "../modules/SpectralAxisSweepMotion";
import type { MotionPreset } from "../types";

export const spectralAxisSweepPreset: MotionPreset = {
  id: "spectral-axis-sweep",
  label: "스펙트럴 축 이동",
  duration: 7.2,
  constraint: "strict",
  modules: [SpectralAxisSweepMotion],
  parameters: { direction: 0, sweepWidth: 0.18, sweepSoftness: 0.72, phaseOffset: 0.09, spectralLag: 0.17, colorSaturation: 0.42, originPulse: 0.4, lightLength: .72, lightWidth: .34, loopHold: 0.12 },
};
