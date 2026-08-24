import { createAxisGraph, createReferenceFrame, getApprovedAxisDefinition, type AxisGraph } from "../axis";
import { evaluateCompliance, type ComplianceReport } from "../brand/compliance";
import { StillExporter } from "../export/StillExporter";
import type { AxisGraphLike } from "../geometry/FoldSurfaceBuilder";
import { MATERIAL_PRESETS } from "../materials/MaterialRegistry";
import { SPECTRAL_PRESETS, applySpectralPreset } from "../materials/spectralPresets";
import { MotionEngine } from "../motion/MotionEngine";
import { PleosRenderer } from "../renderer/PleosRenderer";
import type { SurfaceTextureSlot, UploadedTextureAsset } from "../textures/TextureUploader";
import {
  DEFAULT_STATE,
  EXPLORATION_PRESETS,
  STATIC_CUTS,
  cloneState,
  type AxisFamily,
  type AxisVariationId,
  type ColorFamily,
  type ExpressionLevel,
  type MaterialPresetId,
  type MotionPresetId,
  type SpectralPresetId,
  type SpectralSettings,
  type StudioState,
} from "../state/studioState";
import { History } from "../app/history";

const STORAGE_KEY = "pleos-27-axis-studio-v2";
const SAVED_KEY = "pleos-27-axis-variations-v2";

const VARIATION_TO_DEFINITION: Record<AxisVariationId, string> = {
  "30-basic": "axis-30-basic",
  "30-v1": "axis-30-variation-1",
  "30-v2": "axis-30-variation-2",
  "30-v3": "axis-30-variation-3",
  "45-basic": "axis-45-basic",
  "45-v1": "axis-45-variation-1",
  "45-v2": "axis-45-variation-2",
  "45-v3": "axis-45-variation-3",
};

const RAY_DEPTH_BY_ANGLE: Record<number, number> = {
  [-135]: 0.11, [-90]: -0.1, [-45]: -0.14, [0]: 0.08, [30]: 0.17,
  [45]: 0.16, [90]: 0.03, [135]: -0.04, [150]: -0.04, [180]: -0.07,
  [210]: 0.11, [-30]: -0.15,
};

const MOTIONS: Array<{ id: MotionPresetId; name: string }> = [
  { id: "fold-breath", name: "Fold Breath" },
  { id: "depth-pulse", name: "Depth Pulse" },
  { id: "layer-reveal", name: "Layer Reveal" },
  { id: "axis-light-sweep", name: "Axis Light Sweep" },
  { id: "material-scan", name: "Material Scan" },
  { id: "node-flow", name: "Node Flow" },
  { id: "circuit-build", name: "Circuit Build" },
  { id: "orbit-loop", name: "Orbit Loop" },
];

const CAMERA_PRESETS: Array<{ id: StudioState["camera"]["preset"]; name: string }> = [
  { id: "reference-front", name: "Reference Front" },
  { id: "front-perspective", name: "Front Perspective" },
  { id: "three-quarter-left", name: "Three Quarter Left" },
  { id: "three-quarter-right", name: "Three Quarter Right" },
  { id: "low-angle", name: "Low Angle" },
  { id: "high-angle", name: "High Angle" },
  { id: "macro-center", name: "Macro Center" },
  { id: "venue-led-wide", name: "Venue LED Wide" },
];

const OUTPUT_PRESETS: Array<{ name: string; width: number; height: number }> = [
  { name: "Spectral 2048×2048", width: 2048, height: 2048 },
  { name: "Spectral 4096×4096", width: 4096, height: 4096 },
  { name: "Spectral 8192×8192", width: 8192, height: 8192 },
  { name: "Reference 2800×2080", width: 2800, height: 2080 },
  { name: "4K 16:9", width: 3840, height: 2160 },
  { name: "8K 16:9", width: 7680, height: 4320 },
  { name: "Vertical DID", width: 2160, height: 3840 },
  { name: "Social 1:1", width: 2160, height: 2160 },
  { name: "Ultra-wide LED", width: 5760, height: 1080 },
];

