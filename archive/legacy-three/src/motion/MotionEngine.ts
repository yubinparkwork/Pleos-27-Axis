import * as THREE from "three";
import { evaluateMasterFold } from "../geometry/FoldSurfaceBuilder";
import type { FoldState, MotionSettings } from "../state/studioState";

export interface MotionFrame {
  fold: FoldState;
  layerReveal: number;
  sweep: number;
  elementTime: number;
  materialMix: number;
}

export class MotionEngine {
  evaluate(base: FoldState, settings: MotionSettings): MotionFrame {
    const time = settings.duration > 0 ? settings.time / settings.duration : 0;
    const phase = settings.loop ? ((time % 1) + 1) % 1 : THREE.MathUtils.clamp(time, 0, 1);
    const intensity = settings.intensity;
    let fold = base;
    let layerReveal = 0;
    let sweep = 0;
    let materialMix = 0;
    if (settings.preset === "fold-breath") fold = evaluateMasterFold(base, phase, intensity * 0.55);
    if (settings.preset === "depth-pulse") {
      const pulse = Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 1.8);
      fold = evaluateMasterFold(base, phase, intensity * (0.25 + pulse));
    }
    if (settings.preset === "layer-reveal") layerReveal = intensity;
    if (settings.preset === "axis-light-sweep") sweep = intensity;
    if (settings.preset === "material-scan") materialMix = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    return { fold, layerReveal, sweep, elementTime: phase, materialMix };
  }
}
