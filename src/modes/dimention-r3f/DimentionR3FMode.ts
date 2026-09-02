import type { ArtboardState } from "../../artboard/ArtboardState";
import { canEncodeVideo, CanvasSource, Mp4OutputFormat, Output, Quality } from "mediabunny";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState } from "../../studio/ModeTypes";
import { injectPngPpiBlob } from "../light-field/PngMetadata";
import { DimentionR3FExportAdapter } from "./DimentionR3FExportAdapter";
import { DimentionR3FCameraPanel } from "./DimentionR3FCameraPanel";
import { DimentionR3FPanel } from "./DimentionR3FPanel";
import { DimentionR3FRenderer } from "./DimentionR3FRenderer";
import { cloneDimentionR3FState, createDimentionR3FState, sanitizeDimentionR3FState, type DimentionR3FPresetId, type DimentionR3FState } from "./DimentionR3FState";
import { createVideoSink, formatBytes, resolveVideoDimensions } from "./DimentionR3FExportPipeline";

interface DimentionVideoExportOptions {
  download?: boolean;
  duration?: number;
  fps?: 24 | 30 | 60;
  width?: number;
  height?: number;
}

export class DimentionR3FMode implements StudioModeInstance {
  readonly id = "dimention-r3f";
  readonly exportAdapter = new DimentionR3FExportAdapter(() => this);
  private state = createDimentionR3FState();
  private renderer: DimentionR3FRenderer | null = null;
  private panel: DimentionR3FPanel | null = null;
  private cameraPanel: DimentionR3FCameraPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private artboardShell: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private videoJob: { cancelled: boolean } | null = null;

