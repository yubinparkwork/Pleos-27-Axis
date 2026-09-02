import type * as THREE from "three";
import { ACESFilmicToneMapping, SRGBColorSpace, WebGPURenderer } from "three/webgpu";
import { WebGPUPathTracer, type WebGPUSampleCounts } from "three-gpu-pathtracer/webgpu";

export type WebGPUPathTracerStatus = "initializing" | "webgpu" | "unavailable";

interface BackendIdentity {
  isWebGPUBackend?: boolean;
  device?: { limits?: { maxTextureDimension2D?: number } };
}

/**
 * Native WebGPU wavefront path-tracing backend.
 *
 * The backend intentionally owns a renderer and canvas separate from the
 * realtime preview. Progressive accumulation, high-resolution export and the
 * WebGL compatibility tracer therefore cannot invalidate each other's GPU
 * state. The app keeps the established WebGL tracer as a fallback only.
 */
export class WebGPUPathTracerBackend {
  readonly renderer: WebGPURenderer;
  readonly canvas: HTMLCanvasElement;
  status: WebGPUPathTracerStatus = "initializing";
  error: string | null = null;
  sampleCounts: WebGPUSampleCounts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };

  private tracer: WebGPUPathTracer | null = null;
  private ready = false;
  private sampleQuery: Promise<void> | null = null;
  private lastSampleQueryAt = 0;

  constructor(background: THREE.ColorRepresentation, alpha: number, exposure: number) {
    this.renderer = new WebGPURenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.renderer.setClearColor(background, alpha);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "pathtrace-canvas webgpu-pathtrace-canvas";
    this.canvas.dataset.rendererBackend = this.status;
  }

  async init(): Promise<void> {
    try {
      await this.renderer.init();
      if ((this.renderer.backend as BackendIdentity).isWebGPUBackend !== true) {
        throw new Error("Native WebGPU adapter is unavailable");
      }

      const tracer = new WebGPUPathTracer(this.renderer);
      tracer.renderDelay = 0;
      tracer.fadeDuration = 0;
      tracer.dynamicLowRes = false;
      tracer.minSamples = 1;
      tracer.stableNoise = true;
      tracer.pause = true;
      this.tracer = tracer;
      this.status = "webgpu";
      this.ready = true;
    } catch (error) {
      this.status = "unavailable";
      this.error = error instanceof Error ? error.message : String(error);
      this.ready = false;
    }
    this.canvas.dataset.rendererBackend = this.status;
  }

  get isReady(): boolean { return this.ready && this.tracer !== null; }
  get maxTextureSize(): number {
    return (this.renderer.backend as BackendIdentity).device?.limits?.maxTextureDimension2D ?? 8192;
  }

  setClearColor(color: THREE.ColorRepresentation, alpha: number): void {
    this.renderer.setClearColor(color, alpha);
  }

  setExposure(value: number): void { this.renderer.toneMappingExposure = value; }

  prepare(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, options: {
    bounces: number;
    renderScale: number;
    targetSamples: number;
    filterGlossyFactor: number;
  }): void {
    if (!this.tracer) throw new Error("WebGPU path tracer is not ready");
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.tracer.renderScale = options.renderScale;
    this.tracer.bounces = options.bounces;
    this.tracer.maxTransparentBounces = options.bounces + 4;
    this.tracer.maxSamples = options.targetSamples;
    this.tracer.filterGlossyFactor = options.filterGlossyFactor;
    this.tracer.setScene(scene, camera);
    this.tracer.setSize(Math.max(1, Math.floor(width * options.renderScale)), Math.max(1, Math.floor(height * options.renderScale)));
    this.reset();
    this.tracer.pause = false;
  }

  reset(): void {
    this.tracer?.reset();
    this.sampleCounts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };
    this.lastSampleQueryAt = 0;
    this.sampleQuery = null;
  }

  pause(): void { if (this.tracer) this.tracer.pause = true; }

  renderSample(now = performance.now()): void {
    if (!this.tracer || this.tracer.pause) return;
    this.tracer.renderSample();
    if (!this.sampleQuery && (this.lastSampleQueryAt === 0 || now - this.lastSampleQueryAt >= 180)) {
      this.lastSampleQueryAt = now;
      this.sampleQuery = this.tracer.getSampleCountsAsync()
        .then((counts) => { this.sampleCounts = counts; })
        .catch((error: unknown) => { this.error = error instanceof Error ? error.message : String(error); })
        .finally(() => { this.sampleQuery = null; });
    }
  }

  async refreshSampleCounts(): Promise<WebGPUSampleCounts> {
    if (!this.tracer) return this.sampleCounts;
    if (this.sampleQuery) await this.sampleQuery;
    this.sampleCounts = await this.tracer.getSampleCountsAsync();
    return this.sampleCounts;
  }

  async capturePng(): Promise<string> {
    // Wait for all previously submitted WebGPU commands before reading the
    // presentation canvas. A frame boundary gives Chrome time to present the
    // latest accumulated target to the canvas.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return this.canvas.toDataURL("image/png");
  }

  dispose(): void {
    this.tracer?.dispose();
    this.tracer = null;
    this.renderer.dispose();
    this.canvas.remove();
  }
}
