import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { injectPngPpi } from "../light-field/PngMetadata";
import { AxisHabitatExportAdapter } from "./AxisHabitatExportAdapter";
import { AxisHabitatPanel } from "./AxisHabitatPanel";
import { AxisHabitatRenderer } from "./AxisHabitatRenderer";
import { cloneAxisHabitatState, createAxisHabitatState, sanitizeAxisHabitatState, type AxisHabitatPresetId, type AxisHabitatState } from "./AxisHabitatState";

const BUILTINS: StudioVariationSummary[] = [
  { id: "habitat-frosted-formation", label: "01  Frosted Formation", builtin: true, modeId: "axis-habitat" },
  { id: "habitat-obsidian-signal", label: "02  Obsidian Signal", builtin: true, modeId: "axis-habitat" },
  { id: "habitat-blue-archive", label: "03  Blue Archive", builtin: true, modeId: "axis-habitat" },
];

export class AxisHabitatMode implements StudioModeInstance {
  readonly id = "axis-habitat";
  readonly exportAdapter = new AxisHabitatExportAdapter(() => this);
  private state = createAxisHabitatState();
  private renderer: AxisHabitatRenderer | null = null;
  private panel: AxisHabitatPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private artboard: HTMLElement | null = null;
  private raf = 0;
  private disposed = false;
  private playing = true;
  private startedAt = performance.now();
  private previousFrame = performance.now();
  private metricFrame = 0;
  private lastRenderedTime = 0;

  constructor(private readonly context: StudioModeContext) {}

