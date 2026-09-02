import "./CrystalApp.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { DenoiseMaterial, ShapedAreaLight, WebGLPathTracer } from "three-gpu-pathtracer";
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from "mediabunny";
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
import { createLightingPreset, halveLightingRigDensity, LightingSystem, migrateLightingRigToMainCamera, sanitizeLightingState, type LightingState } from "./LightingSystem";
import { PrismMotionAdapter } from "./PrismMotionAdapter";
import { installStudioEnvironment, type PathTracingStudioEnvironment } from "./StudioEnvironment";
import { bindScrubbableNumbers } from "./InspectorScrub";
import { createSpectralFlowState, sanitizeSpectralFlowState, SPECTRAL_FLOW_PRESETS, type SpectralFlowDirection, type SpectralFlowPresetId, type SpectralFlowState } from "./materials/SpectralFlowMaterial";
import { createSoftSpectralState, sanitizeSoftSpectralState, SOFT_SPECTRAL_PRESETS, type SoftSpectralPresetId, type SoftSpectralState } from "./materials/SoftSpectralMaterial";
import { PRISM_STYLE_PRESETS, sanitizePrismStyle, type PhysicalLookParameters, type PrismStyleId } from "./presets/PrismStylePresets";
import { StudioVariationStore, type StudioVariationSnapshot } from "./variations/StudioVariation";
import { renderMotionParameters } from "./ui/MotionPanel";
import { studioPanelTemplate } from "./ui/StudioPanel";
import { transportTemplate } from "./ui/TransportBar";
import { WebGPUPreviewBackend } from "./rendering/WebGPUPreviewBackend";
import { WebGPUPathTracerBackend } from "./rendering/WebGPUPathTracerBackend";

