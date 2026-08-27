import { CrystalAssembly, type PrismRestPose } from "./CrystalAssembly";
import type { MotionPatch } from "../motion/types";

export class PrismMotionAdapter {
  private restPose: PrismRestPose;

  constructor(private readonly assembly: CrystalAssembly) {
    this.restPose = assembly.captureRestPose();
  }

  captureRestPose(): PrismRestPose {
    this.restPose = this.assembly.captureRestPose();
    return this.restPose;
  }

  applyFrame(patch: MotionPatch): void {
    this.assembly.restoreRestPose(this.restPose);
    if (patch.solidScale) this.assembly.applyRuntimeScale(patch.solidScale);
    if (typeof patch.gap === "number") this.assembly.applyRuntimeGap(patch.gap);
    if (patch.microRotation) this.assembly.applyRuntimeRotation(patch.microRotation);
  }

  restoreRestPose(): void { this.assembly.restoreRestPose(this.restPose); }

  getSharedCornerValidity(epsilon = 1e-5): boolean {
    const positions = this.assembly.getSharedCornerPositions();
    return positions.every((position) => position.length() <= epsilon);
  }
}
