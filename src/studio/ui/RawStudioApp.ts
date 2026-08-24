import "./RawStudioApp.css";
import {
  LIGHTING_PRESETS,
  cloneLightingPreset,
  type LightingPresetId,
} from "../../raw-webgl/lighting/lightingPresets";
import {
  MATTE_PRESETS,
  PRISM_PRESETS,
  type MattePresetId,
  type PrismPresetId,
  type Vec3,
} from "../../raw-webgl/materials/materialPresets";
import {
  RAW_SCENE_PRESETS,
  RawStudioStore,
  applyRawMaterialPreset,
  applyRawScenePreset,
  createDefaultRawStudioState,
  type RawStudioChange,
  type RawStudioState,
} from "../state/RawStudioState";

export type RawStudioCommand =
  | { type: "export" }
  | { type: "reset-camera" }
  | { type: "fit-camera" }
  | { type: "recompile-shaders" };

/** Minimal bridge owned by the renderer integration layer. */
export interface RawStudioController {
  mount(stageHost: HTMLElement): void;
  update(state: Readonly<RawStudioState>, change: RawStudioChange): void;
  command(
    command: RawStudioCommand,
    state: Readonly<RawStudioState>,
  ): void | RawStudioState | Promise<void | RawStudioState>;
}

export interface RawStudioStatus {
  renderer: string;
  gpuPreference: string;
  hdr: "Checking" | "Enabled" | "Disabled";
  floatColorBuffer: "Checking" | "Supported" | "Unsupported";
  maxTextureSize: number | null;
  maxRenderbufferSize: number | null;
  maxSamples: number | null;
  drawingBuffer: [number, number] | null;
  frameTimeMs: number | null;
  message: string;
  level: "ok" | "warning" | "error";
}

const DEFAULT_STATUS: RawStudioStatus = {
  renderer: "Raw WebGL2",
  gpuPreference: "High Performance Requested",
  hdr: "Checking",
  floatColorBuffer: "Checking",
  maxTextureSize: null,
  maxRenderbufferSize: null,
  maxSamples: null,
  drawingBuffer: null,
  frameTimeMs: null,
  message: "Renderer initialization pending",
  level: "warning",
};

const OUTPUT_PRESETS = [
  { value: "1400x1040", label: "Reference half", width: 1400, height: 1040 },
  { value: "2000x1486", label: "Reference medium", width: 2000, height: 1486 },
  { value: "2800x2080", label: "Reference master", width: 2800, height: 2080 },
  { value: "3840x2160", label: "4K 16:9", width: 3840, height: 2160 },
  { value: "4096x4096", label: "Square 4K", width: 4096, height: 4096 },
  { value: "5600x4160", label: "Reference 2×", width: 5600, height: 4160 },
] as const;

const TABS = [
  ["material", "Style"],
  ["lighting", "Light"],
  ["output", "Export"],
] as const;

function option(value: string, label: string): string {
  return `<option value="${value}">${label}</option>`;
}

function rangeField(label: string, path: string, min: number, max: number, step: number): string {
  return `<label class="raw-field raw-range-field">
    <span>${label}<output data-output-for="${path}"></output></span>
    <span class="raw-range-pair">
      <input type="range" min="${min}" max="${max}" step="${step}" data-state-path="${path}" data-value-type="number">
      <input type="number" min="${min}" max="${max}" step="${step}" data-state-path="${path}" data-value-type="number" aria-label="${label} numeric value">
    </span>
  </label>`;
}

function numberField(label: string, path: string, min: number, max: number, step: number): string {
  return `<label class="raw-field"><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" data-state-path="${path}" data-value-type="number"></label>`;
}

function toggleField(label: string, path: string): string {
  return `<label class="raw-toggle"><span>${label}</span><input type="checkbox" data-state-path="${path}" data-value-type="boolean"><i></i></label>`;
}

function colorField(label: string, path: string): string {
  return `<label class="raw-field raw-color-field"><span>${label}</span><input type="color" data-state-path="${path}" data-value-type="color"></label>`;
}

