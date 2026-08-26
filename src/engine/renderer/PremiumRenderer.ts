import * as THREE from "three/webgpu";
import type { RawStudioChange, RawStudioState } from "../../studio/state/RawStudioState";
import type { RawStudioCommand } from "../../studio/ui/RawStudioApp";
import { AnimationSystem } from "../animation/AnimationSystem";
import {
  resolveQualityProfile,
  type EngineRendererStatus,
} from "../config/EngineTypes";
import { AdaptiveQuality } from "../performance/AdaptiveQuality";
import { PleosScene } from "../scene/PleosScene";

export interface PremiumRendererOptions {
  state: RawStudioState;
  onStatus?: (status: EngineRendererStatus) => void;
  onError?: (error: Error) => void;
  onCameraChange?: (camera: RawStudioState["camera"]) => void;
}

function backendName(renderer: THREE.WebGPURenderer | null): "WebGPU" | "WebGL2" | "Initializing" {
  if (!renderer) return "Initializing";
  return (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL2";
}

export class PremiumRenderer {
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGPURenderer | null = null;
  private pleosScene: PleosScene | null = null;
  private state: RawStudioState;
  private resizeObserver: ResizeObserver | null = null;
  private readonly animation = new AnimationSystem();
  private readonly adaptive = new AdaptiveQuality();
  private disposed = false;
  private initialized = false;
  private pixelRatioScale = 1;
  private status: EngineRendererStatus = {
    renderer: "Three.js WebGPU",
    gpuPreference: "WebGPU 우선 · WebGL2 자동 폴백",
    hdrEnabled: true,
    floatColorBuffer: true,
    maxTextureSize: null,
    maxRenderbufferSize: null,
    maxSamples: null,
    drawingBuffer: null,
    frameTimeMs: null,
    contextLost: false,
    effectiveGeometryMode: "closed-optical-solid",
    message: "Three.js 렌더링 엔진을 준비하고 있습니다.",
    level: "warning",
  };

  constructor(private readonly options: PremiumRendererOptions) {
    this.state = structuredClone(options.state);
  }

  mount(host: HTMLElement): void {
    this.host = host;
    void this.initialize().catch((error: unknown) => this.handleError(error));
  }

  updateState(next: Readonly<RawStudioState>, change: RawStudioChange): void {
    const requiresBackendRestart = this.state.engine.backend !== next.engine.backend
      || this.state.output.transparent !== next.output.transparent;
    this.state = structuredClone(next);
    if (requiresBackendRestart && this.host && this.initialized) {
      const host = this.host;
      this.disposeRendererOnly();
      this.disposed = false;
      this.host = host;
      void this.initialize().catch((error: unknown) => this.handleError(error));
      return;
    }
    this.pleosScene?.update(next, change);
    this.applyRendererSettings();
  }

  inspectStatus(): EngineRendererStatus {
    if (this.renderer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.status.drawingBuffer = [Math.round(size.x), Math.round(size.y)];
      this.status.frameTimeMs = this.adaptive.frameTimeMs;
      this.status.renderer = `Three.js ${backendName(this.renderer)}`;
    }
    return { ...this.status };
  }

  fitCamera(): RawStudioState["camera"] {
    return this.requireScene().fitCamera();
  }

  resetCamera(): RawStudioState["camera"] {
    return this.requireScene().resetCamera();
  }

  recompileShaders(): void {
    this.requireScene().recompile();
  }

  async exportPNG(): Promise<void> {
    const renderer = this.requireRenderer();
    const scene = this.requireScene();
    const host = this.host;
    if (!host) throw new Error("렌더링 화면이 연결되지 않았습니다.");
    const previousWidth = Math.max(1, host.clientWidth);
    const previousHeight = Math.max(1, host.clientHeight);
    const previousRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(Math.max(1, this.state.output.supersampling));
    renderer.setSize(this.state.output.width, this.state.output.height, false);
    scene.resize(this.state.output.width, this.state.output.height);
    scene.render();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const blob = await new Promise<Blob>((resolve, reject) => {
      renderer.domElement.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 생성에 실패했습니다.")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${this.state.output.filename || "pleos-27"}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    renderer.setPixelRatio(previousRatio);
    renderer.setSize(previousWidth, previousHeight, false);
    scene.resize(previousWidth, previousHeight);
  }

  async command(command: RawStudioCommand): Promise<void> {
    if (command.type === "export") await this.exportPNG();
    else if (command.type === "recompile-shaders") this.recompileShaders();
  }

  dispose(): void {
    this.disposed = true;
    this.disposeRendererOnly();
    this.host = null;
  }

  private async initialize(): Promise<void> {
    if (!this.host) return;
    const quality = resolveQualityProfile(this.state);
    THREE.ColorManagement.enabled = true;
    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      samples: quality.antialiasSamples,
      alpha: this.state.output.transparent,
      forceWebGL: this.state.engine.backend === "webgl2",
      outputBufferType: THREE.HalfFloatType,
    });
    this.renderer = renderer;
    renderer.domElement.className = "premium-renderer-canvas";
    renderer.domElement.setAttribute("aria-label", "Pleos 27 Three.js WebGPU 렌더러");
    this.host.replaceChildren(renderer.domElement);
    this.applyRendererSettings();
    await renderer.init();
    if (this.disposed || this.renderer !== renderer || !this.host) return;
    const pleosScene = new PleosScene(renderer, this.state, quality, this.options.onCameraChange);
    this.pleosScene = pleosScene;
    pleosScene.mount(this.host);
    await pleosScene.initialize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animation.connect(document);
    await renderer.setAnimationLoop(this.frame);
    this.initialized = true;
    this.status = {
      ...this.status,
      renderer: `Three.js ${backendName(renderer)}`,
      gpuPreference: backendName(renderer) === "WebGPU" ? "WebGPU 활성" : "WebGL2 폴백 활성",
      message: `${backendName(renderer)} · HDR · TSL · 적응형 품질 렌더러가 준비되었습니다.`,
      level: "ok",
    };
    this.emitStatus();
  }

  private readonly frame = (): void => {
    if (!this.renderer || !this.pleosScene || this.disposed) return;
    const frame = this.animation.sample(this.state.engine.animationPaused);
    const delta = frame.deltaSeconds;
    const elapsed = frame.elapsedSeconds;
    const frameStart = performance.now();
    if (delta > 0) this.pleosScene.step(delta);
    this.pleosScene.render();
    const frameMs = performance.now() - frameStart;
    const quality = resolveQualityProfile(this.state);
    const adjustment = this.adaptive.sample(frameMs, elapsed, this.state);
    if (adjustment) {
      this.pixelRatioScale = adjustment.pixelRatioScale;
      this.applyPixelRatio();
      this.resize();
      this.pleosScene.updateQuality(quality, adjustment.particleScale);
    }
    if (Math.floor(elapsed * 2) !== Math.floor((elapsed - delta) * 2)) this.emitStatus();
  };

  private applyRendererSettings(): void {
    if (!this.renderer) return;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = this.state.output.post.toneMapping === "aces-fitted"
      ? THREE.ACESFilmicToneMapping
      : THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = Math.pow(2, this.state.output.post.exposure);
    this.renderer.setClearColor(0x000008, this.state.output.transparent ? 0 : 1);
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    if (!this.renderer) return;
    const profile = resolveQualityProfile(this.state);
    const deviceRatio = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(deviceRatio, profile.pixelRatioCap) * this.pixelRatioScale);
  }

  private resize(): void {
    if (!this.renderer || !this.pleosScene || !this.host) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.pleosScene.resize(width, height);
  }

  private emitStatus(): void {
    this.options.onStatus?.(this.inspectStatus());
  }

  private handleError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.status.message = normalized.message;
    this.status.level = "error";
    this.options.onError?.(normalized);
    this.emitStatus();
  }

  private disposeRendererOnly(): void {
    this.initialized = false;
    this.animation.dispose();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer?.setAnimationLoop(null);
    this.pleosScene?.dispose();
    this.pleosScene = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  private requireRenderer(): THREE.WebGPURenderer {
    if (!this.renderer || !this.initialized) throw new Error("Three.js 렌더러가 아직 준비되지 않았습니다.");
    return this.renderer;
  }

  private requireScene(): PleosScene {
    if (!this.pleosScene || !this.initialized) throw new Error("3D 장면이 아직 준비되지 않았습니다.");
    return this.pleosScene;
  }
}
