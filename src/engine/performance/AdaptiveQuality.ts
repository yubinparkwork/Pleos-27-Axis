import type { RawStudioState } from "../../studio/state/RawStudioState";

export interface AdaptiveQualityChange {
  pixelRatioScale: number;
  particleScale: number;
}

export class AdaptiveQuality {
  private frameAccumulator = 0;
  private frameCount = 0;
  private lastAdjustment = 0;
  private pixelRatioScale = 1;
  private particleScale = 1;
  private averageFrameMs = 16.67;

  sample(frameMs: number, nowSeconds: number, state: Readonly<RawStudioState>): AdaptiveQualityChange | null {
    this.frameAccumulator += frameMs;
    this.frameCount += 1;
    if (this.frameCount < 45) return null;
    this.averageFrameMs = this.frameAccumulator / this.frameCount;
    this.frameAccumulator = 0;
    this.frameCount = 0;
    if (!state.engine.adaptiveQuality || nowSeconds - this.lastAdjustment < 2.4) return null;
    const targetMs = 1000 / Math.max(30, state.engine.targetFps);
    const previousPixel = this.pixelRatioScale;
    const previousParticles = this.particleScale;
    if (this.averageFrameMs > targetMs * 1.16) {
      this.pixelRatioScale = Math.max(0.58, this.pixelRatioScale - 0.08);
      this.particleScale = Math.max(0.3, this.particleScale - 0.12);
    } else if (this.averageFrameMs < targetMs * 0.78) {
      this.pixelRatioScale = Math.min(1, this.pixelRatioScale + 0.05);
      this.particleScale = Math.min(1, this.particleScale + 0.08);
    }
    if (previousPixel === this.pixelRatioScale && previousParticles === this.particleScale) return null;
    this.lastAdjustment = nowSeconds;
    return {
      pixelRatioScale: this.pixelRatioScale,
      particleScale: this.particleScale,
    };
  }

  get frameTimeMs(): number {
    return this.averageFrameMs;
  }
}
