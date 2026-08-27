import "./CrystalApp.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { DEFAULT_ARTBOARD, type ArtboardPresetId, type ArtboardState } from "../artboard/ArtboardState";
import { CompositionAdapter } from "../artboard/CompositionAdapter";
import { FormatPresetRegistry } from "../artboard/FormatPresetRegistry";
import { MotionClock } from "../motion/MotionClock";
import { MotionEngine } from "../motion/MotionEngine";
import { MotionPresetRegistry } from "../motion/MotionPresetRegistry";
import { AxisConstraintService } from "../motion/constraints/AxisConstraintService";
import { STRENGTH_VALUES, type MotionPatch, type MotionPresetId, type MotionSettings, type MotionStrengthMode } from "../motion/types";
import { CrystalAssembly, type CrystalLook } from "./CrystalAssembly";
import { InspectorPanel, type InspectorTab } from "./InspectorPanel";
import { LightingPanel } from "./LightingPanel";
import { createLightingPreset, LightingSystem, migrateLightingRigToMainCamera, sanitizeLightingState, type LightingState } from "./LightingSystem";
import { PrismMotionAdapter } from "./PrismMotionAdapter";
import { installStudioEnvironment, type PathTracingStudioEnvironment } from "./StudioEnvironment";
import { bindScrubbableNumbers } from "./InspectorScrub";
import { createSpectralFlowState, sanitizeSpectralFlowState, SPECTRAL_FLOW_PRESETS, type SpectralFlowDirection, type SpectralFlowPresetId, type SpectralFlowState } from "./materials/SpectralFlowMaterial";
import { renderMotionParameters } from "./ui/MotionPanel";
import { studioPanelTemplate } from "./ui/StudioPanel";
import { transportTemplate } from "./ui/TransportBar";

interface StudioSettingsV2 {
  version: 2;
  setup: { gap: number; bevelRadius: number; lightingRigVersion: number; viewLocked: boolean };
  look: { preset: CrystalLook; roughness: number; dispersion: number; spectralFlow: SpectralFlowState };
  lighting: LightingState;
  motion: MotionSettings;
  format: ArtboardState;
  export: { ppi: number };
  advanced: { renderScale: number; bounces: number; targetSamples: number; renderRegion: RenderRegion };
  ui: { activeTab: InspectorTab; inspectorCollapsed: boolean; advancedOpen: boolean };
}

type RenderQuality = "fast" | "high";
type RenderRegionKey = "x" | "y" | "width" | "height";

interface RenderRegion {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  unitPpi: number;
}

interface PathRenderJob {
  quality: RenderQuality;
  targetSamples: number;
  download: boolean;
  printScale: number;
  printOutput: boolean;
  width: number;
  height: number;
  resolve?: (value: string) => void;
  reject?: (reason: Error) => void;
}

const STORAGE_V2 = "pleos-27-axis-settings-v2";
const STORAGE_V1 = "pleos-27-axis-settings-v1";
const FAST_RENDER_SAMPLES = 16;
const FAST_RENDER_SCALE = 0.5;
const FAST_RENDER_BOUNCES = 4;
const PRINT_RENDER_SAMPLES = 512;
const PRINT_RENDER_BOUNCES = 12;
const defaultMotion = (): MotionSettings => ({ enabled: false, preset: "spectral-axis-sweep", strengthMode: "balanced", strength: 0.65, duration: 6, fps: 30, speed: 1, seed: 27, loop: true, constraint: "strict", parameters: {} });
const defaults = (): StudioSettingsV2 => ({
  version: 2,
  setup: { gap: 0, bevelRadius: 0.018, lightingRigVersion: 2, viewLocked: true },
  look: { preset: "prism", roughness: 0.04, dispersion: 0.16, spectralFlow: createSpectralFlowState("balanced") },
  lighting: createLightingPreset("pleos-prism"),
  motion: defaultMotion(),
  format: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor } },
  export: { ppi: 300 },
  advanced: { renderScale: 0.75, bounces: 8, targetSamples: 128, renderRegion: { enabled: false, x: -1, y: -1, width: 640, height: 480, unitPpi: 96 } },
  ui: { activeTab: "motion", inspectorCollapsed: false, advancedOpen: false },
});

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

function loadSettingsV2(): StudioSettingsV2 {
  const base = defaults();
  try {
    const v2 = JSON.parse(localStorage.getItem(STORAGE_V2) ?? "null") as Partial<StudioSettingsV2> | null;
    if (v2?.version === 2) {
      let lighting = sanitizeLightingState(v2.lighting);
      const lightingRigVersion = v2.setup?.lightingRigVersion === 2 ? 2 : 1;
      if (lightingRigVersion < 2 && v2.lighting) lighting = migrateLightingRigToMainCamera(lighting);
      return {
        version: 2,
        setup: {
          gap: finite(v2.setup?.gap, base.setup.gap, 0, 0.45),
          bevelRadius: finite(v2.setup?.bevelRadius, base.setup.bevelRadius, 0, 0.15),
          lightingRigVersion: 2,
          viewLocked: v2.setup?.viewLocked !== false,
        },
        look: {
          preset: v2.look?.preset === "clear" || v2.look?.preset === "smoked" || v2.look?.preset === "spectral-flow" ? v2.look.preset : "prism",
          roughness: finite(v2.look?.roughness, base.look.roughness, 0.02, 0.28),
          dispersion: finite(v2.look?.dispersion, base.look.dispersion, 0, 0.35),
          spectralFlow: sanitizeSpectralFlowState(v2.look?.spectralFlow),
        },
        lighting,
        motion: { ...base.motion, ...v2.motion, parameters: { ...v2.motion?.parameters } },
        format: { ...base.format, ...v2.format, axisAnchor: { ...base.format.axisAnchor, ...v2.format?.axisAnchor } },
        export: { ppi: finite(v2.export?.ppi, 300, 36, 1200) },
        advanced: {
          renderScale: finite(v2.advanced?.renderScale, .75, .4, 1),
          bounces: Math.round(finite(v2.advanced?.bounces, 8, 3, 14)),
          targetSamples: Math.round(finite(v2.advanced?.targetSamples, 128, 16, 512)),
          renderRegion: sanitizeRenderRegion(v2.advanced?.renderRegion, base.advanced.renderRegion),
        },
        ui: { activeTab: v2.ui?.activeTab ?? "motion", inspectorCollapsed: v2.ui?.inspectorCollapsed === true, advancedOpen: v2.ui?.advancedOpen === true },
      };
    }
    const v1 = JSON.parse(localStorage.getItem(STORAGE_V1) ?? "null") as Record<string, unknown> | null;
    if (v1) {
      base.setup.gap = finite(v1.gap, 0, 0, .45);
      base.look.preset = v1.look === "clear" || v1.look === "smoked" ? v1.look : "prism";
      base.look.roughness = finite(v1.roughness, .04, .02, .28);
      base.look.dispersion = finite(v1.dispersion, .16, 0, .35);
      base.look.spectralFlow = createSpectralFlowState("balanced");
      if (v1.lighting) base.lighting = migrateLightingRigToMainCamera(sanitizeLightingState(v1.lighting));
      base.advanced.renderScale = finite(v1.scale, .75, .4, 1);
      base.advanced.bounces = Math.round(finite(v1.bounces, 8, 3, 14));
      base.advanced.targetSamples = Math.round(finite(v1.targetSamples, 128, 16, 512));
      const legacyRegion = v1.renderRegion as Partial<RenderRegion> | undefined;
      if (legacyRegion) base.advanced.renderRegion = sanitizeRenderRegion({ ...legacyRegion, enabled: true, unitPpi: finite(v1.unitPpi, 96, 36, 1200) }, base.advanced.renderRegion);
      base.export.ppi = finite(v1.exportPpi, 300, 36, 1200);
      base.ui.inspectorCollapsed = v1.inspectorCollapsed === true;
    }
  } catch { /* defaults remain valid */ }
  return base;
}

