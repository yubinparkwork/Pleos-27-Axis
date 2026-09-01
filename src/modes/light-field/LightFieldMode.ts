import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { LightFieldExportAdapter } from "./LightFieldExportAdapter";
import { LightFieldPanel } from "./LightFieldPanel";
import { LightFieldRenderer } from "./LightFieldRenderer";
import { injectPngPpi } from "./PngMetadata";
import { cloneLightFieldState, createLightFieldState, sanitizeLightFieldState, type LightFieldPresetId, type LightFieldState } from "./LightFieldState";

const VARIATION_KEY = "pleos-27-axis-light-field-variations-v2";
interface StoredVariation extends StudioVariationSummary { state: LightFieldState; sharedArtboardState?: ArtboardState }

const BUILTINS: StoredVariation[] = [
  { id: "light-field-iridescent-pulse", label: "01  Iridescent Pulse", builtin: true, modeId: "light-field", state: createLightFieldState("iridescent-pulse") },
  { id: "light-field-violet-membrane", label: "02  Violet Membrane", builtin: true, modeId: "light-field", state: createLightFieldState("violet-membrane") },
  { id: "light-field-spectral-white", label: "03  Spectral White", builtin: true, modeId: "light-field", state: createLightFieldState("spectral-white") },
];

function loadUserVariations(): StoredVariation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(VARIATION_KEY) ?? "[]") as StoredVariation[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.modeId === "light-field" && !item.builtin && item.state).slice(0, 24).map((item) => ({
      ...item,
      state: sanitizeLightFieldState(item.state),
      sharedArtboardState: { ...item.state.artboard, ...item.sharedArtboardState, axisAnchor: { ...item.state.artboard.axisAnchor, ...item.sharedArtboardState?.axisAnchor } },
    })) : [];
  } catch { return []; }
}

export class LightFieldMode implements StudioModeInstance {
  readonly id = "light-field";
  readonly exportAdapter = new LightFieldExportAdapter(() => this);
  private readonly state = createLightFieldState();
  private users = loadUserVariations();
  private renderer: LightFieldRenderer | null = null;
  private panel: LightFieldPanel | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private artboardShell: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private raf = 0;
  private disposed = false;
  private playing = true;
  private startedAt = performance.now();

  constructor(private readonly context: StudioModeContext) {}