const RENDERER_MODES: readonly StudioState["rendererMode"][] = ["reference-3d", "studio-3d", "split-compare"];
const COLOR_FAMILIES: readonly ColorFamily[] = ["grayscale", "red", "green", "blue"];
const EXPRESSION_LEVELS: readonly ExpressionLevel[] = ["level-1-restrained", "level-2-balanced", "level-3-active"];
const LAYER_PRESETS: readonly StudioState["layers"]["preset"][] = ["single-surface", "double-lamina", "glass-stack", "technical-sandwich", "offset-wireframe", "data-overlay", "depth-array"];
const SPECTRAL_NUMBER_CONTROLS: Record<string, keyof SpectralSettings> = {
  "spectral-bevel-width": "bevelWidth", "spectral-bevel-segments": "bevelSegments", "spectral-bevel-curvature": "bevelCurvature",
  "spectral-edge-roughness": "edgeRoughness", "spectral-edge-boost": "edgeOpticalBoost", "spectral-surface-warp": "surfaceWarp",
  "spectral-fracture": "fractureStrength", "spectral-micro-detail": "microDetail", "spectral-thickness-variation": "thicknessVariation",
  "spectral-edge-thickness": "edgeThickness", "spectral-center-thickness": "centerThickness", "spectral-volume-scale": "volumeScale",
  "spectral-bulge": "bulge", "spectral-curvature": "curvature", "spectral-tension": "tension", "spectral-pinch": "centerPinch",
  "spectral-center-depth": "centerDepth", "spectral-saddle": "saddleStrength", "spectral-edge-lock": "edgeLockWidth",
  "spectral-intensity": "spectralIntensity", "spectral-width": "spectralWidth", "spectral-softness": "bandSoftness",
  "spectral-compression": "bandCompression", "spectral-dispersion": "dispersion", "spectral-iridescence": "iridescence",
  "spectral-fresnel": "fresnelPower", "spectral-roughness": "roughness", "spectral-transmission": "transmission",
  "spectral-thickness": "thickness", "spectral-ior": "ior", "spectral-warm-card": "warmCard", "spectral-cool-card": "coolCard",
  "spectral-film-min": "filmThicknessMin", "spectral-film-max": "filmThicknessMax", "spectral-film-noise": "filmThicknessNoise",
  "spectral-iridescence-ior": "iridescenceIOR", "spectral-attenuation": "attenuationDistance", "spectral-density": "internalDensity",
  "spectral-absorption": "absorptionStrength", "spectral-imperfection": "imperfectionAmount", "spectral-scratch-scale": "scratchScale",
  "spectral-scratch-density": "scratchDensity", "spectral-waviness": "surfaceWaviness", "spectral-caustic-intensity": "causticIntensity",
  "spectral-center-accent": "centerAccent", "spectral-bloom": "bloom", "spectral-haze": "haze", "spectral-exposure": "exposure",
  "spectral-grain": "grain", "spectral-breath": "breath", "spectral-flow": "flowSpeed", "spectral-center-pulse": "centerPulse",
};
const SPECTRAL_GEOMETRY_CONTROLS = new Set(["spectral-bulge", "spectral-curvature", "spectral-tension", "spectral-pinch", "spectral-center-depth", "spectral-saddle", "spectral-edge-lock", "spectral-bevel-width", "spectral-bevel-segments", "spectral-bevel-curvature", "spectral-surface-warp", "spectral-fracture", "spectral-micro-detail"]);

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function numberOr(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function hydrateState(value: unknown): StudioState | null {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 2) return null;
  const parsed = value as Partial<StudioState>;
  const state: StudioState = {
    ...cloneState(DEFAULT_STATE), ...parsed,
    anchor: { ...DEFAULT_STATE.anchor, ...parsed.anchor },
    structure: { ...DEFAULT_STATE.structure, ...parsed.structure },
    fold: { centerZ: parsed.fold?.centerZ ?? DEFAULT_STATE.fold.centerZ, rayDepth: { ...DEFAULT_STATE.fold.rayDepth, ...parsed.fold?.rayDepth } },
    layers: { ...DEFAULT_STATE.layers, ...parsed.layers },
    elements: { ...DEFAULT_STATE.elements, ...parsed.elements },
    motion: { ...DEFAULT_STATE.motion, ...parsed.motion, playing: false },
    camera: { ...DEFAULT_STATE.camera, ...parsed.camera },
    lighting: { ...DEFAULT_STATE.lighting, ...parsed.lighting },
    output: { ...DEFAULT_STATE.output, ...parsed.output },
    spectral: { ...DEFAULT_STATE.spectral, ...parsed.spectral },
  };

  state.variationId = enumOr(state.variationId, Object.keys(VARIATION_TO_DEFINITION) as AxisVariationId[], DEFAULT_STATE.variationId);
  state.axisFamily = state.variationId.startsWith("30") ? "30deg" : "45deg";
  state.rendererMode = enumOr(state.rendererMode, RENDERER_MODES, DEFAULT_STATE.rendererMode);
  state.colorFamily = enumOr(state.colorFamily, COLOR_FAMILIES, DEFAULT_STATE.colorFamily);
  state.materialPreset = enumOr(state.materialPreset, MATERIAL_PRESETS.map((item) => item.id), DEFAULT_STATE.materialPreset);
  state.expressionLevel = enumOr(state.expressionLevel, EXPRESSION_LEVELS, DEFAULT_STATE.expressionLevel);
  state.expressionDirection = enumOr(state.expressionDirection, ["indirect", "direct"], DEFAULT_STATE.expressionDirection);
  state.structure.mode = enumOr(state.structure.mode, ["folded-surface", "joined-hexahedra", "corner-cubes", "crystal-cluster"], DEFAULT_STATE.structure.mode);
  state.structure.depth = numberOr(state.structure.depth, DEFAULT_STATE.structure.depth, 0.04, 1.5);
  state.structure.cubeScale = numberOr(state.structure.cubeScale, DEFAULT_STATE.structure.cubeScale, 0.18, 0.72);
  state.anchor.gridX = Math.round(numberOr(state.anchor.gridX, DEFAULT_STATE.anchor.gridX, 0, 20));
  state.anchor.gridY = Math.round(numberOr(state.anchor.gridY, DEFAULT_STATE.anchor.gridY, 0, 20));
  state.fold.centerZ = numberOr(state.fold.centerZ, DEFAULT_STATE.fold.centerZ, -2, 2);
  state.fold.rayDepth = Object.fromEntries(Object.entries(state.fold.rayDepth).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
  state.layers.preset = enumOr(state.layers.preset, LAYER_PRESETS, DEFAULT_STATE.layers.preset);
  state.layers.enabled = booleanOr(state.layers.enabled, DEFAULT_STATE.layers.enabled);
  state.layers.count = Math.round(numberOr(state.layers.count, DEFAULT_STATE.layers.count, 1, 8));
  state.layers.spacing = numberOr(state.layers.spacing, DEFAULT_STATE.layers.spacing, 0.01, 0.35);
  state.layers.opacity = numberOr(state.layers.opacity, DEFAULT_STATE.layers.opacity, 0, 1);
  state.elements.grid = booleanOr(state.elements.grid, DEFAULT_STATE.elements.grid);
  state.elements.nodes = booleanOr(state.elements.nodes, DEFAULT_STATE.elements.nodes);
  state.elements.connections = booleanOr(state.elements.connections, DEFAULT_STATE.elements.connections);
  state.elements.circuit = booleanOr(state.elements.circuit, DEFAULT_STATE.elements.circuit);
  state.elements.orbit = booleanOr(state.elements.orbit, DEFAULT_STATE.elements.orbit);
  state.elements.arrows = booleanOr(state.elements.arrows, DEFAULT_STATE.elements.arrows);
  state.elements.density = numberOr(state.elements.density, DEFAULT_STATE.elements.density, 0, 1);
  state.elements.opacity = numberOr(state.elements.opacity, DEFAULT_STATE.elements.opacity, 0, 1);
  state.motion.preset = enumOr(state.motion.preset, MOTIONS.map((item) => item.id), DEFAULT_STATE.motion.preset);
  state.motion.time = numberOr(state.motion.time, DEFAULT_STATE.motion.time, 0, 86400);
  state.motion.duration = numberOr(state.motion.duration, DEFAULT_STATE.motion.duration, 0.001, 86400);
  state.motion.speed = numberOr(state.motion.speed, DEFAULT_STATE.motion.speed, 0, 16);
  state.motion.loop = booleanOr(state.motion.loop, DEFAULT_STATE.motion.loop);
  state.motion.intensity = numberOr(state.motion.intensity, DEFAULT_STATE.motion.intensity, 0, 1);
  state.camera.mode = enumOr(state.camera.mode, ["reference-orthographic", "perspective-exploration"], DEFAULT_STATE.camera.mode);
  state.camera.preset = enumOr(state.camera.preset, CAMERA_PRESETS.map((item) => item.id), DEFAULT_STATE.camera.preset);
  state.camera.parallax = booleanOr(state.camera.parallax, DEFAULT_STATE.camera.parallax);
  state.camera.fov = numberOr(state.camera.fov, DEFAULT_STATE.camera.fov, 10, 120);
  state.lighting.keyAngle = numberOr(state.lighting.keyAngle, DEFAULT_STATE.lighting.keyAngle, -180, 180);
  state.lighting.keyHeight = numberOr(state.lighting.keyHeight, DEFAULT_STATE.lighting.keyHeight, -12, 12);
  state.lighting.keyIntensity = numberOr(state.lighting.keyIntensity, DEFAULT_STATE.lighting.keyIntensity, 0, 16);
  state.lighting.fillIntensity = numberOr(state.lighting.fillIntensity, DEFAULT_STATE.lighting.fillIntensity, 0, 8);
  state.lighting.environmentIntensity = numberOr(state.lighting.environmentIntensity, DEFAULT_STATE.lighting.environmentIntensity, 0, 8);
  state.lighting.exposure = numberOr(state.lighting.exposure, DEFAULT_STATE.lighting.exposure, 0, 8);
  state.output.width = Math.round(numberOr(state.output.width, DEFAULT_STATE.output.width, 64, 16384));
  state.output.height = Math.round(numberOr(state.output.height, DEFAULT_STATE.output.height, 64, 16384));
  state.output.format = enumOr(state.output.format, ["png", "jpeg", "webp", "exr"], DEFAULT_STATE.output.format);
  state.output.supersampling = state.output.supersampling === 2 ? 2 : 1;
  state.output.quality = enumOr(state.output.quality, ["draft", "balanced", "high", "final"], DEFAULT_STATE.output.quality);
  state.output.transparent = booleanOr(state.output.transparent, DEFAULT_STATE.output.transparent);
  state.spectral.enabled = booleanOr(state.spectral.enabled, DEFAULT_STATE.spectral.enabled);
  state.spectral.preset = enumOr(state.spectral.preset, SPECTRAL_PRESETS.map((item) => item.id), DEFAULT_STATE.spectral.preset);
  state.spectral.surfaceMode = enumOr(state.spectral.surfaceMode, ["flat", "soft-curved", "inflated", "pinched", "membrane"], DEFAULT_STATE.spectral.surfaceMode);
  state.spectral.opticalMode = enumOr(state.spectral.opticalMode, ["projected-caustic", "thin-film", "dispersive-refraction", "hybrid"], DEFAULT_STATE.spectral.opticalMode);
  state.spectral.colorMode = enumOr(state.spectral.colorMode, ["pleos-tone-on-tone", "full-spectrum-experimental"], DEFAULT_STATE.spectral.colorMode);
  state.spectral.quality = enumOr(state.spectral.quality, ["draft", "balanced", "high", "ultra", "final"], DEFAULT_STATE.spectral.quality);
  state.spectral.geometryMode = enumOr(state.spectral.geometryMode, ["surface", "optical-solid"], DEFAULT_STATE.spectral.geometryMode);
  state.spectral.spectralSamples = ([3, 5, 7, 9] as const).includes(state.spectral.spectralSamples) ? state.spectral.spectralSamples : DEFAULT_STATE.spectral.spectralSamples;
  state.spectral.finalSamples = ([64, 128, 256] as const).includes(state.spectral.finalSamples) ? state.spectral.finalSamples : DEFAULT_STATE.spectral.finalSamples;
  state.spectral.comparison = enumOr(state.spectral.comparison, ["render", "reference", "split", "overlay", "difference", "luminance-difference"], DEFAULT_STATE.spectral.comparison);
  state.spectral.referenceOpacity = numberOr(state.spectral.referenceOpacity, DEFAULT_STATE.spectral.referenceOpacity, 0, 1);
  state.showGrid = booleanOr(state.showGrid, DEFAULT_STATE.showGrid);
  state.showAxisGuide = booleanOr(state.showAxisGuide, DEFAULT_STATE.showAxisGuide);
  state.showWireframe = booleanOr(state.showWireframe, DEFAULT_STATE.showWireframe);
  state.seed = Math.round(numberOr(state.seed, DEFAULT_STATE.seed, 0, 0xffffffff));
  state.selectedFace = typeof state.selectedFace === "number" && Number.isInteger(state.selectedFace) && state.selectedFace >= 0 ? state.selectedFace : null;
  return state;
}

function loadState(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(DEFAULT_STATE);
    return hydrateState(JSON.parse(raw)) ?? cloneState(DEFAULT_STATE);
  } catch {
    return cloneState(DEFAULT_STATE);
  }
}

function selected(value: string, current: string): string { return value === current ? " selected" : ""; }
function checked(value: boolean): string { return value ? " checked" : ""; }