function sanitizeRenderRegion(value: Partial<RenderRegion> | undefined, fallback: RenderRegion): RenderRegion {
  return {
    enabled: value?.enabled === true,
    x: Math.round(finite(value?.x, fallback.x, -1, 8192)),
    y: Math.round(finite(value?.y, fallback.y, -1, 8192)),
    width: Math.round(finite(value?.width, fallback.width, 16, 8192)),
    height: Math.round(finite(value?.height, fallback.height, 16, 8192)),
    unitPpi: Math.round(finite(value?.unitPpi, fallback.unitPpi, 36, 1200)),
  };
}

export class MotionStudioApp {
  private readonly settings = loadSettingsV2();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .05, 80);
  private readonly pathCamera = new THREE.OrthographicCamera(-3, 3, 3, -3, .05, 80);
  private readonly assembly = new CrystalAssembly();
  private readonly motionAdapter = new PrismMotionAdapter(this.assembly);
  private readonly motionEngine = new MotionEngine();
  private readonly motionClock = new MotionClock();
  private readonly constraints = new AxisConstraintService();
  private readonly composition = new CompositionAdapter();
  private readonly previewRenderer: THREE.WebGLRenderer;
  private readonly pathRenderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly pathTracer: WebGLPathTracer;
  private readonly previewComposer: EffectComposer;
  private readonly previewBloom: UnrealBloomPass;
  private readonly pathComposer: EffectComposer;
  private readonly pathTexture: TexturePass;
  private readonly pathDenoiseMaterial: DenoiseMaterial;
  private readonly pathDenoise: ShaderPass;
  private readonly pathBloom: UnrealBloomPass;
  private readonly environment: PathTracingStudioEnvironment;
  private readonly lighting: LightingSystem;
  readonly lightingPanel: LightingPanel;
  private readonly inspector: InspectorPanel;
  private readonly artboardShell: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly motionRig = new THREE.Group();
  private readonly motionLights: THREE.PointLight[] = [];
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private saveTimer = 0;
  private renderingHigh = false;
  private renderJob: PathRenderJob | null = null;
  private lastPatch: MotionPatch = {};

  constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = this.template();
    this.artboardShell = this.require(".artboard-shell");
    this.stage = this.require(".crystal-stage");
    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.pathRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    for (const renderer of [this.previewRenderer, this.pathRenderer]) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = this.settings.lighting.globals.exposure;
      renderer.setClearColor(this.settings.format.background, this.settings.format.transparent ? 0 : 1);
    }
    this.previewRenderer.domElement.className = "preview-canvas";
    this.pathRenderer.domElement.className = "pathtrace-canvas";
    this.stage.append(this.previewRenderer.domElement, this.pathRenderer.domElement);
    this.camera.position.set(0, 0, -12);
    this.camera.lookAt(0, .02, 0);
    this.controls = new OrbitControls(this.camera, this.previewRenderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enabled = !this.settings.setup.viewLocked;
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setLook(this.settings.look.preset);
    this.assembly.setRoughness(this.settings.look.roughness);
    this.assembly.setDispersion(this.settings.look.dispersion);
    this.assembly.setGap(this.settings.setup.gap);
    this.assembly.setBevelRadius(this.settings.setup.bevelRadius);
    this.motionAdapter.captureRestPose();
    this.scene.add(this.assembly);
    this.environment = installStudioEnvironment(this.scene);
    this.environment.setIntensity(this.settings.lighting.globals.environmentIntensity);
    this.lighting = new LightingSystem(this.scene, new THREE.Scene(), this.settings.lighting, this.onLightingChange);
    this.createMotionLightRig();
    this.pathCamera.copy(this.camera);
    this.pathTracer = new WebGLPathTracer(this.pathRenderer);
    this.pathTracer.bounces = this.settings.advanced.bounces;
    this.pathTracer.transmissiveBounces = this.settings.advanced.bounces + 4;
    this.pathTracer.renderScale = this.settings.advanced.renderScale;
    this.pathTracer.tiles.set(2, 2);
    this.pathTracer.pausePathTracing = true;
    this.pathTracer.renderToCanvas = false;
    this.pathTracer.setScene(this.scene, this.pathCamera);
    this.previewComposer = new EffectComposer(this.previewRenderer);
    this.previewComposer.addPass(new RenderPass(this.scene, this.camera));
    this.previewBloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.settings.lighting.globals.bloomIntensity, .65, .78);
    this.previewComposer.addPass(this.previewBloom);
    this.previewComposer.addPass(new OutputPass());
    this.pathComposer = new EffectComposer(this.pathRenderer);
    this.pathTexture = new TexturePass(this.pathTracer.target.texture);
    this.pathComposer.addPass(this.pathTexture);
    this.pathDenoiseMaterial = new DenoiseMaterial({ sigma: 4.5, kSigma: 1.25, threshold: .075 });
    this.pathDenoiseMaterial.toneMapped = false;
    this.pathDenoise = new ShaderPass(this.pathDenoiseMaterial, "map");
    this.pathDenoise.enabled = false;
    this.pathComposer.addPass(this.pathDenoise);
    this.pathBloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.settings.lighting.globals.bloomIntensity, .65, .78);
    this.pathComposer.addPass(this.pathBloom);
    this.pathComposer.addPass(new OutputPass());
    this.lightingPanel = new LightingPanel(this.require("[data-lighting-panel]"), this.lighting, () => undefined);
    this.inspector = new InspectorPanel(this.root, this.settings.ui.activeTab, this.settings.ui.inspectorCollapsed, (tab, collapsed) => { this.settings.ui.activeTab = tab; this.settings.ui.inspectorCollapsed = collapsed; this.persist(); this.resize(); });
    this.bindUi();
    bindScrubbableNumbers(this.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
    this.resize();
    this.applyMotionAt(0);
    this.raf = requestAnimationFrame(this.render);
  }

  private template(): string {
    const globals = this.settings.lighting.globals;
    const region = this.settings.advanced.renderRegion;
    return `<section class="crystal-app motion-studio">
      <header class="topbar"><div class="wordmark"><strong>PLEOS AXIS STUDIO</strong><span>Prism 3D · Motion V1</span></div><div class="render-status"><span data-output="samples">Raster preview ready</span></div></header>
      <main class="pasteboard"><div class="artboard-meta"><span data-output="format-name">Square 1:1</span><b data-output="artboard-size">${this.settings.format.width} × ${this.settings.format.height}px</b></div><div class="artboard-shell"><div class="crystal-stage" aria-label="Pleos Axis virtual artboard"><div class="safe-guide" data-safe-guide></div><div class="render-region-guide" data-render-region-guide><span data-output="region-size"></span></div></div></div></main>
      ${studioPanelTemplate({ look: this.settings.look.preset, spectralFlow: this.settings.look.spectralFlow, gap: this.settings.setup.gap, bevelRadius: this.settings.setup.bevelRadius, roughness: this.settings.look.roughness, dispersion: this.settings.look.dispersion, reflection: globals.reflectionStrength, refraction: globals.refractionStrength, exposure: globals.exposure, bloom: globals.bloomIntensity, saturation: globals.colorSaturation, environment: globals.environmentIntensity, motion: this.settings.motion, artboard: this.settings.format, activeTab: this.settings.ui.activeTab, outputSamples: this.settings.advanced.targetSamples, bounces: this.settings.advanced.bounces, renderScale: this.settings.advanced.renderScale, ppi: this.settings.export.ppi, renderRegion: region, printOutput: this.printOutputDescription() })}
      ${transportTemplate()}
    </section>`;
  }

  private createMotionLightRig(): void {
    const colors = [0xffffff, 0x4664ff, 0xfa293c, 0x0adc91];
    colors.forEach((color, index) => {
      const light = new THREE.PointLight(color, 0, 12, 2);
      light.name = `MotionLight${index}`;
      this.motionRig.add(light);
      this.motionLights.push(light);
    });
    this.scene.add(this.motionRig);
  }

  private bindUi(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.addEventListener("click", () => this.setLook(button.dataset.look as CrystalLook)));
    this.bindNumber("gap", (value) => { this.settings.setup.gap = value; this.assembly.setGap(value); this.motionAdapter.captureRestPose(); this.motionClock.pause(); this.applyMotionAt(this.motionClock.time); });
    this.bindNumber("bevel-radius", (value) => { this.settings.setup.bevelRadius = value; this.assembly.setBevelRadius(value); this.motionAdapter.captureRestPose(); this.motionClock.pause(); this.applyMotionAt(this.motionClock.time); });
    this.bindNumber("roughness", (value) => { this.settings.look.roughness = value; this.assembly.setRoughness(value); });
    this.bindNumber("dispersion", (value) => { this.settings.look.dispersion = value; this.assembly.setDispersion(value); });
    this.bindNumber("spectral-flow-position", (value) => this.updateSpectralFlow({ flowPosition: value }));
    this.bindNumber("spectral-flow-speed", (value) => this.updateSpectralFlow({ flowSpeed: value }));
    this.bindNumber("spectral-flow-width", (value) => this.updateSpectralFlow({ flowWidth: value }));
    this.bindNumber("spectral-flow-softness", (value) => this.updateSpectralFlow({ flowSoftness: value }));
    this.bindNumber("spectral-spread", (value) => this.updateSpectralFlow({ spectrumSpread: value }));
    this.bindNumber("spectral-separation", (value) => this.updateSpectralFlow({ spectrumSeparation: value }));
    this.bindNumber("spectral-saturation", (value) => this.updateSpectralFlow({ saturation: value }));
    this.bindNumber("spectral-lag", (value) => this.updateSpectralFlow({ spectralLag: value }));
    this.bindNumber("spectral-core-intensity", (value) => this.updateSpectralFlow({ coreIntensity: value }));
    this.bindNumber("spectral-core-width", (value) => this.updateSpectralFlow({ coreWidth: value }));
    this.bindNumber("spectral-falloff", (value) => this.updateSpectralFlow({ falloff: value }));
    this.bindNumber("spectral-bloom", (value) => this.updateSpectralFlow({ bloom: value }));
    this.bindNumber("spectral-edge-attraction", (value) => this.updateSpectralFlow({ edgeAttraction: value }));
    this.bindNumber("spectral-reflection", (value) => this.updateSpectralFlow({ reflection: value }));
    this.bindNumber("spectral-darkness", (value) => this.updateSpectralFlow({ darkness: value }));
    this.root.querySelectorAll<HTMLButtonElement>("[data-spectral-preset]").forEach((button) => button.addEventListener("click", () => this.setSpectralFlowPreset(button.dataset.spectralPreset as SpectralFlowPresetId)));
    this.require<HTMLSelectElement>("[data-spectral-direction]").addEventListener("change", (event) => this.updateSpectralFlow({ flowDirection: (event.currentTarget as HTMLSelectElement).value as SpectralFlowDirection }));
    this.bindNumber("reflection-strength", (value) => this.lighting.updateGlobal("reflectionStrength", value));
    this.bindNumber("refraction-strength", (value) => this.lighting.updateGlobal("refractionStrength", value));
    this.bindNumber("master-intensity", (value) => this.lighting.updateGlobal("masterIntensity", value));
    this.bindNumber("environment-intensity", (value) => this.lighting.updateGlobal("environmentIntensity", value));
    this.bindNumber("exposure", (value) => this.lighting.updateGlobal("exposure", value));
    this.bindNumber("bloom-intensity", (value) => this.lighting.updateGlobal("bloomIntensity", value));
    this.bindNumber("color-saturation", (value) => this.lighting.updateGlobal("colorSaturation", value));
    this.bindNumber("motion-strength", (value) => { this.settings.motion.strength = value; this.applyMotionAt(this.motionClock.time); });
    this.bindNumber("motion-duration", (value) => { this.settings.motion.duration = value; this.updateTransport(); });
    this.bindNumber("motion-fps", (value) => { this.settings.motion.fps = Math.round(value); this.updateTransport(); });
    this.bindNumber("artboard-scale", (value) => { this.settings.format.scale = value; this.resize(); });
    this.bindNumber("preview-zoom", (value) => { this.settings.format.previewZoom = value; this.resize(); });
    this.bindNumber("scale", (value) => { this.settings.advanced.renderScale = value; this.pathTracer.renderScale = value; this.updateRenderUi(); });
    this.bindNumber("bounces", (value) => { this.settings.advanced.bounces = Math.round(value); this.pathTracer.bounces = Math.round(value); });
    this.bindNumber("target-samples", (value) => { this.settings.advanced.targetSamples = Math.round(value); this.updateRenderUi(); });
    const enabled = this.require<HTMLInputElement>("[data-motion='enabled']");
    enabled.addEventListener("change", () => { this.settings.motion.enabled = enabled.checked; if (!enabled.checked) this.resetMotion(); else this.applyMotionAt(this.motionClock.time); this.updateTransport(); this.persist(); });
    const preset = this.require<HTMLSelectElement>("[data-motion='preset']");
    preset.addEventListener("change", () => this.setMotionPreset(preset.value as MotionPresetId));
    const strengthMode = this.require<HTMLSelectElement>("[data-motion='strength-mode']");
    strengthMode.value = this.settings.motion.strengthMode;
    strengthMode.addEventListener("change", () => this.setMotionStrength(strengthMode.value as MotionStrengthMode));
    const loop = this.require<HTMLInputElement>("[data-motion='loop']");
    loop.addEventListener("change", () => { this.settings.motion.loop = loop.checked; this.require<HTMLInputElement>("[data-motion='transport-loop']").checked = loop.checked; this.persist(); });
    const timeline = this.require<HTMLInputElement>("[data-motion='timeline']");
    timeline.addEventListener("input", () => { this.pause(); this.seek(Number(timeline.value)); });
    this.require<HTMLInputElement>("[data-motion='transport-loop']").addEventListener("change", (event) => { const value = (event.currentTarget as HTMLInputElement).checked; this.settings.motion.loop = value; loop.checked = value; this.persist(); });
    this.require<HTMLSelectElement>("[data-format='preset']").addEventListener("change", (event) => this.setArtboard({ id: (event.currentTarget as HTMLSelectElement).value as ArtboardPresetId }));
    for (const key of ["width", "height"] as const) this.require<HTMLInputElement>(`[data-format='${key}']`).addEventListener("change", (event) => this.setArtboard({ id: "custom", [key]: Number((event.currentTarget as HTMLInputElement).value) }));
    this.require<HTMLSelectElement>("[data-format='fit']").value = this.settings.format.fitMode;
    this.require<HTMLSelectElement>("[data-format='fit']").addEventListener("change", (event) => { this.settings.format.fitMode = (event.currentTarget as HTMLSelectElement).value as ArtboardState["fitMode"]; this.persist(); });
    this.require<HTMLInputElement>("[data-format='safe-guide']").addEventListener("change", (event) => { this.settings.format.safeGuide = (event.currentTarget as HTMLInputElement).checked; this.resize(); this.persist(); });
    this.require<HTMLInputElement>("[data-format='transparent']").addEventListener("change", (event) => { this.settings.format.transparent = (event.currentTarget as HTMLInputElement).checked; this.updateBackground(); this.persist(); });
    this.require<HTMLInputElement>("[data-control='view-lock']").addEventListener("change", (event) => { this.settings.setup.viewLocked = (event.currentTarget as HTMLInputElement).checked; this.controls.enabled = !this.settings.setup.viewLocked && !this.motionClock.playing; this.persist(); });
    this.require<HTMLSelectElement>("[data-control='export-ppi']").addEventListener("change", (event) => { this.settings.export.ppi = Number((event.currentTarget as HTMLSelectElement).value); this.updateRenderUi(); this.persist(); });
    this.bindRenderRegionUi();
    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => this.handleAction(button.dataset.action ?? "")));
    window.addEventListener("keydown", this.onKeydown);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderPresetParameters();
    this.updateAdvanced();
    this.updateTransport();
    this.updateRenderRegion();
    this.updateRenderUi();
  }

  private bindNumber(name: string, apply: (value: number) => void): void {
    const range = this.root.querySelector<HTMLInputElement>(`[data-control='${name}']`);
    const number = this.root.querySelector<HTMLInputElement>(`[data-number='${name}']`);
    if (!range || !number) return;
    const update = (value: number): void => { const clamped = THREE.MathUtils.clamp(value, Number(range.min), Number(range.max)); range.value = String(clamped); number.value = String(clamped); apply(clamped); this.persist(); this.showPreview(); };
    range.addEventListener("input", () => update(Number(range.value)));
    const commit = (): void => update(Number(number.value));
    number.addEventListener("change", commit);
    number.addEventListener("blur", commit);
    number.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); commit(); number.select(); } });
  }

  private bindRenderRegionUi(): void {
    const enabled = this.require<HTMLInputElement>("[data-region-enabled]");
    enabled.addEventListener("change", () => {
      this.settings.advanced.renderRegion.enabled = enabled.checked;
      if (enabled.checked && (this.settings.advanced.renderRegion.x < 0 || this.settings.advanced.renderRegion.y < 0)) this.centerRenderRegion();
      this.updateRenderRegion(); this.showPreview(); this.persist();
    });
    const unitPpi = this.require<HTMLInputElement>("[data-unit-ppi]");
    unitPpi.addEventListener("change", () => {
      this.settings.advanced.renderRegion.unitPpi = Math.round(finite(Number(unitPpi.value), 96, 36, 1200));
      unitPpi.value = String(this.settings.advanced.renderRegion.unitPpi);
      this.updateRenderUi(); this.persist();
    });
    for (const key of ["x", "y", "width", "height"] as RenderRegionKey[]) {
      const input = this.require<HTMLInputElement>(`[data-region='${key}']`);
      const applyInput = (): void => {
        const parsed = this.parsePhysicalPixels(input.value);
        if (parsed !== null) this.settings.advanced.renderRegion[key] = Math.round(parsed);
        this.updateRenderRegion(); this.showPreview(); this.persist();
      };
      input.addEventListener("change", applyInput);
      input.addEventListener("blur", applyInput);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); applyInput(); input.select(); return; }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        this.settings.advanced.renderRegion[key] += direction * (event.shiftKey ? 10 : 1);
        input.value = String(this.settings.advanced.renderRegion[key]);
        this.updateRenderRegion(); this.showPreview(); this.persist();
      });
    }
  }

  private parsePhysicalPixels(value: string): number | null {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(px|mm|cm|in)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = (match[2] ?? "px").toLowerCase();
    const ppi = this.settings.advanced.renderRegion.unitPpi;
    if (unit === "mm") return amount * ppi / 25.4;
    if (unit === "cm") return amount * ppi / 2.54;
    if (unit === "in") return amount * ppi;
    return amount;
  }

  private centerRenderRegion(): void {
    const region = this.settings.advanced.renderRegion;
    region.x = Math.round((this.settings.format.width - region.width) * 0.5);
    region.y = Math.round((this.settings.format.height - region.height) * 0.5);
  }

  private updateRenderRegion(): void {
    const region = this.settings.advanced.renderRegion;
    region.width = THREE.MathUtils.clamp(Math.round(region.width), 16, this.settings.format.width);
    region.height = THREE.MathUtils.clamp(Math.round(region.height), 16, this.settings.format.height);
    if (region.x < 0 || region.y < 0) this.centerRenderRegion();
    region.x = THREE.MathUtils.clamp(Math.round(region.x), 0, this.settings.format.width - region.width);
    region.y = THREE.MathUtils.clamp(Math.round(region.y), 0, this.settings.format.height - region.height);
    const guide = this.require<HTMLElement>("[data-render-region-guide]");
    guide.style.left = `${region.x / this.settings.format.width * 100}%`;
    guide.style.top = `${region.y / this.settings.format.height * 100}%`;
    guide.style.width = `${region.width / this.settings.format.width * 100}%`;
    guide.style.height = `${region.height / this.settings.format.height * 100}%`;
    guide.classList.toggle("active", region.enabled && this.settings.ui.advancedOpen);
    this.require<HTMLElement>("[data-output='region-size']").textContent = `X ${region.x} · Y ${region.y} · ${region.width} × ${region.height}px`;
    this.syncRenderRegionInputs();
    this.updateRenderUi();
  }

  private syncRenderRegionInputs(): void {
    const region = this.settings.advanced.renderRegion;
    for (const key of ["x", "y", "width", "height"] as RenderRegionKey[]) {
      const input = this.root.querySelector<HTMLInputElement>(`[data-region='${key}']`);
      if (input && document.activeElement !== input) input.value = String(region[key]);
    }
    const enabled = this.root.querySelector<HTMLInputElement>("[data-region-enabled]");
    if (enabled) enabled.checked = region.enabled;
  }

  private activeRegion(): { x: number; y: number; width: number; height: number } {
    const region = this.settings.advanced.renderRegion;
    return region.enabled ? { x: region.x, y: region.y, width: region.width, height: region.height } : { x: 0, y: 0, width: this.settings.format.width, height: this.settings.format.height };
  }

  private scaledOutput(printScale: number): { x: number; y: number; width: number; height: number; fullWidth: number; fullHeight: number } {
    const region = this.activeRegion();
    return {
      x: Math.round(region.x * printScale), y: Math.round(region.y * printScale),
      width: Math.max(1, Math.round(region.width * printScale)), height: Math.max(1, Math.round(region.height * printScale)),
      fullWidth: Math.max(1, Math.round(this.settings.format.width * printScale)), fullHeight: Math.max(1, Math.round(this.settings.format.height * printScale)),
    };
  }

  private printOutputDescription(): string {
    const scale = this.settings.export.ppi / this.settings.advanced.renderRegion.unitPpi;
    const output = this.scaledOutput(scale);
    return `${output.width} × ${output.height}px · ${this.settings.export.ppi}ppi`;
  }

  private updateRenderUi(): void {
    const region = this.activeRegion();
    const exportSize = this.root.querySelector<HTMLElement>("[data-output='export-size']");
    if (exportSize) exportSize.textContent = `${region.width} × ${region.height}px`;
    const printSize = this.root.querySelector<HTMLElement>("[data-output='print-size']");
    if (printSize) printSize.textContent = this.printOutputDescription();
    const fast = this.root.querySelector<HTMLButtonElement>("[data-action='render-fast']");
    const high = this.root.querySelector<HTMLButtonElement>("[data-action='render-high']");
    if (this.settings.look.preset === "spectral-flow") {
      if (fast) fast.innerHTML = `<strong>빠른 래스터</strong><span>실시간 셰이더</span>`;
      if (high) high.innerHTML = `<strong>고품질 래스터</strong><span>노이즈 없음 · 100%</span>`;
      fast?.classList.remove("active"); high?.classList.remove("active");
      if (fast) fast.disabled = false; if (high) high.disabled = false;
      return;
    }
    if (fast) fast.innerHTML = this.renderJob?.quality === "fast" ? `<strong>렌더링 중지</strong><span>${Math.floor(this.pathTracer.samples)} / ${this.renderJob.targetSamples} spp</span>` : `<strong>빠른 렌더링</strong><span>${FAST_RENDER_SAMPLES} spp · ${Math.round(FAST_RENDER_SCALE * 100)}%</span>`;
    if (high) high.innerHTML = this.renderJob?.quality === "high" ? `<strong>렌더링 중지</strong><span>${Math.floor(this.pathTracer.samples)} / ${this.renderJob.targetSamples} spp</span>` : `<strong>고품질 렌더링</strong><span>${this.settings.advanced.targetSamples} spp · ${Math.round(this.settings.advanced.renderScale * 100)}%</span>`;
    fast?.classList.toggle("active", this.renderJob?.quality === "fast");
    high?.classList.toggle("active", this.renderJob?.quality === "high");
    if (fast) fast.disabled = this.renderingHigh && this.renderJob?.quality !== "fast";
    if (high) high.disabled = this.renderingHigh && this.renderJob?.quality !== "high";
    for (const selector of ["[data-action='export-raster']", "[data-action='render-current-high']", "[data-action='export-print']"]) {
      const button = this.root.querySelector<HTMLButtonElement>(selector); if (button) button.disabled = this.renderingHigh;
    }
  }

  private handleAction(action: string): void {
    if (action === "play-toggle") this.motionClock.playing ? this.pause() : this.play();
    else if (action === "motion-reset") this.resetMotion();
    else if (action === "frame-prev") this.stepFrame(-1);
    else if (action === "frame-next") this.stepFrame(1);
    else if (action === "reset") this.resetCamera();
    else if (action === "scene-reset") { this.resetCamera(); this.resetMotion(); this.settings.setup.gap = 0; this.settings.setup.bevelRadius = .018; this.assembly.setGap(0); this.assembly.setBevelRadius(.018); this.motionAdapter.captureRestPose(); }
    else if (action === "advanced-toggle" || action === "advanced-close") { this.settings.ui.advancedOpen = action === "advanced-toggle" ? !this.settings.ui.advancedOpen : false; this.updateAdvanced(); this.updateRenderRegion(); this.persist(); }
    else if (action === "region-center") { this.centerRenderRegion(); this.updateRenderRegion(); this.persist(); }
    else if (action === "region-full") { this.settings.advanced.renderRegion = { ...this.settings.advanced.renderRegion, enabled: true, x: 0, y: 0, width: this.settings.format.width, height: this.settings.format.height }; this.syncRenderRegionInputs(); this.updateRenderRegion(); this.persist(); }
    else if (action === "render-fast") this.togglePreviewRender("fast");
    else if (action === "render-high") this.togglePreviewRender("high");
    else if (action === "export-raster") void this.exportPng(true).catch((error) => this.showPreview(`PNG 저장 실패 · ${error.message}`));
    else if (action === "render-current-high") void this.renderCurrentFrame(true).catch((error) => this.showPreview(`고품질 렌더링 실패 · ${error.message}`));
    else if (action === "export-print") void this.renderPrintFrame(true).catch((error) => this.showPreview(`인쇄용 렌더링 실패 · ${error.message}`));
    else if (action === "copy-sequence") void navigator.clipboard.writeText(this.sequenceCommand());
  }

  private renderPresetParameters(): void {
    const host = this.require<HTMLElement>("[data-motion-parameters]");
    renderMotionParameters(host, this.settings.motion);
    host.querySelectorAll<HTMLInputElement>("[data-motion-param]").forEach((input) => {
      const key = input.dataset.motionParam ?? "";
      const number = host.querySelector<HTMLInputElement>(`[data-motion-param-number='${key}']`);
      const update = (value: number): void => { input.value = String(value); if (number) number.value = String(value); this.settings.motion.parameters[key] = value; this.applyMotionAt(this.motionClock.time); this.persist(); };
      input.addEventListener("input", () => update(Number(input.value)));
      number?.addEventListener("change", () => update(Number(number.value)));
    });
  }

  private applyMotionAt(time: number): void {
    const raw = this.motionEngine.evaluate(this.settings.motion, time);
    const patch = this.constraints.constrain(raw, this.settings.motion.constraint);
    this.lastPatch = patch;
    this.motionAdapter.applyFrame(patch);
    this.assembly.setDispersion(this.settings.look.dispersion + (patch.dispersionOffset ?? 0));
    this.assembly.setSpectralFlowRuntime(time, this.settings.motion.duration, this.settings.motion.enabled, patch.spectralSweep ?? 0);
    this.applyMotionLights(patch);
    const spectralBloom = this.settings.look.preset === "spectral-flow" ? this.settings.look.spectralFlow.bloom : 0;
    this.previewBloom.strength = this.settings.lighting.globals.bloomIntensity + spectralBloom + (patch.bloomOffset ?? 0);
    this.showPreview();
    this.updateTransport();
  }

  private applyMotionLights(patch: MotionPatch): void {
    const rig = patch.lightRig;
    const radians = THREE.MathUtils.degToRad(rig?.direction ?? 30);
    const direction = new THREE.Vector3(Math.cos(radians), Math.sin(radians), 1).normalize();
    this.motionLights.forEach((light, index) => {
      const phase = index === 0 ? 0 : (index - 1) * Math.PI * 2 / 3;
      light.position.set(Math.cos(radians + phase) * 3.6, Math.sin(radians + phase) * 3.6, 2.5);
      light.intensity = index === 0 ? (rig?.whitePulse ?? 0) * 45 : (rig?.spectralIntensity ?? 0) * 18;
    });
    this.motionRig.position.copy(direction).multiplyScalar((patch.spectralSweep ?? 0) * 1.2 - .6);
  }

  private showPreview(message?: string): void {
    if (this.renderJob) {
      this.renderJob.resolve?.("");
      this.renderJob = null;
    }
    this.renderingHigh = false;
    this.pathTracer.pausePathTracing = true;
    this.pathRenderer.domElement.classList.remove("visible");
    this.previewRenderer.domElement.classList.add("visible");
    this.previewComposer.render();
    if (message) this.require<HTMLElement>("[data-output='samples']").textContent = message;
    this.updateRenderUi();
  }

  private resize(): void {
    const panelWidth = this.inspector?.isCollapsed ? 0 : 380;
    const transportHeight = this.settings.motion.enabled ? 48 : 0;
    const width = Math.max(320, this.root.clientWidth - panelWidth);
    const height = Math.max(240, this.root.clientHeight - transportHeight);
    const preview = this.composition.fitPreview(width, height, this.settings.format);
    this.artboardShell.style.width = `${preview.width}px`;
    this.artboardShell.style.height = `${preview.height}px`;
    this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.previewRenderer.setSize(preview.width, preview.height, false);
    this.previewComposer.setSize(preview.width, preview.height);
    this.pathRenderer.setPixelRatio(1);
    this.pathRenderer.setSize(preview.width, preview.height, false);
    this.pathComposer.setSize(preview.width, preview.height);
    this.composition.apply(this.camera, this.settings.format);
    this.pathCamera.copy(this.camera);
    this.pathTracer.updateCamera();
    this.require<HTMLElement>("[data-safe-guide]").classList.toggle("visible", this.settings.format.safeGuide);
    this.require<HTMLElement>("[data-output='artboard-size']").textContent = `${this.settings.format.width} × ${this.settings.format.height}px`;
    const format = FormatPresetRegistry.list().find((item) => item.id === this.settings.format.id);
    this.require<HTMLElement>("[data-output='format-name']").textContent = format?.label ?? "Custom";
    this.updateBackground();
    this.updateRenderRegion();
    this.showPreview();
  }

  private updateBackground(): void {
    const alpha = this.settings.format.transparent ? 0 : 1;
    this.previewRenderer.setClearColor(this.settings.format.background, alpha);
    this.pathRenderer.setClearColor(this.settings.format.background, alpha);
    this.artboardShell.classList.toggle("transparent", this.settings.format.transparent);
  }

  private updateAdvanced(): void { const drawer = this.require<HTMLElement>("[data-advanced]"); drawer.hidden = !this.settings.ui.advancedOpen; drawer.classList.toggle("open", this.settings.ui.advancedOpen); this.root.querySelector<HTMLElement>("[data-render-region-guide]")?.classList.toggle("active", this.settings.ui.advancedOpen && this.settings.advanced.renderRegion.enabled); }

  private updateTransport(): void {
    const transport = this.require<HTMLElement>("[data-transport]");
    transport.classList.toggle("disabled", !this.settings.motion.enabled);
    const timeline = this.require<HTMLInputElement>("[data-motion='timeline']");
    timeline.max = String(this.settings.motion.duration);
    timeline.value = String(Math.min(this.motionClock.time, this.settings.motion.duration));
    this.require<HTMLElement>("[data-output='motion-time']").textContent = `${this.timecode(this.motionClock.time)} / ${this.timecode(this.settings.motion.duration)}`;
    this.require<HTMLElement>("[data-output='motion-fps']").textContent = `${this.settings.motion.fps} fps`;
    this.require<HTMLButtonElement>("[data-action='play-toggle']").textContent = this.motionClock.playing ? "Ⅱ" : "▶";
    this.require<HTMLElement>("[data-output='sequence-command']").textContent = this.sequenceCommand();
  }

  private timecode(seconds: number): string { const frames = Math.round(seconds * this.settings.motion.fps); const s = Math.floor(frames / this.settings.motion.fps); return `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(frames % this.settings.motion.fps).padStart(2, "0")}`; }
  private sequenceCommand(): string { return `npm run render:motion -- --look ${this.settings.look.preset} --preset ${this.settings.motion.preset} --width ${this.settings.format.width} --height ${this.settings.format.height} --fps ${this.settings.motion.fps} --duration ${this.settings.motion.duration} --quality raster --out artifacts/motion/${this.settings.look.preset}-${this.settings.motion.preset}`; }

  play(): void { if (!this.settings.motion.enabled) { this.settings.motion.enabled = true; this.require<HTMLInputElement>("[data-motion='enabled']").checked = true; } this.showPreview(); this.controls.enabled = false; this.motionClock.setRealtime(); this.motionClock.play(); this.updateTransport(); }
  pause(): void { this.motionClock.pause(); this.controls.enabled = !this.settings.setup.viewLocked; this.updateTransport(); }
  seek(time: number): void { this.motionClock.seek(Math.min(this.settings.motion.duration, Math.max(0, time)), this.settings.motion.fps); this.applyMotionAt(this.motionClock.time); }
  stepFrame(frames: number): void { this.pause(); this.motionClock.step(frames, this.settings.motion.fps, this.settings.motion.duration); this.applyMotionAt(this.motionClock.time); }
  resetMotion(): void { this.motionClock.reset(); this.motionAdapter.restoreRestPose(); this.assembly.setDispersion(this.settings.look.dispersion); this.assembly.setSpectralFlowRuntime(0, this.settings.motion.duration, this.settings.motion.enabled, 0); this.applyMotionLights({}); this.lastPatch = {}; this.showPreview(); this.updateTransport(); }

  setMotionPreset(id: MotionPresetId): void {
    this.settings.motion.preset = id;
    this.settings.motion.enabled = id !== "off";
    const preset = MotionPresetRegistry.get(id);
    if (preset) { this.settings.motion.duration = preset.duration; this.settings.motion.constraint = preset.constraint; this.settings.motion.parameters = { ...preset.parameters }; }
    this.require<HTMLInputElement>("[data-motion='enabled']").checked = this.settings.motion.enabled;
    this.renderPresetParameters();
    this.resetMotion();
    this.persist();
  }

  setMotionStrength(mode: MotionStrengthMode | number): void {
    if (typeof mode === "number") this.settings.motion.strength = THREE.MathUtils.clamp(mode, 0, 1);
    else { this.settings.motion.strengthMode = mode; this.settings.motion.strength = STRENGTH_VALUES[mode]; }
    const input = this.root.querySelector<HTMLInputElement>("[data-control='motion-strength']");
    const number = this.root.querySelector<HTMLInputElement>("[data-number='motion-strength']");
    if (input) input.value = String(this.settings.motion.strength);
    if (number) number.value = String(this.settings.motion.strength);
    this.applyMotionAt(this.motionClock.time);
    this.persist();
  }

  configureMotion(patch: Partial<Pick<MotionSettings, "duration" | "fps" | "seed" | "speed" | "loop" | "constraint">>): void {
    if (typeof patch.duration === "number") this.settings.motion.duration = finite(patch.duration, this.settings.motion.duration, .1, 120);
    if (typeof patch.fps === "number") this.settings.motion.fps = Math.round(finite(patch.fps, this.settings.motion.fps, 1, 120));
    if (typeof patch.seed === "number") this.settings.motion.seed = Math.round(patch.seed);
    if (typeof patch.speed === "number") this.settings.motion.speed = finite(patch.speed, 1, .05, 8);
    if (typeof patch.loop === "boolean") this.settings.motion.loop = patch.loop;
    if (patch.constraint === "strict" || patch.constraint === "anchored" || patch.constraint === "experimental") this.settings.motion.constraint = patch.constraint;
    this.updateTransport(); this.applyMotionAt(this.motionClock.time); this.persist();
  }

  setArtboard(patch: Partial<ArtboardState> & { id?: ArtboardPresetId }): void {
    if (patch.id && patch.id !== "custom") this.settings.format = FormatPresetRegistry.apply(this.settings.format, patch.id);
    this.settings.format = { ...this.settings.format, ...patch, axisAnchor: { ...this.settings.format.axisAnchor, ...patch.axisAnchor } };
    this.settings.format.width = Math.round(finite(this.settings.format.width, 1080, 16, 8192));
    this.settings.format.height = Math.round(finite(this.settings.format.height, 1080, 16, 8192));
    const width = this.root.querySelector<HTMLInputElement>("[data-format='width']"); const height = this.root.querySelector<HTMLInputElement>("[data-format='height']");
    if (width) width.value = String(this.settings.format.width); if (height) height.value = String(this.settings.format.height);
    this.resize(); this.persist();
  }

  setRenderRegion(patch: Partial<RenderRegion>): void {
    this.settings.advanced.renderRegion = sanitizeRenderRegion({ ...this.settings.advanced.renderRegion, ...patch }, this.settings.advanced.renderRegion);
    this.updateRenderRegion(); this.showPreview(); this.persist();
  }

  setLook(look: CrystalLook): void {
    this.settings.look.preset = look;
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setLook(look);
    this.assembly.setRoughness(this.settings.look.roughness);
    this.assembly.setDispersion(this.settings.look.dispersion);
    this.assembly.setSpectralFlowRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.classList.toggle("active", button.dataset.look === look));
    const spectralControls = this.root.querySelector<HTMLElement>("[data-spectral-flow-controls]");
    const physicalControls = this.root.querySelector<HTMLElement>("[data-physical-optics]");
    if (spectralControls) spectralControls.hidden = look !== "spectral-flow";
    if (physicalControls) physicalControls.hidden = look === "spectral-flow";
    this.applyMotionAt(this.motionClock.time);
    this.updateRenderUi();
    this.persist();
  }

  setSpectralFlow(patch: Partial<SpectralFlowState>): void {
    this.updateSpectralFlow(patch);
    this.syncSpectralFlowUi();
    this.persist();
  }

  setSpectralFlowPreset(preset: SpectralFlowPresetId): void {
    this.settings.look.spectralFlow = { ...SPECTRAL_FLOW_PRESETS[preset] };
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setSpectralFlowRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.syncSpectralFlowUi();
    this.applyMotionAt(this.motionClock.time);
    this.persist();
  }

  private updateSpectralFlow(patch: Partial<SpectralFlowState>): void {
    this.settings.look.spectralFlow = sanitizeSpectralFlowState({ ...this.settings.look.spectralFlow, ...patch, preset: this.settings.look.spectralFlow.preset });
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setSpectralFlowRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.applyMotionAt(this.motionClock.time);
  }

  private syncSpectralFlowUi(): void {
    const state = this.settings.look.spectralFlow;
    const controls: Array<[string, number]> = [
      ["spectral-flow-position", state.flowPosition], ["spectral-flow-speed", state.flowSpeed], ["spectral-flow-width", state.flowWidth],
      ["spectral-flow-softness", state.flowSoftness], ["spectral-spread", state.spectrumSpread], ["spectral-separation", state.spectrumSeparation],
      ["spectral-saturation", state.saturation], ["spectral-lag", state.spectralLag], ["spectral-core-intensity", state.coreIntensity],
      ["spectral-core-width", state.coreWidth], ["spectral-falloff", state.falloff], ["spectral-bloom", state.bloom],
      ["spectral-edge-attraction", state.edgeAttraction], ["spectral-reflection", state.reflection], ["spectral-darkness", state.darkness],
    ];
    controls.forEach(([name, value]) => {
      const range = this.root.querySelector<HTMLInputElement>(`[data-control='${name}']`);
      const number = this.root.querySelector<HTMLInputElement>(`[data-number='${name}']`);
      if (range) range.value = String(value);
      if (number) number.value = String(value);
    });
    const direction = this.root.querySelector<HTMLSelectElement>("[data-spectral-direction]");
    if (direction) direction.value = state.flowDirection;
    this.root.querySelectorAll<HTMLButtonElement>("[data-spectral-preset]").forEach((button) => button.classList.toggle("active", button.dataset.spectralPreset === state.preset));
  }

  private resetCamera(): void { this.camera.position.set(0, 0, -12); this.camera.lookAt(0, .02, 0); this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.target.set(0, .02, 0); this.controls.update(); this.showPreview(); }

  async exportPng(download = true): Promise<string> {
    return this.renderRasterFrame(download, 1, false, "raster");
  }

  private async renderRasterFrame(download: boolean, printScale: number, printOutput: boolean, label: "raster" | "hq"): Promise<string> {
    this.pause();
    this.applyMotionAt(this.motionClock.time);
    const output = this.scaledOutput(printScale);
    const maxTextureSize = this.previewRenderer.capabilities.maxTextureSize;
    if (output.width > maxTextureSize || output.height > maxTextureSize) throw new Error(`${output.width} × ${output.height}px가 GPU 한계 ${maxTextureSize}px를 초과합니다.`);
    this.previewRenderer.setPixelRatio(1); this.previewRenderer.setSize(output.width, output.height, false);
    this.previewComposer.setSize(output.width, output.height);
    this.camera.setViewOffset(output.fullWidth, output.fullHeight, output.x, output.y, output.width, output.height);
    this.camera.updateProjectionMatrix();
    this.previewComposer.render();
    const dataUrl = this.previewRenderer.domElement.toDataURL("image/png");
    this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    if (download) {
      const suffix = printOutput ? `-${this.settings.export.ppi}ppi` : "";
      this.download(await this.injectPpi(dataUrl, this.settings.export.ppi), `pleos-axis-${this.settings.look.preset}-${label}-${this.settings.motion.preset}-frame-${String(this.motionClock.frame).padStart(6, "0")}-${output.width}x${output.height}${suffix}.png`);
    }
    this.resize(); this.showPreview(`${this.settings.look.preset === "spectral-flow" ? "Spectral Flow" : "Raster"} PNG 준비 완료 · ${output.width} × ${output.height}px`);
    return dataUrl;
  }

  renderCurrentFrame(download = true): Promise<string> {
    if (this.settings.look.preset === "spectral-flow") return this.renderRasterFrame(download, 1, false, "hq");
    return this.startPathRender("high", download, 1, false);
  }

  renderPreview(quality: RenderQuality): Promise<string> {
    if (this.settings.look.preset === "spectral-flow") return this.renderRasterFrame(false, 1, false, quality === "high" ? "hq" : "raster");
    return this.startPathRender(quality, false, 1, false);
  }

  renderPrintFrame(download = true): Promise<string> {
    const printScale = this.settings.export.ppi / this.settings.advanced.renderRegion.unitPpi;
    if (this.settings.look.preset === "spectral-flow") return this.renderRasterFrame(download, printScale, true, "hq");
    return this.startPathRender("high", download, printScale, true);
  }

  private togglePreviewRender(quality: RenderQuality): void {
    if (this.settings.look.preset === "spectral-flow") {
      void this.renderRasterFrame(false, 1, false, quality === "high" ? "hq" : "raster").catch((error) => this.showPreview(`래스터 렌더링 실패 · ${error.message}`));
      return;
    }
    if (this.renderJob?.quality === quality) { this.cancelPathRender("렌더링 중지됨"); return; }
    if (this.renderJob) return;
    void this.startPathRender(quality, false, 1, false).catch((error) => this.showPreview(`렌더링 실패 · ${error.message}`));
  }

  private startPathRender(quality: RenderQuality, download: boolean, printScale: number, printOutput: boolean): Promise<string> {
    this.pause(); this.applyMotionAt(this.motionClock.time);
    const output = this.scaledOutput(printScale);
    const maxTextureSize = this.pathRenderer.capabilities.maxTextureSize;
    if (output.width > maxTextureSize || output.height > maxTextureSize) return Promise.reject(new Error(`${output.width} × ${output.height}px가 GPU 한계 ${maxTextureSize}px를 초과합니다.`));
    const targetSamples = printOutput ? Math.max(this.settings.advanced.targetSamples, PRINT_RENDER_SAMPLES) : quality === "fast" ? FAST_RENDER_SAMPLES : this.settings.advanced.targetSamples;
    const bounces = printOutput ? Math.max(this.settings.advanced.bounces, PRINT_RENDER_BOUNCES) : quality === "fast" ? FAST_RENDER_BOUNCES : this.settings.advanced.bounces;
    this.renderingHigh = true;
    this.previewRenderer.domElement.classList.remove("visible"); this.pathRenderer.domElement.classList.add("visible");
    this.pathRenderer.setPixelRatio(1); this.pathRenderer.setSize(output.width, output.height, false); this.pathComposer.setSize(output.width, output.height);
    this.pathCamera.copy(this.camera);
    this.pathCamera.setViewOffset(output.fullWidth, output.fullHeight, output.x, output.y, output.width, output.height);
    this.pathCamera.updateProjectionMatrix();
    this.applyPathCanvasFrame();
    // Print output must be traced at the requested pixel dimensions. A lower
    // renderScale only enlarges a smaller accumulation target and is not true
    // 300ppi detail.
    this.pathTracer.renderScale = printOutput ? 1 : quality === "fast" ? FAST_RENDER_SCALE : this.settings.advanced.renderScale;
    this.pathTracer.filterGlossyFactor = printOutput ? .65 : quality === "high" ? .25 : 0;
    this.pathTracer.bounces = bounces; this.pathTracer.transmissiveBounces = bounces + 4;
    this.pathDenoise.enabled = false;
    this.pathTracer.setScene(this.scene, this.pathCamera); this.pathTracer.reset(); this.pathTracer.pausePathTracing = false;
    this.require<HTMLElement>("[data-output='samples']").textContent = `${quality === "fast" ? "빠른" : "고품질"} 렌더링 0 / ${targetSamples} spp · ${output.width} × ${output.height}px`;
    return new Promise<string>((resolve, reject) => {
      this.renderJob = { quality, targetSamples, download, printScale, printOutput, width: output.width, height: output.height, resolve, reject };
      this.updateRenderUi();
    });
  }

  private applyPathCanvasFrame(): void {
    const region = this.activeRegion();
    Object.assign(this.pathRenderer.domElement.style, {
      left: `${region.x / this.settings.format.width * 100}%`, top: `${region.y / this.settings.format.height * 100}%`,
      width: `${region.width / this.settings.format.width * 100}%`, height: `${region.height / this.settings.format.height * 100}%`,
      right: "auto", bottom: "auto",
    });
  }

  private cancelPathRender(message: string): void {
    const job = this.renderJob;
    this.renderJob = null; this.renderingHigh = false; this.pathTracer.pausePathTracing = true;
    job?.resolve?.("");
    this.pathRenderer.domElement.classList.remove("visible"); this.previewRenderer.domElement.classList.add("visible");
    this.require<HTMLElement>("[data-output='samples']").textContent = message;
    this.updateRenderUi();
  }

  private async finishHighRender(): Promise<void> {
    const job = this.renderJob; if (!job) return;
    this.renderJob = null; this.renderingHigh = false; this.pathTracer.pausePathTracing = true; this.pathTexture.map = this.pathTracer.target.texture;
    // The edge-aware denoiser is applied only after accumulation so it does not
    // slow every progressive sample. It removes residual Monte Carlo grain and
    // isolated fireflies while retaining the hard glass seams.
    this.pathDenoise.enabled = job.quality === "high";
    this.pathComposer.render();
    try {
      const dataUrl = this.pathRenderer.domElement.toDataURL("image/png");
      if (job.download) this.download(await this.injectPpi(dataUrl, this.settings.export.ppi), `pleos-axis-${job.printOutput ? "print" : "hq"}-${this.settings.motion.preset}-frame-${String(this.motionClock.frame).padStart(6, "0")}-${job.width}x${job.height}-${this.settings.export.ppi}ppi.png`);
      job.resolve?.(dataUrl); this.require<HTMLElement>("[data-output='samples']").textContent = `${job.quality === "fast" ? "빠른" : "고품질"} 렌더링 완료 · ${Math.floor(this.pathTracer.samples)} spp · ${job.width} × ${job.height}px`;
    } catch (error) {
      const reason = error instanceof Error ? error : new Error("PNG 인코딩 실패");
      job.reject?.(reason); this.showPreview(`렌더링 실패 · ${reason.message}`);
    }
    this.updateRenderUi();
  }

  private download(url: string, filename: string): void { const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); }

  private async injectPpi(dataUrl: string, ppi: number): Promise<string> {
    const source = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (character) => character.charCodeAt(0));
    const view = new DataView(source.buffer); const ihdrLength = view.getUint32(8, false); const insertOffset = 20 + ihdrLength;
    const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); const data = new Uint8Array(9); const dataView = new DataView(data.buffer);
    const pixelsPerMeter = Math.round(ppi / .0254); dataView.setUint32(0, pixelsPerMeter, false); dataView.setUint32(4, pixelsPerMeter, false); data[8] = 1;
    const crcInput = new Uint8Array(13); crcInput.set(type); crcInput.set(data, 4); const chunk = new Uint8Array(21); const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, 9, false); chunk.set(type, 4); chunk.set(data, 8); chunkView.setUint32(17, this.crc32(crcInput), false);
    const output = new Uint8Array(source.length + chunk.length); output.set(source.subarray(0, insertOffset)); output.set(chunk, insertOffset); output.set(source.subarray(insertOffset), insertOffset + chunk.length);
    let binary = ""; for (let offset = 0; offset < output.length; offset += 0x8000) binary += String.fromCharCode(...output.subarray(offset, offset + 0x8000));
    return `data:image/png;base64,${btoa(binary)}`;
  }

  private crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }

  private readonly onLightingChange = (): void => {
    const globals = this.lighting.state.globals;
    this.environment.setIntensity(globals.environmentIntensity); this.assembly.setOpticalLighting(globals.reflectionStrength, globals.refractionStrength);
    this.previewRenderer.toneMappingExposure = globals.exposure; this.pathRenderer.toneMappingExposure = globals.exposure;
    this.previewBloom.strength = globals.bloomIntensity + (this.settings.look.preset === "spectral-flow" ? this.settings.look.spectralFlow.bloom : 0); this.pathBloom.strength = globals.bloomIntensity;
    this.showPreview(); this.persist();
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    const target = event.target; if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (event.code === "Space") { event.preventDefault(); this.motionClock.playing ? this.pause() : this.play(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); this.stepFrame(event.shiftKey ? -10 : -1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); this.stepFrame(event.shiftKey ? 10 : 1); }
    else if (event.key === "Home") { event.preventDefault(); this.seek(0); }
    else if (event.key === "End") { event.preventDefault(); this.seek(this.settings.motion.duration); }
    else if (event.key.toLowerCase() === "r") this.resetMotion();
    else if (event.key === "Tab" || event.key.toLowerCase() === "h") { event.preventDefault(); this.inspector.toggle(); }
  };

  private readonly onVisibility = (): void => { if (document.hidden) this.pause(); };

  private readonly render = (timestamp: number): void => {
    if (this.motionClock.tick(timestamp, this.settings.motion.speed, this.settings.motion.duration, this.settings.motion.fps, this.settings.motion.loop)) this.applyMotionAt(this.motionClock.time);
    this.controls.update();
    if (this.renderingHigh && this.renderJob) {
      this.pathTracer.renderSample(); this.pathTexture.map = this.pathTracer.target.texture; this.pathComposer.render();
      const samples = Math.floor(this.pathTracer.samples);
      if (samples % 4 === 0) { this.require<HTMLElement>("[data-output='samples']").textContent = `${this.renderJob.quality === "fast" ? "빠른" : "고품질"} 렌더링 ${samples} / ${this.renderJob.targetSamples} spp`; this.updateRenderUi(); }
      if (samples >= this.renderJob.targetSamples) void this.finishHighRender();
    } else if (!this.motionClock.playing) this.previewComposer.render();
    this.raf = requestAnimationFrame(this.render);
  };

  inspect(): object {
    return {
      ready: true,
      project: "PLEOS 27 Axis",
      app: {
        entryPoint: "src/main.ts",
        defaultRoute: "/",
        activeApplication: "MotionStudioApp",
        renderer: "Three.js WebGLRenderer + three-gpu-pathtracer",
        previewRenderer: "Three.js raster + EffectComposer + UnrealBloomPass",
        projection: "orthographic",
        camera: { type: this.camera.type, position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom },
        sceneStructure: "3 closed optical solids meeting at one shared vertex",
      },
      renderer: "Three.js + three-gpu-pathtracer",
      motion: this.getMotionState(),
      motionPresets: MotionPresetRegistry.list().map((preset) => ({ id: preset.id, label: preset.label, duration: preset.duration, constraint: preset.constraint })),
      artboard: { ...this.settings.format },
      artboardPresets: FormatPresetRegistry.list(),
      renderRegion: { ...this.settings.advanced.renderRegion },
      export: { ppi: this.settings.export.ppi, rasterPng: true, pathTracedStill: true, fixedTimestepSequence: true, transparency: true },
      pathTracing: { active: this.renderingHigh, samples: this.pathTracer.samples, quality: this.renderJob?.quality ?? null, output: this.renderJob ? [this.renderJob.width, this.renderJob.height] : null },
      assembly: this.assembly.inspect(),
      sharedVertexValid: this.motionAdapter.getSharedCornerValidity(),
      inspector: { tabs: ["setup", "look", "motion", "format", "export"], advancedDrawer: true },
      storageVersion: 2,
    };
  }
  getMotionState(): object { return { preset: this.settings.motion.preset, enabled: this.settings.motion.enabled, playing: this.motionClock.playing, time: this.motionClock.time, frame: this.motionClock.frame, duration: this.settings.motion.duration, fps: this.settings.motion.fps, seed: this.settings.motion.seed, patch: this.lastPatch }; }
  private persist(): void { window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => { localStorage.setItem(STORAGE_V2, JSON.stringify(this.settings)); const status = this.root.querySelector<HTMLElement>("[data-output='save']"); if (status) status.textContent = "저장됨"; }, 180); }
  dispose(): void { cancelAnimationFrame(this.raf); clearTimeout(this.saveTimer); this.resizeObserver.disconnect(); window.removeEventListener("keydown", this.onKeydown); document.removeEventListener("visibilitychange", this.onVisibility); this.controls.dispose(); this.pathTracer.dispose(); this.previewComposer.dispose(); this.pathComposer.dispose(); this.lighting.dispose(); this.environment.dispose(); this.assembly.dispose(); this.previewRenderer.dispose(); this.pathRenderer.dispose(); }
  private require<T extends Element>(selector: string): T { const element = this.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Motion Studio element: ${selector}`); return element; }
}
