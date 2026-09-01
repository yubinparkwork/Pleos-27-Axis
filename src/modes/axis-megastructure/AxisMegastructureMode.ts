import type { ArtboardState } from "../../artboard/ArtboardState";
import type { StudioExportQuality, StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState, StudioVariationSummary } from "../../studio/ModeTypes";
import { injectPngPpi } from "../light-field/PngMetadata";
import { AxisMegastructureExportAdapter } from "./AxisMegastructureExportAdapter";
import { AxisMegastructurePanel, type AxisMegastructurePanelMetrics } from "./AxisMegastructurePanel";
import { AxisMegastructureRenderer } from "./AxisMegastructureRenderer";
import { cloneAxisMegastructureState, createAxisMegastructureState, sanitizeAxisMegastructureState, type AxisMegastructurePresetId, type AxisMegastructureState } from "./AxisMegastructureState";

const LOCAL_PRESET_KEY = "pleos-27-axis-megastructure-presets-v1";
const BUILTINS: StudioVariationSummary[] = [
  { id: "axis-mega-abyssal-core", label: "01  Abyssal Core", builtin: true, modeId: "axis-megastructure" },
  { id: "axis-mega-violet-foundry", label: "02  Violet Foundry", builtin: true, modeId: "axis-megastructure" },
  { id: "axis-mega-cold-archive", label: "03  Cold Archive", builtin: true, modeId: "axis-megastructure" },
];

interface SavedPreset { id: string; name: string; state: AxisMegastructureState }

export class AxisMegastructureMode implements StudioModeInstance {
  readonly id = "axis-megastructure";
  readonly exportAdapter = new AxisMegastructureExportAdapter(() => this);
  private state = createAxisMegastructureState();
  private renderer: AxisMegastructureRenderer | null = null;
  private panel: AxisMegastructurePanel | null = null;
  private observer: ResizeObserver | null = null;
  private artboard: HTMLElement | null = null;
  private raf = 0;
  private regenerationTimer = 0;
  private disposed = false;
  private playing = true;
  private startedAt = performance.now();
  private previousFrame = performance.now();
  private lastTime = 0;
  private metricFrame = 0;
  private geometryPending = false;

  constructor(private readonly context: StudioModeContext) {}

