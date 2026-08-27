import { SpectralAxisSweepMotion } from "../modules/SpectralAxisSweepMotion";
import type { MotionPreset } from "../types";

export const spectralAxisSweepPreset: MotionPreset = {
  id: "spectral-axis-sweep",
  label: "Spectral Axis Sweep",
  duration: 6,
  constraint: "strict",
  modules: [SpectralAxisSweepMotion],
  parameters: { direction: 0, sweepWidth: 0.2, sweepSoftness: 0.65, phaseOffset: 0.12, spectralLag: 0.08, colorSaturation: 0.55, originPulse: 0.75, loopHold: 0.08 },
};