interface StudioSettingsV2 {
  version: 2;
  setup: { gap: number; bevelRadius: number; lightingRigVersion: number; viewLocked: boolean; cameraPan: { x: number; y: number } };
  look: { preset: CrystalLook; prismStyle: PrismStyleId; roughness: number; dispersion: number; physical: PhysicalLookParameters; spectralFlow: SpectralFlowState; softSpectral: SoftSpectralState };
  lighting: LightingState;
  motion: MotionSettings;
  format: ArtboardState;
  export: { ppi: number };
  advanced: { renderScale: number; bounces: number; targetSamples: number; renderRegion: RenderRegion };
  ui: { activeTab: InspectorTab; inspectorCollapsed: boolean; structureCollapsed: boolean; advancedOpen: boolean; selectedVariationId: string };
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
  backend: "webgpu" | "webgl";
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

interface VideoExportJob {
  cancelled: boolean;
  completedFrames: number;
  totalFrames: number;
}

export interface MotionStudioModeHeader {
  activeModeId: string;
  modes: Array<{ id: string; label: string }>;
  onModeChange(id: string): void;
  onVariationChange?(modeId: string, variationId: string): void;
  onStateChange?(): void;
}

const STORAGE_V2 = "pleos-27-axis-settings-v2";
const STORAGE_V1 = "pleos-27-axis-settings-v1";
const FAST_RENDER_SAMPLES = 16;
const FAST_RENDER_SCALE = 0.5;
const FAST_RENDER_BOUNCES = 4;
// Keep the converged raster/WebGPU preview visible while the path tracer's
// target is still empty. Revealing the progressive canvas after a few real
// samples avoids a misleading black flash at render start.
const PATH_PREVIEW_REVEAL_SAMPLES = 4;
const MOTION_STRIP_LENGTH_SCALE = [1, .9, 1.08] as const;
const MOTION_STRIP_WIDTH_SCALE = [1, 1.18, .88] as const;
const MOTION_STRIP_COLOR_WEIGHT = [1.08, .96, .9] as const;
const SPECTRAL_SUPPORT_SHARE = .12;
const SPECTRAL_DOMINANT_SHARE = .76;

function smoothUnit(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function colorDominanceWeights(time: number, duration: number): [number, number, number] {
  const progress = ((time / Math.max(duration, .001)) % 1 + 1) % 1;
  if (progress < .24) return [SPECTRAL_DOMINANT_SHARE, SPECTRAL_SUPPORT_SHARE, SPECTRAL_SUPPORT_SHARE];
  if (progress < .42) {
    const mix = smoothUnit((progress - .24) / .18);
    return [
      THREE.MathUtils.lerp(SPECTRAL_DOMINANT_SHARE, SPECTRAL_SUPPORT_SHARE, mix),
      THREE.MathUtils.lerp(SPECTRAL_SUPPORT_SHARE, SPECTRAL_DOMINANT_SHARE, mix),
      SPECTRAL_SUPPORT_SHARE,
    ];
  }
  if (progress < .69) {
    const mix = smoothUnit((progress - .42) / .27);
    return [
      SPECTRAL_SUPPORT_SHARE,
      THREE.MathUtils.lerp(SPECTRAL_DOMINANT_SHARE, SPECTRAL_SUPPORT_SHARE, mix),
      THREE.MathUtils.lerp(SPECTRAL_SUPPORT_SHARE, SPECTRAL_DOMINANT_SHARE, mix),
    ];
  }
  if (progress >= .83) return [SPECTRAL_DOMINANT_SHARE, SPECTRAL_SUPPORT_SHARE, SPECTRAL_SUPPORT_SHARE];
  const mix = smoothUnit((progress - .69) / .14);
  return [
    THREE.MathUtils.lerp(SPECTRAL_SUPPORT_SHARE, SPECTRAL_DOMINANT_SHARE, mix),
    SPECTRAL_SUPPORT_SHARE,
    THREE.MathUtils.lerp(SPECTRAL_DOMINANT_SHARE, SPECTRAL_SUPPORT_SHARE, mix),
  ];
}

const defaultMotion = (): MotionSettings => ({ enabled: false, preset: "spectral-axis-sweep", strengthMode: "balanced", strength: 0.5, duration: 7.2, fps: 30, speed: 1, seed: 27, loop: true, constraint: "strict", parameters: {} });
const defaults = (): StudioSettingsV2 => ({
  version: 2,
  setup: { gap: 0, bevelRadius: 0.018, lightingRigVersion: 4, viewLocked: true, cameraPan: { x: 0, y: 0 } },
  look: { preset: "prism", prismStyle: "clean", roughness: PRISM_STYLE_PRESETS.clean.roughness, dispersion: PRISM_STYLE_PRESETS.clean.dispersion, physical: { ...PRISM_STYLE_PRESETS.clean.physical }, spectralFlow: createSpectralFlowState("balanced"), softSpectral: createSoftSpectralState("balanced") },
  lighting: createLightingPreset("pleos-prism"),
  motion: defaultMotion(),
  format: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor } },
  export: { ppi: 300 },
  advanced: { renderScale: 0.75, bounces: 8, targetSamples: 128, renderRegion: { enabled: false, x: -1, y: -1, width: 640, height: 480, unitPpi: 96 } },
  ui: { activeTab: "look", inspectorCollapsed: false, structureCollapsed: false, advancedOpen: false, selectedVariationId: "" },
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
      const lightingRigVersion = v2.setup?.lightingRigVersion === 4 ? 4 : v2.setup?.lightingRigVersion === 3 ? 3 : v2.setup?.lightingRigVersion === 2 ? 2 : 1;
      if (lightingRigVersion < 2 && v2.lighting) lighting = migrateLightingRigToMainCamera(lighting);
      if (lightingRigVersion === 3 && v2.lighting) lighting = halveLightingRigDensity(lighting);
      return {
        version: 2,
        setup: {
          gap: finite(v2.setup?.gap, base.setup.gap, 0, 0.45),
          bevelRadius: finite(v2.setup?.bevelRadius, base.setup.bevelRadius, 0, 0.15),
          lightingRigVersion: 4,
          viewLocked: v2.setup?.viewLocked !== false,
          cameraPan: {
            x: finite(v2.setup?.cameraPan?.x, base.setup.cameraPan.x, -3, 3),
            y: finite(v2.setup?.cameraPan?.y, base.setup.cameraPan.y, -3, 3),
          },
        },
        look: {
          preset: v2.look?.preset === "clear" || v2.look?.preset === "smoked" || v2.look?.preset === "spectral-flow" || v2.look?.preset === "soft-spectral" ? v2.look.preset : "prism",
          prismStyle: sanitizePrismStyle(v2.look?.prismStyle),
          roughness: finite(v2.look?.roughness, base.look.roughness, 0.02, 0.28),
          dispersion: finite(v2.look?.dispersion, base.look.dispersion, 0, 0.35),
          physical: {
            ior: finite(v2.look?.physical?.ior, base.look.physical.ior, 1, 2.5),
            thickness: finite(v2.look?.physical?.thickness, base.look.physical.thickness, .01, 10),
            attenuationDistance: finite(v2.look?.physical?.attenuationDistance, base.look.physical.attenuationDistance, .1, 20),
            iridescence: finite(v2.look?.physical?.iridescence, base.look.physical.iridescence, 0, 1),
          },
          spectralFlow: sanitizeSpectralFlowState(v2.look?.spectralFlow),
          softSpectral: sanitizeSoftSpectralState(v2.look?.softSpectral),
        },
        lighting,
        motion: { ...base.motion, ...v2.motion, parameters: { ...v2.motion?.parameters } },
        format: sanitizeArtboard({ ...base.format, ...v2.format, axisAnchor: { ...base.format.axisAnchor, ...v2.format?.axisAnchor } }),
        export: { ppi: finite(v2.export?.ppi, 300, 36, 1200) },
        advanced: {
          renderScale: finite(v2.advanced?.renderScale, .75, .4, 1),
          bounces: Math.round(finite(v2.advanced?.bounces, 8, 3, 14)),
          targetSamples: Math.round(finite(v2.advanced?.targetSamples, 128, 16, 2048)),
          renderRegion: sanitizeRenderRegion(v2.advanced?.renderRegion, base.advanced.renderRegion),
        },
        ui: { activeTab: v2.ui?.activeTab ?? "look", inspectorCollapsed: v2.ui?.inspectorCollapsed === true, structureCollapsed: v2.ui?.structureCollapsed === true, advancedOpen: v2.ui?.advancedOpen === true, selectedVariationId: v2.ui?.selectedVariationId ?? "" },
      };
    }
    const v1 = JSON.parse(localStorage.getItem(STORAGE_V1) ?? "null") as Record<string, unknown> | null;
    if (v1) {
      base.setup.gap = finite(v1.gap, 0, 0, .45);
      base.look.preset = v1.look === "clear" || v1.look === "smoked" ? v1.look : "prism";
      base.look.roughness = finite(v1.roughness, .04, .02, .28);
      base.look.dispersion = finite(v1.dispersion, .16, 0, .35);
      base.look.spectralFlow = createSpectralFlowState("balanced");
      base.look.softSpectral = createSoftSpectralState("balanced");
      if (v1.lighting) base.lighting = migrateLightingRigToMainCamera(sanitizeLightingState(v1.lighting));
      base.advanced.renderScale = finite(v1.scale, .75, .4, 1);
      base.advanced.bounces = Math.round(finite(v1.bounces, 8, 3, 14));
      base.advanced.targetSamples = Math.round(finite(v1.targetSamples, 128, 16, 2048));
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

function sanitizeArtboard(value: ArtboardState): ArtboardState {
  return {
    ...value,
    width: Math.round(finite(value.width, 1080, 16, 8192)), height: Math.round(finite(value.height, 1080, 16, 8192)),
    scale: finite(value.scale, .82, .25, 2), previewZoom: finite(value.previewZoom, 1, .5, 1.8),
    axisAnchor: { gridX: finite(value.axisAnchor?.gridX, .5, 0, 1), gridY: finite(value.axisAnchor?.gridY, .5, 0, 1) },
    background: /^#[0-9a-f]{6}$/i.test(value.background) ? value.background : "#050607",
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
  private readonly variations = new StudioVariationStore();
  private readonly composition = new CompositionAdapter();
  private readonly previewRenderer: THREE.WebGLRenderer;
  private readonly pathRenderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly pathTracer: WebGLPathTracer;
  private readonly previewComposer: EffectComposer;
  private readonly previewBloom: UnrealBloomPass;
  private readonly webgpuPreview: WebGPUPreviewBackend;
  private readonly webgpuPathTracer: WebGPUPathTracerBackend;
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
  private readonly motionLights: Array<THREE.PointLight | THREE.SpotLight> = [];
  private readonly pathMotionRig = new THREE.Group();
  private readonly pathMotionLights: ShapedAreaLight[] = [];
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private saveTimer = 0;
  private renderingHigh = false;
  private renderJob: PathRenderJob | null = null;
  private lastCompletedPathBackend: "webgpu" | "webgl" | null = null;
  private lastCompletedPathSamples = 0;
  private videoExportJob: VideoExportJob | null = null;
  private lastPatch: MotionPatch = {};
  private gestureZoomStart = 1;
  private resizeDeferredByRender = false;

  constructor(private readonly root: HTMLElement, private readonly modeHeader: MotionStudioModeHeader = { activeModeId: "glass-3d", modes: [{ id: "glass-3d", label: "Glass 3D" }], onModeChange: () => undefined }) {
    this.root.innerHTML = this.template();
    this.artboardShell = this.require(".artboard-shell");
    this.stage = this.require(".crystal-stage");
    // The production lighting rigs are dominated by Rect Area Lights. The
    // path tracer supports them directly, while Three.js' raster preview
    // requires the LTC lookup tables to be installed explicitly.
    RectAreaLightUniformsLib.init();
    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.pathRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    for (const renderer of [this.previewRenderer, this.pathRenderer]) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = this.settings.lighting.globals.exposure;
      renderer.setClearColor(this.settings.format.background, this.settings.format.transparent ? 0 : 1);
    }
    // Transmission is evaluated every preview frame. A slightly reduced
    // buffer keeps motion responsive without changing the final path-traced
    // render or exported resolution.
    this.previewRenderer.transmissionResolutionScale = 0.72;
    this.previewRenderer.domElement.className = "preview-canvas";
    this.pathRenderer.domElement.className = "pathtrace-canvas";
    this.stage.append(this.previewRenderer.domElement, this.pathRenderer.domElement);
    this.camera.position.set(0, 0, -12);
    this.camera.lookAt(0, .02, 0);
    // Bind controls to the stable stage rather than a specific canvas. The
    // visible preview canvas can now switch between WebGPU and WebGL without
    // changing zoom/orbit interaction semantics.
    this.controls = new OrbitControls(this.camera, this.stage);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enabled = !this.settings.setup.viewLocked;
    this.controls.enableZoom = false;
    this.controls.target.set(0, .02, 0);
    this.controls.update();
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setSoftSpectralState(this.settings.look.softSpectral);
    this.assembly.setLook(this.settings.look.preset);
    this.assembly.setRoughness(this.settings.look.roughness);
    this.assembly.setDispersion(this.settings.look.dispersion);
    this.assembly.setPhysicalParameters(this.settings.look.physical);
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
    this.webgpuPreview = new WebGPUPreviewBackend(
      this.scene,
      this.camera,
      this.settings.format.background,
      this.settings.format.transparent ? 0 : 1,
      this.settings.lighting.globals.exposure,
      this.settings.lighting.globals.bloomIntensity,
    );
    this.stage.insertBefore(this.webgpuPreview.canvas, this.pathRenderer.domElement);
    this.webgpuPathTracer = new WebGPUPathTracerBackend(
      this.settings.format.background,
      this.settings.format.transparent ? 0 : 1,
      this.settings.lighting.globals.exposure,
    );
    this.stage.insertBefore(this.webgpuPathTracer.canvas, this.pathRenderer.domElement);
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
    this.root.classList.toggle("structure-hidden", this.settings.ui.structureCollapsed);
    this.bindUi();
    this.bindCanvasZoom();
    bindScrubbableNumbers(this.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
    this.resize();
    this.applyMotionAt(0);
    void this.initializeWebGPUPreview();
    void this.initializeWebGPUPathTracer();
    this.raf = requestAnimationFrame(this.render);
  }

  private async initializeWebGPUPreview(): Promise<void> {
    await this.webgpuPreview.init();
    if (this.disposed) return;
    this.resize();
    const status = this.webgpuPreview.isNativeWebGPU ? "WebGPU 준비됨" : this.webgpuPreview.status === "webgl2-fallback" ? "WebGPU 미지원 · WebGL2 호환" : `WebGPU 초기화 실패${this.webgpuPreview.error ? ` · ${this.webgpuPreview.error}` : ""}`;
    this.showPreview(status);
  }

  private async initializeWebGPUPathTracer(): Promise<void> {
    await this.webgpuPathTracer.init();
    if (this.disposed) return;
    const status = this.webgpuPathTracer.isReady
      ? "WebGPU 패스트레이서 준비됨"
      : `WebGPU 패스트레이서 미지원 · WebGL 폴백${this.webgpuPathTracer.error ? ` · ${this.webgpuPathTracer.error}` : ""}`;
    this.showPreview(status);
  }

  private template(): string {
    const globals = this.settings.lighting.globals;
    const region = this.settings.advanced.renderRegion;
    const modeOptions = this.modeHeader.modes.map(({ id, label }) => `<option value="${id}" ${id === this.modeHeader.activeModeId ? "selected" : ""}>${label}</option>`).join("");
    const variationOptions = `<option value="" ${this.settings.ui.selectedVariationId ? "" : "selected"}>현재 설정</option>` + this.variations.list().map(({ id, label, builtin }) => `<option value="${id}" ${id === this.settings.ui.selectedVariationId ? "selected" : ""}>${label}${builtin ? "" : " · 사용자"}</option>`).join("");
    return `<section class="crystal-app motion-studio">
      <header class="topbar"><div class="wordmark"><strong>PLEOS 27 AXIS</strong></div><div class="studio-context"><label><span>모드</span><select data-mode-select>${modeOptions}</select></label><label class="topbar-variation"><span>변형</span><select data-variation>${variationOptions}</select></label><details class="variation-actions topbar-variation-actions"><summary aria-label="변형 작업">•••</summary><div><button data-action="variation-save">현재 설정 저장</button><button data-action="variation-duplicate">복제</button><button data-action="variation-rename">이름 변경</button><button data-action="variation-delete" class="danger">삭제</button></div></details></div><div class="topbar-actions"><div class="render-status" hidden><span data-output="samples">준비됨</span></div><button class="topbar-export" data-action="export-focus">내보내기</button><button class="inspector-icon" data-action="inspector-toggle" aria-label="외형 패널 표시 또는 숨기기">◫</button></div></header>
      <main class="pasteboard"><div class="artboard-meta"><span data-output="format-name">Square 1:1</span><b data-output="artboard-size">${this.settings.format.width} × ${this.settings.format.height}px</b></div><div class="artboard-shell"><div class="crystal-stage" aria-label="Pleos Axis virtual artboard"><div class="safe-guide" data-safe-guide></div><div class="render-region-guide" data-render-region-guide><span data-output="region-size"></span></div></div></div></main>
      ${studioPanelTemplate({ look: this.settings.look.preset, prismStyle: this.settings.look.prismStyle, physical: this.settings.look.physical, variations: this.variations.list().map(({ id, label, builtin }) => ({ id, label, builtin })), selectedVariationId: this.settings.ui.selectedVariationId, spectralFlow: this.settings.look.spectralFlow, softSpectral: this.settings.look.softSpectral, gap: this.settings.setup.gap, bevelRadius: this.settings.setup.bevelRadius, roughness: this.settings.look.roughness, dispersion: this.settings.look.dispersion, reflection: globals.reflectionStrength, refraction: globals.refractionStrength, exposure: globals.exposure, bloom: globals.bloomIntensity, saturation: globals.colorSaturation, environment: globals.environmentIntensity, motion: this.settings.motion, artboard: this.settings.format, activeTab: this.settings.ui.activeTab, outputSamples: this.settings.advanced.targetSamples, bounces: this.settings.advanced.bounces, renderScale: this.settings.advanced.renderScale, ppi: this.settings.export.ppi, viewLocked: this.settings.setup.viewLocked, cameraPan: this.settings.setup.cameraPan, renderRegion: region, printOutput: this.printOutputDescription() })}
      ${transportTemplate()}
    </section>`;
  }

  private createMotionLightRig(): void {
    const colors = [0xffffff, 0x4664ff, 0xfa293c, 0x0adc91];
    colors.forEach((color, index) => {
      // Preserve the established realtime look. These lights are preview-only
      // and are explicitly excluded from path-traced renders.
      const previewLight = index === 0
        ? new THREE.PointLight(color, 0, 12, 2)
        : new THREE.SpotLight(color, 0, 12, THREE.MathUtils.degToRad(31), .72, 2);
      previewLight.name = `MotionPreviewLight${index}`;
      this.motionRig.add(previewLight);
      if (previewLight instanceof THREE.SpotLight) {
        previewLight.target.name = `MotionPreviewLightTarget${index}`;
        previewLight.target.position.set(0, 0, 0);
        this.motionRig.add(previewLight.target);
      }
      this.motionLights.push(previewLight);

      // Path tracing receives physical strip / softbox emitters. Their finite
      // area produces linear or planar reflections without a radial hotspot.
      const pathLight = new ShapedAreaLight(color, 0, index === 0 ? 6.4 : 4.2, index === 0 ? 4.6 : .34);
      pathLight.name = `MotionPathStrip${index}`;
      pathLight.visible = false;
      this.pathMotionRig.add(pathLight);
      this.pathMotionLights.push(pathLight);
    });
    this.scene.add(this.motionRig, this.pathMotionRig);
  }

  private setMotionLightRenderMode(mode: "preview" | "path"): void {
    const previewVisible = mode === "preview";
    this.motionLights.forEach((light) => { light.visible = previewVisible; });
    this.pathMotionLights.forEach((light) => { light.visible = !previewVisible; });
  }

  private bindUi(): void {
    const softLookButton = this.root.querySelector<HTMLButtonElement>("[data-look='soft-spectral']");
    if (softLookButton) softLookButton.textContent = "소프트 스펙트럴";
    this.root.querySelector<HTMLSelectElement>("[data-mode-select]")?.addEventListener("change", (event) => this.modeHeader.onModeChange((event.currentTarget as HTMLSelectElement).value));
    this.root.querySelector<HTMLSelectElement>("[data-look-select]")?.addEventListener("change", (event) => this.setLook((event.currentTarget as HTMLSelectElement).value as CrystalLook));
    this.root.querySelector<HTMLSelectElement>("[data-prism-style-select]")?.addEventListener("change", (event) => this.setPrismStyle((event.currentTarget as HTMLSelectElement).value as PrismStyleId));
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.addEventListener("click", () => this.setLook(button.dataset.look as CrystalLook)));
    this.root.querySelectorAll<HTMLButtonElement>("[data-prism-style]").forEach((button) => button.addEventListener("click", () => this.setPrismStyle(button.dataset.prismStyle as PrismStyleId)));
    this.require<HTMLSelectElement>("[data-variation]").addEventListener("change", (event) => {
      const id = (event.currentTarget as HTMLSelectElement).value;
      const variation = this.variations.get(id);
      if (variation && this.modeHeader.onVariationChange) this.modeHeader.onVariationChange(variation.modeId, variation.id);
      else this.applyVariation(id);
    });
    this.bindNumber("gap", (value) => { this.settings.setup.gap = value; this.assembly.setGap(value); this.motionAdapter.captureRestPose(); this.motionClock.pause(); this.applyMotionAt(this.motionClock.time); });
    this.bindNumber("bevel-radius", (value) => { this.settings.setup.bevelRadius = value; this.assembly.setBevelRadius(value); this.motionAdapter.captureRestPose(); this.motionClock.pause(); this.applyMotionAt(this.motionClock.time); });
    this.bindNumber("roughness", (value) => { this.settings.look.roughness = value; this.assembly.setRoughness(value); });
    this.bindNumber("dispersion", (value) => { this.settings.look.dispersion = value; this.assembly.setDispersion(value); });
    this.bindNumber("ior", (value) => this.updatePhysical({ ior: value }));
    this.bindNumber("thickness", (value) => this.updatePhysical({ thickness: value }));
    this.bindNumber("attenuation-distance", (value) => this.updatePhysical({ attenuationDistance: value }));
    this.bindNumber("iridescence", (value) => this.updatePhysical({ iridescence: value }));
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
    const softBindings: Array<[string, keyof SoftSpectralState]> = [
      ["soft-glow", "glow"], ["soft-spectrum", "spectrum"], ["soft-edge", "edge"], ["soft-darkness", "darkness"], ["soft-motion-depth", "motionDepth"],
      ["soft-center-radius", "centerRadius"], ["soft-center-softness", "centerSoftness"], ["soft-spread", "spectrumSpread"], ["soft-separation", "spectrumSeparation"],
      ["soft-saturation", "saturation"], ["soft-phase-offset", "phaseOffset"], ["soft-edge-attraction", "edgeAttraction"], ["soft-edge-softness", "edgeSoftness"],
      ["soft-reflection", "reflection"], ["soft-roughness", "roughness"], ["soft-falloff", "falloff"], ["soft-bloom", "bloom"],
    ];
    softBindings.forEach(([control, key]) => this.bindNumber(control, (value) => this.updateSoftSpectral({ [key]: value })));
    this.root.querySelectorAll<HTMLButtonElement>("[data-soft-spectral-preset]").forEach((button) => button.addEventListener("click", () => this.setSoftSpectralPreset(button.dataset.softSpectralPreset as SoftSpectralPresetId)));
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
    this.bindNumber("axis-anchor-x", (value) => { this.settings.format.axisAnchor.gridX = value; this.resize(); });
    this.bindNumber("axis-anchor-y", (value) => { this.settings.format.axisAnchor.gridY = value; this.resize(); });
    this.bindNumber("camera-pan-x", (value) => { this.settings.setup.cameraPan.x = value; this.resize(); });
    this.bindNumber("camera-pan-y", (value) => { this.settings.setup.cameraPan.y = value; this.resize(); });
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
    this.root.querySelectorAll<HTMLButtonElement>("[data-format-preset]").forEach((button) => button.addEventListener("click", () => this.setArtboard({ id: button.dataset.formatPreset as ArtboardPresetId })));
    for (const key of ["width", "height"] as const) this.require<HTMLInputElement>(`[data-format='${key}']`).addEventListener("change", (event) => this.setArtboard({ id: "custom", [key]: Number((event.currentTarget as HTMLInputElement).value) }));
    this.require<HTMLSelectElement>("[data-format='fit']").value = this.settings.format.fitMode;
    this.require<HTMLSelectElement>("[data-format='fit']").addEventListener("change", (event) => { this.settings.format.fitMode = (event.currentTarget as HTMLSelectElement).value as ArtboardState["fitMode"]; this.persist(); });
    this.require<HTMLInputElement>("[data-format='safe-guide']").addEventListener("change", (event) => { this.settings.format.safeGuide = (event.currentTarget as HTMLInputElement).checked; this.resize(); this.persist(); });
    this.require<HTMLInputElement>("[data-format='transparent']").addEventListener("change", (event) => { this.settings.format.transparent = (event.currentTarget as HTMLInputElement).checked; this.updateBackground(); this.persist(); });
    this.require<HTMLInputElement>("[data-format='background']").addEventListener("input", (event) => { this.settings.format.background = (event.currentTarget as HTMLInputElement).value; this.updateBackground(); this.showPreview(); this.persist(); });
    const transparentMirror = this.root.querySelector<HTMLInputElement>("[data-format='transparent-mirror']");
    transparentMirror?.addEventListener("change", () => {
      this.settings.format.transparent = transparentMirror.checked;
      this.require<HTMLInputElement>("[data-format='transparent']").checked = transparentMirror.checked;
      this.updateBackground(); this.persist();
    });
    this.require<HTMLInputElement>("[data-control='view-lock']").addEventListener("change", (event) => { this.settings.setup.viewLocked = (event.currentTarget as HTMLInputElement).checked; this.controls.enabled = !this.settings.setup.viewLocked && !this.motionClock.playing; this.persist(); });
    this.require<HTMLSelectElement>("[data-control='export-ppi']").addEventListener("change", (event) => { this.settings.export.ppi = Number((event.currentTarget as HTMLSelectElement).value); this.updateRenderUi(); this.persist(); });
    this.bindRenderRegionUi();
    this.root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => this.handleAction(button.dataset.action ?? "")));
    this.root.querySelectorAll<HTMLButtonElement>("[data-panel-jump]").forEach((button) => button.addEventListener("click", () => {
      this.root.querySelector<HTMLElement>(`[data-panel-section='${button.dataset.panelJump}']`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    this.root.querySelectorAll<HTMLDetailsElement>("[data-context-advanced]").forEach((details) => details.addEventListener("toggle", () => {
      this.settings.ui.advancedOpen = Array.from(this.root.querySelectorAll<HTMLDetailsElement>("[data-context-advanced]")).some((item) => item.open);
      this.updateAdvanced(); this.updateRenderRegion(); this.persist();
    }));
    for (const selector of ["[data-export-type]", "[data-export-render]"]) {
      this.root.querySelector<HTMLSelectElement>(selector)?.addEventListener("change", () => this.updateExportWorkflow());
    }
    window.addEventListener("keydown", this.onKeydown);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.renderPresetParameters();
    this.updateAdvanced();
    this.updateTransport();
    this.updateRenderRegion();
    this.updateRenderUi();
    this.updateExportWorkflow();
  }

  private bindCanvasZoom(): void {
    this.stage.addEventListener("wheel", this.onCanvasWheel, { passive: false });
    this.stage.addEventListener("gesturestart", this.onGestureStart as EventListener, { passive: false });
    this.stage.addEventListener("gesturechange", this.onGestureChange as EventListener, { passive: false });
    this.stage.addEventListener("gestureend", this.onGestureEnd as EventListener, { passive: false });
  }

  private zoomCanvas(nextZoom: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(nextZoom, .35, 8);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.pathCamera.copy(this.camera);
    this.pathTracer.updateCamera();
    this.showPreview();
  }

  private readonly onCanvasWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const sensitivity = event.ctrlKey ? .01 : .0015;
    this.zoomCanvas(this.camera.zoom * Math.exp(-event.deltaY * sensitivity));
  };

  private readonly onGestureStart = (event: Event): void => {
    event.preventDefault();
    this.gestureZoomStart = this.camera.zoom;
  };

  private readonly onGestureChange = (event: Event): void => {
    event.preventDefault();
    const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
    this.zoomCanvas(this.gestureZoomStart * (gesture.scale ?? 1));
  };

  private readonly onGestureEnd = (event: Event): void => { event.preventDefault(); };

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
    const regionControlsOpen = this.root.querySelector<HTMLDetailsElement>("[data-context-advanced='export-region']")?.open === true;
    guide.classList.toggle("active", region.enabled && regionControlsOpen);
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
    this.root.querySelectorAll<HTMLElement>("[data-output='export-size']").forEach((output) => { output.textContent = `${region.width} × ${region.height}px`; });
    const printSize = this.root.querySelector<HTMLElement>("[data-output='print-size']");
    if (printSize) printSize.textContent = this.printOutputDescription();
    const progressText = this.root.querySelector<HTMLElement>("[data-output='render-progress-text']");
    const progressPercent = this.root.querySelector<HTMLElement>("[data-output='render-progress-percent']");
    const progressBar = this.root.querySelector<HTMLElement>("[data-output='render-progress-bar']");
    const cancel = this.root.querySelector<HTMLButtonElement>("[data-action='cancel-render']");
    const renderPrimary = this.root.querySelector<HTMLButtonElement>("[data-action='render-export']");
    const samples = this.currentPathSamples();
    const frameProgress = this.renderJob ? Math.min(1, samples / this.renderJob.targetSamples) : 0;
    const progress = this.videoExportJob
      ? Math.min(1, (this.videoExportJob.completedFrames + frameProgress) / this.videoExportJob.totalFrames)
      : frameProgress;
    if (progressText) progressText.textContent = this.videoExportJob
      ? `영상 렌더링 ${Math.min(this.videoExportJob.completedFrames + 1, this.videoExportJob.totalFrames)} / ${this.videoExportJob.totalFrames} · ${Math.floor(samples)} / ${this.settings.advanced.targetSamples} spp`
      : this.renderJob ? `${this.renderJob.quality === "fast" ? "Preview" : "High"} · ${Math.floor(samples)} / ${this.renderJob.targetSamples} spp` : "준비됨";
    if (progressPercent) progressPercent.textContent = `${Math.round(progress * 100)}%`;
    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    if (cancel) cancel.hidden = !this.renderJob && !this.videoExportJob;
    if (renderPrimary) renderPrimary.disabled = this.renderingHigh || Boolean(this.videoExportJob);
    for (const selector of ["[data-action='export-raster']", "[data-action='render-current-high']", "[data-action='export-print']", "[data-action='render-export']"]) {
      const button = this.root.querySelector<HTMLButtonElement>(selector); if (button) button.disabled = this.renderingHigh;
    }
  }

  private currentPathSamples(): number {
    return this.renderJob?.backend === "webgpu" ? this.webgpuPathTracer.sampleCounts.avg : this.pathTracer.samples;
  }

  private pathOutputCanvas(backend: "webgpu" | "webgl" = this.renderJob?.backend ?? this.lastCompletedPathBackend ?? (this.webgpuPathTracer.isReady ? "webgpu" : "webgl")): HTMLCanvasElement {
    return backend === "webgpu" ? this.webgpuPathTracer.canvas : this.pathRenderer.domElement;
  }

  private handleAction(action: string): void {
    if (action === "play-toggle") this.motionClock.playing ? this.pause() : this.play();
    else if (action === "motion-reset") this.resetMotion();
    else if (action === "frame-prev") this.stepFrame(-1);
    else if (action === "frame-next") this.stepFrame(1);
    else if (action === "reset") this.resetCamera();
    else if (action === "camera-pan-center") {
      this.settings.setup.cameraPan = { x: 0, y: 0 };
      this.syncNumeric("camera-pan-x", 0); this.syncNumeric("camera-pan-y", 0);
      this.resize(); this.persist();
    }
    else if (action === "scene-reset") { this.settings.setup.cameraPan = { x: 0, y: 0 }; this.resetCamera(); this.resetMotion(); this.settings.setup.gap = 0; this.settings.setup.bevelRadius = .018; this.assembly.setGap(0); this.assembly.setBevelRadius(.018); this.motionAdapter.captureRestPose(); }
    else if (action === "structure-close" || action === "structure-open") { this.settings.ui.structureCollapsed = action === "structure-close"; this.root.classList.toggle("structure-hidden", this.settings.ui.structureCollapsed); this.resize(); this.persist(); }
    else if (action === "variation-save") this.saveCurrentVariation();
    else if (action === "variation-duplicate") this.duplicateVariation();
    else if (action === "variation-rename") this.renameVariation();
    else if (action === "variation-delete") this.deleteVariation();
    else if (action === "export-focus") { const output = this.root.querySelector<HTMLElement>("[data-output-section]"); output?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (action === "region-center") { this.centerRenderRegion(); this.updateRenderRegion(); this.persist(); }
    else if (action === "region-full") { this.settings.advanced.renderRegion = { ...this.settings.advanced.renderRegion, enabled: true, x: 0, y: 0, width: this.settings.format.width, height: this.settings.format.height }; this.syncRenderRegionInputs(); this.updateRenderRegion(); this.persist(); }
    else if (action === "export-raster") void this.exportPng(true).catch((error) => this.showPreview(`PNG 저장 실패 · ${error.message}`));
    else if (action === "render-current-high") void this.renderCurrentFrame(true).catch((error) => this.showPreview(`고품질 렌더링 실패 · ${error.message}`));
    else if (action === "export-print") void this.renderPrintFrame(true).catch((error) => this.showPreview(`인쇄용 렌더링 실패 · ${error.message}`));
    else if (action === "render-export") void this.runExportWorkflow().catch((error) => this.showPreview(`렌더링 실패 · ${error.message}`));
    else if (action === "cancel-render") this.cancelActiveRender();
    else if (action === "copy-sequence") void navigator.clipboard.writeText(this.sequenceCommand());
  }

  private updateExportWorkflow(): void {
    const type = this.root.querySelector<HTMLSelectElement>("[data-export-type]")?.value ?? "still";
    const render = this.root.querySelector<HTMLSelectElement>("[data-export-render]");
    const pathSettings = this.root.querySelector<HTMLElement>("[data-path-settings]");
    const button = this.root.querySelector<HTMLButtonElement>("[data-action='render-export']");
    const motion = this.root.querySelector<HTMLDetailsElement>("[data-context-advanced='export-motion']");
    const videoSettings = this.root.querySelector<HTMLElement>("[data-video-settings]");
    if (render) { if (type === "video") render.value = "path"; render.disabled = type === "video"; }
    if (pathSettings) pathSettings.hidden = render?.value === "raster";
    if (videoSettings) videoSettings.hidden = type !== "video";
    if (button) button.textContent = type === "video" ? "패스트레이싱 MP4 만들기" : "PNG 내보내기";
    if (motion) motion.classList.toggle("workflow-relevant", type === "video");
  }

  private async runExportWorkflow(): Promise<void> {
    const type = this.root.querySelector<HTMLSelectElement>("[data-export-type]")?.value ?? "still";
    const render = this.root.querySelector<HTMLSelectElement>("[data-export-render]")?.value ?? "path";
    if (type === "video") { await this.exportPathTracedVideo(); return; }
    const printScale = this.settings.export.ppi / this.settings.advanced.renderRegion.unitPpi;
    if (render === "raster") { await this.renderRasterFrame(true, printScale, true, "hq"); return; }
    await this.renderPrintFrame(true);
  }

  private updatePhysical(patch: Partial<PhysicalLookParameters>): void {
    this.settings.look.physical = { ...this.settings.look.physical, ...patch };
    this.assembly.setPhysicalParameters(this.settings.look.physical);
  }

  setPrismStyle(id: PrismStyleId): void {
    const preset = PRISM_STYLE_PRESETS[sanitizePrismStyle(id)];
    this.settings.look.prismStyle = preset.id;
    this.settings.look.roughness = preset.roughness;
    this.settings.look.dispersion = preset.dispersion;
    this.settings.look.physical = { ...preset.physical };
    this.assembly.setRoughness(preset.roughness);
    this.assembly.setDispersion(preset.dispersion);
    this.assembly.setPhysicalParameters(preset.physical);
    const lighting = createLightingPreset(preset.lightingPreset);
    Object.assign(lighting.globals, preset.lightingGlobals);
    this.lighting.applyState(lighting);
    if (preset.id === "immersive") this.settings.format.scale = Math.max(this.settings.format.scale, 1.04);
    this.settings.ui.selectedVariationId = "";
    this.syncStudioUi(); this.resize(); this.persist();
  }

  private captureVariationSnapshot(): StudioVariationSnapshot {
    return {
      setup: { gap: this.settings.setup.gap, bevelRadius: this.settings.setup.bevelRadius, lightingRigVersion: 4, cameraPan: { ...this.settings.setup.cameraPan } },
      look: JSON.parse(JSON.stringify(this.settings.look)) as StudioVariationSnapshot["look"],
      lighting: JSON.parse(JSON.stringify(this.lighting.state)) as LightingState,
      motion: JSON.parse(JSON.stringify(this.settings.motion)) as MotionSettings,
      format: JSON.parse(JSON.stringify(this.settings.format)) as ArtboardState,
      camera: { position: this.camera.position.toArray() as [number, number, number], target: this.controls.target.toArray() as [number, number, number], zoom: this.camera.zoom },
      heroTime: this.motionClock.time,
    };
  }

  serializeModeState(): StudioVariationSnapshot { return this.captureVariationSnapshot(); }

  restoreModeState(value: StudioVariationSnapshot): void {
    const snapshot = this.variations.sanitizeSnapshot(value);
    this.pause();
    this.settings.setup.gap = snapshot.setup.gap; this.settings.setup.bevelRadius = snapshot.setup.bevelRadius; this.settings.setup.cameraPan = { ...snapshot.setup.cameraPan };
    this.settings.look = JSON.parse(JSON.stringify(snapshot.look)) as StudioSettingsV2["look"];
    this.settings.motion = JSON.parse(JSON.stringify(snapshot.motion)) as MotionSettings;
    this.settings.format = JSON.parse(JSON.stringify(snapshot.format)) as ArtboardState;
    this.assembly.setGap(snapshot.setup.gap); this.assembly.setBevelRadius(snapshot.setup.bevelRadius);
    this.assembly.setSpectralFlowState(snapshot.look.spectralFlow); this.assembly.setSoftSpectralState(snapshot.look.softSpectral); this.assembly.setLook(snapshot.look.preset);
    this.assembly.setRoughness(snapshot.look.roughness); this.assembly.setDispersion(snapshot.look.dispersion); this.assembly.setPhysicalParameters(snapshot.look.physical);
    this.motionAdapter.captureRestPose();
    this.lighting.applyState(snapshot.lighting); this.lightingPanel.refreshValues();
    this.camera.position.fromArray(snapshot.camera.position); this.controls.target.fromArray(snapshot.camera.target); this.camera.zoom = snapshot.camera.zoom; this.camera.updateProjectionMatrix(); this.controls.update();
    this.motionClock.reset(); this.seek(snapshot.heroTime);
    this.syncStudioUi(); this.resize(); this.persist();
  }

  applyVariation(id: string): void {
    const variation = this.variations.get(id); if (!variation) return;
    const currentArtboard = JSON.parse(JSON.stringify(this.settings.format)) as ArtboardState;
    this.restoreModeState({ ...variation.snapshot, format: currentArtboard });
    this.settings.ui.selectedVariationId = id;
    this.syncStudioUi(); this.resize(); this.persist();
  }

  listVariations(): Array<{ id: string; label: string; builtin: boolean; modeId: "glass-3d" }> {
    return this.variations.list().map(({ id, label, builtin, modeId }) => ({ id, label, builtin, modeId }));
  }

  private saveCurrentVariation(): void {
    const count = this.variations.list().filter((item) => !item.builtin).length + 1;
    const item = this.variations.save(`Variation ${String(count).padStart(2, "0")}`, this.captureVariationSnapshot());
    this.settings.ui.selectedVariationId = item.id; this.syncVariationUi(); this.persist();
  }

  private duplicateVariation(): void {
    const item = this.variations.duplicate(this.settings.ui.selectedVariationId); if (!item) return;
    this.settings.ui.selectedVariationId = item.id; this.syncVariationUi(); this.persist();
  }

  private renameVariation(): void {
    const current = this.variations.get(this.settings.ui.selectedVariationId); if (!current || current.builtin) return;
    const label = window.prompt("Variation 이름", current.label); if (!label?.trim()) return;
    this.variations.rename(current.id, label.trim()); this.syncVariationUi();
  }

  private deleteVariation(): void {
    const current = this.variations.get(this.settings.ui.selectedVariationId); if (!current || current.builtin) return;
    this.variations.remove(current.id); this.settings.ui.selectedVariationId = "builtin-prism-clean"; this.syncVariationUi(); this.persist();
  }

  private syncVariationUi(): void {
    const select = this.root.querySelector<HTMLSelectElement>("[data-variation]"); if (!select) return;
    select.innerHTML = `<option value="">현재 설정</option>` + this.variations.list().map((item) => `<option value="${item.id}">${item.label}${item.builtin ? "" : " · User"}</option>`).join("");
    select.value = this.settings.ui.selectedVariationId;
    const selected = this.variations.get(this.settings.ui.selectedVariationId);
    for (const action of ["variation-rename", "variation-delete"]) { const button = this.root.querySelector<HTMLButtonElement>(`[data-action='${action}']`); if (button) button.disabled = !selected || selected.builtin; }
  }

  private syncNumeric(name: string, value: number): void {
    const range = this.root.querySelector<HTMLInputElement>(`[data-control='${name}']`); const number = this.root.querySelector<HTMLInputElement>(`[data-number='${name}']`);
    if (range) range.value = String(value); if (number) number.value = String(value);
  }

  private syncStudioUi(): void {
    const lookSelect = this.root.querySelector<HTMLSelectElement>("[data-look-select]"); if (lookSelect) lookSelect.value = this.settings.look.preset;
    const prismStyleSelect = this.root.querySelector<HTMLSelectElement>("[data-prism-style-select]"); if (prismStyleSelect) prismStyleSelect.value = this.settings.look.prismStyle;
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.classList.toggle("active", button.dataset.look === this.settings.look.preset));
    this.root.querySelectorAll<HTMLButtonElement>("[data-prism-style]").forEach((button) => button.classList.toggle("active", button.dataset.prismStyle === this.settings.look.prismStyle));
    this.root.querySelector<HTMLElement>("[data-spectral-flow-controls]")?.toggleAttribute("hidden", this.settings.look.preset !== "spectral-flow");
    this.root.querySelector<HTMLElement>("[data-soft-spectral-controls]")?.toggleAttribute("hidden", this.settings.look.preset !== "soft-spectral");
    this.root.querySelector<HTMLElement>("[data-physical-optics]")?.toggleAttribute("hidden", this.settings.look.preset === "spectral-flow" || this.settings.look.preset === "soft-spectral");
    this.root.querySelector<HTMLElement>("[data-prism-style-panel]")?.toggleAttribute("hidden", this.settings.look.preset !== "prism");
    [["gap", this.settings.setup.gap], ["bevel-radius", this.settings.setup.bevelRadius], ["roughness", this.settings.look.roughness], ["dispersion", this.settings.look.dispersion], ["ior", this.settings.look.physical.ior], ["thickness", this.settings.look.physical.thickness], ["attenuation-distance", this.settings.look.physical.attenuationDistance], ["iridescence", this.settings.look.physical.iridescence], ["motion-strength", this.settings.motion.strength], ["motion-duration", this.settings.motion.duration], ["motion-fps", this.settings.motion.fps], ["artboard-scale", this.settings.format.scale], ["axis-anchor-x", this.settings.format.axisAnchor.gridX], ["axis-anchor-y", this.settings.format.axisAnchor.gridY], ["camera-pan-x", this.settings.setup.cameraPan.x], ["camera-pan-y", this.settings.setup.cameraPan.y]].forEach(([name, value]) => this.syncNumeric(name as string, value as number));
    const motionPreset = this.root.querySelector<HTMLSelectElement>("[data-motion='preset']"); if (motionPreset) motionPreset.value = this.settings.motion.preset;
    const motionEnabled = this.root.querySelector<HTMLInputElement>("[data-motion='enabled']"); if (motionEnabled) motionEnabled.checked = this.settings.motion.enabled;
    const strength = this.root.querySelector<HTMLSelectElement>("[data-motion='strength-mode']"); if (strength) strength.value = this.settings.motion.strengthMode;
    const loop = this.root.querySelector<HTMLInputElement>("[data-motion='loop']"); if (loop) loop.checked = this.settings.motion.loop;
    const background = this.root.querySelector<HTMLInputElement>("[data-format='background']"); if (background) background.value = this.settings.format.background;
    const transparent = this.root.querySelector<HTMLInputElement>("[data-format='transparent']"); if (transparent) transparent.checked = this.settings.format.transparent;
    const transparentMirror = this.root.querySelector<HTMLInputElement>("[data-format='transparent-mirror']"); if (transparentMirror) transparentMirror.checked = this.settings.format.transparent;
    this.root.querySelectorAll<HTMLButtonElement>("[data-format-preset]").forEach((button) => button.classList.toggle("active", button.dataset.formatPreset === this.settings.format.id));
    this.syncSpectralFlowUi(); this.syncSoftSpectralUi(); this.renderPresetParameters(); this.syncVariationUi(); this.updateTransport(); this.updateRenderUi();
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
    if (this.settings.look.preset === "soft-spectral") this.motionAdapter.restoreRestPose();
    else this.motionAdapter.applyFrame(patch);
    this.assembly.setDispersion(this.settings.look.dispersion + (patch.dispersionOffset ?? 0));
    this.assembly.setSpectralFlowRuntime(time, this.settings.motion.duration, this.settings.motion.enabled, patch.spectralSweep ?? 0);
    this.assembly.setSoftSpectralRuntime(time, this.settings.motion.duration, this.settings.motion.enabled, patch.spectralSweep ?? 0);
    this.applyMotionLights(patch, time);
    const spectralBloom = this.settings.look.preset === "spectral-flow" ? this.settings.look.spectralFlow.bloom : this.settings.look.preset === "soft-spectral" ? this.settings.look.softSpectral.bloom : 0;
    this.previewBloom.strength = this.settings.lighting.globals.bloomIntensity + spectralBloom + (patch.bloomOffset ?? 0);
    this.webgpuPreview.setBloom(this.settings.lighting.globals.bloomIntensity + (patch.bloomOffset ?? 0));
    this.showPreview();
    this.updateTransport();
  }

  private applyMotionLights(patch: MotionPatch, time = this.motionClock.time): void {
    const rig = patch.lightRig;
    const radians = THREE.MathUtils.degToRad(rig?.direction ?? 30);
    const progress = THREE.MathUtils.clamp(((rig?.travel ?? -1) + 1) * .5, 0, 1);
    const orbit = progress * Math.PI * 2;
    const stripLength = THREE.MathUtils.lerp(2.4, 6.2, rig?.emitterLength ?? .72);
    const stripWidth = THREE.MathUtils.lerp(.08, 1.35, rig?.emitterWidth ?? .34);
    const dominanceWeights = colorDominanceWeights(time, this.settings.motion.duration);
    this.motionLights.forEach((light, index) => {
      const pathLight = this.pathMotionLights[index];
      if (index === 0) {
        // White stays broad and slow: it supports the glass silhouette but no
        // longer drives the look.
        light.position.set(
          -2.9 + Math.cos(orbit * .42) * .55,
          4.1 + Math.sin(orbit * .42) * .38,
          -4.2 + Math.sin(orbit * .3) * .28,
        );
        light.intensity = (rig?.whitePulse ?? 0) * 260;
        pathLight.position.copy(light.position);
        pathLight.width = 6.4;
        pathLight.height = 4.6;
        pathLight.lookAt(0, .1, 0);
        pathLight.rotateZ(orbit * .08);
        pathLight.intensity = (rig?.whitePulse ?? 0) * 34;
        return;
      }

      // Blue, red and green use offset elliptical orbits and independent
      // depth waves. Their highlights therefore cross different facets,
      // bevels and the shared vertex instead of reading as a flat RGB wash.
      const colorIndex = index - 1;
      const dominance = dominanceWeights[colorIndex];
      const dominanceRatio = dominance / SPECTRAL_DOMINANT_SHARE;
      const energyScale = dominance * 3;
      const phase = colorIndex * Math.PI * 2 / 3;
      const directionSign = colorIndex === 1 ? -1 : 1;
      const azimuth = radians + phase + orbit * directionSign;
      const radius = (3.05 + Math.sin(orbit * 1.7 + phase) * .52) * THREE.MathUtils.lerp(1.06, .9, dominanceRatio);
      const depth = -2.15 + Math.sin(orbit * 1.35 + phase * 1.4) * 1.32 + THREE.MathUtils.lerp(.65, -.95, dominanceRatio);
      light.position.set(
        Math.cos(azimuth) * radius,
        Math.sin(azimuth) * radius * .82,
        depth,
      );
      const colorWeight = MOTION_STRIP_COLOR_WEIGHT[colorIndex];
      light.intensity = (rig?.spectralIntensity ?? 0) * 1100 * colorWeight * energyScale;

      // Only the path-traced result uses the finite emitter dimensions. Narrow
      // widths read as a line; wider values become a soft illuminated plane.
      pathLight.position.copy(light.position);
      pathLight.width = stripLength * MOTION_STRIP_LENGTH_SCALE[colorIndex] * THREE.MathUtils.lerp(.86, 1.3, dominanceRatio);
      pathLight.height = stripWidth * MOTION_STRIP_WIDTH_SCALE[colorIndex] * THREE.MathUtils.lerp(.78, 1.4, dominanceRatio);
      pathLight.lookAt(0, 0, 0);
      pathLight.rotateZ(phase * .38 + orbit * (.16 + colorIndex * .035));
      pathLight.intensity = (rig?.spectralIntensity ?? 0) * 76 * colorWeight * energyScale;
    });
    this.motionRig.position.set(0, 0, 0);
    this.pathMotionRig.position.set(0, 0, 0);
  }

  private showPreview(message?: string): void {
    if (this.renderJob) {
      this.renderJob.resolve?.("");
      this.renderJob = null;
    }
    if (!this.videoExportJob && this.resizeDeferredByRender) {
      this.resizeDeferredByRender = false;
      this.resize();
      if (message) this.require<HTMLElement>("[data-output='samples']").textContent = message;
      return;
    }
    this.renderingHigh = false;
    this.pathTracer.pausePathTracing = true;
    this.webgpuPathTracer.pause();
    this.setMotionLightRenderMode("preview");
    this.lighting.setPathTracingShapeMode(false);
    this.pathRenderer.domElement.classList.remove("visible");
    this.webgpuPathTracer.canvas.classList.remove("visible");
    this.renderPreviewFrame();
    if (message) this.require<HTMLElement>("[data-output='samples']").textContent = message;
    this.updateRenderUi();
  }

  private canUseWebGPUPreview(): boolean {
    // onBeforeCompile GLSL looks are intentionally kept on the established
    // WebGL pipeline. Clear/prism/smoked are standard MeshPhysicalMaterial
    // looks and render through the native WebGPU backend.
    return this.webgpuPreview.isNativeWebGPU && this.settings.look.preset !== "spectral-flow" && this.settings.look.preset !== "soft-spectral";
  }

  private renderPreviewFrame(): void {
    const useWebGPU = this.canUseWebGPUPreview();
    this.webgpuPreview.canvas.classList.toggle("visible", useWebGPU);
    this.previewRenderer.domElement.classList.toggle("visible", !useWebGPU);
    if (!useWebGPU || !this.webgpuPreview.render()) this.previewComposer.render();
  }

  private resize(): void {
    // ResizeObserver can fire while the path tracer owns the shared scene.
    // Deferring layout prevents a harmless panel/layout change from silently
    // resolving the active job as a cancellation.
    if (this.renderJob || this.videoExportJob) {
      this.resizeDeferredByRender = true;
      return;
    }
    this.resizeDeferredByRender = false;
    const layout = getComputedStyle(this.require<HTMLElement>(".motion-studio"));
    const leftPanelWidth = Number.parseFloat(layout.getPropertyValue("--left-panel-space")) || 0;
    const rightPanelWidth = Number.parseFloat(layout.getPropertyValue("--right-panel-space")) || 0;
    const transportHeight = this.settings.motion.enabled ? 48 : 0;
    const width = Math.max(240, this.root.clientWidth - leftPanelWidth - rightPanelWidth);
    const height = Math.max(240, this.root.clientHeight - transportHeight);
    const preview = this.composition.fitPreview(width, height, this.settings.format);
    this.artboardShell.style.width = `${preview.width}px`;
    this.artboardShell.style.height = `${preview.height}px`;
    this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.previewRenderer.setSize(preview.width, preview.height, false);
    this.previewComposer.setSize(preview.width, preview.height);
    this.webgpuPreview.setSize(preview.width, preview.height, Math.min(devicePixelRatio, 1.75));
    this.pathRenderer.setPixelRatio(1);
    this.pathRenderer.setSize(preview.width, preview.height, false);
    this.pathComposer.setSize(preview.width, preview.height);
    const cameraPositionBeforeComposition = this.camera.position.clone();
    this.composition.apply(this.camera, this.settings.format, this.settings.setup.cameraPan);
    this.controls.target.add(this.camera.position.clone().sub(cameraPositionBeforeComposition));
    this.controls.update();
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
    this.webgpuPreview.setClearColor(this.settings.format.background, alpha);
    this.webgpuPathTracer.setClearColor(this.settings.format.background, alpha);
    this.pathRenderer.setClearColor(this.settings.format.background, alpha);
    this.artboardShell.classList.toggle("transparent", this.settings.format.transparent);
  }

  private updateAdvanced(): void {
    const advancedOpen = Array.from(this.root.querySelectorAll<HTMLDetailsElement>("[data-context-advanced]")).some((details) => details.open);
    this.settings.ui.advancedOpen = advancedOpen;
    const regionOpen = this.root.querySelector<HTMLDetailsElement>("[data-context-advanced='export-region']")?.open === true;
    this.root.querySelector<HTMLElement>("[data-render-region-guide]")?.classList.toggle("active", regionOpen && this.settings.advanced.renderRegion.enabled);
  }

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
  getSequenceCommand(): string { return `npm run render:motion -- --look ${this.settings.look.preset} --preset ${this.settings.motion.preset} --width ${this.settings.format.width} --height ${this.settings.format.height} --fps ${this.settings.motion.fps} --duration ${this.settings.motion.duration} --quality raster --out artifacts/motion/${this.settings.look.preset}-${this.settings.motion.preset}`; }
  private sequenceCommand(): string { return this.getSequenceCommand(); }

  play(): void { if (!this.settings.motion.enabled) { this.settings.motion.enabled = true; this.require<HTMLInputElement>("[data-motion='enabled']").checked = true; } this.showPreview(); this.controls.enabled = false; this.motionClock.setRealtime(); this.motionClock.play(); this.updateTransport(); }
  pause(): void { this.motionClock.pause(); this.controls.enabled = !this.settings.setup.viewLocked; this.updateTransport(); }
  seek(time: number): void { this.motionClock.seek(Math.min(this.settings.motion.duration, Math.max(0, time)), this.settings.motion.fps); this.applyMotionAt(this.motionClock.time); }
  stepFrame(frames: number): void { this.pause(); this.motionClock.step(frames, this.settings.motion.fps, this.settings.motion.duration); this.applyMotionAt(this.motionClock.time); }
  resetMotion(): void { this.motionClock.reset(); this.motionAdapter.restoreRestPose(); this.assembly.setDispersion(this.settings.look.dispersion); this.assembly.setSpectralFlowRuntime(0, this.settings.motion.duration, this.settings.motion.enabled, 0); this.assembly.setSoftSpectralRuntime(0, this.settings.motion.duration, this.settings.motion.enabled, 0); this.applyMotionLights({}); this.lastPatch = {}; this.showPreview(); this.updateTransport(); }

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
    this.syncNumeric("artboard-scale", this.settings.format.scale); this.syncNumeric("axis-anchor-x", this.settings.format.axisAnchor.gridX); this.syncNumeric("axis-anchor-y", this.settings.format.axisAnchor.gridY);
    this.root.querySelectorAll<HTMLButtonElement>("[data-format-preset]").forEach((button) => button.classList.toggle("active", button.dataset.formatPreset === this.settings.format.id));
    this.resize(); this.persist();
  }

  setRenderRegion(patch: Partial<RenderRegion>): void {
    this.settings.advanced.renderRegion = sanitizeRenderRegion({ ...this.settings.advanced.renderRegion, ...patch }, this.settings.advanced.renderRegion);
    this.updateRenderRegion(); this.showPreview(); this.persist();
  }

  setLook(look: CrystalLook): void {
    this.settings.look.preset = look;
    this.assembly.setSpectralFlowState(this.settings.look.spectralFlow);
    this.assembly.setSoftSpectralState(this.settings.look.softSpectral);
    this.assembly.setLook(look);
    this.assembly.setRoughness(this.settings.look.roughness);
    this.assembly.setDispersion(this.settings.look.dispersion);
    this.assembly.setPhysicalParameters(this.settings.look.physical);
    if (look === "soft-spectral") {
      this.settings.motion.preset = "spectral-axis-sweep"; this.settings.motion.duration = 8; this.settings.motion.enabled = true;
      const neutral = createLightingPreset("soft-glass");
      neutral.lights.forEach((light, index) => { light.color = index % 3 === 0 ? "#CDDCFF" : index % 2 === 0 ? "#F2F2F2" : "#FFFFFF"; });
      Object.assign(neutral.globals, { masterIntensity: .68, environmentIntensity: .22, exposure: .96, bloomIntensity: .035, colorSaturation: .24 });
      this.lighting.applyState(neutral); this.lightingPanel.refreshValues();
    }
    this.assembly.setSpectralFlowRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.assembly.setSoftSpectralRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.classList.toggle("active", button.dataset.look === look));
    const lookSelect = this.root.querySelector<HTMLSelectElement>("[data-look-select]"); if (lookSelect) lookSelect.value = look;
    const spectralControls = this.root.querySelector<HTMLElement>("[data-spectral-flow-controls]");
    const softSpectralControls = this.root.querySelector<HTMLElement>("[data-soft-spectral-controls]");
    const physicalControls = this.root.querySelector<HTMLElement>("[data-physical-optics]");
    const prismStylePanel = this.root.querySelector<HTMLElement>("[data-prism-style-panel]");
    if (spectralControls) spectralControls.hidden = look !== "spectral-flow";
    if (softSpectralControls) softSpectralControls.hidden = look !== "soft-spectral";
    if (physicalControls) physicalControls.hidden = look === "spectral-flow" || look === "soft-spectral";
    if (prismStylePanel) prismStylePanel.hidden = look !== "prism";
    this.settings.ui.selectedVariationId = ""; this.syncVariationUi();
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
    this.settings.ui.selectedVariationId = ""; this.syncVariationUi();
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

  setSoftSpectral(patch: Partial<SoftSpectralState>): void {
    this.updateSoftSpectral(patch); this.syncSoftSpectralUi(); this.persist();
  }

  setSoftSpectralPreset(preset: SoftSpectralPresetId): void {
    this.settings.look.softSpectral = { ...SOFT_SPECTRAL_PRESETS[preset] };
    this.assembly.setSoftSpectralState(this.settings.look.softSpectral);
    this.assembly.setSoftSpectralRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.syncSoftSpectralUi(); this.settings.ui.selectedVariationId = ""; this.syncVariationUi(); this.applyMotionAt(this.motionClock.time); this.persist();
  }

  private updateSoftSpectral(patch: Partial<SoftSpectralState>): void {
    this.settings.look.softSpectral = sanitizeSoftSpectralState({ ...this.settings.look.softSpectral, ...patch, preset: this.settings.look.softSpectral.preset });
    this.assembly.setSoftSpectralState(this.settings.look.softSpectral);
    this.assembly.setSoftSpectralRuntime(this.motionClock.time, this.settings.motion.duration, this.settings.motion.enabled, this.lastPatch.spectralSweep ?? 0);
    this.applyMotionAt(this.motionClock.time);
  }

  private syncSoftSpectralUi(): void {
    const state = this.settings.look.softSpectral;
    const values: Array<[string, number]> = [
      ["soft-glow", state.glow], ["soft-spectrum", state.spectrum], ["soft-edge", state.edge], ["soft-darkness", state.darkness], ["soft-motion-depth", state.motionDepth],
      ["soft-center-radius", state.centerRadius], ["soft-center-softness", state.centerSoftness], ["soft-spread", state.spectrumSpread], ["soft-separation", state.spectrumSeparation],
      ["soft-saturation", state.saturation], ["soft-phase-offset", state.phaseOffset], ["soft-edge-attraction", state.edgeAttraction], ["soft-edge-softness", state.edgeSoftness],
      ["soft-reflection", state.reflection], ["soft-roughness", state.roughness], ["soft-falloff", state.falloff], ["soft-bloom", state.bloom],
    ];
    values.forEach(([name, value]) => this.syncNumeric(name, value));
    this.root.querySelectorAll<HTMLButtonElement>("[data-soft-spectral-preset]").forEach((button) => button.classList.toggle("active", button.dataset.softSpectralPreset === state.preset));
  }

  private resetCamera(): void { this.camera.position.set(0, 0, -12); this.camera.lookAt(0, .02, 0); this.camera.zoom = 1; this.camera.updateProjectionMatrix(); this.controls.target.set(0, .02, 0); this.controls.update(); this.resize(); }

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
    this.resize(); this.showPreview(`${this.settings.look.preset === "spectral-flow" ? "Spectral Flow" : this.settings.look.preset === "soft-spectral" ? "Soft Spectral" : "Raster"} PNG 준비 완료 · ${output.width} × ${output.height}px`);
    return dataUrl;
  }

