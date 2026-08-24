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
  type RawAxisFamily,
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

const AXIS_VARIATIONS: Record<RawAxisFamily, Array<{ value: string; label: string }>> = {
  "30deg": [
    { value: "30-basic", label: "30° Basic" },
    { value: "30-v1", label: "30° Variation 1" },
    { value: "30-v2", label: "30° Variation 2" },
    { value: "30-v3", label: "30° Variation 3" },
  ],
  "45deg": [
    { value: "45-basic", label: "45° Basic" },
    { value: "45-v1", label: "45° Variation 1" },
    { value: "45-v2", label: "45° Variation 2" },
    { value: "45-v3", label: "45° Variation 3" },
  ],
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
  ["geometry", "Geometry"],
  ["material", "Material"],
  ["prism", "Prism"],
  ["lighting", "Lighting"],
  ["cards", "Cards"],
  ["camera", "Camera"],
  ["output", "Output"],
  ["debug", "Debug"],
] as const;

function option(value: string, label: string): string {
  return `<option value="${value}">${label}</option>`;
}

function selectField(label: string, path: string, options: string): string {
  return `<label class="raw-field"><span>${label}</span><select data-state-path="${path}">${options}</select></label>`;
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

function vectorField(label: string, path: string, min: number, max: number, step: number): string {
  return `<fieldset class="raw-vector-field"><legend>${label}</legend><div>
    ${["X", "Y", "Z"].map((axis, index) => `<label><span>${axis}</span><input type="number" min="${min}" max="${max}" step="${step}" data-state-path="${path}.${index}" data-value-type="number"></label>`).join("")}
  </div></fieldset>`;
}

function section(title: string, content: string, note = ""): string {
  return `<section class="raw-inspector-section"><header><h3>${title}</h3>${note ? `<small>${note}</small>` : ""}</header>${content}</section>`;
}

function lightControls(id: "key" | "fill" | "rim", label: string): string {
  const path = `lighting.${id}`;
  return section(label, `
    ${toggleField("Enabled", `${path}.enabled`)}
    ${colorField("Color", `${path}.color`)}
    ${rangeField("Intensity", `${path}.intensity`, 0, 12, 0.05)}
    ${rangeField("Azimuth", `${path}.azimuth`, -180, 180, 1)}
    ${rangeField("Elevation", `${path}.elevation`, -90, 90, 1)}
    ${rangeField("Distance", `${path}.distance`, 1, 30, 0.1)}
    ${vectorField("Target", `${path}.target`, -10, 10, 0.05)}
  `, "Independent direct light");
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
  private renderedCard = -1;

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
    this.renderCardInspector(initialState);
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
        <label class="raw-top-select"><span>Quality</span><select data-state-path="output.quality">
          ${option("draft", "Draft")}${option("balanced", "Balanced")}${option("high", "High")}${option("final", "Final")}
        </select></label>
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
          <div data-tab-panel="geometry">${this.geometryPanel()}</div>
          <div data-tab-panel="material">${this.materialPanel(materialOptions)}</div>
          <div data-tab-panel="prism">${this.prismPanel()}</div>
          <div data-tab-panel="lighting">${this.lightingPanel(lightingOptions)}</div>
          <div data-tab-panel="cards"><div data-card-inspector></div></div>
          <div data-tab-panel="camera">${this.cameraPanel()}</div>
          <div data-tab-panel="output">${this.outputPanel()}</div>
          <div data-tab-panel="debug">${this.debugPanel()}</div>
        </div>
      </aside>

      <footer class="raw-studio-status" data-status-level="warning">
        <span data-status="renderer"></span><span data-status="gpu"></span><span data-status="hdr"></span>
        <span data-status="float"></span><span data-status="limits"></span><span data-status="buffer"></span>
        <span data-status="frame"></span><strong data-status="message"></strong>
      </footer>
    </div>`;
  }

  private geometryPanel(): string {
    return `
      ${section("Axis topology", `
        ${selectField("Angle family", "geometry.axisFamily", option("30deg", "30°") + option("45deg", "45°"))}
        ${selectField("Approved variation", "geometry.variation", "")}
        ${numberField("Origin grid X", "geometry.originGrid.0", 0, 20, 1)}
        ${numberField("Origin grid Y", "geometry.originGrid.1", 0, 20, 1)}
      `, "20 × 20 grid anchor")}
      ${section("Volume", `
        ${selectField("Geometry mode", "geometry.mode", option("folded-surface", "Folded Surface") + option("closed-optical-solid", "Closed Optical Solid"))}
        ${rangeField("Fold depth", "geometry.foldDepth", 0, 1.5, 0.01)}
        ${rangeField("Solid depth ratio", "geometry.solidThickness", 0.02, 1.5, 0.001)}
      `)}
      ${section("Bevel", `
        ${toggleField("Enable bevel", "geometry.bevelEnabled")}
        ${rangeField("Width", "geometry.bevelWidth", 0, 0.16, 0.001)}
        ${rangeField("Segments", "geometry.bevelSegments", 1, 12, 1)}
        ${rangeField("Curvature", "geometry.bevelCurvature", 0, 1, 0.01)}
        ${rangeField("Edge roughness", "geometry.edgeRoughness", 0, 1, 0.01)}
        ${rangeField("Highlight strength", "geometry.edgeHighlightStrength", 0, 3, 0.01)}
      `, "Narrow bevel must preserve projected rays")}`;
  }

  private materialPanel(materialOptions: string): string {
    return `
      ${section("Material", `
        <label class="raw-field"><span>Preset</span><select data-action="material-preset">${materialOptions}</select></label>
        <p class="raw-inline-status" data-material-summary></p>
      `)}
      ${section("Matte BRDF", `
        ${colorField("Base color", "material.matte.baseColor")}
        ${colorField("Specular tint", "material.matte.specularTint")}
        ${rangeField("Face variation", "material.matte.faceVariation", 0, 0.5, 0.01)}
        ${rangeField("Roughness", "material.matte.roughness", 0.04, 1, 0.01)}
        ${rangeField("Diffuse strength", "material.matte.diffuseStrength", 0, 2, 0.01)}
        ${rangeField("Specular strength", "material.matte.specularStrength", 0, 2, 0.01)}
        ${rangeField("Micro surface", "material.matte.microStrength", 0, 0.5, 0.005)}
        ${rangeField("Micro scale", "material.matte.microScale", 8, 1200, 1)}
        ${rangeField("Ambient strength", "material.matte.ambientStrength", 0, 1, 0.01)}
      `, "GGX + diffuse, linear-space inputs")}`;
  }

  private prismPanel(): string {
    return `
      <div class="raw-experimental-banner" data-experimental-banner hidden>EXPERIMENTAL — COLOR REVIEW REQUIRED</div>
      ${section("Optical transport", `
        ${rangeField("Base IOR", "material.prism.baseIor", 1, 2.5, 0.005)}
        ${rangeField("Dispersion", "material.prism.dispersion", 0, 0.8, 0.005)}
        ${selectField("Spectral samples", "material.prism.spectralSamples", option("3", "3 / Preview") + option("5", "5 / High") + option("7", "7 / Final"))}
        ${rangeField("Spectrum strength", "material.prism.spectrumStrength", 0, 2, 0.01)}
        ${rangeField("Edge spectrum", "material.prism.edgeSpectrumStrength", 0, 3, 0.01)}
        ${rangeField("Internal spectrum", "material.prism.internalSpectrumStrength", 0, 2, 0.01)}
        ${rangeField("Saturation", "material.prism.spectrumSaturation", 0, 2, 0.01)}
        ${rangeField("Softness", "material.prism.spectrumSoftness", 0, 1, 0.01)}
      `)}
      ${section("Reflection / refraction", `
        ${rangeField("Fresnel", "material.prism.fresnelStrength", 0, 3, 0.01)}
        ${rangeField("Reflection", "material.prism.reflectionStrength", 0, 3, 0.01)}
        ${rangeField("Refraction", "material.prism.refractionStrength", 0, 3, 0.01)}
        ${rangeField("Surface roughness", "material.prism.surfaceRoughness", 0, 0.8, 0.005)}
        ${rangeField("Refraction roughness", "material.prism.refractionRoughness", 0, 1, 0.005)}
        ${rangeField("Refraction blur", "material.prism.refractionBlur", 0, 1, 0.005)}
      `)}
      ${section("Absorption", `
        ${colorField("Absorption color", "material.prism.absorptionColor")}
        ${rangeField("Density", "material.prism.absorptionDensity", 0, 3, 0.01)}
        ${rangeField("Distance", "material.prism.absorptionDistance", 0.05, 12, 0.01)}
        ${rangeField("Internal darkness", "material.prism.internalDarkness", 0, 1, 0.01)}
        ${rangeField("Thickness influence", "material.prism.thicknessInfluence", 0, 3, 0.01)}
      `)}
      ${section("Thin film", `
        ${toggleField("Iridescence", "material.prism.iridescenceEnabled")}
        ${rangeField("Strength", "material.prism.iridescenceStrength", 0, 1, 0.01)}
        ${rangeField("Film IOR", "material.prism.filmIor", 1, 2.5, 0.01)}
        ${rangeField("Thickness nm", "material.prism.filmThickness", 80, 1200, 1)}
        ${rangeField("Variation", "material.prism.filmThicknessVariation", 0, 1, 0.01)}
      `, "Independent from dispersion")}`;
  }

  private lightingPanel(lightingOptions: string): string {
    return `
      ${section("Studio environment", `
        <label class="raw-field"><span>Lighting preset</span><select data-action="lighting-preset">${lightingOptions}</select></label>
        ${colorField("Background", "lighting.backgroundColor")}
        ${rangeField("Background exposure", "lighting.backgroundExposure", 0, 4, 0.01)}
        ${rangeField("Environment intensity", "lighting.environmentIntensity", 0, 6, 0.01)}
        ${rangeField("Environment rotation", "lighting.environmentRotation", -180, 180, 1)}
      `)}
      ${lightControls("key", "Key Light")}${lightControls("fill", "Fill Light")}${lightControls("rim", "Rim Light")}`;
  }

  private cameraPanel(): string {
    return `
      ${section("Projection", `
        ${selectField("Camera mode", "camera.mode", option("orthographic", "Orthographic") + option("perspective", "Perspective"))}
        ${toggleField("Lock camera", "camera.locked")}
        ${rangeField("FOV", "camera.fov", 10, 100, 0.1)}
        ${rangeField("Ortho zoom", "camera.orthoZoom", 0.2, 4, 0.01)}
        ${rangeField("Roll", "camera.roll", -180, 180, 0.1)}
        ${numberField("Near", "camera.near", 0.001, 20, 0.001)}
        ${numberField("Far", "camera.far", 1, 500, 0.1)}
      `)}
      ${section("Transform", `${vectorField("Position", "camera.position", -30, 30, 0.01)}${vectorField("Target", "camera.target", -10, 10, 0.01)}
        <div class="raw-button-row"><button data-command="reset-camera">Reset</button><button data-command="fit-camera">Fit</button></div>
      `, "Drag orbit and wheel zoom remain renderer-owned")}`;
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
        ${selectField("Supersampling", "output.supersampling", option("1", "1×") + option("2", "2×"))}
        ${selectField("Accumulation", "output.accumulationSamples", option("8", "8 samples") + option("16", "16 samples") + option("32", "32 samples"))}
        ${toggleField("Transparent background", "output.transparent")}
        <label class="raw-field"><span>Filename</span><input type="text" data-state-path="output.filename"></label>
      `)}
      ${section("Display transform", `
        ${selectField("Tone mapping", "output.post.toneMapping", option("neutral", "Neutral") + option("aces-fitted", "ACES fitted"))}
        ${rangeField("Exposure", "output.post.exposure", -6, 6, 0.01)}
        ${rangeField("Contrast", "output.post.contrast", 0.5, 2, 0.01)}
        ${rangeField("White point", "output.post.whitePoint", 0.2, 8, 0.01)}
        ${rangeField("Black lift", "output.post.blackLift", 0, 0.25, 0.001)}
        ${rangeField("Preview render scale", "output.post.internalScale", 0.5, 2, 0.05)}
        ${toggleField("Dither", "output.post.dither")}${toggleField("FXAA", "output.post.fxaa")}
        <button class="raw-full-button" data-command="export">Render and export PNG</button>
      `)}
    `;
  }

  private debugPanel(): string {
    return `
      ${section("Visualization", `
        ${selectField("Debug mode", "debug.mode", [
          ["shaded", "Shaded"], ["wireframe", "Wireframe"], ["vertices", "Vertices"], ["face-normal", "Face Normal"],
          ["face-id", "Face ID"], ["axis-ray", "Axis Ray"], ["center-node", "Center Node"], ["depth", "Depth"], ["thickness", "Thickness"],
        ].map(([value, label]) => option(value, label)).join(""))}
        ${toggleField("Axis guides", "debug.showAxisGuides")}
        ${toggleField("Center node", "debug.showCenterNode")}
        ${toggleField("Bounds", "debug.showBounds")}
        ${toggleField("Freeze render", "debug.freezeRender")}
      `)}
      ${section("Diagnostics", `
        <div class="raw-button-column"><button data-command="recompile-shaders">Recompile shaders</button><button data-copy-state>Copy state JSON</button></div>
        <p class="raw-help">Shader failures must be reported with source line numbers. Debug controls are renderer state, not visual decoration.</p>
      `)}
    `;
  }

  private renderCardInspector(state: Readonly<RawStudioState>): void {
    const host = this.require<HTMLElement>("[data-card-inspector]");
    const index = Math.min(state.lighting.cards.length - 1, Math.max(0, state.ui.selectedCard));
    const names = ["Large Softbox", "Narrow Strip", "Warm Spectral", "Cool Spectral", "Rim Card"];
    const path = `lighting.cards.${index}`;
    host.innerHTML = `
      ${section("Reflection cards", `<div class="raw-card-selector">${state.lighting.cards.map((_, cardIndex) => `<button data-card-index="${cardIndex}">${cardIndex + 1}<small>${names[cardIndex] ?? `Card ${cardIndex + 1}`}</small></button>`).join("")}</div>`, "Direction-dependent environment")}
      ${section(names[index] ?? `Card ${index + 1}`, `
        ${toggleField("Enabled", `${path}.enabled`)}
        ${colorField("Color", `${path}.color`)}
        ${rangeField("Intensity", `${path}.intensity`, 0, 10, 0.01)}
        ${rangeField("Azimuth", `${path}.azimuth`, -180, 180, 1)}
        ${rangeField("Elevation", `${path}.elevation`, -90, 90, 1)}
        ${rangeField("Rotation", `${path}.rotation`, -180, 180, 1)}
        ${rangeField("Width", `${path}.width`, 0.01, 1.5, 0.01)}
        ${rangeField("Height", `${path}.height`, 0.01, 1.5, 0.01)}
        ${rangeField("Softness", `${path}.softness`, 0, 1, 0.01)}
      `)}
    `;
    this.renderedCard = index;
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
    const cardIndex = target.dataset.cardIndex;
    if (cardIndex !== undefined) {
      this.store.update((draft) => { draft.ui.selectedCard = Number(cardIndex); }, { path: "ui.selectedCard", reason: "control" });
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
    if (target.hasAttribute("data-copy-state")) {
      if (!navigator.clipboard) {
        this.setStatus({ message: "Clipboard API unavailable", level: "error" });
        return;
      }
      void navigator.clipboard.writeText(JSON.stringify(this.store.snapshot, null, 2)).then(
        () => this.setStatus({ message: "State JSON copied", level: "ok" }),
        () => this.setStatus({ message: "Clipboard write failed", level: "error" }),
      );
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
      if (path === "geometry.axisFamily") {
        const family = value as RawAxisFamily;
        draft.geometry.variation = family === "30deg" ? "30-basic" : "45-basic";
      }
      if (path === "geometry.mode" && draft.material.mode === "prism") {
        draft.geometry.mode = "closed-optical-solid";
      }
      if (path === "geometry.originGrid.0" || path === "geometry.originGrid.1") {
        draft.geometry.originGrid[0] = Math.round(Math.min(20, Math.max(0, draft.geometry.originGrid[0])));
        draft.geometry.originGrid[1] = Math.round(Math.min(20, Math.max(0, draft.geometry.originGrid[1])));
      }
      if (path === "geometry.bevelSegments") draft.geometry.bevelSegments = Math.round(draft.geometry.bevelSegments);
      if (path === "material.prism.spectralSamples") draft.material.prism.spectralSamples = Number(value) as 3 | 5 | 7;
      if (path === "output.supersampling") draft.output.supersampling = Number(value) as 1 | 2;
      if (path === "output.accumulationSamples") draft.output.accumulationSamples = Number(value) as 8 | 16 | 32;
      if (path === "output.width" && draft.output.aspectLock) draft.output.height = Math.max(1, Math.round(draft.output.width / previous.output.width * previous.output.height));
      if (path === "output.height" && draft.output.aspectLock) draft.output.width = Math.max(1, Math.round(draft.output.height / previous.output.height * previous.output.width));
      if (path === "camera.near" && draft.camera.near >= draft.camera.far) draft.camera.far = draft.camera.near + 1;
      if (path === "camera.far" && draft.camera.far <= draft.camera.near) draft.camera.near = Math.max(0.001, draft.camera.far - 1);
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

    const variation = this.require<HTMLSelectElement>("[data-state-path='geometry.variation']");
    const family = state.geometry.axisFamily;
    if (variation.dataset.family !== family) {
      variation.innerHTML = AXIS_VARIATIONS[family].map((item) => option(item.value, item.label)).join("");
      variation.dataset.family = family;
    }
    const familyControl = this.require<HTMLSelectElement>("[data-state-path='geometry.axisFamily']");
    const modeControl = this.require<HTMLSelectElement>("[data-state-path='geometry.mode']");
    familyControl.disabled = state.material.mode === "prism";
    variation.disabled = state.material.mode === "prism";
    modeControl.disabled = state.material.mode === "prism";

    if (this.renderedCard !== state.ui.selectedCard) this.renderCardInspector(state);
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
    this.root.querySelectorAll<HTMLElement>("[data-card-index]").forEach((button) => button.dataset.active = String(Number(button.dataset.cardIndex) === state.ui.selectedCard));

    const materialSelect = this.require<HTMLSelectElement>("[data-action='material-preset']");
    materialSelect.value = state.material.mode === "matte" ? state.material.mattePreset : state.material.prismPreset;
    const lightingSelect = this.require<HTMLSelectElement>("[data-action='lighting-preset']");
    lightingSelect.value = state.lighting.preset;
    const outputPreset = this.require<HTMLSelectElement>("[data-action='output-preset']");
    outputPreset.value = OUTPUT_PRESETS.find((preset) => preset.width === state.output.width && preset.height === state.output.height)?.value ?? "custom";
    const summary = this.require<HTMLElement>("[data-material-summary]");
    summary.textContent = state.material.mode === "matte" ? "Folded surface · opaque PBR" : "Closed solid · multi-pass optics";
    const banner = this.require<HTMLElement>("[data-experimental-banner]");
    banner.hidden = state.material.mode !== "prism" || !state.material.prism.experimental;
  }

  private syncStatus(): void {
    const value = (name: string, text: string): void => { this.require<HTMLElement>(`[data-status='${name}']`).textContent = text; };
    const status = this.status;
    this.require<HTMLElement>(".raw-studio-status").dataset.statusLevel = status.level;
    value("renderer", `Renderer: ${status.renderer}`);
    value("gpu", `GPU: ${status.gpuPreference}`);
    value("hdr", `HDR: ${status.hdr}`);
    value("float", `Float: ${status.floatColorBuffer}`);
    value("limits", `Limits: ${status.maxTextureSize ?? "—"} / ${status.maxRenderbufferSize ?? "—"} / ${status.maxSamples ?? "—"}`);
    value("buffer", `Buffer: ${status.drawingBuffer ? `${status.drawingBuffer[0]} × ${status.drawingBuffer[1]}` : "—"}`);
    value("frame", `GPU: ${status.frameTimeMs === null ? "—" : `${status.frameTimeMs.toFixed(2)} ms`}`);
    value("message", status.message);
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`RawStudioApp missing element: ${selector}`);
    return element;
  }
}