function section(title: string, content: string, note = ""): string {
  return `<section class="raw-inspector-section"><header><h3>${title}</h3>${note ? `<small>${note}</small>` : ""}</header>${content}</section>`;
}

function getPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, root);
}

function setPath(root: unknown, path: string, value: unknown): boolean {
  const keys = path.split(".");
  let cursor: unknown = root;
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (cursor === null || typeof cursor !== "object") return false;
    cursor = (cursor as Record<string, unknown>)[keys[index]];
  }
  if (cursor === null || typeof cursor !== "object") return false;
  (cursor as Record<string, unknown>)[keys[keys.length - 1]] = value;
  return true;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const safe = Math.min(1, Math.max(0, value));
  return safe <= 0.0031308 ? safe * 12.92 : 1.055 * safe ** (1 / 2.4) - 0.055;
}

function colorFromHex(hex: string): Vec3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((value >> 16) & 255) / 255),
    srgbToLinear(((value >> 8) & 255) / 255),
    srgbToLinear((value & 255) / 255),
  ];
}

function colorToHex(color: Vec3): string {
  const channel = (value: number): string => Math.round(linearToSrgb(value) * 255).toString(16).padStart(2, "0");
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

function formatValue(value: number, step: string): string {
  const decimal = step.includes(".") ? step.split(".")[1].length : 0;
  return value.toFixed(Math.min(4, decimal));
}

export class RawStudioApp {
  readonly stageHost: HTMLElement;
  private readonly store: RawStudioStore;
  private readonly abortController = new AbortController();
  private readonly unsubscribe: () => void;
  private status: RawStudioStatus = { ...DEFAULT_STATUS };

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: RawStudioController,
    initialState: RawStudioState = createDefaultRawStudioState(),
  ) {
    this.store = new RawStudioStore(initialState);
    this.root.innerHTML = this.template();
    this.stageHost = this.require<HTMLElement>("[data-raw-stage-host]");
    this.bindEvents();
    this.unsubscribe = this.store.subscribe((state, change) => {
      this.sync(state);
      this.controller.update(state, change);
    });
    this.controller.mount(this.stageHost);
    this.sync(initialState);
    this.syncStatus();
    this.controller.update(initialState, { path: "*", reason: "initialize" });
  }

  getState(): RawStudioState {
    return structuredClone(this.store.snapshot);
  }

  setState(
    state: RawStudioState,
    change: RawStudioChange = { path: "*", reason: "external" },
  ): void {
    this.store.replace(state, change);
  }

  setStatus(patch: Partial<RawStudioStatus>): void {
    this.status = { ...this.status, ...patch };
    this.syncStatus();
  }

  destroy(): void {
    this.abortController.abort();
    this.unsubscribe();
    this.root.replaceChildren();
  }

  private template(): string {
    const sceneCards = RAW_SCENE_PRESETS.map((preset, index) => `
      <button class="raw-preset-card" data-scene-preset="${preset.id}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${preset.name}</strong>
        <small>${preset.description}</small>
        ${preset.experimental ? "<em>Experimental</em>" : ""}
      </button>`).join("");
    const materialOptions = `
      <optgroup label="Matte">${Object.entries(MATTE_PRESETS).map(([id, preset]) => option(id, preset.name)).join("")}</optgroup>
      <optgroup label="Prism">${Object.entries(PRISM_PRESETS).map(([id, preset]) => option(id, preset.name)).join("")}</optgroup>`;
    const lightingOptions = Object.entries(LIGHTING_PRESETS).map(([id, preset]) => option(id, preset.name)).join("");

    return `<div class="raw-studio-shell" data-left-open="true" data-right-open="true">
      <header class="raw-studio-topbar">
        <div class="raw-brand"><strong>PLEOS</strong><span>27 AXIS</span></div>
        <div class="raw-material-switch" role="group" aria-label="Material mode">
          <button data-material-mode="matte">Matte</button><button data-material-mode="prism">Prism</button>
        </div>
        <span class="raw-top-spacer"></span>
        <button class="raw-utility-button" data-toggle-panel="left" aria-label="Toggle preset panel">Presets</button>
        <button class="raw-utility-button" data-toggle-panel="right" aria-label="Toggle inspector">Inspector</button>
        <button class="raw-primary-button" data-command="export">Export PNG</button>
      </header>

      <aside class="raw-studio-left" aria-label="Scene presets">
        <header><span>PLEOS 27 / AXIS</span><h1>Rendering studies</h1><p>Axis DNA fixed. Material and light expand.</p></header>
        <div class="raw-preset-list">${sceneCards}</div>
        <section class="raw-left-note"><strong>Brand boundary</strong><p>Full Spectrum is experimental and requires color review before final use.</p></section>
      </aside>

      <main class="raw-studio-stage" aria-label="Raw WebGL2 render stage">
        <div class="raw-stage-host" data-raw-stage-host></div>
      </main>

      <aside class="raw-studio-right" aria-label="Render inspector">
        <nav class="raw-inspector-tabs" aria-label="Inspector tabs">
          ${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join("")}
        </nav>
        <div class="raw-inspector-scroll">
          <div data-tab-panel="material">${this.materialPanel(materialOptions)}</div>
          <div data-tab-panel="lighting">${this.lightingPanel(lightingOptions)}</div>
          <div data-tab-panel="output">${this.outputPanel()}</div>
        </div>
      </aside>

      <footer class="raw-studio-status" data-status-level="warning">
        <strong data-status="message"></strong>
      </footer>
    </div>`;
  }

  private materialPanel(materialOptions: string): string {
    return `
      ${section("Style", `
        <label class="raw-field"><span>Preset</span><select data-action="material-preset">${materialOptions}</select></label>
        <p class="raw-inline-status" data-material-summary></p>
      `)}
      <div data-material-section="matte">${section("Matte surface", `
        ${colorField("Base color", "material.matte.baseColor")}
        ${rangeField("Face variation", "material.matte.faceVariation", 0, 0.5, 0.01)}
        ${rangeField("Roughness", "material.matte.roughness", 0.04, 1, 0.01)}
        ${rangeField("Ambient strength", "material.matte.ambientStrength", 0, 1, 0.01)}
      `)}</div>
      <div data-material-section="prism">
        <div class="raw-experimental-banner" data-experimental-banner hidden>EXPERIMENTAL — COLOR REVIEW REQUIRED</div>
        ${section("Prism surface", `
        ${colorField("Absorption color", "material.prism.absorptionColor")}
        ${rangeField("Density", "material.prism.absorptionDensity", 0, 3, 0.01)}
        ${rangeField("Spectrum", "material.prism.spectrumStrength", 0, 2, 0.01)}
        ${rangeField("Roughness", "material.prism.surfaceRoughness", 0, 0.8, 0.005)}
        ${rangeField("Refraction", "material.prism.refractionStrength", 0, 3, 0.01)}
      `)}
      </div>`;
  }

  private lightingPanel(lightingOptions: string): string {
    return `
      ${section("Light", `
        <label class="raw-field"><span>Lighting preset</span><select data-action="lighting-preset">${lightingOptions}</select></label>
        ${colorField("Background", "lighting.backgroundColor")}
        ${rangeField("Environment intensity", "lighting.environmentIntensity", 0, 6, 0.01)}
        ${rangeField("Key intensity", "lighting.key.intensity", 0, 12, 0.05)}
        ${rangeField("Fill intensity", "lighting.fill.intensity", 0, 12, 0.05)}
        ${rangeField("Rim intensity", "lighting.rim.intensity", 0, 12, 0.05)}
      `)}
      ${section("Framing", `
        <p class="raw-help">The 30° Axis camera is locked. Use the mouse wheel over the canvas to zoom.</p>
      `, "Axis protected")}`;
  }

  private outputPanel(): string {
    return `
      ${section("Final image", `
        <label class="raw-field"><span>Resolution preset</span><select data-action="output-preset">
          ${OUTPUT_PRESETS.map((preset) => option(preset.value, `${preset.label} / ${preset.width} × ${preset.height}`)).join("")}${option("custom", "Custom")}
        </select></label>
        ${numberField("Width", "output.width", 64, 16384, 1)}
        ${numberField("Height", "output.height", 64, 16384, 1)}
        ${toggleField("Aspect lock", "output.aspectLock")}
        ${toggleField("Transparent background", "output.transparent")}
        <label class="raw-field"><span>Filename</span><input type="text" data-state-path="output.filename"></label>
        ${rangeField("Exposure", "output.post.exposure", -6, 6, 0.01)}
        <button class="raw-full-button" data-command="export">Render and export PNG</button>
      `)}
    `;
  }

  private bindEvents(): void {
    const signal = this.abortController.signal;
    this.root.addEventListener("click", (event) => this.handleClick(event), { signal });
    this.root.addEventListener("input", (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "range") this.updateBoundControl(input);
    }, { signal });
    this.root.addEventListener("change", (event) => this.handleChange(event), { signal });
  }

  private handleClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    if (!target) return;
    const tab = target.dataset.tab;
    if (tab) {
      this.store.update((draft) => { draft.ui.tab = tab as RawStudioState["ui"]["tab"]; }, { path: "ui.tab", reason: "control" });
      return;
    }
    const scenePreset = target.dataset.scenePreset as RawStudioState["scenePreset"] | undefined;
    if (scenePreset) {
      this.store.replace(applyRawScenePreset(this.getState(), scenePreset), { path: "scenePreset", reason: "preset" });
      return;
    }
    const materialMode = target.dataset.materialMode as RawStudioState["material"]["mode"] | undefined;
    if (materialMode) {
      const preset = materialMode === "matte" ? this.store.snapshot.material.mattePreset : this.store.snapshot.material.prismPreset;
      this.store.replace(applyRawMaterialPreset(this.getState(), preset), { path: "material.mode", reason: "control" });
      return;
    }
    const panel = target.dataset.togglePanel;
    if (panel === "left" || panel === "right") {
      const path = panel === "left" ? "ui.leftPanelOpen" : "ui.rightPanelOpen";
      this.store.update((draft) => {
        if (panel === "left") draft.ui.leftPanelOpen = !draft.ui.leftPanelOpen;
        else draft.ui.rightPanelOpen = !draft.ui.rightPanelOpen;
      }, { path, reason: "control" });
      return;
    }
    const command = target.dataset.command as RawStudioCommand["type"] | undefined;
    if (command) {
      void this.runCommand({ type: command });
      return;
    }
  }

  private handleChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target instanceof HTMLSelectElement && target.dataset.action === "material-preset") {
      this.store.replace(applyRawMaterialPreset(this.getState(), target.value as MattePresetId | PrismPresetId), { path: "material.preset", reason: "preset" });
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset.action === "lighting-preset") {
      this.store.update((draft) => { draft.lighting = cloneLightingPreset(target.value as LightingPresetId); }, { path: "lighting", reason: "preset" });
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset.action === "output-preset") {
      const preset = OUTPUT_PRESETS.find((candidate) => candidate.value === target.value);
      if (preset) this.store.update((draft) => {
        draft.output.width = preset.width;
        draft.output.height = preset.height;
      }, { path: "output.size", reason: "preset" });
      return;
    }
    if (target.type === "range") return;
    this.updateBoundControl(target);
  }

  private updateBoundControl(control: HTMLInputElement | HTMLSelectElement): void {
    const path = control.dataset.statePath;
    if (!path) return;
    const previous = this.store.snapshot;
    let value: unknown = control.value;
    if (control instanceof HTMLInputElement && control.dataset.valueType === "boolean") value = control.checked;
    else if (control.dataset.valueType === "number") {
      const parsed = Number(control.value);
      if (!Number.isFinite(parsed)) return;
      value = parsed;
    } else if (control.dataset.valueType === "color") value = colorFromHex(control.value);

    this.store.update((draft) => {
      setPath(draft, path, value);
      if (path === "output.width" && draft.output.aspectLock) draft.output.height = Math.max(1, Math.round(draft.output.width / previous.output.width * previous.output.height));
      if (path === "output.height" && draft.output.aspectLock) draft.output.width = Math.max(1, Math.round(draft.output.height / previous.output.height * previous.output.width));
    }, { path, reason: "control" });
  }

  private async runCommand(command: RawStudioCommand): Promise<void> {
    try {
      this.setStatus({ message: command.type === "export" ? "Rendering export…" : `Running ${command.type}…`, level: "warning" });
      const next = await this.controller.command(command, this.store.snapshot);
      if (next) this.store.replace(next, { path: command.type, reason: "command" });
      this.setStatus({ message: command.type === "export" ? "Export complete" : `${command.type} complete`, level: "ok" });
    } catch (error) {
      this.setStatus({ message: error instanceof Error ? error.message : String(error), level: "error" });
    }
  }

  private sync(state: Readonly<RawStudioState>): void {
    const shell = this.require<HTMLElement>(".raw-studio-shell");
    shell.dataset.leftOpen = String(state.ui.leftPanelOpen);
    shell.dataset.rightOpen = String(state.ui.rightPanelOpen);
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-state-path]").forEach((control) => {
      const path = control.dataset.statePath;
      if (!path) return;
      const value = getPath(state, path);
      if (control instanceof HTMLInputElement && control.dataset.valueType === "boolean") control.checked = Boolean(value);
      else if (control instanceof HTMLInputElement && control.dataset.valueType === "color" && Array.isArray(value)) control.value = colorToHex(value as Vec3);
      else if (value !== undefined && String(value) !== control.value) control.value = String(value);
    });
    this.root.querySelectorAll<HTMLOutputElement>("[data-output-for]").forEach((output) => {
      const path = output.dataset.outputFor;
      if (!path) return;
      const value = getPath(state, path);
      const range = Array.from(this.root.querySelectorAll<HTMLInputElement>("input[type='range'][data-state-path]")).find((candidate) => candidate.dataset.statePath === path);
      output.value = typeof value === "number" ? formatValue(value, range?.step ?? "0.01") : String(value ?? "");
    });

    this.root.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => button.dataset.active = String(button.dataset.tab === state.ui.tab));
    this.root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== state.ui.tab; });
    this.root.querySelectorAll<HTMLElement>("[data-material-mode]").forEach((button) => button.dataset.active = String(button.dataset.materialMode === state.material.mode));
    this.root.querySelectorAll<HTMLElement>("[data-scene-preset]").forEach((button) => button.dataset.active = String(button.dataset.scenePreset === state.scenePreset));
    this.root.querySelectorAll<HTMLElement>("[data-material-section]").forEach((panel) => {
      panel.hidden = panel.dataset.materialSection !== state.material.mode;
    });

    const materialSelect = this.require<HTMLSelectElement>("[data-action='material-preset']");
    materialSelect.value = state.material.mode === "matte" ? state.material.mattePreset : state.material.prismPreset;
    const lightingSelect = this.require<HTMLSelectElement>("[data-action='lighting-preset']");
    lightingSelect.value = state.lighting.preset;
    const outputPreset = this.require<HTMLSelectElement>("[data-action='output-preset']");
    outputPreset.value = OUTPUT_PRESETS.find((preset) => preset.width === state.output.width && preset.height === state.output.height)?.value ?? "custom";
    const summary = this.require<HTMLElement>("[data-material-summary]");
    summary.textContent = state.material.mode === "matte" ? "Locked two-cube Axis · Matte" : "Locked two-cube Axis · Prism";
    const banner = this.require<HTMLElement>("[data-experimental-banner]");
    banner.hidden = state.material.mode !== "prism" || !state.material.prism.experimental;
  }

  private syncStatus(): void {
    const status = this.status;
    this.require<HTMLElement>(".raw-studio-status").dataset.statusLevel = status.level;
    this.require<HTMLElement>("[data-status='message']").textContent = status.message;
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`RawStudioApp missing element: ${selector}`);
    return element;
  }
}
