import { createRoot, type Root } from "react-dom/client";
import type { DimentionCaptureQuality, DimentionR3FRuntime } from "./DimentionR3FScene";
import { DimentionR3FScene } from "./DimentionR3FScene";
import { cloneDimentionR3FState, type DimentionR3FState } from "./DimentionR3FState";

export class DimentionR3FRenderer {
  private readonly root: Root;
  private state: DimentionR3FState;
  private runtime: DimentionR3FRuntime | null = null;
  private ready = false;
  private currentTime = 0;
  private lastSize = { width: 1, height: 1 };
  private appliedSize = { width: 0, height: 0 };
  private captureDpr: number | null = null;
  private captureQuality: DimentionCaptureQuality = "preview";

  constructor(private readonly stage: HTMLElement, initialState: DimentionR3FState, private readonly onReady: () => void, private readonly onError: (message: string) => void, private readonly onTime: (time: number) => void, private readonly onCameraOrbit: (yaw: number, pitch: number, zoom: number) => void) {
    this.state = cloneDimentionR3FState(initialState);
    this.currentTime = initialState.motion.time;
    this.root = createRoot(stage);
    this.renderReact();
  }
  isReady(): boolean { return this.ready && Boolean(this.runtime); }
  setState(state: DimentionR3FState): void { this.state = cloneDimentionR3FState(state); if (this.runtime) this.runtime.gl.toneMappingExposure = state.lighting.exposure; this.renderReact(); }
  resize(width: number, height: number): void {
    this.lastSize = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    if (!this.runtime || (this.appliedSize.width === this.lastSize.width && this.appliedSize.height === this.lastSize.height)) return;
    this.appliedSize = { ...this.lastSize };
    this.runtime.setSize(this.lastSize.width, this.lastSize.height);
  }
  renderPreview(): void { this.runtime?.invalidate(); }
  maximumTextureSize(): number { return this.runtime?.gl.capabilities.maxTextureSize ?? 0; }
  inspect(): object {
    const gl = this.runtime?.gl;
    return { ready: this.isReady(), renderer: "React Three Fiber realtime transmission + recursive FBO glass reflection + Lightformer + N8AO", pipeline: "Three.js WebGL raster", materialPipeline: "deterministic MeshPhysicalMaterial transmission + dispersion", recursionCapture: "ping-pong half-float FBO", lightingRig: "soft white spotlight + animated Gaussian spectral disc IBL", pathTracing: false, solids: 3, sharedOrigin: this.state.geometry.gap === 0, canvasCount: this.stage.querySelectorAll("canvas").length, motion: { enabled: this.state.motion.enabled, playing: this.state.motion.playing, time: this.currentTime, duration: this.state.motion.duration, fps: 60 }, gpu: gl ? { maximumTextureSize: gl.capabilities.maxTextureSize, logarithmicDepthBuffer: gl.capabilities.logarithmicDepthBuffer } : null };
  }
  async exportPng(width: number, height: number): Promise<string> {
    return this.blobDataUrl(await this.exportPngBlob(width, height));
  }
  async exportPngBlob(width: number, height: number): Promise<Blob> {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    const maximum = runtime.gl.capabilities.maxTextureSize;
    if (width > maximum || height > maximum) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${maximum}px를 초과합니다.`);
    const previousDpr = runtime.gl.getPixelRatio();
    const pixelBudget = 8_000_000;
    const superSample = Math.max(1, Math.min(2, maximum / width, maximum / height, Math.sqrt(pixelBudget / Math.max(1, width * height))));
    try {
      this.captureQuality = "still"; this.renderReact();
      // Keep the logical artboard size stable and raise DPR for supersampling.
      // Resizing the logical viewport itself leaves post-processing targets at
      // the old size for a frame and can capture only the upper-left quadrant.
      runtime.setSize(width, height); runtime.setDpr(superSample); runtime.invalidate();
      await this.frames(3);
      const output = document.createElement("canvas"); output.width = width; output.height = height;
      const context = output.getContext("2d", { alpha: true });
      if (!context) throw new Error("고품질 PNG 캔버스를 만들 수 없습니다.");
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);
      context.drawImage(runtime.gl.domElement, 0, 0, runtime.gl.domElement.width, runtime.gl.domElement.height, 0, 0, width, height);
      return await this.canvasPngBlob(output);
    } finally {
      this.captureQuality = "preview"; this.renderReact();
      runtime.setDpr(previousDpr); runtime.setSize(this.lastSize.width, this.lastSize.height); this.appliedSize = { ...this.lastSize }; runtime.invalidate();
      await this.frames(3);
    }
  }
  beginVideoCapture(width: number, height: number): void {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    const maximum = runtime.gl.capabilities.maxTextureSize;
    if (width > maximum || height > maximum) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${maximum}px를 초과합니다.`);
    if (this.captureDpr !== null) throw new Error("이미 동영상 캡처가 진행 중입니다.");
    this.captureDpr = runtime.gl.getPixelRatio();
    this.captureQuality = "video";
    this.renderReact();
    runtime.setDpr(1);
    runtime.setSize(width, height);
    this.appliedSize = { width, height };
    runtime.invalidate();
  }
  async captureVideoFrame(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, shouldCancel?: () => boolean): Promise<void> {
    const runtime = this.runtime;
    if (!runtime || this.captureDpr === null) throw new Error("동영상 캡처 세션이 시작되지 않았습니다.");
    await this.frames(2, shouldCancel);
    context.drawImage(runtime.gl.domElement, x, y, width, height);
  }
  endVideoCapture(): void {
    const runtime = this.runtime;
    if (!runtime || this.captureDpr === null) return;
    runtime.setDpr(this.captureDpr);
    this.captureDpr = null;
    this.captureQuality = "preview";
    this.renderReact();
    runtime.setSize(this.lastSize.width, this.lastSize.height);
    this.appliedSize = { ...this.lastSize };
    runtime.invalidate();
  }
  dispose(): void { this.endVideoCapture(); this.root.unmount(); this.runtime = null; this.ready = false; }
  private renderReact(): void {
    try { this.root.render(<DimentionR3FScene state={this.state} captureQuality={this.captureQuality} onRuntime={this.handleRuntime} onTime={this.handleTime} onCameraOrbit={this.onCameraOrbit} />); }
    catch (error) { this.onError(error instanceof Error ? error.message : String(error)); }
  }
  private handleRuntime = (runtime: DimentionR3FRuntime): void => {
    this.runtime = runtime; runtime.gl.toneMappingExposure = this.state.lighting.exposure;
    this.appliedSize = { width: 0, height: 0 };
    if (!this.ready) { this.ready = true; this.onReady(); }
    this.resize(this.lastSize.width, this.lastSize.height);
  };
  private handleTime = (time: number): void => { this.currentTime = time; this.onTime(time); };
  private canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("PNG 데이터 생성에 실패했습니다.")); return; }
      resolve(blob);
    }, "image/png"));
  }
  private blobDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("이미지 데이터를 읽을 수 없습니다."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }
  private frames(count: number, shouldCancel?: () => boolean): Promise<void> { return new Promise((resolve, reject) => { let remaining = count; const next = () => { if (shouldCancel?.()) { reject(new DOMException("사용자가 동영상 렌더링을 취소했습니다.", "AbortError")); return; } this.runtime?.invalidate(); remaining -= 1; if (remaining <= 0) resolve(); else requestAnimationFrame(next); }; requestAnimationFrame(next); }); }
}