  constructor(private readonly context: StudioModeContext) {}
  mount(): void {
    this.context.root.innerHTML = this.template();
    this.artboardShell = this.require<HTMLElement>(".dimention-r3f-artboard"); this.stage = this.require<HTMLElement>(".dimention-r3f-stage"); this.status = this.require<HTMLElement>("[data-r3f-status]");
    this.renderer = new DimentionR3FRenderer(this.stage, this.state, () => { if (this.status) this.status.hidden = true; this.resize(); }, (message) => this.showError(message), (time) => { this.state.motion.time = time; this.syncTransport(); }, (yaw, pitch, zoom) => this.commitCameraOrbit(yaw, pitch, zoom));
    this.mountPanel(); this.mountCameraPanel(); this.bindTransport(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.context.root); this.applyCameraPanelState(); this.resize();
  }
  unmount(): void { if (this.videoJob) this.videoJob.cancelled = true; this.state.motion.playing = false; this.renderer?.setState(this.state); }
  resize(): void {
    if (!this.renderer || !this.stage || !this.artboardShell) return;
    const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard"); if (!pasteboard) return;
    const availableWidth = Math.max(120, pasteboard.clientWidth - 56); const availableHeight = Math.max(120, pasteboard.clientHeight - 56); const aspect = this.state.artboard.width / this.state.artboard.height;
    let width = availableWidth; let height = width / aspect; if (height > availableHeight) { height = availableHeight; width = height * aspect; }
    width *= this.state.artboard.previewZoom; height *= this.state.artboard.previewZoom;
    this.artboardShell.style.width = `${width}px`; this.artboardShell.style.height = `${height}px`; this.artboardShell.classList.toggle("transparent", this.state.artboard.transparent); this.artboardShell.style.background = this.state.artboard.background; this.renderer.resize(width, height);
    const meta = this.context.root.querySelector<HTMLElement>("[data-r3f-meta-size]"); if (meta) meta.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }
  getState(): DimentionR3FState { return cloneDimentionR3FState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.renderPreview(); }
  applyVariation(id: string): void { const preset = id.replace("dimention-r3f-", "") as DimentionR3FPresetId; if (preset === "clear-studio" || preset === "pleos-prism" || preset === "dark-glass") this.applyPreset(preset); }
  focusExport(): void { this.panel?.focusExport(); }
  inspect(): object {
    const video = resolveVideoDimensions(this.state.artboard.width, this.state.artboard.height, this.state.export.videoResolution, this.state.export.videoWidth, this.state.export.videoHeight);
    return { ...(this.renderer?.inspect() ?? { ready: false }), projection: "orthographic isometric with optional free orbit", camera: { type: "OrthographicCamera", position: [this.state.camera.panX, this.state.camera.panY, -12], pan: [this.state.camera.panX, this.state.camera.panY], freeOrbit: this.state.camera.freeOrbit, orbit: [this.state.camera.orbitYaw, this.state.camera.orbitPitch], zoom: this.state.camera.orbitZoom, panelCollapsed: this.state.camera.panelCollapsed }, axis: { family: "30deg", sharedOrigin: this.state.geometry.gap === 0, source: "CrystalAssembly" }, preset: this.state.preset, material: { ...this.state.material }, mirror: { ...this.state.mirror }, lighting: { ...this.state.lighting }, geometry: { ...this.state.geometry }, artboard: { ...this.state.artboard }, export: { rasterPng: true, transparentPng: true, rasterMp4: true, video4k: true, videoFps: this.state.export.videoFps, videoResolution: this.state.export.videoResolution, videoDimensions: [video.width, video.height], videoBitrateMbps: this.state.export.videoBitrateMbps, streaming: "OPFS with memory fallback", ppi: this.state.export.ppi }, state: this.getState() };
  }
  command(name: string, payload?: unknown): unknown {
    if (name === "play") { this.state.motion.playing = true; this.changed(); return; }
    if (name === "pause") { this.state.motion.playing = false; this.changed(); return; }
    if (name === "seek") { this.state.motion.time = ((Number(payload ?? 0) % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration; this.changed(); return; }
    if (name === "resetMotion") { this.state.motion.time = 0; this.changed(); return; }
    if (name === "getMotionState") return { ...this.state.motion, fps: 60 };
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(payload as Partial<ArtboardState>)?.axisAnchor } }; this.changed(); return; }
    if (name === "setPreset") { this.applyPreset(payload as DimentionR3FPresetId); return; }
    if (name === "exportFrame") { const value = payload as { frame?: number; fps?: number; download?: boolean } | undefined; this.state.motion.time = (value?.frame ?? 0) / (value?.fps ?? 30); this.state.motion.playing = false; this.renderer?.setState(this.state); return this.exportStill("custom", value?.download ?? false); }
    if (name === "exportVideo") { const options = payload as DimentionVideoExportOptions | undefined; return this.exportVideo(options?.download ?? true, options); }
    if (name === "cancelVideo") { this.cancelVideo(); return; }
    return undefined;
  }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void { if (!shared.artboard) return; this.state.artboard = { ...this.state.artboard, ...(shared.artboard as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(shared.artboard as Partial<ArtboardState>).axisAnchor } }; this.changed(); }
  serialize(): DimentionR3FState { return this.getState(); }
  restore(state: unknown): void { this.state = sanitizeDimentionR3FState(state); this.renderer?.setState(this.state); this.mountPanel(); this.mountCameraPanel(); this.applyCameraPanelState(); this.resize(); }
  dispose(): void { if (this.videoJob) this.videoJob.cancelled = true; this.resizeObserver?.disconnect(); this.renderer?.dispose(); this.renderer = null; this.panel = null; this.cameraPanel = null; this.context.root.replaceChildren(); }
  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> {
    if (!this.renderer?.isReady()) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    const scale = quality === "print" ? this.state.export.ppi / 72 : 1; const width = Math.round(this.state.artboard.width * scale); const height = Math.round(this.state.artboard.height * scale);
    const blob = await injectPngPpiBlob(await this.renderer.exportPngBlob(width, height), this.state.export.ppi);
    if (download) {
      const url = this.downloadBlob(blob, `pleos-dimention-r3f-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`);
      return url;
    }
    return this.blobDataUrl(blob);
  }
  async exportVideo(download = true, options?: DimentionVideoExportOptions): Promise<string> {
    const renderer = this.renderer;
    if (!renderer?.isReady()) throw new Error("Dimention R3F 렌더러를 초기화하는 중입니다.");
    if (this.videoJob) throw new Error("이미 동영상을 렌더링하고 있습니다.");
    if (!("VideoEncoder" in window)) throw new Error("이 브라우저는 4K MP4 인코딩을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.");

    const fps = options?.fps ?? this.state.export.videoFps;
    const duration = Math.max(1 / fps, options?.duration ?? this.state.motion.duration);
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const requested = options?.width && options?.height
      ? { width: Math.max(2, Math.round(options.width / 2) * 2), height: Math.max(2, Math.round(options.height / 2) * 2), label: `검증 출력 ${options.width}×${options.height}` }
      : resolveVideoDimensions(this.state.artboard.width, this.state.artboard.height, this.state.export.videoResolution, this.state.export.videoWidth, this.state.export.videoHeight);
    const { width, height, label: resolutionLabel } = requested;
    const maximum = renderer.maximumTextureSize();
    if (width > maximum || height > maximum) throw new Error(`출력 크기 ${width}×${height}px가 GPU 한계 ${maximum}px를 초과합니다.`);

    const encodingCanvas = document.createElement("canvas");
    encodingCanvas.width = width; encodingCanvas.height = height;
    const context = encodingCanvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("동영상 프레임 캔버스를 만들 수 없습니다.");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    const bitrate = Math.round(this.state.export.videoBitrateMbps * 1_000_000 * (fps === 60 ? 1.25 : 1));
    const quality = new Quality({ bitrate, bitrateMode: "constant" });
    if (!await canEncodeVideo("avc", { width, height, quality, hardwareAcceleration: "no-preference" })) throw new Error(`이 브라우저의 H.264 인코더가 ${width}×${height}px 출력을 지원하지 않습니다. Chrome 하드웨어 가속을 켜거나 해상도를 낮춰 주세요.`);
    const sink = await createVideoSink();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: sink.storage === "memory" ? "in-memory" : false }), target: sink.target });
    const source = new CanvasSource(encodingCanvas, { codec: "avc", quality, keyFrameInterval: 2, latencyMode: "quality", hardwareAcceleration: "no-preference" });
    output.addVideoTrack(source, { frameRate: fps });

    const originalTime = this.state.motion.time;
    const originalPlaying = this.state.motion.playing;
    this.state.motion.playing = false;
    this.videoJob = { cancelled: false };
    const startedAt = performance.now();
    this.panel?.setVideoProgress(`${resolutionLabel} · ${sink.storage === "opfs" ? "디스크 스트리밍" : "메모리 출력"} 준비`, 0, true);
    try {
      await output.start();
      renderer.beginVideoCapture(width, height);
      for (let frame = 0; frame < totalFrames; frame += 1) {
        if (this.videoJob.cancelled) throw new DOMException("사용자가 동영상 렌더링을 취소했습니다.", "AbortError");
        this.state.motion.time = frame / fps;
        renderer.setState(this.state);
        context.fillStyle = this.state.artboard.transparent ? "#000000" : this.state.artboard.background;
        context.fillRect(0, 0, width, height);
        await renderer.captureVideoFrame(context, 0, 0, width, height, () => Boolean(this.videoJob?.cancelled));
        await source.add(frame / fps, 1 / fps);
        const completed = frame + 1;
        const elapsed = Math.max(.001, (performance.now() - startedAt) / 1000);
        const remaining = Math.max(0, elapsed / completed * (totalFrames - completed));
        this.panel?.setVideoProgress(`렌더링 ${completed}/${totalFrames} · 약 ${this.formatDuration(remaining)} 남음`, completed / totalFrames, true);
      }
      this.panel?.setVideoProgress("MP4 파일을 마무리하는 중…", 1, true);
      await output.finalize();
      const result = await sink.complete();
      const filename = `pleos-dimention-r3f-${this.state.preset}-${duration.toFixed(1)}s-${fps}fps-${width}x${height}.mp4`;
      const url = download ? this.downloadBlob(result.blob, filename) : URL.createObjectURL(result.blob);
      if (!download) window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
      this.panel?.setVideoProgress(`완료 · ${width}×${height}px · ${formatBytes(result.size)}`, 1, false);
      return url;
    } catch (error) {
      if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
      await sink.cancel();
      if (error instanceof DOMException && error.name === "AbortError") { this.panel?.setVideoProgress("동영상 렌더링을 취소했습니다.", 0, false); return ""; }
      this.panel?.setVideoProgress("동영상 내보내기 실패", 0, false);
      throw error;
    } finally {
      renderer.endVideoCapture();
      this.videoJob = null;
      this.state.motion.time = originalTime;
      this.state.motion.playing = originalPlaying;
      renderer.setState(this.state);
      this.resize();
      this.syncTransport();
    }
  }
  cancelVideo(): void { if (this.videoJob) this.videoJob.cancelled = true; }
  private mountPanel(): void {
    const host = this.context.root.querySelector<HTMLElement>("[data-r3f-panel-host]"); if (!host) return;
    this.panel = new DimentionR3FPanel(host, this.state, { change: () => this.changed(), preset: (id) => this.applyPreset(id), reset: () => this.applyPreset("pleos-prism"), export: async () => {
      this.panel?.setImageProgress("무손실 PNG 광학 패스를 렌더링하는 중…", true);
      try { await this.exportStill("custom", true); this.panel?.setImageProgress("저장 완료 · 다운로드 폴더를 확인하세요.", false); }
      catch (error) { const message = error instanceof Error ? error.message : String(error); this.panel?.setImageProgress(`저장 실패 · ${message}`, false); this.showError(message); }
    }, exportVideo: () => { void this.exportVideo(true).catch((error) => this.showError(error instanceof Error ? error.message : String(error))); }, cancelVideo: () => this.cancelVideo() });
  }
  private mountCameraPanel(): void {
    const host = this.context.root.querySelector<HTMLElement>("[data-r3f-camera-panel-host]"); if (!host) return;
    this.cameraPanel = new DimentionR3FCameraPanel(host, this.state, {
      change: () => this.changed(),
      center: () => { this.state.camera.panX = 0; this.state.camera.panY = 0; this.changed(); },
      reset: () => { this.state.camera.panX = 0; this.state.camera.panY = 0; this.state.camera.freeOrbit = false; this.state.camera.orbitYaw = 0; this.state.camera.orbitPitch = 0; this.state.camera.orbitZoom = 1; this.state.artboard.previewZoom = 1; this.state.artboard.axisAnchor = { gridX: .5, gridY: .5 }; this.changed(); },
      collapse: (collapsed) => { this.state.camera.panelCollapsed = collapsed; this.applyCameraPanelState(); this.context.notifyStateChange(); this.resize(); },
    });
  }
  private applyPreset(id: DimentionR3FPresetId): void { const artboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } }; this.state = createDimentionR3FState(id); this.state.artboard = { ...this.state.artboard, ...artboard, axisAnchor: { ...artboard.axisAnchor } }; this.renderer?.setState(this.state); this.mountPanel(); this.resize(); this.context.notifyStateChange(); }
  private changed(): void { this.renderer?.setState(this.state); this.panel?.sync(); this.cameraPanel?.sync(); this.resize(); this.context.notifyStateChange(); }
  private commitCameraOrbit(yaw: number, pitch: number, zoom: number): void { this.state.camera.orbitYaw = Math.round(Math.max(-180, Math.min(180, yaw)) * 10) / 10; this.state.camera.orbitPitch = Math.round(Math.max(-80, Math.min(80, pitch)) * 10) / 10; this.state.camera.orbitZoom = Math.round(Math.max(.25, Math.min(4, zoom)) * 100) / 100; this.cameraPanel?.sync(); this.context.notifyStateChange(); }
  private applyCameraPanelState(): void { this.context.root.querySelector<HTMLElement>(".dimention-r3f-app")?.classList.toggle("dimention-camera-collapsed", this.state.camera.panelCollapsed); }
  private bindTransport(): void {
    this.context.root.querySelector("[data-r3f-play]")?.addEventListener("click", () => this.command("play")); this.context.root.querySelector("[data-r3f-pause]")?.addEventListener("click", () => this.command("pause"));
    this.context.root.querySelector<HTMLInputElement>("[data-r3f-timeline]")?.addEventListener("input", (event) => this.command("seek", Number((event.currentTarget as HTMLInputElement).value)));
  }
  private syncTransport(): void { const timeline = this.context.root.querySelector<HTMLInputElement>("[data-r3f-timeline]"); if (timeline) { timeline.max = String(this.state.motion.duration); timeline.value = String(this.state.motion.time); } const time = this.context.root.querySelector<HTMLElement>("[data-r3f-time]"); if (time) time.textContent = `${this.state.motion.time.toFixed(2)} / ${this.state.motion.duration.toFixed(1)}s`; }
  private showError(message: string): void { if (this.status) { this.status.hidden = false; this.status.textContent = message; } console.error(message); }
  private download(data: string, filename: string): void { const link = document.createElement("a"); link.href = data; link.download = filename; link.rel = "noopener"; link.style.display = "none"; document.body.append(link); link.click(); link.remove(); }
  private downloadBlob(blob: Blob, filename: string): string { const url = URL.createObjectURL(blob); this.download(url, filename); window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000); return url; }
  private blobDataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("내보내기 데이터를 읽을 수 없습니다.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); }); }
  private formatDuration(seconds: number): string { if (!Number.isFinite(seconds)) return "계산 중"; const rounded = Math.max(0, Math.round(seconds)); return rounded < 60 ? `${rounded}초` : `${Math.floor(rounded / 60)}분 ${rounded % 60}초`; }
  private require<T extends Element>(selector: string): T { const element = this.context.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Dimention R3F element: ${selector}`); return element; }
  private template(): string { return `<section class="light-field-app motion-studio dimention-r3f-app"><main class="pasteboard"><div class="artboard-meta"><span>REALTIME OPTICAL GLASS</span><b data-r3f-meta-size>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard dimention-r3f-artboard"><div class="dimention-r3f-stage"></div></div></main><div data-r3f-camera-panel-host></div><div data-r3f-panel-host></div><div class="field-error" data-r3f-status role="status" aria-live="polite">R3F 광학 렌더러를 준비하는 중…</div><footer class="motion-transport"><div class="transport-buttons"><button data-r3f-play aria-label="재생">▶</button><button data-r3f-pause aria-label="일시 정지">Ⅱ</button></div><time data-r3f-time>0.00 / ${this.state.motion.duration.toFixed(1)}s</time><input type="range" data-r3f-timeline min="0" max="${this.state.motion.duration}" step="0.001" aria-label="Dimention R3F 타임라인"><span>REALTIME · 60 FPS TARGET</span></footer></section>`; }
}

export const DIMENTION_R3F_MODE: StudioModeDefinition = {
  id: "dimention-r3f", label: "Dimention R3F", description: "PLEOS Axis optical glass rendered with realtime React Three Fiber",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: true, print: true },
  ownsVariation: (id) => id.startsWith("dimention-r3f-"), create: (context) => new DimentionR3FMode(context),
};