function renderTemplate(state: StudioState): string {
  return `
    <div class="studio-shell" data-ui-hidden="false">
      <header class="topbar">
        <div class="brand-lockup" aria-label="Pleos 27 Axis Studio">
          <span class="brand-mark">PLEOS</span>
          <span class="brand-divider"></span>
          <span class="brand-product">27 AXIS SYSTEM <em>02</em></span>
        </div>
        <div class="toolbar-group mode-switch" aria-label="Renderer mode">
          <button data-mode="reference-3d">Reference</button>
          <button data-mode="studio-3d">Studio</button>
          <button data-mode="split-compare">Split</button>
        </div>
        <div class="toolbar-group family-switch" aria-label="Axis family">
          <button data-family="30deg">30°</button>
          <button data-family="45deg">45°</button>
        </div>
        <div class="toolbar-group expression-switch" aria-label="Expression level">
          <button data-level="level-1-restrained">L1</button>
          <button data-level="level-2-balanced">L2</button>
          <button data-level="level-3-active">L3</button>
        </div>
        <div class="toolbar-spacer"></div>
        <button class="icon-button" data-action="undo" title="Undo">↶</button>
        <button class="icon-button" data-action="redo" title="Redo">↷</button>
        <button class="toolbar-button" data-action="save">Save preset</button>
        <button class="toolbar-button primary" data-action="export">Export still</button>
      </header>

      <aside class="panel left-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">PLEOS 27</span><h1>Axis explorations</h1></div>
          <span class="system-dot" title="Renderer active"></span>
        </div>
        <div class="panel-scroll">
          <section class="panel-section scene-section">
            <div class="section-title"><span>01</span><h2>Exploration presets</h2></div>
            <div class="scene-list">
              ${EXPLORATION_PRESETS.map((preset) => `<button class="scene-card" data-preset="${preset.id}"><span class="scene-index">L${preset.level}</span><span><strong>27 / ${preset.name}</strong><small>${preset.description}</small></span></button>`).join("")}
            </div>
          </section>

          <section class="panel-section">
            <div class="section-title"><span>02</span><h2>Axis definition</h2></div>
            <label class="field"><span>Approved variation</span><select data-control="variation">
              ${variationOptions(state.axisFamily, state.variationId)}
            </select></label>
            <label class="field"><span>Grid anchor</span><select data-control="anchor-preset">
              <option value="center">Center</option><option value="center-right">Center right</option><option value="left">Left</option><option value="up">Up</option><option value="down">Down</option><option value="custom">Custom intersection</option>
            </select></label>
            <div class="coordinate-row">
              <label><span>X / 20</span><input data-control="grid-x" type="number" min="0" max="20" step="1" value="${state.anchor.gridX}"></label>
              <label><span>Y / 20</span><input data-control="grid-y" type="number" min="0" max="20" step="1" value="${state.anchor.gridY}"></label>
            </div>
            <div class="cut-grid">${STATIC_CUTS.map((cut) => `<button data-cut="${cut.id}">${cut.name.replace("Cut ", "")}</button>`).join("")}</div>
          </section>

          <section class="panel-section">
            <div class="section-title"><span>03</span><h2>Saved variations</h2></div>
            <div class="variation-slots">${["A", "B", "C", "D"].map((slot) => `<button data-slot="${slot}"><span>${slot}</span><small>Empty</small></button>`).join("")}</div>
          </section>
        </div>
      </aside>

      <main class="stage" id="axis-stage">
        <canvas id="axis-canvas" aria-label="Pleos Axis 3D canvas"></canvas>
        <img class="spectral-reference" src="/reference/soft-spectral-caustic.png" alt="" aria-hidden="true">
        <div class="stage-meta top-left"><span id="stage-mode">STUDIO 3D</span><span id="stage-definition">30° BASIC / 10·10</span></div>
        <div class="stage-meta top-right"><span>STRICT AXIS DNA</span><span id="stage-material">REFERENCE MATTE</span></div>
        <div class="stage-footer"><span id="stage-frame">35:26 REFERENCE FRAME</span><span id="stage-face">NO FACE SELECTED</span></div>
        <div class="split-divider" hidden><span></span></div>
      </main>

      <aside class="panel inspector">
        <div class="inspector-tabs" role="tablist">
          <button data-tab="surface" class="active">Surface</button>
          <button data-tab="spectral">Spectral</button>
          <button data-tab="system">System</button>
          <button data-tab="output">Output</button>
          <button data-tab="compliance">Rules</button>
        </div>
        <div class="panel-scroll inspector-scroll">
          <div class="inspector-pane active" data-pane="surface">
            <section class="inspector-section structural-section">
              <div class="section-label"><span>Axis construction</span><small>Edge, not line</small></div>
              <label class="field"><span>Structure</span><select data-control="structure-mode"><option value="corner-cubes">Touching corner cubes</option><option value="joined-hexahedra">Joined hexahedra</option><option value="folded-surface">Folded surface</option><option value="crystal-cluster">Optical crystal cluster · exploration</option></select></label>
              <div data-cube-scale-control>${range("structure-cube-scale", "Cube size", state.structure.cubeScale, 0.18, 0.72, 0.01, "")}</div>
              <div data-cell-depth-control>${range("structure-depth", "Body depth", state.structure.depth, 0.04, 1.5, 0.01, "")}</div>
              <p class="micro-copy" data-structure-description>Two optical cubes meet at one exact corner. Their physical edges preserve the approved Axis projection; no line primitive is used.</p>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Material</span><small>Physical surface</small></div>
              <div class="material-grid">${MATERIAL_PRESETS.map((material) => `<button data-material="${material.id}" title="${material.name}"><span class="material-swatch ${material.id}"></span><span>${material.name}</span>${material.compliant ? "" : "<em>EXP</em>"}</button>`).join("")}</div>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Texture input</span><small>Local session only</small></div>
              <div class="texture-upload-grid">
                <article class="texture-upload-card" data-texture-card="baseColor">
                  <div><strong>Base color</strong><small data-texture-name="baseColor">Built-in procedural</small></div>
                  <div class="texture-upload-actions">
                    <label class="texture-upload-action"><input data-texture-upload="baseColor" type="file" accept="image/png,image/jpeg,image/webp,image/avif"><span>Choose image</span></label>
                    <button data-texture-remove="baseColor" type="button" disabled>Remove</button>
                  </div>
                </article>
                <article class="texture-upload-card" data-texture-card="normal">
                  <div><strong>Normal map</strong><small data-texture-name="normal">Built-in procedural</small></div>
                  <div class="texture-upload-actions">
                    <label class="texture-upload-action"><input data-texture-upload="normal" type="file" accept="image/png,image/jpeg,image/webp,image/avif"><span>Choose image</span></label>
                    <button data-texture-remove="normal" type="button" disabled>Remove</button>
                  </div>
                </article>
              </div>
              <p class="micro-copy texture-upload-note">Images are decoded locally. Base color is reduced to luminance, then tinted by the selected Pleos tone-on-tone family.</p>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Color DNA</span><small>Tone-on-tone only</small></div>
              <div class="color-family-grid">
                ${(["grayscale", "red", "green", "blue"] as ColorFamily[]).map((family) => `<button data-color-family="${family}"><i class="color-chip ${family}"></i><span>${family}</span></button>`).join("")}
              </div>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Lighting</span><small>Neutral environment</small></div>
              ${range("key-angle", "Key direction", state.lighting.keyAngle, -180, 180, 1, "°")}
              ${range("key-intensity", "Key intensity", state.lighting.keyIntensity, 0, 8, 0.05, "")}
              ${range("fill-intensity", "Fill intensity", state.lighting.fillIntensity, 0, 3, 0.02, "")}
              ${range("environment", "Environment", state.lighting.environmentIntensity, 0, 2, 0.02, "")}
            </section>
          </div>

          <div class="inspector-pane" data-pane="spectral">
            <section class="inspector-section spectral-hero">
              <div class="section-label"><span>Spectral caustic</span><small>World-space optical pass</small></div>
              ${toggle("spectral-enabled", "Enable optical surface", state.spectral.enabled)}
              <div class="spectral-preset-list">
                ${SPECTRAL_PRESETS.map((preset) => `<button data-spectral-preset="${preset.id}"><strong>${preset.name}</strong><small>${preset.description}</small>${preset.experimental ? "<em>EXP</em>" : "<em>BRAND</em>"}</button>`).join("")}
              </div>
            </section>
            <section class="inspector-section" data-curved-surface-controls>
              <div class="section-label"><span>Curved surface</span><small>Axis projection locked</small></div>
              <label class="field"><span>Surface mode</span><select data-control="spectral-surface-mode"><option value="flat">Flat</option><option value="soft-curved">Soft Curved</option><option value="inflated">Inflated</option><option value="pinched">Pinched</option><option value="membrane">Membrane</option></select></label>
              ${range("spectral-bulge", "Bulge", state.spectral.bulge, 0, 0.75, 0.01, "")}
              ${range("spectral-curvature", "Curvature", state.spectral.curvature, 0, 1, 0.01, "")}
              ${range("spectral-tension", "Surface tension", state.spectral.tension, 0, 1, 0.01, "")}
              ${range("spectral-pinch", "Center pinch", state.spectral.centerPinch, 0, 1, 0.01, "")}
              ${range("spectral-center-depth", "Center depth", state.spectral.centerDepth, 0, 0.6, 0.01, "")}
              ${range("spectral-saddle", "Saddle strength", state.spectral.saddleStrength, 0, 0.45, 0.01, "")}
              ${range("spectral-edge-lock", "Edge lock", state.spectral.edgeLockWidth, 0.02, 0.2, 0.005, "")}
              <label class="field"><span>Subdivision quality</span><select data-control="spectral-quality"><option value="draft">Draft</option><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option><option value="final">Final</option></select></label>
            </section>
            <section class="inspector-section" data-solid-spectral-note hidden>
              <div class="section-label"><span>Optical solid</span><small>Closed volume · Axis locked</small></div>
              <label class="field"><span>Geometry</span><select data-control="spectral-geometry-mode"><option value="optical-solid">Optical solid</option><option value="surface">Planar surface</option></select></label>
              ${range("spectral-bevel-width", "Bevel width", state.spectral.bevelWidth, 0, 0.12, 0.002, "")}
              ${range("spectral-bevel-segments", "Bevel segments", state.spectral.bevelSegments, 1, 12, 1, "")}
              ${range("spectral-bevel-curvature", "Bevel curvature", state.spectral.bevelCurvature, 0, 1, 0.01, "")}
              ${range("spectral-surface-warp", "Large-scale warp", state.spectral.surfaceWarp, 0, 0.3, 0.005, "")}
              ${range("spectral-fracture", "Fracture ridge", state.spectral.fractureStrength, 0, 0.3, 0.005, "")}
              ${range("spectral-micro-detail", "Micro detail", state.spectral.microDetail, 0, 0.12, 0.002, "")}
              ${range("spectral-edge-roughness", "Edge roughness", state.spectral.edgeRoughness, 0.02, 0.7, 0.01, "")}
              ${range("spectral-edge-boost", "Edge optical boost", state.spectral.edgeOpticalBoost, 0, 2.5, 0.01, "")}
              <label class="field"><span>Preview quality</span><select data-control="spectral-quality"><option value="draft">Draft</option><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option><option value="final">Final</option></select></label>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Optical field</span><small>Curvature + light reactive</small></div>
              <label class="field"><span>Optical mode</span><select data-control="spectral-optical-mode"><option value="projected-caustic">Projected Caustic</option><option value="thin-film">Thin Film</option><option value="dispersive-refraction">Dispersive Refraction</option><option value="hybrid">Hybrid</option></select></label>
              ${range("spectral-intensity", "Spectral intensity", state.spectral.spectralIntensity, 0, 2.5, 0.01, "")}
              ${range("spectral-width", "Band width", state.spectral.spectralWidth, 0.05, 0.5, 0.005, "")}
              ${range("spectral-softness", "Band softness", state.spectral.bandSoftness, 0, 1, 0.01, "")}
              ${range("spectral-compression", "Band compression", state.spectral.bandCompression, 0.4, 2.5, 0.01, "")}
              ${range("spectral-dispersion", "Dispersion", state.spectral.dispersion, 0, 0.6, 0.01, "")}
              ${range("spectral-iridescence", "Iridescence", state.spectral.iridescence, 0, 1, 0.01, "")}
              ${range("spectral-fresnel", "Fresnel", state.spectral.fresnelPower, 1, 8, 0.1, "")}
              ${range("spectral-roughness", "Micro roughness", state.spectral.roughness, 0.04, 0.65, 0.01, "")}
              ${range("spectral-transmission", "Transmission", state.spectral.transmission, 0, 1, 0.01, "")}
              ${range("spectral-thickness", "Optical thickness", state.spectral.thickness, 0.05, 1.5, 0.01, "")}
              ${range("spectral-ior", "Index of refraction", state.spectral.ior, 1.01, 2.2, 0.01, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Volume & film</span><small>Path length · thin-film optics</small></div>
              <label class="field"><span>Spectral samples</span><select data-control="spectral-samples"><option value="3">3</option><option value="5">5</option><option value="7">7</option><option value="9">9</option></select></label>
              ${range("spectral-thickness-variation", "Thickness variation", state.spectral.thicknessVariation, 0, 1, 0.01, "")}
              ${range("spectral-edge-thickness", "Edge thickness", state.spectral.edgeThickness, 0, 2, 0.01, "")}
              ${range("spectral-center-thickness", "Center thickness", state.spectral.centerThickness, 0, 2, 0.01, "")}
              ${range("spectral-volume-scale", "Volume scale", state.spectral.volumeScale, 0.1, 3, 0.01, "")}
              ${range("spectral-attenuation", "Attenuation distance", state.spectral.attenuationDistance, 0.05, 5, 0.01, "")}
              ${range("spectral-density", "Internal density", state.spectral.internalDensity, 0, 3, 0.01, "")}
              ${range("spectral-absorption", "Absorption", state.spectral.absorptionStrength, 0, 3, 0.01, "")}
              ${range("spectral-iridescence-ior", "Film IOR", state.spectral.iridescenceIOR, 1.01, 2.5, 0.01, "")}
              ${range("spectral-film-min", "Film min (nm)", state.spectral.filmThicknessMin, 80, 900, 1, "")}
              ${range("spectral-film-max", "Film max (nm)", state.spectral.filmThicknessMax, 80, 1200, 1, "")}
              ${range("spectral-film-noise", "Film variation", state.spectral.filmThicknessNoise, 0, 1, 0.01, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Imperfection</span><small>Subtle optical breakup</small></div>
              ${range("spectral-imperfection", "Imperfection amount", state.spectral.imperfectionAmount, 0, 0.5, 0.005, "")}
              ${range("spectral-scratch-scale", "Scratch scale", state.spectral.scratchScale, 1, 180, 1, "")}
              ${range("spectral-scratch-density", "Scratch density", state.spectral.scratchDensity, 0, 1, 0.01, "")}
              ${range("spectral-waviness", "Surface waviness", state.spectral.surfaceWaviness, 0, 1, 0.01, "")}
              ${range("spectral-caustic-intensity", "Caustic intensity", state.spectral.causticIntensity, 0, 3, 0.01, "")}
              <label class="field"><span>Final accumulation</span><select data-control="spectral-final-samples"><option value="64">64 samples</option><option value="128">128 samples</option><option value="256">256 samples</option></select></label>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Light & post</span><small>Restrained HDR roll-off</small></div>
              ${range("spectral-warm-card", "Warm card", state.spectral.warmCard, 0, 2.5, 0.01, "")}
              ${range("spectral-cool-card", "Cool card", state.spectral.coolCard, 0, 2.5, 0.01, "")}
              ${range("spectral-center-accent", "Center accent", state.spectral.centerAccent, 0, 2, 0.01, "")}
              ${range("spectral-bloom", "Selective bloom", state.spectral.bloom, 0, 0.5, 0.005, "")}
              ${range("spectral-haze", "Haze", state.spectral.haze, 0, 0.3, 0.005, "")}
              ${range("spectral-exposure", "Exposure", state.spectral.exposure, 0.25, 2.5, 0.01, "")}
              ${range("spectral-grain", "Fine grain", state.spectral.grain, 0, 0.05, 0.001, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Slow loop</span><small>Deterministic</small></div>
              ${range("spectral-breath", "Surface breath", state.spectral.breath, 0, 0.5, 0.01, "")}
              ${range("spectral-flow", "Spectral flow", state.spectral.flowSpeed, 0, 0.5, 0.01, "")}
              ${range("spectral-center-pulse", "Center pulse", state.spectral.centerPulse, 0, 0.3, 0.01, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Reference compare</span><small>Debug only · never exported</small></div>
              <label class="field"><span>Comparison mode</span><select data-control="spectral-comparison"><option value="render">Render</option><option value="reference">Reference</option><option value="split">Split</option><option value="overlay">Opacity Overlay</option><option value="difference">Difference</option><option value="luminance-difference">Luminance Difference</option></select></label>
              ${range("spectral-reference-opacity", "Reference opacity", state.spectral.referenceOpacity, 0, 1, 0.01, "")}
              <p class="micro-copy">The reference exists only as an editor layer. Still and motion exports always render procedural geometry.</p>
            </section>
          </div>

          <div class="inspector-pane" data-pane="system">
            <section class="inspector-section">
              <div class="section-label"><span>Layer system</span><small>Inherits AxisGraph</small></div>
              <label class="switch-row"><span>Enable layers</span><input data-control="layers-enabled" type="checkbox"${checked(state.layers.enabled)}><i></i></label>
              <label class="field"><span>Layer preset</span><select data-control="layer-preset">
                <option value="single-surface">Single Surface</option><option value="double-lamina">Double Lamina</option><option value="glass-stack">Glass Stack</option><option value="technical-sandwich">Technical Sandwich</option><option value="offset-wireframe">Offset Wireframe</option><option value="data-overlay">Data Overlay</option><option value="depth-array">Depth Array</option>
              </select></label>
              ${range("layer-count", "Count", state.layers.count, 1, 8, 1, "")}
              ${range("layer-spacing", "Depth spacing", state.layers.spacing, 0.01, 0.35, 0.01, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Axis-bound elements</span><small>No generic particles</small></div>
              ${toggle("element-grid", "Grid", state.elements.grid)}
              ${toggle("element-nodes", "Nodes", state.elements.nodes)}
              ${toggle("element-connections", "Connections", state.elements.connections)}
              ${toggle("element-circuit", "Circuit", state.elements.circuit)}
              ${toggle("element-orbit", "Orbit", state.elements.orbit)}
              ${toggle("element-arrows", "Arrows", state.elements.arrows)}
              ${range("element-density", "Density", state.elements.density, 0, 1, 0.01, "")}
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Camera</span><small>Projection constraint</small></div>
              <div class="segmented two"><button data-camera-mode="reference-orthographic">Reference</button><button data-camera-mode="perspective-exploration">Perspective</button></div>
              <label class="field"><span>View preset</span><select data-control="camera-preset">${CAMERA_PRESETS.map((preset) => `<option value="${preset.id}"${selected(preset.id, state.camera.preset)}>${preset.name}</option>`).join("")}</select></label>
              ${toggle("camera-parallax", "Pointer parallax", state.camera.parallax)}
            </section>
            <section class="inspector-section debug-section">
              <div class="section-label"><span>Diagnostics</span><small>Never exported</small></div>
              ${toggle("show-grid", "20 × 20 grid", state.showGrid)}
              ${toggle("show-guides", "Axis guide", state.showAxisGuide)}
              ${toggle("show-wireframe", "Wireframe", state.showWireframe)}
            </section>
          </div>

          <div class="inspector-pane" data-pane="output">
            <section class="inspector-section">
              <div class="section-label"><span>Still master</span><small>Exact offscreen render</small></div>
              <label class="field"><span>Output preset</span><select data-control="output-preset">${OUTPUT_PRESETS.map((preset, index) => `<option value="${index}">${preset.name}</option>`).join("")}</select></label>
              <div class="coordinate-row output-size"><label><span>Width</span><input data-control="output-width" type="number" min="64" max="16384" value="${state.output.width}"></label><label><span>Height</span><input data-control="output-height" type="number" min="64" max="16384" value="${state.output.height}"></label></div>
              <label class="field"><span>Format</span><select data-control="output-format"><option value="png">PNG / sRGB</option><option value="jpeg">JPEG / sRGB</option><option value="webp">WebP / sRGB</option><option value="exr">EXR / Half Float</option></select></label>
              <label class="field"><span>Supersampling</span><select data-control="supersampling"><option value="1">1× Exact</option><option value="2">2× Downsample</option></select></label>
              <button class="wide-action primary" data-action="export">Export current still</button>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>Motion sequence</span><small>Fixed timestep</small></div>
              <p class="micro-copy">Exports 60 deterministic PNG frames at 30fps in a local ZIP. The browser never uploads the frames.</p>
              <button class="wide-action" data-action="export-motion">Export 60-frame preview</button>
            </section>
            <section class="inspector-section">
              <div class="section-label"><span>GPU budget</span><small id="gpu-limit">Detecting...</small></div>
              <div class="metric-grid"><div><span>Working</span><strong id="metric-working">Linear HDR</strong></div><div><span>Output</span><strong id="metric-output">sRGB</strong></div><div><span>Backend</span><strong id="metric-backend">WebGL 2</strong></div><div><span>AA / quality</span><strong id="metric-aa">MSAA</strong></div></div>
            </section>
          </div>

          <div class="inspector-pane" data-pane="compliance">
            <section class="compliance-hero"><div class="compliance-ring"><strong id="compliance-score">100</strong><span>/ 100</span></div><div><span class="eyebrow">LIVE CHECK</span><h3 id="compliance-title">Brand compliant</h3><p>Axis, color, material and projection are checked against the source documents.</p></div></section>
            <div class="compliance-list" id="compliance-list"></div>
            <p class="source-note">Official rules are separated from implementation assumptions. PDF pages are reference-only and are never included in the production canvas.</p>
          </div>
        </div>
      </aside>

      <footer class="timeline">
        <button class="play-button" data-action="play" aria-label="Play motion">▶</button>
        <div class="timeline-readout"><span id="time-readout">00:00.000</span><small>/ ${state.motion.duration.toFixed(1)} SEC</small></div>
        <div class="timeline-track-wrap">
          <input class="timeline-range" data-control="timeline" type="range" min="0" max="${state.motion.duration}" step="0.001" value="${state.motion.time}">
          <div class="cut-markers">${STATIC_CUTS.map((cut) => `<button data-cut="${cut.id}" style="left:${cut.time * 100}%" title="${cut.name}"></button>`).join("")}</div>
          <div class="motion-lane"><span id="motion-lane-label">${MOTIONS.find((item) => item.id === state.motion.preset)?.name}</span></div>
        </div>
        <label class="motion-select"><span>Motion</span><select data-control="motion-preset">${MOTIONS.map((motion) => `<option value="${motion.id}"${selected(motion.id, state.motion.preset)}>${motion.name}</option>`).join("")}</select></label>
        <label class="compact-range"><span>Intensity</span><input data-control="motion-intensity" type="range" min="0" max="1" step="0.01" value="${state.motion.intensity}"></label>
        <div class="status-cluster"><span id="fps-status">-- FPS</span><span id="backend-status">WEBGL 2 FALLBACK</span><span id="compliance-status" class="pass">PASS</span></div>
      </footer>
      <div class="export-progress" hidden><div><span id="export-label">Preparing...</span><button data-action="cancel-export">Cancel</button></div><progress id="export-meter" max="1" value="0"></progress></div>
    </div>
  `;
}

