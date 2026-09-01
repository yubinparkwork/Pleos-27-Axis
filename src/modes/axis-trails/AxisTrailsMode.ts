import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { injectPngPpi } from "../light-field/PngMetadata";
import { AxisTrailsExportAdapter } from "./AxisTrailsExportAdapter";
import { AxisTrailsPanel } from "./AxisTrailsPanel";
import { AxisTrailsRenderer } from "./AxisTrailsRenderer";
import { cloneAxisTrailsState, createAxisTrailsState, sanitizeAxisTrailsState, type AxisTrailsPresetId, type AxisTrailsState } from "./AxisTrailsState";

const BUILTINS: StudioVariationSummary[] = [
  { id: "axis-trails-pleos-blue", label: "01  PLEOS Blue", builtin: true, modeId: "axis-trails" },
  { id: "axis-trails-spectral-signal", label: "02  Spectral Signal", builtin: true, modeId: "axis-trails" },
  { id: "axis-trails-white-axis", label: "03  White Axis", builtin: true, modeId: "axis-trails" },
];

export class AxisTrailsMode implements StudioModeInstance {
  readonly id = "axis-trails";
  readonly exportAdapter = new AxisTrailsExportAdapter(() => this);
  private state = createAxisTrailsState();
  private renderer: AxisTrailsRenderer | null = null;
  private panel: AxisTrailsPanel | null = null;
  private observer: ResizeObserver | null = null;
  private artboard: HTMLElement | null = null;
  private raf = 0;
  private disposed = false;
  private playing = true;
  private startedAt = performance.now();
  private previousFrame = performance.now();

