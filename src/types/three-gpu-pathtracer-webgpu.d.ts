declare module "three-gpu-pathtracer/webgpu" {
  import type { Camera, Scene, Vector2 } from "three";
  import type { WebGPURenderer } from "three/webgpu";

  export interface WebGPUSampleCounts {
    min: number;
    max: number;
    avg: number;
    samplesPerSecond: number;
  }

  export class WebGPUPathTracer {
    constructor(renderer: WebGPURenderer);
    bounces: number;
    maxTransparentBounces: number;
    maxSamples: number;
    renderScale: number;
    minSamples: number;
    renderDelay: number;
    fadeDuration: number;
    dynamicLowRes: boolean;
    stableNoise: boolean;
    pause: boolean;
    filterGlossyFactor: number;
    clampDirect: number;
    clampIndirect: number;
    multipleImportanceSampling: boolean;
    transmissiveBackground: number;
    readonly target: unknown;
    readonly tiles: Vector2;
    setScene(scene: Scene, camera: Camera): void;
    setSize(width: number, height: number): void;
    updateCamera(): void;
    updateTransforms(): void;
    updateMaterials(): void;
    updateLights(): void;
    updateEnvironment(): void;
    reset(): void;
    renderSample(): void;
    getSampleCountsAsync(): Promise<WebGPUSampleCounts>;
    dispose(): void;
  }
}