function variationOptions(family: AxisFamily, current: AxisVariationId): string {
  const prefix = family === "30deg" ? "30" : "45";
  return [
    [`${prefix}-basic`, "Basic Form"], [`${prefix}-v1`, "Variation 1"], [`${prefix}-v2`, "Variation 2"], [`${prefix}-v3`, "Variation 3"],
  ].map(([value, label]) => `<option value="${value}"${selected(value, current)}>${prefix}° / ${label}</option>`).join("");
}

function range(id: string, label: string, value: number, min: number, max: number, step: number, unit: string): string {
  return `<label class="range-row"><span>${label}</span><input data-control="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${Number(value).toFixed(step < 0.1 ? 2 : 0)}${unit}</output></label>`;
}

function toggle(id: string, label: string, value: boolean): string {
  return `<label class="switch-row"><span>${label}</span><input data-control="${id}" type="checkbox"${checked(value)}><i></i></label>`;
}

function mergeState(state: StudioState, patch: Partial<StudioState>): StudioState {
  return {
    ...state, ...patch,
    anchor: { ...state.anchor, ...patch.anchor },
    structure: { ...state.structure, ...patch.structure },
    fold: patch.fold ? { centerZ: patch.fold.centerZ ?? state.fold.centerZ, rayDepth: { ...state.fold.rayDepth, ...patch.fold.rayDepth } } : state.fold,
    layers: { ...state.layers, ...patch.layers },
    elements: { ...state.elements, ...patch.elements },
    motion: { ...state.motion, ...patch.motion },
    camera: { ...state.camera, ...patch.camera },
    lighting: { ...state.lighting, ...patch.lighting },
    output: { ...state.output, ...patch.output },
    spectral: { ...state.spectral, ...patch.spectral },
  };
}

