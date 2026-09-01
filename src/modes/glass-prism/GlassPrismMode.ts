import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { injectPngPpi } from "../light-field/PngMetadata";
import { GlassPrismExportAdapter } from "./GlassPrismExportAdapter";
import { GlassPrismPanel } from "./GlassPrismPanel";
import { GlassPrismRenderer } from "./GlassPrismRenderer";
import { cloneGlassPrismState, createGlassPrismState, sanitizeGlassPrismState, type GlassPrismPresetId, type GlassPrismState } from "./GlassPrismState";

const VARIATION_KEY = "pleos-27-axis-glass-prism-variations-v1";
interface StoredVariation extends StudioVariationSummary { state: GlassPrismState; sharedArtboardState?: ArtboardState }
const BUILTINS: StoredVariation[] = [
  { id: "glass-prism-clear", label: "01  Clear Glass", builtin: true, modeId: "glass-prism", state: createGlassPrismState("clear-glass") },
  { id: "glass-prism-rgb", label: "02  RGB Prism", builtin: true, modeId: "glass-prism", state: createGlassPrismState("rgb-prism") },
  { id: "glass-prism-frosted", label: "03  Frosted Prism", builtin: true, modeId: "glass-prism", state: createGlassPrismState("frosted-prism") },
  { id: "glass-prism-dark", label: "04  Dark Crystal", builtin: true, modeId: "glass-prism", state: createGlassPrismState("dark-crystal") },
];
function loadUsers(): StoredVariation[] { try { const parsed = JSON.parse(localStorage.getItem(VARIATION_KEY) ?? "[]") as StoredVariation[]; return Array.isArray(parsed) ? parsed.filter((item) => item?.modeId === "glass-prism" && !item.builtin).map((item) => ({ ...item, state: sanitizeGlassPrismState(item.state) })).slice(0, 24) : []; } catch { return []; } }

export class GlassPrismMode implements StudioModeInstance {
  readonly id = "glass-prism";
  readonly exportAdapter = new GlassPrismExportAdapter(() => this);
  private readonly state = createGlassPrismState();
  private users = loadUsers();
  private renderer: GlassPrismRenderer | null = null;
  private panel: GlassPrismPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private artboardShell: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private raf = 0; private disposed = false; private playing = true; private startedAt = performance.now();
  private dragPointer = -1; private dragX = 0; private dragY = 0;
  constructor(private readonly context: StudioModeContext) {}

