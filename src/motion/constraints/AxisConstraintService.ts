import type { AxisConstraintMode, MotionPatch } from "../types";

export class AxisConstraintService {
  constrain(patch: MotionPatch, mode: AxisConstraintMode): MotionPatch {
    if (mode === "strict") return { ...patch, microRotation: [0, 0, 0] };
    if (mode === "anchored") return { ...patch };
    return patch;
  }
}
