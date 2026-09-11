import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { planDimentionCapture } from "./DimentionCapturePlan";
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
  private videoSupersampling = 1;
  private captureQuality: DimentionCaptureQuality = "preview";
  private lastCapture: ReturnType<typeof planDimentionCapture> | null = null;

  constructor(private readonly stage: HTMLElement, initialState: DimentionR3FState, private readonly onReady: () => void, private readonly onError: (message: string) => void, private readonly onTime: (time: number) => void, private readonly onCameraOrbit: (yaw: number, pitch: number, zoom: number) => void) {
    this.state = cloneDimentionR3FState(initialState);
    this.currentTime = initialState.motion.time;
    this.root = createRoot(stage);
    this.renderReact();
  }
  isReady(): boolean { return this.ready && Boolean(this.runtime); }
  setState(state: DimentionR3FState): void { this.state = cloneDimentionR3FState(state); this.currentTime = state.motion.time; if (this.runtime) this.runtime.gl.toneMappingExposure = state.lighting.exposure; this.renderReact(); }
  resize(width: number, height: number): void {
    this.lastSize = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    if (!this.runtime || this.captureQuality !== "preview" || (this.appliedSize.width === this.lastSize.width && this.appliedSize.height === this.lastSize.height)) return;
    this.appliedSize = { ...this.lastSize };
    this.runtime.setSize(this.lastSize.width, this.lastSize.height);
  }
  renderPreview(): void { this.runtime?.invalidate(); }
  maximumTextureSize(): number { return this.runtime?.gl.capabilities.maxTextureSize ?? 0; }
  captureInfo(): object | null { return this.lastCapture; }
  inspect(): object {
    const gl = this.runtime?.gl;
    const dimensionUniforms: Array<{ cube: string; layers: number }> = [];
    this.runtime?.scene.traverse(object => {
      if (!object.name.startsWith("RecursiveGlassReflection-")) return;
      const material = (object as unknown as { material: { uniforms: { uBounces: { value: number } } } }).material;
      dimensionUniforms.push({ cube: object.name, layers: material.uniforms.uBounces.value });
    });
    return { dimensionUniforms, lastCapture: this.lastCapture, dimensions: [...this.state.mirror.cubeBounces], ready: this.isReady(), renderer: "React Three Fiber realtime transmission + recursive FBO glass reflection + Lightformer + N8AO", pipeline: "Three.js WebGL raster", materialPipeline: "deterministic MeshPhysicalMaterial transmission + dispersion", recursionCapture: "ping-pong half-float FBO", opticalTransport: "finite RGB softbox ray intersections + Fresnel + secondary IOR path approximation, captured into recursive FBO", antialiasing: { preview: `${this.state.quality.multisampling}x MSAA + final SMAA`, video: `native pixels + budgeted supersampling (up to ${this.state.export.videoSupersampling}x) + up to 2x MSAA + final SMAA + mipmapped reflections + analytic dimension-edge AA` }, lightingRig: "white key + animated Pleos RGB spotlights + studio Lightformers", rgbEnergyMode: "simultaneous-balanced-rgb", pathTracing: false, solids: 3, sharedOrigin: this.state.geometry.gap === 0, canvasCount: this.stage.querySelectorAll("canvas").length, motion: { enabled: this.state.motion.enabled, playing: this.state.motion.playing, time: this.currentTime, duration: this.state.motion.duration, fps: 60, cubeRotationTurns: this.state.motion.cubeRotationTurns, cubeRotationDegrees: -(this.currentTime / Math.max(.001, this.state.motion.duration)) * this.state.motion.cubeRotationTurns * 360, cubeRotationDirection: "clockwise-y" }, gpu: gl ? { maximumTextureSize: gl.capabilities.maxTextureSize, logarithmicDepthBuffer: gl.capabilities.logarithmicDepthBuffer } : null };
  }
  async exportPng(width: number, height: number): Promise<string> {
    return this.blobDataUrl(await this.exportPngBlob(width, height));
  }
  async exportPngBlob(width: number, height: number): Promise<Blob> {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    if (this.captureQuality !== "preview") throw new Error("다른 내보내기가 진행 중입니다. 완료 후 다시 시도하세요.");
    const plan = planDimentionCapture(width, height, this.state.export.videoSupersampling, runtime.gl.capabilities.maxTextureSize);
    this.lastCapture = plan;
    const previousDpr = runtime.gl.getPixelRatio();
    const wasPlaying = this.state.motion.playing;
    const previousTime = this.currentTime;
    try {
      // A still must use one deterministic motion frame. Otherwise a large
      // tiled print export can advance while tiles are being rendered.
      this.state.motion.playing = false;
      this.state.motion.time = this.currentTime;
      this.captureQuality = "still";
      runtime.setDpr(plan.scale); runtime.setSize(width, height);
      flushSync(() => this.renderReact());
      const output = document.createElement("canvas"); output.width = width; output.height = height;
      const context = output.getContext("2d", { alpha: true });
      if (!context) throw new Error("고품질 PNG 캔버스를 만들 수 없습니다.");
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);

      await this.frames(Math.max(6, Math.round(this.state.quality.samples)));
      context.drawImage(runtime.gl.domElement, 0, 0, runtime.gl.domElement.width, runtime.gl.domElement.height, 0, 0, width, height);
      return await this.canvasPngBlob(output);
    } finally {
      this.state.motion.playing = wasPlaying;
      this.state.motion.time = previousTime;
      this.captureQuality = "preview"; this.renderReact();
      runtime.setDpr(previousDpr); runtime.setSize(this.lastSize.width, this.lastSize.height); this.appliedSize = { ...this.lastSize }; runtime.invalidate();
      await this.frames(3);
    }
  }
  beginVideoCapture(width: number, height: number, requestedSupersampling: number): number {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    if (this.captureQuality !== "preview") throw new Error("다른 내보내기가 진행 중입니다.");
    const plan = planDimentionCapture(width, height, requestedSupersampling, runtime.gl.capabilities.maxTextureSize);
    this.lastCapture = plan;
    this.captureDpr = runtime.gl.getPixelRatio();
    this.videoSupersampling = plan.scale;
    this.captureQuality = "video";
    runtime.setDpr(this.videoSupersampling);
    runtime.setSize(width, height);
    // Apply the capture DPR and logical size before switching the React scene
    // so resolution-dependent post-process and recursive targets are allocated
    // at their final dimensions on the first captured frame.
    flushSync(() => this.renderReact());
    this.appliedSize = { width, height };
    runtime.invalidate();
    return this.videoSupersampling;
  }
  async captureVideoFrame(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, shouldCancel?: () => boolean): Promise<void> {
    const runtime = this.runtime;
    if (!runtime || this.captureDpr === null) throw new Error("동영상 캡처 세션이 시작되지 않았습니다.");
    await this.frames(Math.max(6, Math.round(this.state.quality.samples)), shouldCancel);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(runtime.gl.domElement, 0, 0, runtime.gl.domElement.width, runtime.gl.domElement.height, x, y, width, height);
  }
  endVideoCapture(): void {
    const runtime = this.runtime;
    if (!runtime || this.captureDpr === null) return;
    runtime.setDpr(this.captureDpr);
    this.captureDpr = null;
    this.videoSupersampling = 1;
    this.captureQuality = "preview";
    this.renderReact();
    runtime.setSize(this.lastSize.width, this.lastSize.height);
    this.appliedSize = { ...this.lastSize };
    runtime.invalidate();
  }
  dispose(): void { this.endVideoCapture(); this.root.unmount(); this.runtime = null; this.ready = false; }
  private renderReact(): void {
    try { this.root.render(<DimentionR3FScene state={this.state} captureQuality={this.captureQuality} capturePlan={this.captureQuality === "preview" ? null : this.lastCapture} onRuntime={this.handleRuntime} onTime={this.handleTime} onCameraOrbit={this.onCameraOrbit} />); }
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
  private frames(count: number, shouldCancel?: () => boolean): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) return Promise.reject(new Error("렌더러가 종료되었습니다."));
    let target = runtime.completedFrames() + count;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const next = () => {
        if (shouldCancel?.()) return reject(new DOMException("사용자가 동영상 렌더링을 취소했습니다.", "AbortError"));
        if (this.runtime !== runtime || runtime.gl.getContext().isContextLost()) return reject(new Error("GPU 렌더링 연결이 끊겼습니다. 출력 해상도 또는 슈퍼샘플링을 낮춰 다시 시도하세요."));
        if (performance.now() - started > 120_000) return reject(new Error("프레임 렌더링 시간이 초과되었습니다. 출력 크기를 낮춰 주세요."));
        const plan = this.captureQuality === "preview" ? null : this.lastCapture;
        const sizeReady = !plan || (runtime.gl.domElement.width >= plan.renderWidth && runtime.gl.domElement.height >= plan.renderHeight);
        if (!sizeReady) target = runtime.completedFrames() + count;
        if (sizeReady && runtime.completedFrames() >= target) return resolve();
        runtime.invalidate(); requestAnimationFrame(next);
      };
      requestAnimationFrame(next);
    });
  }
}
