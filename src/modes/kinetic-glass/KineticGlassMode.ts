import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { injectPngPpi } from "../light-field/PngMetadata";
import { KineticGlassExportAdapter } from "./KineticGlassExportAdapter";
import { KineticGlassPanel } from "./KineticGlassPanel";
import { KineticGlassRenderer } from "./KineticGlassRenderer";
import { cloneKineticGlassState, createKineticGlassState, sanitizeKineticGlassState, type KineticGlassPresetId, type KineticGlassState } from "./KineticGlassState";

const BUILTINS: StudioVariationSummary[] = [
  { id: "kinetic-clear-attraction", label: "01  Clear Attraction", builtin: true, modeId: "kinetic-glass" },
  { id: "kinetic-pleos-prism", label: "02  PLEOS Prism", builtin: true, modeId: "kinetic-glass" },
  { id: "kinetic-dark-mass", label: "03  Dark Mass", builtin: true, modeId: "kinetic-glass" },
];

export class KineticGlassMode implements StudioModeInstance {
  readonly id = "kinetic-glass";
  readonly exportAdapter = new KineticGlassExportAdapter(() => this);
  private state = createKineticGlassState();
  private renderer: KineticGlassRenderer | null = null;
  private panel: KineticGlassPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private artboardShell: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private status: HTMLElement | null = null;