  mount(): void {
    this.context.root.innerHTML = this.template();
    this.artboard = this.require<HTMLElement>(".axis-habitat-artboard");
    const stage = this.require<HTMLElement>(".axis-habitat-stage");
    this.renderer = new AxisHabitatRenderer(this.state);
    stage.append(this.renderer.canvas);
    this.mountPanel();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.context.root);
    this.resize();
    this.raf = requestAnimationFrame(this.render);
  }

  unmount(): void { this.playing = false; this.resizeObserver?.disconnect(); }

  resize(): void {
    if (!this.renderer || !this.artboard) return;
    const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard");
    if (!pasteboard) return;
    const availableWidth = Math.max(120, pasteboard.clientWidth - 56);
    const availableHeight = Math.max(120, pasteboard.clientHeight - 56);
    const aspect = this.state.artboard.width / this.state.artboard.height;
    let width = availableWidth;
    let height = width / aspect;
    if (height > availableHeight) { height = availableHeight; width = height * aspect; }
    width *= this.state.artboard.previewZoom;
    height *= this.state.artboard.previewZoom;
    this.artboard.style.width = `${width}px`;
    this.artboard.style.height = `${height}px`;
    this.renderer.resize(width, height);
    const dimensions = this.context.root.querySelector<HTMLElement>("[data-habitat-dimensions]");
    if (dimensions) dimensions.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }

  getState(): AxisHabitatState { return cloneAxisHabitatState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.render(this.currentSeconds(), 1 / 60); }
  listVariations(): StudioVariationSummary[] { return BUILTINS.map((item) => ({ ...item })); }
  applyVariation(id: string): void { this.applyPreset(id.replace("habitat-", "") as AxisHabitatPresetId); }
  focusExport(): void { this.panel?.focusExport(); }
  serialize(): AxisHabitatState { return this.getState(); }
  restore(state: unknown): void { this.state = sanitizeAxisHabitatState(state); this.renderer?.setState(this.state); this.mountPanel(); this.resize(); }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, transparent: false, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void {
    if (!shared.artboard) return;
    this.state.artboard = { ...this.state.artboard, ...(shared.artboard as Partial<ArtboardState>), transparent: false, axisAnchor: { ...this.state.artboard.axisAnchor, ...(shared.artboard as Partial<ArtboardState>).axisAnchor } };
    this.changed();
  }
  inspect(): object {
    return {
      ...(this.renderer?.inspect() ?? { ready: false }),
      preset: this.state.preset,
      motion: { time: this.currentSeconds(), duration: this.state.motion.duration, speed: this.state.motion.speed, playing: this.playing && this.state.motion.enabled, fps: 60, order: this.state.motion.order, ease: this.state.motion.ease, timing: { ...this.state.motion.timing }, dynamics: { ...this.state.motion.dynamics } },
      artboard: { ...this.state.artboard },
      export: { rasterPng: true, transparentPng: false, ppi: this.state.export.ppi },
    };
  }

  command(name: string, payload?: unknown): unknown {
    if (name === "play") { this.playing = true; this.state.motion.enabled = true; this.startedAt = performance.now() - this.state.motion.time / Math.max(.01, this.state.motion.speed) * 1000; this.panel?.sync(); return; }
    if (name === "pause") { this.state.motion.time = this.currentSeconds(); this.playing = false; this.panel?.sync(); return; }
    if (name === "seek") { this.state.motion.time = Number(payload ?? 0); this.lastRenderedTime = this.state.motion.time; this.startedAt = performance.now() - this.state.motion.time / Math.max(.01, this.state.motion.speed) * 1000; this.renderer?.render(this.state.motion.time, 1 / 60); return; }
    if (name === "getMotionState") return { time: this.currentSeconds(), duration: this.state.motion.duration, fps: 60, playing: this.playing && this.state.motion.enabled };
    if (name === "setPreset") { this.applyPreset(payload as AxisHabitatPresetId); return; }
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>), transparent: false, axisAnchor: { ...this.state.artboard.axisAnchor, ...(payload as Partial<ArtboardState>)?.axisAnchor } }; this.changed(); return; }
    if (name === "exportFrame") { const options = payload as { frame?: number; fps?: number; download?: boolean } | undefined; const time = Number(options?.frame ?? 0) / Math.max(1, Number(options?.fps ?? 30)); return this.exportAtTime("custom", options?.download ?? false, time); }
    return undefined;
  }

  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> { return this.exportAtTime(quality, download, this.currentSeconds()); }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.panel?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.panel = null;
    this.context.root.replaceChildren();
  }

  private async exportAtTime(quality: StudioExportQuality, download: boolean, time: number): Promise<string> {
    if (!this.renderer) throw new Error("Formation Loop 렌더러가 준비되지 않았습니다.");
    const scale = quality === "print" ? this.state.export.ppi / 72 : 1;
    const width = Math.round(this.state.artboard.width * scale);
    const height = Math.round(this.state.artboard.height * scale);
    const data = injectPngPpi(await this.renderer.exportPng(width, height, time), this.state.export.ppi);
    if (download) {
      const link = document.createElement("a");
      link.href = data;
      link.download = `pleos-axis-formation-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`;
      link.click();
    }
    return data;
  }

  private mountPanel(): void {
    const host = this.context.root.querySelector<HTMLElement>("[data-habitat-panel-host]");
    if (!host) return;
    this.panel?.dispose();
    this.panel = new AxisHabitatPanel(host, this.state, {
      change: (path) => this.changed(path),
      preset: (id) => this.applyPreset(id),
      reset: () => this.applyPreset(this.state.preset),
      resetMotion: () => this.resetMotion(),
      export: async () => { await this.exportStill("custom", true).catch((error) => this.showError(error instanceof Error ? error.message : String(error))); },
    });
  }

  private applyPreset(id: AxisHabitatPresetId): void {
    const artboard = { ...this.state.artboard, transparent: false, axisAnchor: { ...this.state.artboard.axisAnchor } };
    this.state = createAxisHabitatState(id);
    this.state.artboard = artboard;
    this.lastRenderedTime = 0;
    this.startedAt = performance.now();
    this.renderer?.setState(this.state);
    this.mountPanel();
    this.resize();
    this.context.notifyStateChange();
    this.context.requestUiRefresh();
  }

  private resetMotion(): void {
    const presetMotion = createAxisHabitatState(this.state.preset).motion;
    this.state.motion = { ...presetMotion, timing: { ...presetMotion.timing }, dynamics: { ...presetMotion.dynamics }, time: this.lastRenderedTime };
    this.changed("motion.reset");
    this.panel?.sync();
  }

  private changed(path = ""): void {
    if (path.startsWith("motion.")) {
      this.state.motion.time = ((this.lastRenderedTime % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration;
      if (this.playing && this.state.motion.enabled) this.startedAt = performance.now() - this.state.motion.time / Math.max(.01, this.state.motion.speed) * 1000;
    }
    this.renderer?.setState(this.state);
    this.resize();
    this.context.notifyStateChange();
  }

  private render = (now: number): void => {
    if (this.disposed) return;
    const delta = Math.min(.1, Math.max(0, (now - this.previousFrame) / 1000));
    this.previousFrame = now;
    if (!document.hidden) {
      this.lastRenderedTime = this.currentSeconds();
      this.renderer?.render(this.lastRenderedTime, delta);
    }
    this.metricFrame += 1;
    if (this.metricFrame % 24 === 0) this.syncMetrics();
    this.raf = requestAnimationFrame(this.render);
  };

  private currentSeconds(): number {
    if (!this.playing || !this.state.motion.enabled) return this.state.motion.time;
    return ((performance.now() - this.startedAt) / 1000 * this.state.motion.speed) % this.state.motion.duration;
  }

  private syncMetrics(): void {
    const inspection = this.renderer?.inspect() as { formation?: { stage?: string; fragments?: number }; performance?: { fps?: number; dpr?: number; drawCalls?: number; quality?: string } } | undefined;
    const metrics = inspection?.performance;
    if (!metrics) return;
    this.panel?.sync({ ...metrics, stage: inspection?.formation?.stage, fragments: inspection?.formation?.fragments });
    const overlay = this.context.root.querySelector<HTMLElement>("[data-habitat-metric]");
    if (overlay) overlay.textContent = `${inspection?.formation?.stage ?? "READY"} / ${Math.round(metrics.fps ?? 0)} FPS / ${metrics.drawCalls ?? 0} CALLS`;
  }

  private showError(message: string): void {
    const status = this.context.root.querySelector<HTMLElement>("[data-habitat-status]");
    if (status) { status.hidden = false; status.textContent = message; }
    console.error(message);
  }

  private require<T extends Element>(selector: string): T {
    const element = this.context.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Formation Loop element: ${selector}`);
    return element;
  }

  private template(): string {
    return `<section class="light-field-app axis-habitat-app motion-studio"><main class="pasteboard"><div class="artboard-meta"><span>FORMATION LOOP</span><b data-habitat-dimensions>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard axis-habitat-artboard"><div class="axis-habitat-stage"></div><div class="axis-habitat-overlay" aria-hidden="true"><div><strong>PLEOS / FORMATION 01</strong><span>WIRE · MATTER · FRAGMENT · RETURN</span></div><small data-habitat-metric>INITIALIZING / WEBGL2</small></div><p class="axis-habitat-hint">POINTER: BVH FOCUS · ARROWS: PARALLAX</p></div></main><div data-habitat-panel-host></div><div class="field-error" data-habitat-status role="status" aria-live="polite" hidden></div></section>`;
  }
}

export const AXIS_HABITAT_MODE: StudioModeDefinition = {
  id: "axis-habitat",
  label: "Formation Loop",
  description: "PLEOS solids drawn as wire, assembled from instanced fragments, materialized, disassembled and returned in a GSAP-controlled WebGL2 loop",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: false, print: true },
  ownsVariation: (id) => id.startsWith("habitat-"),
  create: (context) => new AxisHabitatMode(context),
};
