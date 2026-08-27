import { explodeRejoinPreset } from "./presets/explodeRejoin";
import { sharedVertexPulsePreset } from "./presets/sharedVertexPulse";
import { spectralAxisSweepPreset } from "./presets/spectralAxisSweep";
import type { MotionPreset, MotionPresetId } from "./types";

const PRESETS = [spectralAxisSweepPreset, sharedVertexPulsePreset, explodeRejoinPreset];

export class MotionPresetRegistry {
  static list(): MotionPreset[] { return PRESETS.map((preset) => ({ ...preset, parameters: { ...preset.parameters }, modules: [...preset.modules] })); }
  static get(id: MotionPresetId): MotionPreset | null {
    if (id === "off") return null;
    const preset = PRESETS.find((candidate) => candidate.id === id);
    return preset ? { ...preset, parameters: { ...preset.parameters }, modules: [...preset.modules] } : null;
  }
}