  mount(): void {
    this.context.root.innerHTML = this.template(); this.artboardShell = this.require<HTMLElement>(".glass-prism-artboard"); this.stage = this.require<HTMLElement>(".glass-prism-stage"); this.status = this.require<HTMLElement>("[data-prism-status]");
    const renderer = new GlassPrismRenderer(this.state, (message) => this.showError(message)); this.renderer = renderer; this.stage.append(renderer.canvas);
    this.panel = new GlassPrismPanel(this.require("[data-glass-prism-panel-host]"), this.state, { change: (background) => this.onStateChange(Boolean(background)), preset: (id) => this.applyPreset(id), reset: () => this.applyPreset(this.state.preset), export: () => { void this.exportStill("custom", true).catch((error) => this.showError(error.message)); }, sequence: () => { void this.copySequence(); } });
    this.bindTransport(); this.bindViewport(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.context.root); this.resize(); this.raf = requestAnimationFrame(this.render);
  }
  unmount(): void { this.pause(); }
  resize(): void {
    if (!this.artboardShell || !this.renderer) return; const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard"); if (!pasteboard) return;
    const aw = Math.max(120, pasteboard.clientWidth - 56), ah = Math.max(120, pasteboard.clientHeight - 56), aspect = this.state.artboard.width / this.state.artboard.height; let width = aw, height = width / aspect; if (height > ah) { height = ah; width = height * aspect; }
    width *= this.state.artboard.previewZoom; height *= this.state.artboard.previewZoom; this.artboardShell.style.width = `${width}px`; this.artboardShell.style.height = `${height}px`; this.artboardShell.classList.toggle("transparent", this.state.artboard.transparent); this.renderer.resize(width, height);
  }
  getState(): GlassPrismState { return cloneGlassPrismState(this.state); }
  setState(state: unknown): void { Object.assign(this.state, sanitizeGlassPrismState(state)); this.renderer?.setState(this.state); this.renderer?.invalidateBackground(); this.panel?.sync(); this.resize(); }
  renderPreview(): void { this.renderer?.render(this.normalizedTime()); }
  applyVariation(id: string): void { const variation = [...BUILTINS, ...this.users].find((item) => item.id === id); if (!variation) throw new Error(`Unknown Glass Prism variation: ${id}`); const artboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } }; Object.assign(this.state, cloneGlassPrismState(variation.state)); this.state.artboard = variation.sharedArtboardState ? { ...variation.sharedArtboardState, axisAnchor: { ...variation.sharedArtboardState.axisAnchor } } : artboard; this.renderer?.setState(this.state); this.renderer?.invalidateBackground(); this.panel?.sync(); this.resize(); this.context.notifyStateChange(); }
  listVariations(): StudioVariationSummary[] { return [...BUILTINS, ...this.users].map(({ id, label, builtin, modeId }) => ({ id, label, builtin, modeId })); }
  focusExport(): void { this.panel?.focusExport(); }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void { if (!shared.artboard) return; this.state.artboard = { ...this.state.artboard, ...(shared.artboard as ArtboardState), axisAnchor: { ...this.state.artboard.axisAnchor, ...(shared.artboard as ArtboardState).axisAnchor } }; this.panel?.sync(); this.resize(); }
  serialize(): GlassPrismState { return this.getState(); }
  restore(state: unknown): void { this.setState(state); }
  inspect(): object { return { ready: Boolean(this.renderer), renderer: "custom Raw WebGL2 ray-box prism", rendererStrategy: "two-interface RGB Snell refraction with refracted exit-surface Fresnel", opticalInterfaces: 2, exitSurfaceVisible: true, projection: "interactive orthographic isometric", solids: 3, sharedCorner: true, preset: this.state.preset, state: this.getState(), motion: { ...this.state.motion, playing: this.playing, deterministic: true }, export: { rasterPng: true, transparentPng: true, printRaster: true, fixedTimestepSequence: true, pathTracing: false }, resources: { canvasCount: this.context.root.querySelectorAll("canvas").length, rafActive: this.raf !== 0 } }; }
  command(name: string, payload?: unknown): unknown {
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(payload as Partial<ArtboardState>)?.axisAnchor } }; this.onStateChange(true); return; }
    if (name === "setPreset") return this.applyPreset(payload as GlassPrismPresetId); if (name === "play") return this.play(); if (name === "pause") return this.pause(); if (name === "seek") return this.seek(Number(payload ?? 0));
    if (name === "getMotionState") return { time: this.currentSeconds(), duration: this.state.motion.duration, fps: 30, playing: this.playing, enabled: this.state.motion.enabled };
    if (name === "exportFrame") { const value = payload as { frame?: number; fps?: number; download?: boolean } | undefined; return this.exportFrame(value?.frame ?? 0, value?.fps ?? 30, value?.download ?? false); }
    if (name === "export") return this.exportAdapter.exportStill(payload as Parameters<GlassPrismExportAdapter["exportStill"]>[0]); return undefined;
  }
  play(): void { if (this.playing) return; this.playing = true; this.startedAt = performance.now() - this.state.motion.time * 1000; }
  pause(): void { if (!this.playing) return; this.state.motion.time = this.currentSeconds(); this.playing = false; }
  seek(seconds: number): void { this.state.motion.time = ((seconds % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration; this.startedAt = performance.now() - this.state.motion.time * 1000; this.renderer?.render(this.normalizedTime()); this.syncTransport(); }
  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> { if (!this.renderer) throw new Error("Glass Prism renderer가 준비되지 않았습니다."); const scale = quality === "print" ? this.state.export.ppi / 72 : 1, width = Math.round(this.state.artboard.width * scale), height = Math.round(this.state.artboard.height * scale); const data = injectPngPpi(await this.renderer.exportPng(width, height, this.normalizedTime()), this.state.export.ppi); if (download) this.download(data, `pleos-glass-prism-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`); return data; }
  async exportFrame(frame: number, fps: number, download: boolean): Promise<string> { if (!this.renderer) throw new Error("Glass Prism renderer가 준비되지 않았습니다."); const normalized = ((frame / fps) % this.state.motion.duration) / this.state.motion.duration, data = await this.renderer.exportPng(this.state.artboard.width, this.state.artboard.height, normalized); if (download) this.download(data, `pleos-glass-prism-frame-${String(frame).padStart(6, "0")}.png`); return data; }
  async exportSequence(download: boolean): Promise<string> { const command = `npm run render:glass-prism -- --fps 30 --duration ${this.state.motion.duration} --width ${this.state.artboard.width} --height ${this.state.artboard.height} --preset ${this.state.preset}`; if (download) await navigator.clipboard.writeText(command); return command; }
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.raf); this.raf = 0; this.resizeObserver?.disconnect(); this.resizeObserver = null; this.renderer?.dispose(); this.renderer = null; this.panel = null; this.context.root.replaceChildren(); }
  private render = (): void => { if (this.disposed) return; this.renderer?.render(this.normalizedTime()); this.syncTransport(); if (!this.disposed) this.raf = requestAnimationFrame(this.render); };
  private currentSeconds(): number { return this.playing && this.state.motion.enabled ? ((performance.now() - this.startedAt) / 1000 * this.state.motion.speed) % this.state.motion.duration : this.state.motion.time; }
  private normalizedTime(): number { return this.currentSeconds() / this.state.motion.duration; }
  private applyPreset(id: GlassPrismPresetId): void { const artboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } }; Object.assign(this.state, createGlassPrismState(id)); this.state.artboard = artboard; this.renderer?.setState(this.state); this.renderer?.invalidateBackground(); this.panel?.sync(); this.context.notifyStateChange(); }
  private onStateChange(background: boolean): void { this.renderer?.setState(this.state); if (background) this.renderer?.invalidateBackground(); this.resize(); this.context.notifyStateChange(); }
  private bindViewport(): void { const canvas = this.renderer?.canvas; if (!canvas) return; canvas.addEventListener("pointerdown", (event) => { this.dragPointer = event.pointerId; this.dragX = event.clientX; this.dragY = event.clientY; canvas.setPointerCapture(event.pointerId); }); canvas.addEventListener("pointermove", (event) => { if (event.pointerId !== this.dragPointer) return; this.state.camera.yaw += (event.clientX - this.dragX) * .004; this.state.camera.pitch = Math.max(-.6, Math.min(.6, this.state.camera.pitch + (event.clientY - this.dragY) * .004)); this.dragX = event.clientX; this.dragY = event.clientY; this.panel?.sync(); this.context.notifyStateChange(); }); const release = (event: PointerEvent) => { if (event.pointerId === this.dragPointer) this.dragPointer = -1; }; canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release); canvas.addEventListener("wheel", (event) => { event.preventDefault(); this.state.camera.zoom = Math.max(.55, Math.min(2.4, this.state.camera.zoom * Math.exp(-event.deltaY * .001))); this.context.notifyStateChange(); }, { passive: false }); }
  private bindTransport(): void { this.context.root.querySelector("[data-prism-play]")?.addEventListener("click", () => this.play()); this.context.root.querySelector("[data-prism-pause]")?.addEventListener("click", () => this.pause()); this.context.root.querySelector<HTMLInputElement>("[data-prism-timeline]")?.addEventListener("input", (event) => this.seek(Number((event.currentTarget as HTMLInputElement).value))); }
  private syncTransport(): void { const timeline = this.context.root.querySelector<HTMLInputElement>("[data-prism-timeline]"); if (timeline) { timeline.max = String(this.state.motion.duration); timeline.value = String(this.currentSeconds()); } const time = this.context.root.querySelector<HTMLElement>("[data-prism-time]"); if (time) time.textContent = `${this.currentSeconds().toFixed(2)} / ${this.state.motion.duration.toFixed(1)}s`; }
  private async copySequence(): Promise<void> { const command = await this.exportSequence(true); if (this.status) { this.status.hidden = false; this.status.textContent = `시퀀스 명령을 복사했습니다 · ${command}`; } }
  private showError(message: string): void { if (this.status) { this.status.hidden = false; this.status.textContent = message; } console.error(message); }
  private download(data: string, filename: string): void { const link = document.createElement("a"); link.href = data; link.download = filename; link.click(); }
  private require<T extends Element>(selector: string): T { const element = this.context.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Glass Prism element: ${selector}`); return element; }
  private template(): string { return `<section class="light-field-app motion-studio glass-prism-app"><main class="pasteboard"><div class="artboard-meta"><span>GLASS PRISM</span><b>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard glass-prism-artboard"><div class="light-field-stage glass-prism-stage"></div></div></main><div data-glass-prism-panel-host></div><div class="field-error" data-prism-status role="status" aria-live="polite" hidden></div><footer class="motion-transport"><div class="transport-buttons"><button data-prism-play aria-label="재생">▶</button><button data-prism-pause aria-label="일시 정지">Ⅱ</button></div><time data-prism-time>0.00 / 10.0s</time><input type="range" data-prism-timeline min="0" max="10" step="0.001" aria-label="Glass Prism 타임라인"><span>30 FPS · LOOP</span></footer></section>`; }
}

export const GLASS_PRISM_MODE: StudioModeDefinition = { id: "glass-prism", label: "Glass Prism", description: "Raw WebGL2 thickness-aware RGB refraction", capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: true, print: true }, ownsVariation: (id) => id.startsWith("glass-prism-"), create: (context) => new GlassPrismMode(context) };
