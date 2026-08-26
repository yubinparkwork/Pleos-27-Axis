import type { RawEngineQuality, RawStudioState } from "../../studio/state/RawStudioState";

export type EngineBackendName = "WebGPU" | "WebGL2" | "Initializing";

export interface EngineRendererStatus {
  renderer: string;
  gpuPreference: string;
  hdrEnabled: boolean;
  floatColorBuffer: boolean;
  maxTextureSize: number | null;
  maxRenderbufferSize: number | null;
  maxSamples: number | null;
  drawingBuffer: [number, number] | null;
  frameTimeMs: number | null;
  contextLost: boolean;
  effectiveGeometryMode: string | null;
  message: string;
  level: "ok" | "warning" | "error";
}

export interface EngineQualityProfile {
  pixelRatioCap: number;
  particleScale: number;
  bloomScale: number;
  antialiasSamples: number;
  environmentResolution: number;
}

export const ENGINE_QUALITY_PROFILES: Record<RawEngineQuality, EngineQualityProfile> = {
  adaptive: { pixelRatioCap: 2, particleScale: 1, bloomScale: 0.72, antialiasSamples: 4, environmentResolution: 256 },
  performance: { pixelRatioCap: 1, particleScale: 0.35, bloomScale: 0.42, antialiasSamples: 2, environmentResolution: 128 },
  balanced: { pixelRatioCap: 1.5, particleScale: 0.7, bloomScale: 0.58, antialiasSamples: 4, environmentResolution: 256 },
  ultra: { pixelRatioCap: 2.5, particleScale: 1, bloomScale: 1, antialiasSamples: 8, environmentResolution: 512 },
};

export function resolveQualityProfile(state: Readonly<RawStudioState>): EngineQualityProfile {
  return ENGINE_QUALITY_PROFILES[state.engine.quality];
}

export function clampFinite(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