  constructor(private readonly context: StudioModeContext) {}
  mount(): void {
    this.context.root.innerHTML = this.template(); this.artboard = this.require<HTMLElement>(".light-field-artboard"); const stage = this.require<HTMLElement>(".axis-trails-stage");
    const renderer = new AxisTrailsRenderer(this.state); this.renderer = renderer; stage.append(renderer.canvas);
    this.panel = new AxisTrailsPanel(this.require<HTMLElement>("[data-axis-trails-panel-host]"), this.state, { change: () => this.onChange(), preset: (id) => this.applyPreset(id), reset: () => this.applyPreset("pleos-blue"), export: () => { void this.exportStill("custom", true); } });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.context.root); this.resize(); this.raf = requestAnimationFrame(this.render);
  }
  unmount(): void { this.playing = false; }
  resize(): void {
    if (!this.renderer || !this.artboard) return; const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard"); if (!pasteboard) return;
    const availableWidth = Math.max(120, pasteboard.clientWidth - 56), availableHeight = Math.max(120, pasteboard.clientHeight - 56), aspect = this.state.artboard.width / this.state.artboard.height;
    let width = availableWidth, height = width / aspect; if (height > availableHeight) { height = availableHeight; width = height * aspect; } width *= this.state.artboard.previewZoom; height *= this.state.artboard.previewZoom;
    this.artboard.style.width = `${width}px`; this.artboard.style.height = `${height}px`; this.artboard.classList.toggle("transparent", this.state.artboard.transparent); this.artboard.style.background = this.state.artboard.background; this.renderer.resize(width, height);
    const dimensions = this.context.root.querySelector<HTMLElement>("[data-axis-trails-dimensions]"); if (dimensions) dimensions.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }
  getState(): AxisTrailsState { return cloneAxisTrailsState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.render(this.currentSeconds(), 1 / 60); }
  applyVariation(id: string): void { const preset = id.replace("axis-trails-", "") as AxisTrailsPresetId; this.applyPreset(preset); }
  listVariations(): StudioVariationSummary[] { return BUILTINS.map((item) => ({ ...item })); }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void { if (!shared.artboard) return; this.state.artboard = { ...this.state.artboard, ...(shared.artboard as ArtboardState), axisAnchor: { ...this.state.artboard.axisAnchor, ...(shared.artboard as ArtboardState).axisAnchor } }; this.panel?.sync(); this.onChange(); }
  serialize(): AxisTrailsState { return this.getState(); }
  restore(state: unknown): void { this.state = sanitizeAxisTrailsState(state); this.renderer?.setState(this.state); this.panel?.sync(); this.resize(); }
  focusExport(): void { this.panel?.focusExport(); }
  inspect(): object { return { ready: Boolean(this.renderer), ...this.renderer?.inspect(), preset: this.state.preset, motion: { ...this.state.motion, playing: this.playing }, artboard: { ...this.state.artboard }, canvasCount: this.context.root.querySelectorAll("canvas").length }; }
  command(name: string, payload?: unknown): unknown {
    if (name === "play") { this.playing = true; this.startedAt = performance.now() - this.state.motion.time * 1000; return; }
    if (name === "pause") { this.state.motion.time = this.currentSeconds(); this.playing = false; return; }
    if (name === "seek") { this.state.motion.time = Number(payload ?? 0); this.startedAt = performance.now() - this.state.motion.time * 1000; return; }
    if (name === "getMotionState") return { time: this.currentSeconds(), duration: this.state.motion.duration, fps: 60, playing: this.playing, enabled: this.state.motion.enabled };
    if (name === "setPreset") return this.applyPreset(payload as AxisTrailsPresetId);
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>) }; this.onChange(); }
    return undefined;
  }
  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> {
    if (!this.renderer) throw new Error("Axis Trails renderer가 준비되지 않았습니다."); const scale = quality === "print" ? this.state.export.ppi / 72 : 1; const width = Math.round(this.state.artboard.width * scale), height = Math.round(this.state.artboard.height * scale);
    const data = injectPngPpi(await this.renderer.exportPng(width, height, this.currentSeconds()), this.state.export.ppi); if (download) { const link = document.createElement("a"); link.href = data; link.download = `pleos-axis-trails-${this.state.preset}-${width}x${height}.png`; link.click(); } return data;
  }
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.raf); this.observer?.disconnect(); this.renderer?.dispose(); this.context.root.replaceChildren(); }
  private render = (now: number): void => { if (this.disposed) return; const delta = (now - this.previousFrame) / 1000; this.previousFrame = now; this.renderer?.render(this.currentSeconds(), delta); this.raf = requestAnimationFrame(this.render); };
  private currentSeconds(): number { return this.playing && this.state.motion.enabled ? ((performance.now() - this.startedAt) / 1000 * this.state.motion.speed) % this.state.motion.duration : this.state.motion.time; }
  private applyPreset(id: AxisTrailsPresetId): void { const artboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } }; this.state = createAxisTrailsState(id); this.state.artboard = artboard; this.renderer?.setState(this.state); this.panel = new AxisTrailsPanel(this.require("[data-axis-trails-panel-host]"), this.state, { change: () => this.onChange(), preset: (next) => this.applyPreset(next), reset: () => this.applyPreset("pleos-blue"), export: () => { void this.exportStill("custom", true); } }); this.resize(); this.context.notifyStateChange(); this.context.requestUiRefresh(); }
  private onChange(): void { this.renderer?.setState(this.state); this.resize(); this.context.notifyStateChange(); }
  private require<T extends Element>(selector: string): T { const element = this.context.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Axis Trails element: ${selector}`); return element; }
  private template(): string { return `<section class="light-field-app axis-trails-app motion-studio"><main class="pasteboard"><div class="artboard-meta"><span>AXIS TRAILS</span><b data-axis-trails-dimensions>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard"><div class="axis-trails-stage"></div></div><p class="axis-trails-hint">MOVE CURSOR · 30° AXIS LOCK</p></main><div data-axis-trails-panel-host></div></section>`; }
}

export const AXIS_TRAILS_MODE: StudioModeDefinition = {
  id: "axis-trails", label: "Axis Trails", description: "Cursor-following luminous trails constrained to the PLEOS 30° axis family",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: true, print: true },
  ownsVariation: (id) => id.startsWith("axis-trails-"), create: (context) => new AxisTrailsMode(context),
};