function graphAdapter(graph: AxisGraph): AxisGraphLike {
  return {
    origin: graph.origin,
    rays: graph.rays.map((ray) => ({ id: ray.id, angleDeg: ray.angleDeg, direction: ray.direction, endpoint: ray.endpoint })),
    frame: { minX: graph.bounds.left, maxX: graph.bounds.right, minY: graph.bounds.bottom, maxY: graph.bounds.top },
  };
}

export class AppShell {
  private state = loadState();
  private readonly history = new History<StudioState>(this.state);
  private renderer: PleosRenderer;
  private readonly motionEngine = new MotionEngine();
  private readonly exporter: StillExporter;
  private raf = 0;
  private previousTimestamp = performance.now();
  private fpsTimestamp = performance.now();
  private frames = 0;
  private motionFrameDirty = true;
  private compliance: ComplianceReport;
  private savedVariations: Record<string, StudioState> = {};
  private readonly uploadedTextures: Partial<Record<SurfaceTextureSlot, UploadedTextureAsset>> = {};

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = renderTemplate(this.state);
    const canvas = this.require<HTMLCanvasElement>("#axis-canvas");
    const stage = this.require<HTMLElement>("#axis-stage");
    this.renderer = new PleosRenderer(canvas, stage);
    this.exporter = new StillExporter(this.renderer);
    this.savedVariations = this.loadSavedVariations();
    this.buildGraphAndApply();
    this.compliance = evaluateCompliance(this.state, VARIATION_TO_DEFINITION[this.state.variationId]);
    this.bindEvents();
    this.syncUI();
    this.updateSavedSlots();
    this.raf = requestAnimationFrame(this.tick);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("beforeunload", this.dispose, { once: true });
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private bindEvents(): void {
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("change", this.handleChange);
    this.renderer.canvas.addEventListener("axis-face-select", ((event: CustomEvent<number | null>) => {
      this.state.selectedFace = event.detail;
      this.syncStageMeta();
    }) as EventListener);
    this.renderer.canvas.addEventListener("axis-renderer-status", ((event: CustomEvent<string>) => this.setStatus(event.detail)) as EventListener);
    const stage = this.require<HTMLElement>("#axis-stage");
    stage.addEventListener("pointerdown", (event) => {
      if (this.state.rendererMode !== "split-compare") return;
      const rect = stage.getBoundingClientRect();
      const update = (clientX: number): void => {
        const value = (clientX - rect.left) / rect.width;
        this.renderer.setSplit(value);
        const divider = this.require<HTMLElement>(".split-divider");
        divider.style.left = `${Math.max(5, Math.min(95, value * 100))}%`;
      };
      update(event.clientX);
      const move = (moveEvent: PointerEvent): void => update(moveEvent.clientX);
      const up = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  private handleClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!target) return;
    const mode = target.dataset.mode as StudioState["rendererMode"] | undefined;
    if (mode) this.commit({ rendererMode: mode }, false);
    const family = target.dataset.family as AxisFamily | undefined;
    if (family) this.changeFamily(family);
    const level = target.dataset.level as ExpressionLevel | undefined;
    if (level) this.changeExpression(level);
    const presetId = target.dataset.preset;
    if (presetId) this.applyExplorationPreset(presetId);
    const cutId = target.dataset.cut;
    if (cutId) this.applyCut(cutId);
    const material = target.dataset.material as MaterialPresetId | undefined;
    if (material) this.commit({ materialPreset: material }, true);
    const spectralPreset = target.dataset.spectralPreset as SpectralPresetId | undefined;
    if (spectralPreset) {
      this.commit({
        spectral: applySpectralPreset(this.state.spectral, spectralPreset),
        layers: { ...this.state.layers, enabled: false },
        elements: { ...this.state.elements, grid: false, nodes: false, connections: false, circuit: false, orbit: false, arrows: false },
        motion: { ...this.state.motion, preset: "fold-breath", playing: false },
        selectedFace: null,
      }, true);
      this.setStatus(`Applied ${SPECTRAL_PRESETS.find((item) => item.id === spectralPreset)?.name ?? spectralPreset}`);
    }
    const textureRemove = target.dataset.textureRemove as SurfaceTextureSlot | undefined;
    if (textureRemove) this.removeSurfaceTexture(textureRemove);
    const familyColor = target.dataset.colorFamily as ColorFamily | undefined;
    if (familyColor) this.commit({ colorFamily: familyColor }, true);
    const cameraMode = target.dataset.cameraMode as StudioState["camera"]["mode"] | undefined;
    if (cameraMode) this.commit({ camera: { ...this.state.camera, mode: cameraMode, preset: cameraMode === "reference-orthographic" ? "reference-front" : "front-perspective" } }, false);
    const tab = target.dataset.tab;
    if (tab) this.switchTab(tab);
    const slot = target.dataset.slot;
    if (slot) this.handleSlot(slot);
    const action = target.dataset.action;
    if (action === "play") this.commit({ motion: { ...this.state.motion, playing: !this.state.motion.playing } }, false, false);
    if (action === "undo") this.restoreFromHistory(this.history.undo());
    if (action === "redo") this.restoreFromHistory(this.history.redo());
    if (action === "save") this.saveNextVariation();
    if (action === "export") void this.exportStill();
    if (action === "export-motion") void this.exportMotion();
    if (action === "cancel-export") this.exporter.cancel();
  };

  private handleInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const control = input.dataset.control;
    if (!control) return;
    this.updateOutput(input);
    const number = Number(input.value);
    if (control === "key-angle") this.preview({ lighting: { ...this.state.lighting, keyAngle: number } }, false);
    if (control === "key-intensity") this.preview({ lighting: { ...this.state.lighting, keyIntensity: number } }, false);
    if (control === "fill-intensity") this.preview({ lighting: { ...this.state.lighting, fillIntensity: number } }, false);
    if (control === "environment") this.preview({ lighting: { ...this.state.lighting, environmentIntensity: number } }, false);
    if (control === "layer-count") this.preview({ layers: { ...this.state.layers, count: number } }, true);
    if (control === "layer-spacing") this.preview({ layers: { ...this.state.layers, spacing: number } }, true);
    if (control === "element-density") this.preview({ elements: { ...this.state.elements, density: number } }, true);
    if (control === "timeline") this.preview({ motion: { ...this.state.motion, time: number, playing: false } }, false);
    if (control === "motion-intensity") this.preview({ motion: { ...this.state.motion, intensity: number } }, false);
    if (control === "spectral-reference-opacity") this.preview({ spectral: { ...this.state.spectral, referenceOpacity: number } }, false);
    if (control === "structure-depth") this.preview({ structure: { ...this.state.structure, depth: number } }, true);
    if (control === "structure-cube-scale") this.preview({ structure: { ...this.state.structure, cubeScale: number } }, true);
    const spectralKey = SPECTRAL_NUMBER_CONTROLS[control];
    if (spectralKey) {
      const spectral = { ...this.state.spectral, [spectralKey]: number };
      this.preview({ spectral }, SPECTRAL_GEOMETRY_CONTROLS.has(control));
    }
  };