  mount(): void {
    this.context.root.innerHTML = this.template();
    this.artboard = this.require<HTMLElement>(".axis-megastructure-artboard");
    const stage = this.require<HTMLElement>(".axis-megastructure-stage");
    this.renderer = new AxisMegastructureRenderer(this.state);
    stage.append(this.renderer.canvas);
    this.mountPanel();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.context.root);
    this.resize();
    this.raf = requestAnimationFrame(this.render);
  }

  unmount(): void { this.playing = false; this.observer?.disconnect(); }

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
    const dimensions = this.context.root.querySelector<HTMLElement>("[data-mega-dimensions]");
    if (dimensions) dimensions.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }

  getState(): AxisMegastructureState { return cloneAxisMegastructureState(this.state); }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { this.renderer?.render(this.currentSeconds(), 1 / 60); }
  listVariations(): StudioVariationSummary[] { return BUILTINS.map((item) => ({ ...item })); }
  applyVariation(id: string): void { this.applyPreset(id.replace("axis-mega-", "") as AxisMegastructurePresetId); }
  focusExport(): void { this.panel?.focusExport(); }
  serialize(): AxisMegastructureState { return this.getState(); }

  restore(state: unknown): void {
    this.state = sanitizeAxisMegastructureState(state);
    this.renderer?.setState(this.state);
    this.mountPanel();
    this.resize();
  }

  getSharedState(): StudioSharedState { return { artboard: { ...this.state.artboard, transparent: false, axisAnchor: { ...this.state.artboard.axisAnchor } } }; }
  setSharedState(shared: StudioSharedState): void {
    if (!shared.artboard) return;
    const artboard = shared.artboard as Partial<ArtboardState>;
    this.state.artboard = { ...this.state.artboard, ...artboard, transparent: false, background: "#000000", axisAnchor: { ...this.state.artboard.axisAnchor, ...artboard.axisAnchor } };
    this.changed("artboard", false);
    this.resize();
  }

  inspect(): object {
    return {
      ...(this.renderer?.inspect() ?? { ready: false }),
      preset: this.state.preset,
      motion: { time: this.currentSeconds(), duration: this.state.generation.duration, speed: 1, playing: this.playing && this.state.generation.enabled, fps: 60 },
      artboard: { ...this.state.artboard },
      controls: { expensiveChangesUseRegenerate: true, localPresetPersistence: true, qualityModes: ["low", "medium", "high", "ultra"] },
      export: { rasterPng: true, ppi: this.state.export.ppi },
    };
  }

  command(name: string, payload?: unknown): unknown {
    if (name === "play") { this.play(); return; }
    if (name === "pause") { this.pause(); return; }
    if (name === "restart" || name === "resetMotion") { this.restart(); return; }
    if (name === "seek") { this.seek(Number(payload ?? 0)); return; }
    if (name === "getMotionState") return { time: this.currentSeconds(), duration: this.state.generation.duration, fps: 60, playing: this.playing && this.state.generation.enabled };
    if (name === "setPreset") { this.applyPreset(payload as AxisMegastructurePresetId); return; }
    if (name === "regenerate") { this.regenerate(); return; }
    if (name === "randomize") { this.randomize((payload as "all" | "geometry" | "lighting" | "motion") ?? "all"); return; }
    if (name === "setArtboard") {
      const artboard = payload as Partial<ArtboardState>;
      this.state.artboard = { ...this.state.artboard, ...artboard, transparent: false, background: "#000000", axisAnchor: { ...this.state.artboard.axisAnchor, ...artboard.axisAnchor } };
      this.changed("artboard", false); this.resize(); return;
    }
    if (name === "exportFrame") {
      const options = payload as { frame?: number; fps?: number; download?: boolean } | undefined;
      const time = Number(options?.frame ?? 0) / Math.max(1, Number(options?.fps ?? 30));
      return this.exportAtTime("custom", options?.download ?? false, time);
    }
    return undefined;
  }

  async exportStill(quality: StudioExportQuality, download: boolean): Promise<string> { return this.exportAtTime(quality, download, this.currentSeconds()); }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.regenerationTimer);
    this.observer?.disconnect();
    this.panel?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.panel = null;
    this.context.root.replaceChildren();
  }

  private mountPanel(): void {
    const host = this.context.root.querySelector<HTMLElement>("[data-mega-panel-host]");
    if (!host) return;
    this.panel?.dispose();
    this.panel = new AxisMegastructurePanel(host, this.state, {
      change: (path, expensive) => this.changed(path, expensive),
      regenerate: () => this.regenerate(),
      focusAxis: () => this.focusAxisComposition(),
      preset: (id) => this.applyPreset(id),
      randomize: (scope) => this.randomize(scope),
      transport: (action) => { if (action === "play") this.play(); else if (action === "pause") this.pause(); else this.restart(); },
      savePreset: (name) => this.saveLocalPreset(name),
      loadPreset: (id) => this.loadLocalPreset(id),
      duplicatePreset: (id) => this.duplicateLocalPreset(id),
      deletePreset: (id) => this.deleteLocalPreset(id),
      listPresets: () => this.readLocalPresets().map(({ id, name }) => ({ id, name })),
      export: () => { void this.exportStill("custom", true).catch((error) => this.showError(error instanceof Error ? error.message : String(error))); },
    });
  }

  private changed(_path: string, expensive: boolean): void {
    if (expensive) this.geometryPending = true;
    this.renderer?.setState(this.state, !this.geometryPending);
    if (this.geometryPending) this.panel?.markPending();
    this.context.notifyStateChange();
  }

  private regenerate(): void {
    if (this.regenerationTimer) return;
    this.panel?.setBusy(true);
    this.setStatus("재귀 구조를 생성하고 있습니다…", false);
    this.regenerationTimer = window.setTimeout(() => {
      this.regenerationTimer = 0;
      try {
        this.renderer?.setState(this.state, true);
        this.geometryPending = false;
        this.panel?.setBusy(false);
        this.setStatus("구조 재생성 완료", false);
        this.context.notifyStateChange();
      } catch (error) {
        this.panel?.setBusy(false);
        this.showError(error instanceof Error ? error.message : String(error));
      }
    }, 32);
  }

  private focusAxisComposition(): void {
    const composition = createAxisMegastructureState(this.state.preset);
    this.state.axis = { ...this.state.axis, positionX: composition.axis.positionX, positionY: composition.axis.positionY, positionZ: composition.axis.positionZ, rotationX: composition.axis.rotationX, rotationY: composition.axis.rotationY, rotationZ: composition.axis.rotationZ, length: composition.axis.length, width: composition.axis.width, depth: composition.axis.depth, visualMass: composition.axis.visualMass, localIllumination: composition.axis.localIllumination, visibilityHierarchy: composition.axis.visibilityHierarchy };
    this.state.camera = { ...composition.camera };
    this.state.macro = { ...this.state.macro, wallProximity: composition.macro.wallProximity, canyonWidth: composition.macro.canyonWidth, density: composition.macro.density, voidAmount: composition.macro.voidAmount };
    this.geometryPending = false; this.renderer?.setState(this.state, true); this.mountPanel(); this.resize(); this.setStatus("AXIS 중심 구도를 적용했습니다", false); this.context.notifyStateChange();
  }

  private applyPreset(id: AxisMegastructurePresetId): void {
    const artboard = { ...this.state.artboard, transparent: false, background: "#000000", axisAnchor: { ...this.state.artboard.axisAnchor } };
    this.state = createAxisMegastructureState(id);
    this.geometryPending = false;
    this.state.artboard = artboard;
    this.startedAt = performance.now();
    this.lastTime = 0;
    this.renderer?.setState(this.state);
    this.mountPanel();
    this.resize();
    this.context.notifyStateChange();
    this.context.requestUiRefresh();
  }

  private randomize(scope: "all" | "geometry" | "lighting" | "motion"): void {
    const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    if (scope === "all" || scope === "geometry") {
      this.state.seed = 1000 + Math.floor(random() * 998999);
      this.state.macro.density = .78 + random() * .21;
      this.state.macro.wallProximity = .74 + random() * .24;
      this.state.macro.irregularity = .18 + random() * .5;
      this.state.subdivision.probability = .76 + random() * .22;
      this.state.subdivision.irregularity = .56 + random() * .42;
      this.state.greeble.density = .45 + random() * .54;
      this.state.panels.density = .72 + random() * .27;
    }
    if (scope === "all" || scope === "lighting") {
      this.state.lighting.magentaInternal = 2.2 + random() * 4;
      this.state.lighting.rimStrength = 3.8 + random() * 4;
      this.state.lighting.exposure = .86 + random() * .3;
      this.state.bloom.strength = .18 + random() * .28;
      this.state.atmosphere.fogDensity = .007 + random() * .01;
    }
    if (scope === "all" || scope === "motion") {
      this.state.generation.activationSpeed = .58 + random() * .7;
      this.state.generation.propagationSpeed = .5 + random() * .8;
      this.state.generation.stagger = .3 + random() * .5;
      this.state.generation.circuitResponse = .72 + random() * .28;
    }
    this.renderer?.setState(this.state, scope !== "lighting" && scope !== "motion");
    this.geometryPending = false;
    this.mountPanel();
    this.context.notifyStateChange();
  }

  private play(): void {
    this.playing = true;
    this.state.generation.enabled = true;
    this.startedAt = performance.now() - this.state.generation.time * 1000;
  }

  private pause(): void { this.state.generation.time = this.currentSeconds(); this.playing = false; this.context.notifyStateChange(); }
  private restart(): void { this.state.generation.time = 0; this.lastTime = 0; this.startedAt = performance.now(); this.playing = true; this.renderer?.render(0, 1 / 60); }
  private seek(time: number): void { this.state.generation.time = THREEClamp(time, 0, this.state.generation.duration); this.lastTime = this.state.generation.time; this.startedAt = performance.now() - this.state.generation.time * 1000; this.renderer?.render(this.state.generation.time, 1 / 60); }

  private currentSeconds(): number {
    if (!this.playing || !this.state.generation.enabled) return this.state.generation.time;
    const elapsed = (performance.now() - this.startedAt) / 1000;
    return this.state.generation.loopEnabled ? elapsed % this.state.generation.duration : Math.min(this.state.generation.duration, elapsed);
  }

  private render = (now: number): void => {
    if (this.disposed) return;
    const delta = Math.min(.1, Math.max(0, (now - this.previousFrame) / 1000));
    this.previousFrame = now;
    if (!document.hidden) {
      this.lastTime = this.currentSeconds();
      this.renderer?.render(this.lastTime, delta);
    }
    this.metricFrame += 1;
    if (this.metricFrame % 24 === 0) this.syncMetrics();
    this.raf = requestAnimationFrame(this.render);
  };

  private syncMetrics(): void {
    const inspection = this.renderer?.inspect() as { phase?: string; hierarchy?: Record<string, number>; performance?: { fps?: number; drawCalls?: number } } | undefined;
    if (!inspection) return;
    const metrics: AxisMegastructurePanelMetrics = { phase: inspection.phase, fps: inspection.performance?.fps, drawCalls: inspection.performance?.drawCalls, macro: inspection.hierarchy?.macro, panel: inspection.hierarchy?.panel, greeble: inspection.hierarchy?.greeble, circuit: inspection.hierarchy?.circuit };
    this.panel?.sync(metrics);
    const overlay = this.context.root.querySelector<HTMLElement>("[data-mega-overlay-status]");
    if (overlay) overlay.textContent = `${inspection.phase ?? "READY"} · ${Math.round(inspection.performance?.fps ?? 0)} FPS · ${inspection.performance?.drawCalls ?? 0} CALLS`;
  }

  private async exportAtTime(quality: StudioExportQuality, download: boolean, time: number): Promise<string> {
    if (!this.renderer) throw new Error("Axis Megastructure 렌더러가 준비되지 않았습니다.");
    const scale = quality === "print" ? this.state.export.ppi / 72 : 1;
    const width = Math.round(this.state.artboard.width * scale);
    const height = Math.round(this.state.artboard.height * scale);
    const data = injectPngPpi(await this.renderer.exportPng(width, height, time), this.state.export.ppi);
    if (download) {
      const link = document.createElement("a");
      link.href = data;
      link.download = `pleos-axis-megastructure-${this.state.preset}-${width}x${height}-${this.state.export.ppi}ppi.png`;
      link.click();
    }
    return data;
  }

  private readLocalPresets(): SavedPreset[] {
    try {
      const value = JSON.parse(localStorage.getItem(LOCAL_PRESET_KEY) ?? "[]") as unknown;
      return Array.isArray(value) ? value.filter((item): item is SavedPreset => Boolean(item && typeof item === "object" && "id" in item && "name" in item && "state" in item)) : [];
    } catch { return []; }
  }

  private writeLocalPresets(presets: SavedPreset[]): void { localStorage.setItem(LOCAL_PRESET_KEY, JSON.stringify(presets)); }

  private saveLocalPreset(name: string): void {
    const presets = this.readLocalPresets();
    presets.push({ id: `mega-${Date.now()}`, name, state: this.getState() });
    this.writeLocalPresets(presets.slice(-24));
    this.mountPanel();
    this.setStatus(`프리셋 “${name}” 저장 완료`, false);
  }

  private loadLocalPreset(id: string): void {
    const preset = this.readLocalPresets().find((item) => item.id === id);
    if (!preset) return;
    this.state = sanitizeAxisMegastructureState(preset.state);
    this.renderer?.setState(this.state);
    this.mountPanel(); this.resize(); this.context.notifyStateChange();
  }

  private duplicateLocalPreset(id: string): void {
    const presets = this.readLocalPresets();
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    presets.push({ id: `mega-${Date.now()}`, name: `${preset.name} Copy`, state: cloneAxisMegastructureState(preset.state) });
    this.writeLocalPresets(presets.slice(-24));
    this.mountPanel();
  }

  private deleteLocalPreset(id: string): void { this.writeLocalPresets(this.readLocalPresets().filter((item) => item.id !== id)); this.mountPanel(); }

  private setStatus(message: string, error: boolean): void {
    const status = this.context.root.querySelector<HTMLElement>("[data-mega-status]");
    if (status) { status.hidden = false; status.textContent = message; status.classList.toggle("error", error); }
    if (!error) window.setTimeout(() => { if (status?.textContent === message) status.hidden = true; }, 2200);
  }

  private showError(message: string): void { this.setStatus(message, true); console.error(message); }

  private require<T extends Element>(selector: string): T {
    const element = this.context.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Axis Megastructure element: ${selector}`);
    return element;
  }

  private template(): string {
    return `<section class="light-field-app axis-megastructure-app motion-studio"><main class="pasteboard"><div class="artboard-meta"><span>AXIS MEGASTRUCTURE</span><b data-mega-dimensions>${this.state.artboard.width} × ${this.state.artboard.height}px</b></div><div class="artboard-shell light-field-artboard axis-megastructure-artboard"><div class="axis-megastructure-stage"></div><div class="axis-megastructure-overlay" aria-hidden="true"><div><strong>PLEOS / AXIS COMPUTATION 27</strong><span>ORDER → GENERATION → SUBDIVISION → PROPAGATION</span></div><small data-mega-overlay-status>INITIALIZING · WEBGL2</small></div><p class="axis-megastructure-hint">MOVE POINTER · PERSPECTIVE PARALLAX · DETERMINISTIC SEED</p></div></main><div data-mega-panel-host></div><div class="mega-toast" data-mega-status role="status" aria-live="polite" hidden></div></section>`;
  }
}

function THREEClamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }

export const AXIS_MEGASTRUCTURE_MODE: StudioModeDefinition = {
  id: "axis-megastructure",
  label: "Axis Megastructure",
  description: "An immense recursive computational environment generated outward from one readable PLEOS AXIS",
  capabilities: { motion: true, pathTracing: false, rasterExport: true, transparency: false, print: true },
  ownsVariation: (id) => id.startsWith("axis-mega-"),
  create: (context) => new AxisMegastructureMode(context),
};