  constructor(private readonly context: StudioModeContext) {}
  mount(): void {
    this.context.root.innerHTML = this.template(); this.artboardShell = this.require<HTMLElement>(".light-field-artboard"); const stage = this.require<HTMLElement>(".kinetic-glass-stage"); this.stage = stage; this.status = this.require<HTMLElement>("[data-kinetic-status]");
    this.renderer = new KineticGlassRenderer(this.state, () => { if (this.status) this.status.hidden = true; this.resize(); }, (message) => this.showError(message));
    stage.append(this.renderer.canvas); this.mountPanel(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.context.root); this.resize();
  }
  unmount(): void { this.resizeObserver?.disconnect(); }
  resize(): void {
    if (!this.renderer || !this.stage || !this.artboardShell) return; const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard"); if (!pasteboard) return;
    const availableWidth = Math.max(120, pasteboard.clientWidth - 56), availableHeight = Math.max(120, pasteboard.clientHeight - 56), aspect = this.state.artboard.width / this.state.artboard.height;
    let width = availableWidth, height = width / aspect; if (height > availableHeight) { height = availableHeight; width = height * aspect; }
    width *= this.state.artboard.previewZoom; height *= this.state.artboard.previewZoom; this.artboardShell.style.width = `${width}px`; this.artboardShell.style.height = `${height}px`; this.artboardShell.classList.toggle("transparent", this.state.artboard.transparent); this.artboardShell.style.background = this.state.artboard.background; this.renderer.resize(width, height);
  }
  getState(): KineticGlassState { return cloneKineticGlassState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.renderPreview(); }
  listVariations(): StudioVariationSummary[] { return BUILTINS.map((item) => ({ ...item })); }
  applyVariation(id: string): void { const preset = id.replace("kinetic-", "") as KineticGlassPresetId; if (preset in { "clear-attraction": 1, "pleos-prism": 1, "dark-mass": 1 }) this.applyPreset(preset); }
  focusExport(): void { this.panel?.focusExport(); }
  inspect(): object { return { ...(this.renderer?.inspect() ?? { ready: false }), preset: this.state.preset, projection: "orthographic isometric", axisFamily: "30deg", solids: 3, sharedOrigin: true, material: { ...this.state.material }, physicsSettings: { ...this.state.physics }, motion: { enabled: this.state.motion.enabled, time: this.state.motion.time, duration: this.state.motion.duration, fps: 60 }, export: { rasterPng: true, transparentPng: true, ppi: this.state.export.ppi } }; }
  command(name: string, payload?: unknown): unknown {
    if (name === "play") { this.state.motion.enabled = true; this.panel?.sync(); return; }
    if (name === "pause") { this.state.motion.enabled = false; this.panel?.sync(); return; }
    if (name === "seek") { this.state.motion.time = Number(payload ?? 0); return; }
    if (name === "getMotionState") return { time: this.state.motion.time, duration: this.state.motion.duration, fps: 60, playing: this.state.motion.enabled };
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(payload as Partial<ArtboardState>)?.axisAnchor } }; this.changed(); return; }
    if (name === "setPreset") { this.applyPreset(payload as KineticGlassPresetId); return; }
    if (name === "resetPhysics") { this.renderer?.resetPhysics(); return; }
    if (name === "exportFrame") { const options = payload as { download?: boolean } | undefined; return this.exportStill("custom", options?.download ?? false); }
    return undefined;
  }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(state: StudioSharedState): void { if (!state.artboard) return; this.state.artboard = { ...this.state.artboard, ...(state.artboard as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(state.artboard as Partial<ArtboardState>).axisAnchor } }; this.changed(); }
  serialize(): KineticGlassState { return this.getState(); }
  restore(state: unknown): void { this.state = sanitizeKineticGlassState(state); this.renderer?.setState(this.state); this.mountPanel(); this.resize(); }
  dispose(): void { this.resizeObserver?.disconnect(); this.renderer?.dispose(); this.renderer = null; this.panel = null; this.context.root.replaceChildren(); }
  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> {
    if (!this.renderer?.isReady()) throw new Error("Kinetic Glass 물리 엔진을 초기화하는 중입니다.");
    const scale = quality === "print" ? this.state.export.ppi / 72 : 1, width = Math.round(this.state.artboard.width * scale), height = Math.round(this.state.artboard.height * scale);
    const data = injectPngPpi(await this.renderer.exportPng(width, height), this.state.export.ppi); if (download) this.download(data, `pleos-kinetic-glass-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`); return data;
  }
  private mountPanel(): void {
    const host = this.context.root.querySelector<HTMLElement>("[data-kinetic-panel-host]"); if (!host) return;
    this.panel = new KineticGlassPanel(host, this.state, { change: () => this.changed(), preset: (id) => this.applyPreset(id), resetPhysics: () => this.renderer?.resetPhysics(), resetAll: () => this.applyPreset(this.state.preset), export: () => { void this.exportStill("custom", true).catch((error) => this.showError(error instanceof Error ? error.message : String(error))); } });
  }
  private applyPreset(id: KineticGlassPresetId): void { this.state = createKineticGlassState(id); this.renderer?.setState(this.state); this.mountPanel(); this.resize(); this.context.notifyStateChange(); this.context.requestUiRefresh(); }
  private changed(): void { this.renderer?.setState(this.state); this.resize(); this.context.notifyStateChange(); }
  private showError(message: string): void { if (this.status) { this.status.hidden = false; this.status.textContent = message; } console.error(message); }
  private download(data: string, filename: string): void { const link = document.createElement("a"); link.href = data; link.download = filename; link.click(); }
  private require<T extends Element>(selector: string): T { const element = this.context.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Kinetic Glass element: ${selector}`); return element; }
  private template(): string { return `<section class="light-field-app kinetic-glass-app motion-studio"><main class="pasteboard"><div class="artboard-meta"><span>KINETIC GLASS</span><b>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard"><div class="light-field-stage kinetic-glass-stage"></div></div></main><div data-kinetic-panel-host></div><div class="field-error" data-kinetic-status role="status" aria-live="polite">Rapier 물리 엔진 초기화 중…</div></section>`; }
}

export const KINETIC_GLASS_MODE: StudioModeDefinition = {
  id: "kinetic-glass", label: "Kinetic Glass", description: "PLEOS three-cube glass attraction with Three.js and Rapier",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: true, print: true },
  ownsVariation: (id) => id.startsWith("kinetic-"), create: (context) => new KineticGlassMode(context),
};