  renderCurrentFrame(download = true): Promise<string> {
    if (this.settings.look.preset === "spectral-flow" || this.settings.look.preset === "soft-spectral") return this.renderRasterFrame(download, 1, false, "hq");
    return this.startPathRender("high", download, 1, false);
  }

  renderPreview(quality: RenderQuality): Promise<string> {
    if (this.settings.look.preset === "spectral-flow" || this.settings.look.preset === "soft-spectral") return this.renderRasterFrame(false, 1, false, quality === "high" ? "hq" : "raster");
    return this.startPathRender(quality, false, 1, false);
  }

  renderPrintFrame(download = true): Promise<string> {
    const printScale = this.settings.export.ppi / this.settings.advanced.renderRegion.unitPpi;
    if (this.settings.look.preset === "spectral-flow" || this.settings.look.preset === "soft-spectral") return this.renderRasterFrame(download, printScale, true, "hq");
    return this.startPathRender("high", download, printScale, true);
  }

  private startPathRender(quality: RenderQuality, download: boolean, printScale: number, printOutput: boolean): Promise<string> {
    this.pause(); this.applyMotionAt(this.motionClock.time);
    const output = this.scaledOutput(printScale);
    const backend: "webgpu" | "webgl" = this.webgpuPathTracer.isReady ? "webgpu" : "webgl";
    const maxTextureSize = backend === "webgpu" ? this.webgpuPathTracer.maxTextureSize : this.pathRenderer.capabilities.maxTextureSize;
    if (output.width > maxTextureSize || output.height > maxTextureSize) return Promise.reject(new Error(`${output.width} × ${output.height}px가 GPU 한계 ${maxTextureSize}px를 초과합니다.`));
    const targetSamples = quality === "fast" ? FAST_RENDER_SAMPLES : this.settings.advanced.targetSamples;
    const bounces = quality === "fast" ? FAST_RENDER_BOUNCES : this.settings.advanced.bounces;
    this.renderingHigh = true;
    // The freshly reset path-tracing target is black. Keep the active preview
    // visible until the render loop has accumulated enough useful samples.
    this.pathRenderer.domElement.classList.remove("visible");
    this.webgpuPathTracer.canvas.classList.remove("visible");
    this.pathCamera.copy(this.camera);
    this.pathCamera.setViewOffset(output.fullWidth, output.fullHeight, output.x, output.y, output.width, output.height);
    this.pathCamera.updateProjectionMatrix();
    this.applyPathCanvasFrame();
    this.setMotionLightRenderMode("path");
    this.lighting.setPathTracingShapeMode(true);
    try {
      if (backend === "webgpu") {
        this.webgpuPathTracer.prepare(this.scene, this.pathCamera, output.width, output.height, {
          bounces,
          renderScale: quality === "fast" ? FAST_RENDER_SCALE : this.settings.advanced.renderScale,
          targetSamples,
          filterGlossyFactor: quality === "high" ? .25 : 0,
        });
      } else {
        this.pathRenderer.setPixelRatio(1); this.pathRenderer.setSize(output.width, output.height, false); this.pathComposer.setSize(output.width, output.height);
        this.pathTracer.renderScale = quality === "fast" ? FAST_RENDER_SCALE : this.settings.advanced.renderScale;
        this.pathTracer.filterGlossyFactor = quality === "high" ? .25 : 0;
        this.pathTracer.bounces = bounces; this.pathTracer.transmissiveBounces = bounces + 4;
        this.pathDenoise.enabled = false;
        this.pathTracer.setScene(this.scene, this.pathCamera); this.pathTracer.reset(); this.pathTracer.pausePathTracing = false;
      }
      this.require<HTMLElement>("[data-output='samples']").textContent = `${quality === "fast" ? "빠른" : "고품질"} 렌더링 0 / ${targetSamples} spp · ${backend === "webgpu" ? "WebGPU" : "WebGL 폴백"} · ${output.width} × ${output.height}px`;
      return new Promise<string>((resolve, reject) => {
        this.renderJob = { backend, quality, targetSamples, download, printScale, printOutput, width: output.width, height: output.height, resolve, reject };
        this.updateRenderUi();
      });
    } catch (error) {
      this.renderingHigh = false;
      this.setMotionLightRenderMode("preview");
      this.lighting.setPathTracingShapeMode(false);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private applyPathCanvasFrame(): void {
    const region = this.activeRegion();
    for (const canvas of [this.pathRenderer.domElement, this.webgpuPathTracer.canvas]) {
      Object.assign(canvas.style, {
        left: `${region.x / this.settings.format.width * 100}%`, top: `${region.y / this.settings.format.height * 100}%`,
        width: `${region.width / this.settings.format.width * 100}%`, height: `${region.height / this.settings.format.height * 100}%`,
        right: "auto", bottom: "auto",
      });
    }
  }

  private cancelPathRender(message: string): void {
    const job = this.renderJob;
    this.renderJob = null; this.renderingHigh = false; this.pathTracer.pausePathTracing = true;
    this.webgpuPathTracer.pause();
    this.setMotionLightRenderMode("preview");
    this.lighting.setPathTracingShapeMode(false);
    job?.resolve?.("");
    this.pathRenderer.domElement.classList.remove("visible"); this.webgpuPathTracer.canvas.classList.remove("visible"); this.renderPreviewFrame();
    this.require<HTMLElement>("[data-output='samples']").textContent = message;
    this.updateRenderUi();
  }

  private cancelActiveRender(): void {
    if (this.videoExportJob) this.videoExportJob.cancelled = true;
    if (this.renderJob) this.cancelPathRender("영상 렌더링 취소 중…");
    else this.updateRenderUi();
  }

  private async exportPathTracedVideo(): Promise<void> {
    if (this.videoExportJob || this.renderJob) throw new Error("이미 렌더링이 진행 중입니다.");
    if (!("VideoEncoder" in window)) throw new Error("이 브라우저는 영상 인코딩을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 실행해 주세요.");

    const fps = Math.max(1, Math.round(this.settings.motion.fps));
    const duration = Math.max(1 / fps, this.settings.motion.duration);
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const outputSize = this.scaledOutput(1);
    const encodedWidth = outputSize.width + outputSize.width % 2;
    const encodedHeight = outputSize.height + outputSize.height % 2;
    const encodingCanvas = document.createElement("canvas");
    encodingCanvas.width = encodedWidth;
    encodingCanvas.height = encodedHeight;
    const context = encodingCanvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("영상 프레임 캔버스를 만들 수 없습니다.");

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const source = new CanvasSource(encodingCanvas, {
      codec: "avc",
      quality: new Quality("very-high"),
      keyFrameInterval: 2,
      latencyMode: "quality",
      hardwareAcceleration: "prefer-hardware",
    });
    output.addVideoTrack(source, { frameRate: fps });

    const originalTime = this.motionClock.time;
    this.pause();
    this.videoExportJob = { cancelled: false, completedFrames: 0, totalFrames };
    this.updateRenderUi();
    try {
      await output.start();
      for (let frame = 0; frame < totalFrames; frame += 1) {
        if (this.videoExportJob.cancelled) throw new DOMException("사용자가 영상 렌더링을 취소했습니다.", "AbortError");
        this.seek(frame / fps);
        const frameData = await this.renderCurrentFrame(false);
        if (!frameData || this.videoExportJob.cancelled) throw new DOMException("사용자가 영상 렌더링을 취소했습니다.", "AbortError");
        context.fillStyle = this.settings.format.background;
        context.fillRect(0, 0, encodedWidth, encodedHeight);
        context.drawImage(this.pathOutputCanvas(), 0, 0, outputSize.width, outputSize.height);
        await source.add(frame / fps, 1 / fps);
        this.videoExportJob.completedFrames = frame + 1;
        this.updateRenderUi();
      }
      await output.finalize();
      if (!target.buffer) throw new Error("MP4 파일 생성에 실패했습니다.");
      const url = URL.createObjectURL(new Blob([target.buffer], { type: "video/mp4" }));
      this.download(url, `pleos-axis-${this.settings.look.preset}-${this.settings.motion.preset}-${duration.toFixed(1)}s-${fps}fps-${encodedWidth}x${encodedHeight}-${this.settings.advanced.targetSamples}spp.mp4`);
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.showPreview(`MP4 준비 완료 · ${totalFrames}프레임 · ${this.settings.advanced.targetSamples} spp`);
    } catch (error) {
      if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      this.showPreview("영상 렌더링을 취소했습니다.");
    } finally {
      this.videoExportJob = null;
      this.seek(originalTime);
      this.setMotionLightRenderMode("preview");
      this.lighting.setPathTracingShapeMode(false);
      this.pathRenderer.domElement.classList.remove("visible");
      this.webgpuPathTracer.canvas.classList.remove("visible");
      this.renderingHigh = false;
      this.updateRenderUi();
      this.showPreview();
    }
  }

  private async finishHighRender(): Promise<void> {
    const job = this.renderJob; if (!job) return;
    let samples = Math.floor(this.currentPathSamples());
    this.renderJob = null; this.renderingHigh = false;
    this.lastCompletedPathBackend = job.backend;
    if (job.backend === "webgpu") {
      this.webgpuPathTracer.pause();
      samples = Math.floor((await this.webgpuPathTracer.refreshSampleCounts()).avg);
    } else {
      this.pathTracer.pausePathTracing = true; this.pathTexture.map = this.pathTracer.target.texture;
      // The WebGL fallback retains the established edge-aware finishing pass.
      this.pathDenoise.enabled = job.quality === "high";
      this.pathComposer.render();
    }
    this.lastCompletedPathSamples = samples;
    try {
      const dataUrl = job.backend === "webgpu" ? await this.webgpuPathTracer.capturePng() : this.pathRenderer.domElement.toDataURL("image/png");
      if (job.download) this.download(await this.injectPpi(dataUrl, this.settings.export.ppi), `pleos-axis-${job.printOutput ? "print" : "hq"}-${this.settings.motion.preset}-frame-${String(this.motionClock.frame).padStart(6, "0")}-${job.width}x${job.height}-${this.settings.export.ppi}ppi.png`);
      job.resolve?.(dataUrl); this.require<HTMLElement>("[data-output='samples']").textContent = `${job.quality === "fast" ? "빠른" : "고품질"} 렌더링 완료 · ${samples} spp · ${job.backend === "webgpu" ? "WebGPU" : "WebGL 폴백"} · ${job.width} × ${job.height}px`;
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
    this.webgpuPreview.setExposure(globals.exposure);
    this.webgpuPathTracer.setExposure(globals.exposure);
    this.previewBloom.strength = globals.bloomIntensity + (this.settings.look.preset === "spectral-flow" ? this.settings.look.spectralFlow.bloom : this.settings.look.preset === "soft-spectral" ? this.settings.look.softSpectral.bloom : 0); this.pathBloom.strength = globals.bloomIntensity;
    this.webgpuPreview.setBloom(globals.bloomIntensity);
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
    if (this.disposed) return;
    if (this.motionClock.tick(timestamp, this.settings.motion.speed, this.settings.motion.duration, this.settings.motion.fps, this.settings.motion.loop)) this.applyMotionAt(this.motionClock.time);
    this.controls.update();
    if (this.renderingHigh && this.renderJob) {
      const job = this.renderJob;
      try {
        if (job.backend === "webgpu") {
          this.webgpuPathTracer.renderSample(timestamp);
        } else {
          this.pathTracer.renderSample(); this.pathTexture.map = this.pathTracer.target.texture; this.pathComposer.render();
        }
        const samples = Math.floor(this.currentPathSamples());
        if (samples >= Math.min(PATH_PREVIEW_REVEAL_SAMPLES, job.targetSamples)) {
          this.pathOutputCanvas(job.backend).classList.add("visible");
        }
        if (samples > 0 && samples % 4 === 0) { this.require<HTMLElement>("[data-output='samples']").textContent = `${job.quality === "fast" ? "빠른" : "고품질"} 렌더링 ${samples} / ${job.targetSamples} spp · ${job.backend === "webgpu" ? "WebGPU" : "WebGL 폴백"}`; this.updateRenderUi(); }
        if (samples >= job.targetSamples) void this.finishHighRender();
      } catch (error) {
        const reason = error instanceof Error ? error : new Error(String(error));
        const failedJob = this.renderJob;
        this.renderJob = null;
        this.renderingHigh = false;
        this.webgpuPathTracer.pause();
        failedJob?.reject?.(reason);
        this.showPreview(`렌더링 실패 · ${reason.message}`);
      }
    } else if (!this.motionClock.playing) this.renderPreviewFrame();
    if (!this.disposed) this.raf = requestAnimationFrame(this.render);
  };

  inspect(): object {
    return {
      ready: true,
      project: "PLEOS 27 Axis",
      app: {
        entryPoint: "src/main.ts",
        defaultRoute: "/",
        activeApplication: "Glass3DMode / MotionStudioApp",
        renderer: "Three.js WebGPU preview + native WebGPU wavefront path tracer",
        previewRenderer: this.webgpuPreview.isNativeWebGPU ? "Three.js WebGPU + TSL PostProcessing/Bloom" : "Three.js WebGL compatibility preview",
        previewBackend: { requested: "webgpu", active: this.webgpuPreview.status, native: this.webgpuPreview.isNativeWebGPU, error: this.webgpuPreview.error },
        finalRenderer: this.webgpuPathTracer.isReady ? "three-gpu-pathtracer WebGPU wavefront compute" : "three-gpu-pathtracer WebGL compatibility fallback",
        pathTracerBackend: { requested: "webgpu", active: this.webgpuPathTracer.status, native: this.webgpuPathTracer.isReady, fallback: !this.webgpuPathTracer.isReady, error: this.webgpuPathTracer.error },
        projection: "orthographic",
        camera: { type: this.camera.type, position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom },
        sceneStructure: "3 closed optical solids meeting at one shared vertex",
      },
      renderer: this.webgpuPathTracer.isReady ? "Three.js WebGPU + WebGPU wavefront path tracer" : "Three.js WebGL compatibility + WebGL path tracer",
      motion: this.getMotionState(),
      motionPresets: MotionPresetRegistry.list().map((preset) => ({ id: preset.id, label: preset.label, duration: preset.duration, constraint: preset.constraint })),
      artboard: { ...this.settings.format },
      artboardPresets: FormatPresetRegistry.list(),
      renderRegion: { ...this.settings.advanced.renderRegion },
      export: { ppi: this.settings.export.ppi, rasterPng: true, pathTracedStill: true, pathTracedMp4: true, fixedTimestepSequence: true, transparency: true },
      pathTracing: { active: this.renderingHigh, backend: this.renderJob?.backend ?? this.lastCompletedPathBackend ?? (this.webgpuPathTracer.isReady ? "webgpu" : "webgl"), samples: this.renderJob ? this.currentPathSamples() : this.lastCompletedPathSamples, samplesPerSecond: (this.renderJob?.backend ?? this.lastCompletedPathBackend) === "webgpu" ? this.webgpuPathTracer.sampleCounts.samplesPerSecond : null, quality: this.renderJob?.quality ?? null, output: this.renderJob ? [this.renderJob.width, this.renderJob.height] : null, dispersion: (this.renderJob?.backend ?? this.lastCompletedPathBackend ?? (this.webgpuPathTracer.isReady ? "webgpu" : "webgl")) === "webgpu" ? "not-supported-upstream" : "supported" },
      assembly: this.assembly.inspect(),
      look: { ...this.settings.look, physical: { ...this.settings.look.physical }, spectralFlow: { ...this.settings.look.spectralFlow } },
      variations: { selectedId: this.settings.ui.selectedVariationId, modeAware: true, items: this.listVariations() },
      sharedVertexValid: this.motionAdapter.getSharedCornerValidity(),
      inspector: { layout: "left-structure / canvas / right-appearance", left: ["geometry", "camera", "composition"], right: ["style", "material", "lighting", "motion", "output"], collapsible: true, contextualAdvanced: true, consolidatedExport: true },
      storageVersion: 2,
    };
  }
  getMotionState(): object { return { preset: this.settings.motion.preset, enabled: this.settings.motion.enabled, playing: this.motionClock.playing, time: this.motionClock.time, frame: this.motionClock.frame, duration: this.settings.motion.duration, fps: this.settings.motion.fps, seed: this.settings.motion.seed, preview: "realtime-optical", patch: this.lastPatch }; }
  private persist(): void {
    const panelStatus = this.root.querySelector<HTMLElement>("[data-output='save']");
    const topbarStatus = this.root.querySelector<HTMLElement>("[data-output='topbar-save']");
    if (panelStatus) panelStatus.textContent = "저장 중";
    if (topbarStatus) topbarStatus.textContent = "Saving";
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_V2, JSON.stringify(this.settings));
      this.modeHeader.onStateChange?.();
      if (panelStatus) panelStatus.textContent = "저장됨";
      if (topbarStatus) topbarStatus.textContent = "Saved";
    }, 180);
  }
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.saveTimer); this.resizeObserver.disconnect(); window.removeEventListener("keydown", this.onKeydown); document.removeEventListener("visibilitychange", this.onVisibility); this.stage.removeEventListener("wheel", this.onCanvasWheel); this.stage.removeEventListener("gesturestart", this.onGestureStart as EventListener); this.stage.removeEventListener("gesturechange", this.onGestureChange as EventListener); this.stage.removeEventListener("gestureend", this.onGestureEnd as EventListener); this.controls.dispose(); this.previewComposer.dispose(); this.pathMotionLights.forEach((light) => light.dispose()); this.lighting.dispose(); this.environment.dispose(); this.assembly.dispose(); this.webgpuPreview.dispose(); this.webgpuPathTracer.dispose(); this.previewRenderer.dispose(); const pathTracer = this.pathTracer; const pathComposer = this.pathComposer; const pathRenderer = this.pathRenderer; window.setTimeout(() => { pathTracer.dispose(); pathComposer.dispose(); pathRenderer.dispose(); }, 350); }
  private require<T extends Element>(selector: string): T { const element = this.root.querySelector<T>(selector); if (!element) throw new Error(`Missing Motion Studio element: ${selector}`); return element; }
}