  private handleChange = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input instanceof HTMLInputElement && input.dataset.textureUpload) {
      const textureUpload = input.dataset.textureUpload as SurfaceTextureSlot;
      const file = input.files?.[0];
      if (file) void this.uploadSurfaceTexture(textureUpload, file);
      input.value = "";
      return;
    }
    const control = input.dataset.control;
    if (!control) return;
    const value = input.value;
    const isChecked = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : false;
    if (control === "variation") this.commit({ variationId: value as AxisVariationId }, true);
    if (control === "spectral-enabled") this.commit({ spectral: { ...this.state.spectral, enabled: isChecked } }, true);
    if (control === "spectral-surface-mode") this.commit({ spectral: { ...this.state.spectral, surfaceMode: value as SpectralSettings["surfaceMode"] } }, true);
    if (control === "spectral-geometry-mode") this.commit({ spectral: { ...this.state.spectral, geometryMode: value as SpectralSettings["geometryMode"] } }, true);
    if (control === "spectral-samples") this.commit({ spectral: { ...this.state.spectral, spectralSamples: Number(value) as SpectralSettings["spectralSamples"] } }, false);
    if (control === "spectral-final-samples") this.commit({ spectral: { ...this.state.spectral, finalSamples: Number(value) as SpectralSettings["finalSamples"] } }, false);
    if (control === "spectral-optical-mode") this.commit({ spectral: { ...this.state.spectral, opticalMode: value as SpectralSettings["opticalMode"] } }, false);
    if (control === "spectral-quality") this.commit({ spectral: { ...this.state.spectral, quality: value as SpectralSettings["quality"] } }, true);
    if (control === "spectral-comparison") this.commit({ spectral: { ...this.state.spectral, comparison: value as SpectralSettings["comparison"] } }, false);
    if (control === "structure-mode") this.commit({ structure: { ...this.state.structure, mode: value as StudioState["structure"]["mode"] } }, true);
    if (control === "anchor-preset") this.applyAnchorPreset(value);
    if (control === "grid-x" || control === "grid-y") this.commit({ anchor: { gridX: control === "grid-x" ? Number(value) : this.state.anchor.gridX, gridY: control === "grid-y" ? Number(value) : this.state.anchor.gridY } }, true);
    if (control === "layers-enabled") this.commit({ layers: { ...this.state.layers, enabled: isChecked } }, true);
    if (control === "layer-preset") this.commit({ layers: { ...this.state.layers, preset: value as StudioState["layers"]["preset"], enabled: value !== "single-surface", count: value === "single-surface" ? 1 : Math.max(2, this.state.layers.count) } }, true);
    if (control.startsWith("element-")) {
      const key = control.replace("element-", "") as keyof Pick<StudioState["elements"], "grid" | "nodes" | "connections" | "circuit" | "orbit" | "arrows">;
      this.commit({ elements: { ...this.state.elements, [key]: isChecked } }, true);
    }
    if (control === "camera-preset") this.commit({ camera: { ...this.state.camera, preset: value as StudioState["camera"]["preset"], mode: value === "reference-front" ? "reference-orthographic" : "perspective-exploration" } }, false);
    if (control === "camera-parallax") this.commit({ camera: { ...this.state.camera, parallax: isChecked } }, false);
    if (control === "show-grid") this.commit({ showGrid: isChecked }, false);
    if (control === "show-guides") this.commit({ showAxisGuide: isChecked }, false);
    if (control === "show-wireframe") this.commit({ showWireframe: isChecked }, true);
    if (control === "output-preset") {
      const preset = OUTPUT_PRESETS[Number(value)];
      if (preset) this.commit({ output: { ...this.state.output, width: preset.width, height: preset.height } }, false);
    }
    if (control === "output-width") this.commit({ output: { ...this.state.output, width: Number(value) } }, false);
    if (control === "output-height") this.commit({ output: { ...this.state.output, height: Number(value) } }, false);
    if (control === "output-format") this.commit({ output: { ...this.state.output, format: value as StudioState["output"]["format"] } }, false);
    if (control === "supersampling") this.commit({ output: { ...this.state.output, supersampling: Number(value) as 1 | 2 } }, false);
    if (control === "motion-preset") this.commit({ motion: { ...this.state.motion, preset: value as MotionPresetId } }, false);
    if (["key-angle", "key-intensity", "fill-intensity", "environment", "layer-count", "layer-spacing", "element-density", "timeline", "motion-intensity", "structure-depth", "structure-cube-scale"].includes(control) || SPECTRAL_NUMBER_CONTROLS[control]) this.history.replace(this.state);
  };

  private changeFamily(family: AxisFamily): void {
    const variationId = `${family === "30deg" ? "30" : "45"}-basic` as AxisVariationId;
    this.commit({ axisFamily: family, variationId }, true);
  }

  private changeExpression(level: ExpressionLevel): void {
    const patch: Partial<StudioState> = { expressionLevel: level };
    if (level === "level-1-restrained") {
      patch.camera = { ...this.state.camera, mode: "reference-orthographic", preset: "reference-front", parallax: false };
      patch.layers = { ...this.state.layers, enabled: false, count: 1 };
      patch.elements = { ...this.state.elements, nodes: false, circuit: false, orbit: false, arrows: false, density: 0.2 };
    } else if (level === "level-2-balanced") {
      patch.elements = { ...this.state.elements, density: Math.max(0.42, this.state.elements.density) };
    } else {
      patch.camera = { ...this.state.camera, mode: "perspective-exploration", preset: "three-quarter-left", parallax: true };
      patch.layers = { ...this.state.layers, enabled: true, count: Math.max(3, this.state.layers.count), preset: this.state.layers.preset === "single-surface" ? "depth-array" : this.state.layers.preset };
    }
    this.commit(patch, true);
  }

  private applyExplorationPreset(id: string): void {
    const preset = EXPLORATION_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    this.commit(preset.patch, true);
    this.setStatus(`Applied 27 / ${preset.name}`);
  }

  private applyCut(id: string): void {
    const cut = STATIC_CUTS.find((item) => item.id === id);
    if (!cut) return;
    const perspective = cut.cameraPreset !== "reference-front" && cut.cameraPreset !== "macro-center";
    this.commit({
      anchor: cut.anchor,
      motion: { ...this.state.motion, time: cut.time * this.state.motion.duration, playing: false },
      camera: { ...this.state.camera, preset: cut.cameraPreset, mode: perspective ? "perspective-exploration" : "reference-orthographic" },
    }, true);
    this.setStatus(`${cut.name} bookmark · master motion ${(cut.time * 100).toFixed(0)}%`);
  }

  private applyAnchorPreset(id: string): void {
    const anchors: Record<string, StudioState["anchor"]> = {
      center: { gridX: 10, gridY: 10 }, "center-right": { gridX: 15, gridY: 10 }, left: { gridX: 5, gridY: 10 }, up: { gridX: 10, gridY: 5 }, down: { gridX: 10, gridY: 15 },
    };
    if (anchors[id]) this.commit({ anchor: anchors[id] }, true);
  }

  private buildGraphAndApply(): void {
    const definitionId = VARIATION_TO_DEFINITION[this.state.variationId];
    const definition = getApprovedAxisDefinition(definitionId);
    if (!definition) throw new Error(`Missing approved Axis definition ${definitionId}`);
    const graph = createAxisGraph({ ...definition, anchor: this.state.anchor }, createReferenceFrame(3.5, 2.6), { requireApprovedCombination: true, snapAnchor: true });
    if (this.state.selectedFace !== null && this.state.selectedFace >= graph.rays.length) this.state.selectedFace = null;
    const rayDepth = { ...this.state.fold.rayDepth };
    graph.rays.forEach((ray) => { if (rayDepth[ray.id] === undefined) rayDepth[ray.id] = RAY_DEPTH_BY_ANGLE[ray.angleDeg] ?? 0; });
    this.state.fold = { ...this.state.fold, rayDepth };
    this.renderer.setGraph(graphAdapter(graph), this.state);
  }

  private commit(patch: Partial<StudioState>, rebuild: boolean, record = true): void {
    const next = mergeState(cloneState(this.state), patch);
    this.state = record ? this.history.push(next) : next;
    if (!record) this.history.replace(next);
    this.applyRenderer(rebuild);
    this.motionFrameDirty = this.motionFrameDirty || rebuild || patch.motion !== undefined || patch.fold !== undefined || patch.layers !== undefined || patch.elements !== undefined;
    this.persist();
    this.syncUI();
  }

  private preview(patch: Partial<StudioState>, rebuild: boolean): void {
    this.state = mergeState(this.state, patch);
    this.applyRenderer(rebuild);
    this.motionFrameDirty = this.motionFrameDirty || rebuild || patch.motion !== undefined || patch.fold !== undefined || patch.layers !== undefined || patch.elements !== undefined;
    this.persist();
    this.syncUI();
  }

  private applyRenderer(rebuild: boolean): void {
    if (rebuild || this.state.axisFamily !== (this.state.variationId.startsWith("30") ? "30deg" : "45deg")) {
      this.state.axisFamily = this.state.variationId.startsWith("30") ? "30deg" : "45deg";
      this.buildGraphAndApply();
    } else {
      this.renderer.applyState(this.state, false);
    }
    this.compliance = evaluateCompliance(this.state, VARIATION_TO_DEFINITION[this.state.variationId]);
  }

  private restoreFromHistory(state: StudioState | null): void {
    if (!state) return;
    this.state = state;
    this.buildGraphAndApply();
    this.motionFrameDirty = true;
    this.persist();
    this.syncUI();
  }

  private switchTab(tab: string): void {
    this.root.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    this.root.querySelectorAll<HTMLElement>("[data-pane]").forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === tab));
  }

  private syncUI(): void {
    this.root.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === this.state.rendererMode));
    this.root.querySelectorAll<HTMLElement>("[data-family]").forEach((button) => button.classList.toggle("active", button.dataset.family === this.state.axisFamily));
    this.root.querySelectorAll<HTMLElement>("[data-level]").forEach((button) => button.classList.toggle("active", button.dataset.level === this.state.expressionLevel));
    this.root.querySelectorAll<HTMLElement>("[data-material]").forEach((button) => button.classList.toggle("active", button.dataset.material === this.state.materialPreset));
    this.root.querySelectorAll<HTMLElement>("[data-spectral-preset]").forEach((button) => button.classList.toggle("active", button.dataset.spectralPreset === this.state.spectral.preset && this.state.spectral.enabled));
    this.root.querySelectorAll<HTMLElement>("[data-color-family]").forEach((button) => button.classList.toggle("active", button.dataset.colorFamily === this.state.colorFamily));
    this.root.querySelectorAll<HTMLElement>("[data-camera-mode]").forEach((button) => button.classList.toggle("active", button.dataset.cameraMode === this.state.camera.mode));
    const divider = this.require<HTMLElement>(".split-divider");
    divider.hidden = this.state.rendererMode !== "split-compare";
    this.require<HTMLElement>("[data-action='play']").textContent = this.state.motion.playing ? "❚❚" : "▶";
    const stage = this.require<HTMLElement>("#axis-stage");
    stage.dataset.referenceMode = this.state.spectral.enabled ? this.state.spectral.comparison : "render";
    stage.style.setProperty("--reference-opacity", String(this.state.spectral.referenceOpacity));
    this.syncInputs();
    this.syncUploadedTextureUI();
    this.syncStageMeta();
    this.syncCompliance();
    const inspection = this.renderer.inspect();
    this.require<HTMLElement>("#gpu-limit").textContent = `Max texture ${inspection.gpu.maxTextureSize}px`;
    this.require<HTMLElement>("#metric-output").textContent = inspection.outputBuffer;
    this.require<HTMLElement>("#metric-backend").textContent = inspection.backend;
    this.require<HTMLElement>("#metric-aa").textContent = `${inspection.antialiasing} · ${inspection.quality}`;
  }

  private syncInputs(): void {
    const setValue = (control: string, value: string | number): void => { const element = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-control='${control}']`); if (element) element.value = String(value); };
    const setChecked = (control: string, value: boolean): void => { const element = this.root.querySelector<HTMLInputElement>(`[data-control='${control}']`); if (element) element.checked = value; };
    const variationSelect = this.root.querySelector<HTMLSelectElement>("[data-control='variation']");
    if (variationSelect && !Array.from(variationSelect.options).some((option) => option.value === this.state.variationId)) {
      variationSelect.innerHTML = variationOptions(this.state.axisFamily, this.state.variationId);
    }
    setValue("variation", this.state.variationId);
    const anchorPreset = Object.entries({ center: [10, 10], "center-right": [15, 10], left: [5, 10], up: [10, 5], down: [10, 15] })
      .find(([, point]) => point[0] === this.state.anchor.gridX && point[1] === this.state.anchor.gridY)?.[0] ?? "custom";
    setValue("anchor-preset", anchorPreset); setValue("grid-x", this.state.anchor.gridX); setValue("grid-y", this.state.anchor.gridY);
    setChecked("layers-enabled", this.state.layers.enabled); setValue("layer-preset", this.state.layers.preset); setValue("layer-count", this.state.layers.count); setValue("layer-spacing", this.state.layers.spacing);
    setChecked("element-grid", this.state.elements.grid); setChecked("element-nodes", this.state.elements.nodes); setChecked("element-connections", this.state.elements.connections); setChecked("element-circuit", this.state.elements.circuit); setChecked("element-orbit", this.state.elements.orbit); setChecked("element-arrows", this.state.elements.arrows); setValue("element-density", this.state.elements.density);
    setValue("camera-preset", this.state.camera.preset); setChecked("camera-parallax", this.state.camera.parallax); setChecked("show-grid", this.state.showGrid); setChecked("show-guides", this.state.showAxisGuide); setChecked("show-wireframe", this.state.showWireframe);
    setValue("output-width", this.state.output.width); setValue("output-height", this.state.output.height); setValue("output-format", this.state.output.format); setValue("supersampling", this.state.output.supersampling);
    setValue("motion-preset", this.state.motion.preset); setValue("motion-intensity", this.state.motion.intensity); setValue("timeline", this.state.motion.time);
    setValue("key-angle", this.state.lighting.keyAngle); setValue("key-intensity", this.state.lighting.keyIntensity); setValue("fill-intensity", this.state.lighting.fillIntensity); setValue("environment", this.state.lighting.environmentIntensity);
    setChecked("spectral-enabled", this.state.spectral.enabled); setValue("spectral-surface-mode", this.state.spectral.surfaceMode); setValue("spectral-optical-mode", this.state.spectral.opticalMode); setValue("spectral-quality", this.state.spectral.quality); setValue("spectral-geometry-mode", this.state.spectral.geometryMode); setValue("spectral-samples", this.state.spectral.spectralSamples); setValue("spectral-final-samples", this.state.spectral.finalSamples);
    setValue("structure-mode", this.state.structure.mode); setValue("structure-depth", this.state.structure.depth); setValue("structure-cube-scale", this.state.structure.cubeScale);
    const structureDescriptions: Record<StudioState["structure"]["mode"], string> = {
      "corner-cubes": "Two optical cubes meet at one exact corner. Their physical edges preserve the approved Axis projection; no line primitive is used.",
      "joined-hexahedra": "Each approved Axis sector becomes a closed solid. Shared creases preserve the original Axis silhouette.",
      "folded-surface": "The approved Axis remains a continuous folded surface with screen-space projection preserved.",
      "crystal-cluster": "Exploration only: each Axis ray becomes an independent optical blade, so this mode intentionally changes the master silhouette.",
    };
    this.require<HTMLElement>("[data-structure-description]").textContent = structureDescriptions[this.state.structure.mode];
    const solidStructure = this.state.structure.mode !== "folded-surface";
    this.require<HTMLElement>("[data-curved-surface-controls]").hidden = solidStructure;
    this.require<HTMLElement>("[data-solid-spectral-note]").hidden = !solidStructure;
    this.require<HTMLElement>("[data-cube-scale-control]").hidden = this.state.structure.mode !== "corner-cubes" && this.state.structure.mode !== "crystal-cluster";
    this.require<HTMLElement>("[data-cell-depth-control]").hidden = this.state.structure.mode !== "joined-hexahedra";
    setValue("spectral-comparison", this.state.spectral.comparison); setValue("spectral-reference-opacity", this.state.spectral.referenceOpacity);
    Object.entries(SPECTRAL_NUMBER_CONTROLS).forEach(([control, key]) => setValue(control, this.state.spectral[key] as number));
    this.root.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => this.updateOutput(input));
  }

  private syncStageMeta(): void {
    this.require<HTMLElement>("#stage-mode").textContent = this.state.rendererMode.replace("-", " ").toUpperCase();
    this.require<HTMLElement>("#stage-definition").textContent = `${this.state.axisFamily === "30deg" ? "30°" : "45°"} ${this.state.variationId.split("-").slice(1).join(" ").toUpperCase()} / ${this.state.anchor.gridX}·${this.state.anchor.gridY}`;
    this.require<HTMLElement>("#stage-material").textContent = this.state.spectral.enabled
      ? (SPECTRAL_PRESETS.find((item) => item.id === this.state.spectral.preset)?.name.toUpperCase() ?? "SPECTRAL CAUSTIC")
      : (MATERIAL_PRESETS.find((item) => item.id === this.state.materialPreset)?.name.toUpperCase() ?? "MATERIAL");
    this.require<HTMLElement>("#stage-face").textContent = this.state.selectedFace === null ? "CLICK A FACE TO INSPECT" : `FACE ${this.state.selectedFace + 1} SELECTED`;
    const ms = this.state.motion.time * 1000;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000) % 60;
    const millis = Math.floor(ms % 1000);
    this.require<HTMLElement>("#time-readout").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
    this.require<HTMLElement>("#motion-lane-label").textContent = MOTIONS.find((item) => item.id === this.state.motion.preset)?.name ?? this.state.motion.preset;
  }

  private syncCompliance(): void {
    this.compliance = evaluateCompliance(this.state, VARIATION_TO_DEFINITION[this.state.variationId]);
    this.require<HTMLElement>("#compliance-score").textContent = String(this.compliance.score);
    this.require<HTMLElement>("#compliance-title").textContent = this.compliance.status === "pass" ? "Brand compliant" : this.compliance.status === "warning" ? "Review required" : "Invalid configuration";
    const status = this.require<HTMLElement>("#compliance-status");
    status.textContent = this.compliance.status.toUpperCase();
    status.className = this.compliance.status;
    this.require<HTMLElement>("#compliance-list").innerHTML = this.compliance.checks.map((check) => `<div class="compliance-row ${check.status}"><i></i><span><strong>${check.label}</strong><small>${check.detail}</small></span><em>${check.status}</em></div>`).join("");
  }

  private updateOutput(input: HTMLInputElement): void {
    const output = input.parentElement?.querySelector("output");
    if (!output) return;
    const unit = input.dataset.control === "key-angle" ? "°" : "";
    output.textContent = `${Number(input.value).toFixed(Number(input.step) < 0.1 ? 2 : 0)}${unit}`;
  }

  private async uploadSurfaceTexture(slot: SurfaceTextureSlot, file: File): Promise<void> {
    const card = this.root.querySelector<HTMLElement>(`[data-texture-card='${slot}']`);
    if (card) card.dataset.loading = "true";
    this.setStatus(`Loading ${slot === "baseColor" ? "base color" : "normal map"} texture`);
    try {
      const asset = await this.renderer.uploadSurfaceTexture(slot, file);
      this.uploadedTextures[slot] = asset;
      this.syncUploadedTextureUI();
      this.setStatus(`${slot === "baseColor" ? "Base color" : "Normal map"} · ${asset.width}×${asset.height} · local`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "Texture upload failed");
    } finally {
      if (card) delete card.dataset.loading;
    }
  }

  private removeSurfaceTexture(slot: SurfaceTextureSlot): void {
    this.renderer.removeSurfaceTexture(slot);
    delete this.uploadedTextures[slot];
    this.syncUploadedTextureUI();
    this.setStatus(`${slot === "baseColor" ? "Base color" : "Normal map"} restored to procedural source`);
  }

  private syncUploadedTextureUI(): void {
    (["baseColor", "normal"] as const).forEach((slot) => {
      const asset = this.uploadedTextures[slot];
      const card = this.root.querySelector<HTMLElement>(`[data-texture-card='${slot}']`);
      const name = this.root.querySelector<HTMLElement>(`[data-texture-name='${slot}']`);
      const remove = this.root.querySelector<HTMLButtonElement>(`[data-texture-remove='${slot}']`);
      card?.classList.toggle("active", Boolean(asset));
      if (name) name.textContent = asset ? `${asset.fileName} · ${asset.width}×${asset.height}` : "Built-in procedural";
      if (remove) remove.disabled = !asset;
    });
  }

  private saveNextVariation(): void {
    const slot = ["A", "B", "C", "D"].find((id) => !this.savedVariations[id]) ?? "A";
    this.savedVariations[slot] = cloneState(this.state);
    localStorage.setItem(SAVED_KEY, JSON.stringify(this.savedVariations));
    this.updateSavedSlots();
    this.setStatus(`Saved current system to Variation ${slot}`);
  }

  private handleSlot(slot: string): void {
    const saved = this.savedVariations[slot];
    if (saved) {
      this.commit(saved, true);
      this.setStatus(`Loaded Variation ${slot}`);
    } else {
      this.savedVariations[slot] = cloneState(this.state);
      localStorage.setItem(SAVED_KEY, JSON.stringify(this.savedVariations));
      this.updateSavedSlots();
      this.setStatus(`Saved current system to Variation ${slot}`);
    }
  }

  private updateSavedSlots(): void {
    this.root.querySelectorAll<HTMLElement>("[data-slot]").forEach((button) => {
      const slot = button.dataset.slot ?? "";
      const state = this.savedVariations[slot];
      const label = button.querySelector("small");
      button.classList.toggle("saved", Boolean(state));
      if (label) label.textContent = state ? `${state.axisFamily === "30deg" ? "30°" : "45°"} · ${state.materialPreset.replaceAll("-", " ")}` : "Empty";
    });
  }

  private loadSavedVariations(): Record<string, StudioState> {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, unknown>;
      return Object.fromEntries(["A", "B", "C", "D"].flatMap((slot) => {
        const state = hydrateState(parsed[slot]);
        return state ? [[slot, state]] : [];
      }));
    } catch { return {}; }
  }

  private persist(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.state, motion: { ...this.state.motion, playing: false } })); }

  private async exportStill(): Promise<void> {
    if (this.compliance.status === "fail") { this.setStatus("Brand Final export blocked by compliance errors"); this.switchTab("compliance"); return; }
    this.showExportProgress(true);
    try {
      if (this.motionFrameDirty) this.renderMotionFrame();
      if (this.state.spectral.enabled && this.state.spectral.quality === "final") {
        await this.exporter.exportAccumulatedStill(this.state.output, this.state.spectral.finalSamples, ({ phase, progress }) => this.updateExportProgress(phase, progress));
      } else {
        await this.exporter.exportStill(this.state.output, ({ phase, progress }) => this.updateExportProgress(phase, progress));
      }
      this.setStatus(`Exported ${this.state.output.width}×${this.state.output.height} ${this.state.output.format.toUpperCase()}`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "Export failed");
    } finally { this.showExportProgress(false); }
  }

  private async exportMotion(): Promise<void> {
    const wasPlaying = this.state.motion.playing;
    this.state.motion.playing = false;
    this.syncUI();
    this.showExportProgress(true);
    try {
      await this.exporter.exportMotionSequence({
        width: 960, height: 540, frameRate: 30, frames: 60,
        getTime: () => this.state.motion.time,
        setTime: (time) => { this.state.motion.time = time; },
        renderFrame: () => this.renderMotionFrame(),
      }, ({ phase, progress }) => this.updateExportProgress(phase, progress));
      this.setStatus("Exported deterministic 60-frame PNG sequence");
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "Motion export failed");
    } finally {
      this.state.motion.playing = wasPlaying;
      this.persist();
      this.syncUI();
      this.showExportProgress(false);
    }
  }

  private showExportProgress(show: boolean): void { this.require<HTMLElement>(".export-progress").hidden = !show; }
  private updateExportProgress(label: string, progress: number): void { this.require<HTMLElement>("#export-label").textContent = label; this.require<HTMLProgressElement>("#export-meter").value = progress; }
  private setStatus(message: string): void { this.require<HTMLElement>("#backend-status").textContent = message.toUpperCase(); }

  private renderMotionFrame(): void {
    const frame = this.motionEngine.evaluate(this.state.fold, this.state.motion);
    this.renderer.updateFrame(this.state, frame.fold, frame.layerReveal, frame.sweep, frame.elementTime);
    this.renderer.render();
    this.motionFrameDirty = false;
    this.syncStageMeta();
  }

  private tick = (timestamp: number): void => {
    const delta = Math.min(0.05, (timestamp - this.previousTimestamp) / 1000);
    this.previousTimestamp = timestamp;
    if (this.state.motion.playing && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const next = this.state.motion.time + delta * this.state.motion.speed;
      this.state.motion.time = this.state.motion.loop ? next % this.state.motion.duration : Math.min(this.state.motion.duration, next);
      this.renderMotionFrame();
    } else if (this.motionFrameDirty) {
      this.renderMotionFrame();
    } else {
      this.renderer.render();
    }
    this.frames += 1;
    if (timestamp - this.fpsTimestamp >= 700) {
      const fps = Math.round(this.frames * 1000 / (timestamp - this.fpsTimestamp));
      this.require<HTMLElement>("#fps-status").textContent = `${fps} FPS`;
      this.frames = 0;
      this.fpsTimestamp = timestamp;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab") {
      event.preventDefault();
      const shell = this.require<HTMLElement>(".studio-shell");
      shell.dataset.uiHidden = shell.dataset.uiHidden === "true" ? "false" : "true";
      requestAnimationFrame(() => this.renderer.resize());
    }
    if (event.code === "Space" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
      event.preventDefault();
      this.commit({ motion: { ...this.state.motion, playing: !this.state.motion.playing } }, false, false);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.restoreFromHistory(event.shiftKey ? this.history.redo() : this.history.undo());
    }
  };

  inspect(): object {
    return { state: cloneState(this.state), compliance: this.compliance, renderer: this.renderer.inspect(), definitionId: VARIATION_TO_DEFINITION[this.state.variationId] };
  }

  setPreset(id: string): void { this.applyExplorationPreset(id); }
  setTime(time: number): void { this.preview({ motion: { ...this.state.motion, time, playing: false } }, false); }

  dispose = (): void => {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("input", this.handleInput);
    this.root.removeEventListener("change", this.handleChange);
    this.renderer.dispose();
  };
}
