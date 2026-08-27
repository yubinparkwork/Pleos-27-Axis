import { MotionPresetRegistry } from "./MotionPresetRegistry";
import type { MotionContext, MotionPatch, MotionSettings } from "./types";

function mergePatch(target: MotionPatch, source: MotionPatch): MotionPatch {
  return {
    ...target,
    ...source,
    lightRig: source.lightRig ?? target.lightRig,
  };
}

export class MotionEngine {
  evaluate(settings: MotionSettings, time: number): MotionPatch {
    if (!settings.enabled || settings.preset === "off") return {};
    const preset = MotionPresetRegistry.get(settings.preset);
    if (!preset) return {};
    const duration = Math.max(1 / settings.fps, settings.duration);
    const normalizedTime = settings.loop ? ((time % duration) + duration) % duration : Math.min(duration, Math.max(0, time));
    const progress = duration <= 0 ? 0 : normalizedTime / duration;
    const context: MotionContext = {
      time: normalizedTime,
      duration,
      progress,
      frame: Math.round(normalizedTime * settings.fps),
      fps: settings.fps,
      speed: settings.speed,
      strength: settings.strength,
      seed: settings.seed,
      loop: settings.loop,
    };
    const parameters = { ...preset.parameters, ...settings.parameters };
    return preset.modules.reduce((patch, module) => mergePatch(patch, module.evaluate(context, parameters)), {} as MotionPatch);
  }
}