  mount(): void {
    this.context.root.innerHTML = this.template();
    this.artboardShell = this.require<HTMLElement>(".light-field-artboard");
    this.stage = this.require<HTMLElement>(".light-field-stage");
    this.status = this.require<HTMLElement>("[data-field-status]");
    this.renderer = new LightFieldRenderer(this.state, (message) => this.showError(message));
    this.stage?.append(this.renderer.canvas);
    this.panel = new LightFieldPanel(this.require<HTMLElement>("[data-light-field-panel-host]"), this.state, {
      change: () => this.onStateChange(), preset: (id) => this.applyPreset(id), export: () => { void this.exportStill("custom", true).catch((error) => this.showError(error.message)); },
      sequence: () => { void this.copySequenceCommand(); }, saveVariation: () => this.saveVariation(),
    });
    this.bindTransport();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.context.root);
    this.resize();
    this.raf = requestAnimationFrame(this.render);
  }

  unmount(): void { this.pause(); }
  resize(): void {
    if (!this.artboardShell || !this.renderer) return;
    const pasteboard = this.context.root.querySelector<HTMLElement>(".pasteboard");
    if (!pasteboard) return;
    const availableWidth = Math.max(120, pasteboard.clientWidth - 56);
    const availableHeight = Math.max(120, pasteboard.clientHeight - 56);
    const aspect = this.state.artboard.width / this.state.artboard.height;
    let width = availableWidth; let height = width / aspect;
    if (height > availableHeight) { height = availableHeight; width = height * aspect; }
    width *= this.state.artboard.previewZoom; height *= this.state.artboard.previewZoom;
    this.artboardShell.style.width = `${width}px`; this.artboardShell.style.height = `${height}px`;
    this.artboardShell.classList.toggle("transparent", this.state.artboard.transparent);
    this.artboardShell.style.background = this.state.artboard.background;
    this.renderer.resize(width, height);
  }

  getState(): LightFieldState { return cloneLightFieldState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.render(this.normalizedTime()); }
  applyVariation(id: string): void {
    const variation = [...BUILTINS, ...this.users].find((item) => item.id === id);
    if (!variation) throw new Error(`Unknown Light Field variation: ${id}`);
    const currentArtboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } };
    Object.assign(this.state, cloneLightFieldState(variation.state));
    this.state.artboard = variation.sharedArtboardState
      ? { ...variation.sharedArtboardState, axisAnchor: { ...variation.sharedArtboardState.axisAnchor } }
      : currentArtboard;
    this.renderer?.setState(this.state); this.panel?.sync(); this.resize(); this.context.notifyStateChange();
  }
  listVariations(): StudioVariationSummary[] { return [...BUILTINS, ...this.users].map(({ id, label, builtin, modeId }) => ({ id, label, builtin, modeId })); }
  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void {
    if (!shared.artboard) return;
    this.state.artboard = { ...this.state.artboard, ...(shared.artboard as ArtboardState), axisAnchor: { ...this.state.artboard.axisAnchor, ...(shared.artboard as ArtboardState).axisAnchor } };
    this.panel?.sync(); this.resize();
  }
  serialize(): LightFieldState { return this.getState(); }
  restore(state: unknown): void {
    Object.assign(this.state, sanitizeLightFieldState(state));
    this.renderer?.setState(this.state); this.panel?.sync(); this.resize();
  }
  focusExport(): void { this.panel?.focusExport(); }

  inspect(): object {
    return {
      ready: Boolean(this.renderer), renderer: "custom WebGL2 fullscreen field", rendererStrategy: "ray-box rounded cubes + world-space iridescent membrane + separable diffusion + composite",
      projection: "orthographic isometric cube projection", axis: { family: "30deg", source: "src/axis", sharedOrigin: true, hardcodedAngles: false, projectedAngles: this.renderer?.axisAngles ?? [] },
      preset: this.state.preset, artboard: { ...this.state.artboard }, motion: { ...this.state.motion, playing: this.playing, deterministic: true, evaluation: "absolute normalized time" },
      export: { rasterPng: true, transparentPng: true, printRaster: true, fixedTimestepSequence: true, pathTracing: false },
      variations: this.listVariations(), state: this.getState(), resources: { canvasCount: this.context.root.querySelectorAll("canvas").length, rafActive: this.raf !== 0 },
    };
  }

  command(name: string, payload?: unknown): unknown {
    if (name === "setArtboard") { this.state.artboard = { ...this.state.artboard, ...(payload as Partial<ArtboardState>), axisAnchor: { ...this.state.artboard.axisAnchor, ...(payload as Partial<ArtboardState>)?.axisAnchor } }; this.onStateChange(); return; }
    if (name === "play") return this.play();
    if (name === "pause") return this.pause();
    if (name === "seek") return this.seek(Number(payload ?? 0));
    if (name === "setPreset") return this.applyPreset(payload as LightFieldPresetId);
    if (name === "getMotionState") return { time: this.currentSeconds(), duration: this.state.motion.duration, fps: 30, playing: this.playing, enabled: this.state.motion.enabled };
    if (name === "exportFrame") { const value = payload as { frame?: number; fps?: number; download?: boolean } | undefined; return this.exportFrame(value?.frame ?? 0, value?.fps ?? 30, value?.download ?? false); }
    if (name === "export") return this.exportAdapter.exportStill(payload as Parameters<LightFieldExportAdapter["exportStill"]>[0]);
    return undefined;
  }

  play(): void { if (this.playing) return; this.playing = true; this.startedAt = performance.now() - this.state.motion.time * 1000; this.syncTransport(); }
  pause(): void { if (!this.playing) return; this.state.motion.time = this.currentSeconds(); this.playing = false; this.syncTransport(); }
  seek(seconds: number): void { this.state.motion.time = ((seconds % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration; this.startedAt = performance.now() - this.state.motion.time * 1000; this.renderer?.render(this.normalizedTime()); this.syncTransport(); }

  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> {
    if (!this.renderer) throw new Error("Light Field renderer가 준비되지 않았습니다.");
    const scale = quality === "print" ? this.state.export.ppi / 72 : 1;
    const width = Math.round(this.state.artboard.width * scale); const height = Math.round(this.state.artboard.height * scale);
    const data = injectPngPpi(await this.renderer.exportPng(width, height, this.normalizedTime()), this.state.export.ppi);
    if (download) this.download(data, `pleos-light-field-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`);
    return data;
  }

  async exportFrame(frame: number, fps: number, download: boolean): Promise<string> {
    if (!this.renderer) throw new Error("Light Field renderer가 준비되지 않았습니다.");
    const seconds = frame / fps; const normalized = (seconds % this.state.motion.duration) / this.state.motion.duration;
    const data = await this.renderer.exportPng(this.state.artboard.width, this.state.artboard.height, normalized);
    if (download) this.download(data, `pleos-light-field-frame-${String(frame).padStart(6, "0")}.png`);
    return data;
  }

  async exportSequence(download: boolean): Promise<string> {
    const command = `npm run render:light-field -- --fps 30 --duration ${this.state.motion.duration} --width ${this.state.artboard.width} --height ${this.state.artboard.height} --preset ${this.state.preset}`;
    if (download) await navigator.clipboard.writeText(command);
    return command;
  }

  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.raf); this.raf = 0;
    this.resizeObserver?.disconnect(); this.resizeObserver = null;
    this.renderer?.dispose(); this.renderer = null;
    this.panel = null; this.context.root.replaceChildren();
  }

  private render = (): void => {
    if (this.disposed) return;
    this.renderer?.render(this.normalizedTime());
    this.syncTransport();
    if (!this.disposed) this.raf = requestAnimationFrame(this.render);
  };

  private currentSeconds(): number { return this.playing && this.state.motion.enabled ? ((performance.now() - this.startedAt) / 1000 * this.state.motion.speed) % this.state.motion.duration : this.state.motion.time; }
  private normalizedTime(): number { return this.currentSeconds() / this.state.motion.duration; }
  private applyPreset(id: LightFieldPresetId): void {
    const artboard = { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } };
    Object.assign(this.state, createLightFieldState(id)); this.state.artboard = artboard;
    this.renderer?.setState(this.state); this.panel?.sync(); this.context.notifyStateChange();
  }
  private onStateChange(): void { this.renderer?.setState(this.state); this.resize(); this.context.notifyStateChange(); }
  private saveVariation(): void {
    const label = window.prompt("변형 이름", `Light Field ${this.users.length + 1}`)?.trim();
    if (!label) return;
    this.users.push({
      id: `light-user-${Date.now().toString(36)}`,
      label: label.slice(0, 48),
      builtin: false,
      modeId: "light-field",
      state: this.getState(),
      sharedArtboardState: { ...this.state.artboard, axisAnchor: { ...this.state.artboard.axisAnchor } },
    });
    localStorage.setItem(VARIATION_KEY, JSON.stringify(this.users)); this.context.requestUiRefresh();
  }
  private bindTransport(): void {
    this.context.root.querySelector("[data-field-play]")?.addEventListener("click", () => this.play());
    this.context.root.querySelector("[data-field-pause]")?.addEventListener("click", () => this.pause());
    this.context.root.querySelector<HTMLInputElement>("[data-field-timeline]")?.addEventListener("input", (event) => this.seek(Number((event.currentTarget as HTMLInputElement).value)));
  }
  private syncTransport(): void {
    const timeline = this.context.root.querySelector<HTMLInputElement>("[data-field-timeline]"); if (timeline) { timeline.max = String(this.state.motion.duration); timeline.value = String(this.currentSeconds()); }
    const time = this.context.root.querySelector<HTMLElement>("[data-field-time]"); if (time) time.textContent = `${this.currentSeconds().toFixed(2)} / ${this.state.motion.duration.toFixed(1)}s`;
  }
  private async copySequenceCommand(): Promise<void> { const command = await this.exportSequence(true); if (this.status) this.status.textContent = `시퀀스 명령을 복사했습니다 · ${command}`; }
  private showError(message: string): void { if (this.status) { this.status.hidden = false; this.status.textContent = message; } console.error(message); }
  private download(data: string, filename: string): void { const link = document.createElement("a"); link.href = data; link.download = filename; link.click(); }
  private require<T extends Element>(selector: string): T { const element = this.context.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Light Field element: ${selector}`); return element; }
  private template(): string {
    return `<section class="light-field-app motion-studio">
      <main class="pasteboard"><div class="artboard-meta"><span>IRIDESCENT FIELD</span><b>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard"><div class="light-field-stage"></div></div></main>
      <div data-light-field-panel-host></div>
      <div class="field-error" data-field-status role="status" aria-live="polite" hidden></div>
      <footer class="motion-transport"><div class="transport-buttons"><button data-field-play aria-label="재생">▶</button><button data-field-pause aria-label="일시 정지">Ⅱ</button></div><time data-field-time>0.00 / 10.0s</time><input type="range" data-field-timeline min="0" max="10" step="0.001" aria-label="라이트 필드 타임라인"><span>30 FPS · LOOP</span></footer>
    </section>`;
  }
}

export const LIGHT_FIELD_MODE: StudioModeDefinition = {
  id: "light-field",
  label: "Light Field",
  description: "PLEOS cubes with a loopable iridescent membrane field",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: true, print: true },
  ownsVariation: (id) => id.startsWith("light-field-") || id.startsWith("light-user-"),
  create: (context) => new LightFieldMode(context),
};
