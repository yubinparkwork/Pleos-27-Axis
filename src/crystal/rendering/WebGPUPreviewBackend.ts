import type * as THREE from "three";
import { ACESFilmicToneMapping, PostProcessing, RectAreaLightNode, SRGBColorSpace, WebGPURenderer } from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RectAreaLightTexturesLib } from "three/addons/lights/RectAreaLightTexturesLib.js";

export type WebGPUBackendStatus = "initializing" | "webgpu" | "webgl2-fallback" | "unavailable";

interface BackendIdentity {
  isWebGPUBackend?: boolean;
}

/**
 * WebGPU presentation backend for the physical Glass 3D looks.
 *
 * The existing WebGL path tracer remains a separate reference renderer: the
 * upstream three-gpu-pathtracer package is GLSL/WebGL-only. Keeping that
 * boundary explicit lets the scene, camera, lights and motion remain shared
 * without pretending that a WebGL path trace is running on WebGPU.
 */
export class WebGPUPreviewBackend {
  readonly renderer: WebGPURenderer;
  readonly canvas: HTMLCanvasElement;
  status: WebGPUBackendStatus = "initializing";
  error: string | null = null;
  private readonly postProcessing: PostProcessing;
  private readonly bloomNode: ReturnType<typeof bloom>;
  private ready = false;

  constructor(scene: THREE.Scene, camera: THREE.Camera, background: THREE.ColorRepresentation, alpha: number, exposure: number, bloomStrength: number) {
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    this.renderer = new WebGPURenderer({
      alpha: true,
      antialias: true,
      samples: 4,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.renderer.setClearColor(background, alpha);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "preview-canvas webgpu-preview-canvas";
    this.canvas.dataset.rendererBackend = this.status;

    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    this.bloomNode = bloom(sceneColor, bloomStrength, 0.65, 0.78);
    this.postProcessing = new PostProcessing(this.renderer);
    this.postProcessing.outputNode = sceneColor.add(this.bloomNode);
  }

  async init(): Promise<void> {
    try {
      await this.renderer.init();
      this.status = (this.renderer.backend as BackendIdentity).isWebGPUBackend === true ? "webgpu" : "webgl2-fallback";
      this.canvas.dataset.rendererBackend = this.status;
      this.ready = true;
    } catch (error) {
      this.status = "unavailable";
      this.canvas.dataset.rendererBackend = this.status;
      this.error = error instanceof Error ? error.message : String(error);
      this.ready = false;
    }
  }

  get isReady(): boolean { return this.ready; }
  get isNativeWebGPU(): boolean { return this.status === "webgpu"; }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  setClearColor(color: THREE.ColorRepresentation, alpha: number): void {
    this.renderer.setClearColor(color, alpha);
  }

  setExposure(value: number): void { this.renderer.toneMappingExposure = value; }
  setBloom(value: number): void { this.bloomNode.strength.value = value; }

  render(): boolean {
    if (!this.ready) return false;
    this.postProcessing.render();
    return true;
  }

  dispose(): void {
    this.postProcessing.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
