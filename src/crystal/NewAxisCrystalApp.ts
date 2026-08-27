import "./CrystalApp.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { CrystalAssembly, type CrystalLook } from "./CrystalAssembly";
import { installStudioEnvironment, type PathTracingStudioEnvironment } from "./StudioEnvironment";
import { createLightingPreset, LightingSystem, sanitizeLightingState, type LightingChangeKind, type LightingState } from "./LightingSystem";
import { LightingPanel } from "./LightingPanel";
import { InspectorPanel, type InspectorTab } from "./InspectorPanel";
import { bindScrubbableNumbers } from "./InspectorScrub";

type RenderQuality = "fast" | "high";
type ExportPpi = 72 | 150 | 300;

interface ExportJob {
  ppi: ExportPpi;
  width: number;
  height: number;
  targetSamples: number;
}

interface StoredSettings {
  look: CrystalLook;
  roughness: number;
  dispersion: number;
  scale: number;
  bounces: number;
  gap: number;
  targetSamples: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraZoom: number;
  renderRegion: RenderRegion;
  unitPpi: number;
  regionPlacementVersion: number;
  exportPpi: ExportPpi;
  lighting: LightingState;
  activeInspectorTab: InspectorTab;
  inspectorCollapsed: boolean;
  cameraViewVersion: number;
}

interface RenderRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "pleos-27-axis-settings-v1";
const REGION_PLACEMENT_VERSION = 2;
const CAMERA_VIEW_VERSION = 4;
const FAST_RENDER_SAMPLES = 16;
const FAST_RENDER_SCALE = 0.5;
const FAST_RENDER_BOUNCES = 4;
const DEFAULT_SETTINGS: StoredSettings = {
  look: "prism",
  roughness: 0.04,
  dispersion: 0.16,
  scale: 0.75,
  bounces: 8,
  gap: 0,
  targetSamples: 128,
  cameraPosition: [0, 0, -12],
  cameraTarget: [0, 0.02, 0],
  cameraZoom: 1,
  renderRegion: { x: 120, y: 100, width: 640, height: 480 },
  unitPpi: 96,
  regionPlacementVersion: REGION_PLACEMENT_VERSION,
  exportPpi: 300,
  lighting: createLightingPreset("pleos-rgb"),
  activeInspectorTab: "material",
  inspectorCollapsed: false,
  cameraViewVersion: CAMERA_VIEW_VERSION,
};

function loadSettings(): StoredSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredSettings>;
    const number = (value: unknown, fallback: number, min: number, max: number): number =>
      typeof value === "number" && Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
    const migrateRegionToCenter = stored.regionPlacementVersion !== REGION_PLACEMENT_VERSION;
    const migrateAxisLayout = stored.cameraViewVersion !== CAMERA_VIEW_VERSION;
    return {
      look: stored.look === "clear" || stored.look === "smoked" || stored.look === "prism" ? stored.look : DEFAULT_SETTINGS.look,
      roughness: number(stored.roughness, DEFAULT_SETTINGS.roughness, 0.02, 0.28),
      dispersion: number(stored.dispersion, DEFAULT_SETTINGS.dispersion, 0, 0.35),
      scale: number(stored.scale, DEFAULT_SETTINGS.scale, 0.4, 1),
      bounces: Math.round(number(stored.bounces, DEFAULT_SETTINGS.bounces, 3, 14)),
      gap: migrateAxisLayout ? 0 : number(stored.gap, DEFAULT_SETTINGS.gap, 0, 0.45),
      targetSamples: Math.round(number(stored.targetSamples, DEFAULT_SETTINGS.targetSamples, 16, 512)),
      // A fresh page always opens on the approved top-facing isometric view.
      // Camera motion still works during the session, but cannot replace the
      // presentation-safe startup composition.
      cameraPosition: [...DEFAULT_SETTINGS.cameraPosition],
      cameraTarget: [...DEFAULT_SETTINGS.cameraTarget],
      cameraZoom: DEFAULT_SETTINGS.cameraZoom,
      renderRegion: {
        x: migrateRegionToCenter ? -1 : Math.round(number(stored.renderRegion?.x, DEFAULT_SETTINGS.renderRegion.x, 0, 10000)),
        y: migrateRegionToCenter ? -1 : Math.round(number(stored.renderRegion?.y, DEFAULT_SETTINGS.renderRegion.y, 0, 10000)),
        width: Math.round(number(stored.renderRegion?.width, DEFAULT_SETTINGS.renderRegion.width, 16, 10000)),
        height: Math.round(number(stored.renderRegion?.height, DEFAULT_SETTINGS.renderRegion.height, 16, 10000)),
      },
      unitPpi: Math.round(number(stored.unitPpi, DEFAULT_SETTINGS.unitPpi, 36, 1200)),
      regionPlacementVersion: REGION_PLACEMENT_VERSION,
      exportPpi: stored.exportPpi === 72 || stored.exportPpi === 150 || stored.exportPpi === 300 ? stored.exportPpi : DEFAULT_SETTINGS.exportPpi,
      lighting: sanitizeLightingState(stored.lighting),
      activeInspectorTab: stored.activeInspectorTab === "object" || stored.activeInspectorTab === "material" || stored.activeInspectorTab === "light" || stored.activeInspectorTab === "render" || stored.activeInspectorTab === "export" ? stored.activeInspectorTab : DEFAULT_SETTINGS.activeInspectorTab,
      inspectorCollapsed: stored.inspectorCollapsed === true,
      cameraViewVersion: CAMERA_VIEW_VERSION,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      cameraPosition: [...DEFAULT_SETTINGS.cameraPosition],
      cameraTarget: [...DEFAULT_SETTINGS.cameraTarget],
      renderRegion: { ...DEFAULT_SETTINGS.renderRegion, x: -1, y: -1 },
      unitPpi: DEFAULT_SETTINGS.unitPpi,
      regionPlacementVersion: REGION_PLACEMENT_VERSION,
      exportPpi: DEFAULT_SETTINGS.exportPpi,
      lighting: createLightingPreset("pleos-rgb"),
      activeInspectorTab: DEFAULT_SETTINGS.activeInspectorTab,
      inspectorCollapsed: false,
      cameraViewVersion: CAMERA_VIEW_VERSION,
    };
  }
}

export class NewAxisCrystalApp {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly regionGuide: HTMLElement;
  private readonly previewRenderer: THREE.WebGLRenderer;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pathTracer: WebGLPathTracer;
  private readonly scene = new THREE.Scene();
  private readonly overlayScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 80);
  private readonly pathCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 80);
  private readonly controls: OrbitControls;
  private readonly transformControls: TransformControls;
  private readonly settings = loadSettings();
  private readonly assembly = new CrystalAssembly();
  private readonly environment: PathTracingStudioEnvironment;
  private readonly lighting: LightingSystem;
  private readonly lightingPanel: LightingPanel;
  private readonly inspectorPanel: InspectorPanel;
  private readonly previewComposer: EffectComposer;
  private readonly previewBloom: UnrealBloomPass;
  private readonly pathComposer: EffectComposer;
  private readonly pathTexturePass: TexturePass;
  private readonly pathBloom: UnrealBloomPass;
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private frame = 0;
  private look: CrystalLook = this.settings.look;
  private isRendering = false;
  private targetSamples = this.settings.targetSamples;
  private activeTargetSamples = this.settings.targetSamples;
  private renderQuality: RenderQuality = "high";
  private exportJob: ExportJob | null = null;
  private finishingExport = false;
  private saveStatusTimer = 0;

  constructor(root: HTMLElement) {
    RectAreaLightUniformsLib.init();
    this.root = root;
    this.root.innerHTML = this.template();
    this.stage = this.require<HTMLElement>(".crystal-stage");
    this.regionGuide = this.require<HTMLElement>(".render-region-guide");

    this.previewRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      precision: "highp",
    });
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      precision: "highp",
      preserveDrawingBuffer: true,
    });
    [this.previewRenderer, this.renderer].forEach((renderer) => {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = this.settings.lighting.globals.exposure;
      renderer.setClearColor(0x050607, 1);
    });
    this.previewRenderer.domElement.className = "preview-canvas";
    this.renderer.domElement.className = "pathtrace-canvas";
    this.stage.prepend(this.previewRenderer.domElement);
    this.stage.insertBefore(this.renderer.domElement, this.regionGuide);

    this.camera.position.fromArray(this.settings.cameraPosition);
    this.camera.zoom = this.settings.cameraZoom;
    this.controls = new OrbitControls(this.camera, this.previewRenderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 2.5;
    this.controls.minPolarAngle = Math.PI * 0.31;
    this.controls.maxPolarAngle = Math.PI * 0.69;
    this.controls.target.fromArray(this.settings.cameraTarget);
    this.controls.update();
    this.pathCamera.copy(this.camera);

    this.transformControls = new TransformControls(this.camera, this.previewRenderer.domElement);
    this.transformControls.setMode("translate");
    this.overlayScene.add(this.transformControls.getHelper());
    this.transformControls.addEventListener("dragging-changed", (event) => { this.controls.enabled = !event.value; });
    this.transformControls.addEventListener("objectChange", () => this.lighting.syncSelectedFromObject());
    this.transformControls.addEventListener("mouseUp", () => this.lightingPanel.refreshValues());

    this.assembly.setLook(this.settings.look);
    this.assembly.setRoughness(this.settings.roughness);
    this.assembly.setDispersion(this.settings.dispersion);
    this.assembly.setGap(this.settings.gap);
    this.scene.add(this.assembly);
    this.environment = installStudioEnvironment(this.scene);
    this.environment.setIntensity(this.settings.lighting.globals.environmentIntensity);
    this.assembly.setOpticalLighting(this.settings.lighting.globals.reflectionStrength, this.settings.lighting.globals.refractionStrength);
    this.lighting = new LightingSystem(this.scene, this.overlayScene, this.settings.lighting, this.handleLightingChange);
    this.attachSelectedLightGizmo();

    this.pathTracer = new WebGLPathTracer(this.renderer);
    this.pathTracer.bounces = this.settings.bounces;
    this.pathTracer.transmissiveBounces = Math.max(this.settings.bounces + 2, 8);
    this.pathTracer.filterGlossyFactor = 0.35;
    this.pathTracer.tiles.set(2, 2);
    this.pathTracer.renderScale = this.settings.scale;
    this.pathTracer.minSamples = 1;
    this.pathTracer.fadeDuration = 220;
    this.pathTracer.renderDelay = 0;
    this.pathTracer.dynamicLowRes = true;
    this.pathTracer.lowResScale = 0.3;
    this.pathTracer.rasterizeScene = true;
    this.pathTracer.setScene(this.scene, this.pathCamera);
    this.pathTracer.pausePathTracing = true;
    this.pathTracer.renderToCanvas = false;

    this.previewComposer = new EffectComposer(this.previewRenderer);
    this.previewComposer.addPass(new RenderPass(this.scene, this.camera));
    this.previewBloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.settings.lighting.globals.bloomIntensity, 0.65, 0.78);
    this.previewComposer.addPass(this.previewBloom);
    this.previewComposer.addPass(new OutputPass());

    this.pathComposer = new EffectComposer(this.renderer);
    this.pathTexturePass = new TexturePass(this.pathTracer.target.texture);
    this.pathComposer.addPass(this.pathTexturePass);
    this.pathBloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.settings.lighting.globals.bloomIntensity, 0.65, 0.78);
    this.pathComposer.addPass(this.pathBloom);
    this.pathComposer.addPass(new OutputPass());

    this.lightingPanel = new LightingPanel(this.require<HTMLElement>("[data-lighting-panel]"), this.lighting, (mode) => this.transformControls.setMode(mode));
    this.inspectorPanel = new InspectorPanel(this.root, this.settings.activeInspectorTab, this.settings.inspectorCollapsed, (tab, collapsed) => {
      this.settings.activeInspectorTab = tab;
      this.settings.inspectorCollapsed = collapsed;
      this.setLightEditingVisible(tab === "light" && !collapsed);
      this.persistSettings();
    });
    this.setLightEditingVisible(this.settings.activeInspectorTab === "light" && !this.settings.inspectorCollapsed);

    this.controls.addEventListener("change", this.handleCameraChange);
    this.bindUi();
    bindScrubbableNumbers(this.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.resize();
    this.render();
  }

  private template(): string {
    return `
      <section class="crystal-app">
        <div class="crystal-stage" aria-label="Pleos 27 Axis GPU 패스 트레이싱 장면">
          <div class="render-region-guide" aria-hidden="true"><span data-output="region-size"></span></div>
        </div>
        <header class="topbar">
          <div class="wordmark"><strong>PLEOS</strong><span>27 AXIS / 직교 투영 GPU 패스 트레이싱</span></div>
          <div class="render-status"><span data-output="samples">준비 완료 · 빠른 미리보기</span></div>
        </header>
        <button class="inspector-toggle" data-action="inspector-toggle" aria-label="Inspector 표시 또는 숨기기"><span></span><span></span></button>
        <aside class="control-dock" aria-label="Pleos 3D Inspector">
          <header class="inspector-header"><div><strong>PLEOS AXIS</strong><span>INSPECTOR</span></div><div><small data-output="save">자동 저장</small><button data-action="inspector-close" aria-label="Inspector 닫기">×</button></div></header>
          <nav class="inspector-tabs" role="tablist" aria-label="Inspector 범주">
            ${(["object", "material", "light", "render", "export"] as InspectorTab[]).map((tab) => `<button role="tab" data-inspector-tab="${tab}">${tab.toUpperCase()}</button>`).join("")}
          </nav>
          <div class="inspector-views">
            <div class="inspector-view" data-inspector-view="object" role="tabpanel">
              ${this.inspectorSection("GEOMETRY", "세 개의 폐쇄형 광학 솔리드", this.parameterTemplate("gap", "Cube Gap", 0, 0.45, 0.01, this.settings.gap))}
              ${this.inspectorSection("CAMERA", "Top-facing orthographic isometric", `<div class="inspector-action-row"><button data-action="reset">기준 아이소메트릭 시점</button></div><p class="section-note">윗면이 보이는 수직 / ±30° 축으로 복원합니다. Cube Gap 0에서 세 중심 꼭짓점이 정확히 맞닿습니다.</p>`)}
            </div>
            <div class="inspector-view" data-inspector-view="material" role="tabpanel">
              ${this.inspectorSection("GLASS", "Neutral optical material", `<div class="look-switch" role="group" aria-label="재질 선택"><button data-look="clear" class="${this.settings.look === "clear" ? "active" : ""}">CLEAR</button><button data-look="prism" class="${this.settings.look === "prism" ? "active" : ""}">PRISM</button><button data-look="smoked" class="${this.settings.look === "smoked" ? "active" : ""}">SMOKED</button></div>${this.parameterTemplate("roughness", "Roughness", 0.02, 0.28, 0.01, this.settings.roughness)}`)}
              ${this.inspectorSection("REFRACTION", "Transmission response", this.parameterTemplate("refraction-strength", "Refraction", 0, 1.25, 0.01, this.settings.lighting.globals.refractionStrength))}
              ${this.inspectorSection("PRISM", "Spectral light dispersion", this.parameterTemplate("dispersion", "Dispersion", 0, 0.35, 0.01, this.settings.dispersion))}
              ${this.inspectorSection("EDGE & REFLECTION", "Fresnel과 environment response", this.parameterTemplate("reflection-strength", "Reflection", 0, 3, 0.05, this.settings.lighting.globals.reflectionStrength))}
              ${this.inspectorSection("INTERNAL REFLECTION", "패스 수는 RENDER 탭에서 조정", `<div class="optical-status"><span>IOR</span><b>1.52</b><span>Transmission</span><b>Physical</b><span>Fresnel</span><b>Enabled</b></div>`, false)}
            </div>
            <div class="inspector-view" data-inspector-view="light" role="tabpanel"><section class="lighting-panel" data-lighting-panel aria-label="LIGHTING 조명 시스템"></section></div>
            <div class="inspector-view" data-inspector-view="render" role="tabpanel">
              ${this.inspectorSection("SAMPLING", "GPU path tracing quality", `${this.parameterTemplate("scale", "Render Scale", 0.4, 1, 0.05, this.settings.scale)}${this.parameterTemplate("bounces", "Bounces", 3, 14, 1, this.settings.bounces)}${this.parameterTemplate("target-samples", "Target Samples", 16, 512, 16, this.settings.targetSamples)}`)}
              ${this.inspectorSection("RENDER REGION", "px · mm · cm · in 입력", `<div class="region-controls"><div class="region-head-actions"><button class="icon-button" data-action="region-center" aria-label="렌더 영역 가운데 정렬" title="렌더 영역 가운데 정렬"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/><rect x="6" y="6" width="8" height="8" rx="1"/><circle cx="10" cy="10" r="1"/></svg></button><button data-action="region-full">전체 화면</button></div><label class="unit-ppi">단위 기준 <span><input data-control="unit-ppi" data-scrub aria-label="단위 변환 PPI" type="number" min="36" max="1200" step="1" value="${this.settings.unitPpi}"><i>ppi</i></span></label><div class="region-grid">${this.regionInputTemplate("x", "X", this.settings.renderRegion.x)}${this.regionInputTemplate("y", "Y", this.settings.renderRegion.y)}${this.regionInputTemplate("width", "W", this.settings.renderRegion.width)}${this.regionInputTemplate("height", "H", this.settings.renderRegion.height)}</div></div>`)}
              <div class="render-actions"><button data-action="render-fast"><strong>빠른 렌더링</strong><span>${FAST_RENDER_SAMPLES} spp · ${Math.round(FAST_RENDER_SCALE * 100)}%</span></button><button data-action="render-high"><strong>고품질 렌더링</strong><span>${this.targetSamples} spp · ${Math.round(this.settings.scale * 100)}%</span></button></div>
            </div>
            <div class="inspector-view" data-inspector-view="export" role="tabpanel">
              ${this.inspectorSection("PNG OUTPUT", "선택 영역의 물리 크기 유지", `<section class="output-controls" aria-label="부분 렌더링 PNG 출력"><div class="export-metric"><span>OUTPUT SIZE</span><b data-output="export-size">${this.exportDescription()}</b></div><div class="ppi-switch" role="group" aria-label="출력 PPI 선택">${([72, 150, 300] as ExportPpi[]).map((ppi) => `<button data-export-ppi="${ppi}" class="${this.settings.exportPpi === ppi ? "active" : ""}">${ppi} ppi</button>`).join("")}</div><button class="final-export" data-action="export-final"><strong>${this.settings.exportPpi}ppi 최종 렌더·저장</strong><span>${this.exportDescription(true)}</span></button></section>`)}
              ${this.inspectorSection("CURRENT FRAME", "현재 누적된 화면 저장", `<div class="inspector-action-row"><button data-action="export">현재 화면 저장</button></div>`)}
            </div>
          </div>
        </aside>
        <p class="hint">빠른 미리보기에서 설정 조절<br>렌더링 버튼으로 실행 · TAB INSPECTOR</p>
      </section>`;
  }

  private inspectorSection(title: string, description: string, content: string, open = true): string {
    return `<details class="inspector-section" ${open ? "open" : ""}><summary><span><strong>${title}</strong><small>${description}</small></span><i></i></summary><div class="section-content">${content}</div></details>`;
  }

  private parameterTemplate(name: string, label: string, min: number, max: number, step: number, value: number): string {
    return `<div class="parameter inspector-property"><label for="${name}-range">${label}</label><input id="${name}-range" data-control="${name}" aria-label="${label} 슬라이더" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-number="${name}" data-scrub aria-label="${label} 직접 입력" title="클릭 입력 · 좌우 드래그 · Shift 정밀 조정" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }

  private regionInputTemplate(name: keyof RenderRegion, label: string, value: number): string {
    return `<label>${label}<span><input data-region="${name}" aria-label="렌더 영역 ${label}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${value}"><i>px</i></span></label>`;
  }

  private getExportDimensions(ppi = this.settings.exportPpi): { width: number; height: number } {
    const scale = ppi / this.settings.unitPpi;
    return {
      width: Math.max(1, Math.round(this.settings.renderRegion.width * scale)),
      height: Math.max(1, Math.round(this.settings.renderRegion.height * scale)),
    };
  }

  private getExportSamples(ppi = this.settings.exportPpi): number {
    const minimum = ppi === 300 ? 256 : ppi === 150 ? 192 : 128;
    return Math.max(this.settings.targetSamples, minimum);
  }

  private exportDescription(includeSamples = false): string {
    const { width, height } = this.getExportDimensions();
    return `${width} × ${height}px${includeSamples ? ` · ${this.getExportSamples()} spp` : ""}`;
  }

  private bindUi(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => {
      button.addEventListener("click", () => this.setLook(button.dataset.look as CrystalLook));
    });
    this.bindNumericControl("roughness", (value) => {
      this.settings.roughness = value;
      this.assembly.setRoughness(value);
      this.pathTracer.updateMaterials();
      this.persistSettings();
      this.showRasterPreview("재질 변경됨 · 렌더링 준비 완료");
    });
    this.bindNumericControl("dispersion", (value) => {
      this.settings.dispersion = value;
      this.assembly.setDispersion(value);
      this.pathTracer.updateMaterials();
      this.persistSettings();
      this.showRasterPreview("재질 변경됨 · 렌더링 준비 완료");
    });
    this.bindNumericControl("refraction-strength", (value) => this.lighting.updateGlobal("refractionStrength", value));
    this.bindNumericControl("reflection-strength", (value) => this.lighting.updateGlobal("reflectionStrength", value));
    this.bindNumericControl("scale", (value) => {
      this.settings.scale = value;
      this.pathTracer.renderScale = value;
      this.pathTracer.reset();
      this.persistSettings();
      this.showRasterPreview("렌더 해상도 변경됨 · 렌더링 준비 완료");
    });
    this.bindNumericControl("bounces", (value) => {
      this.settings.bounces = value;
      this.pathTracer.bounces = value;
      this.pathTracer.transmissiveBounces = Math.max(value + 2, 8);
      this.pathTracer.reset();
      this.persistSettings();
      this.showRasterPreview("반사 횟수 변경됨 · 렌더링 준비 완료");
    });
    this.bindNumericControl("gap", (value) => {
      this.settings.gap = value;
      this.assembly.setGap(value);
      this.pathTracer.setScene(this.scene, this.pathCamera);
      this.persistSettings();
      this.showRasterPreview("육면체 간격 변경됨 · 렌더링 준비 완료");
    });
    this.bindNumericControl("target-samples", (value) => {
      this.targetSamples = value;
      this.settings.targetSamples = value;
      this.persistSettings();
      this.showRasterPreview("목표 샘플 수 변경됨 · 렌더링 준비 완료");
    });
    this.require<HTMLInputElement>("[data-control='unit-ppi']").addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      this.settings.unitPpi = Math.round(THREE.MathUtils.clamp(value, 36, 1200));
      this.persistSettings();
      this.updateExportUi();
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-region]").forEach((input) => {
      let unitConversionTimer = 0;
      const commit = (): void => {
        window.clearTimeout(unitConversionTimer);
        const rawValue = input.value.trim();
        const value = this.parsePixelValue(input.value);
        const key = input.dataset.region as keyof RenderRegion;
        if (value === null) {
          input.value = String(this.settings.renderRegion[key]);
          this.require<HTMLElement>("[data-output='samples']").textContent = "단위를 인식하지 못해 이전 픽셀 값으로 복원함";
          return;
        }
        this.setRegionValue(key, value);
        const appliedValue = this.settings.renderRegion[key];
        input.value = String(appliedValue);
        if (/[a-z]/i.test(rawValue)) {
          this.require<HTMLElement>("[data-output='samples']").textContent = `${rawValue} → ${appliedValue}px로 변환됨`;
        }
      };
      input.addEventListener("input", () => {
        window.clearTimeout(unitConversionTimer);
        if (/(px|mm|cm|in)\s*$/i.test(input.value)) {
          unitConversionTimer = window.setTimeout(commit, 450);
        }
      });
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          input.blur();
          return;
        }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        window.clearTimeout(unitConversionTimer);
        const key = input.dataset.region as keyof RenderRegion;
        const parsedValue = this.parsePixelValue(input.value);
        const currentValue = parsedValue ?? this.settings.renderRegion[key];
        const direction = event.key === "ArrowUp" ? 1 : -1;
        const step = event.shiftKey ? 10 : 1;
        this.setRegionValue(key, currentValue + direction * step);
        input.value = String(this.settings.renderRegion[key]);
        const label = key === "x" ? "X 위치" : key === "y" ? "Y 위치" : key === "width" ? "너비" : "높이";
        this.require<HTMLElement>("[data-output='samples']").textContent = `${label} ${direction > 0 ? "+" : "−"}${step}px 조절됨`;
      });
    });
    this.require<HTMLButtonElement>("[data-action='region-center']").addEventListener("click", () => {
      this.centerRenderRegion();
      this.updateRenderRegion();
      this.persistSettings();
      this.showRasterPreview("부분 렌더링 영역을 화면 중앙에 배치함");
    });
    this.require<HTMLButtonElement>("[data-action='region-full']").addEventListener("click", () => {
      this.settings.renderRegion = {
        x: 0,
        y: 0,
        width: Math.max(16, this.stage.clientWidth),
        height: Math.max(16, this.stage.clientHeight),
      };
      this.updateRenderRegion();
      this.persistSettings();
      this.showRasterPreview("전체 화면 렌더링 영역으로 설정됨");
    });
    this.require<HTMLButtonElement>("[data-action='render-fast']").addEventListener("click", () => {
      if (this.isRendering) this.stopRender(false);
      else this.startRender("fast");
    });
    this.require<HTMLButtonElement>("[data-action='render-high']").addEventListener("click", () => {
      if (this.isRendering) this.stopRender(false);
      else this.startRender("high");
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-export-ppi]").forEach((button) => {
      button.addEventListener("click", () => {
        this.settings.exportPpi = Number(button.dataset.exportPpi) as ExportPpi;
        this.persistSettings();
        this.updateExportUi();
      });
    });
    this.require<HTMLButtonElement>("[data-action='export-final']").addEventListener("click", () => {
      if (this.exportJob) this.cancelFinalExport("최종 출력이 취소됨");
      else this.startFinalExport();
    });
    this.require<HTMLButtonElement>("[data-action='reset']").addEventListener("click", () => this.resetCamera());
    this.require<HTMLButtonElement>("[data-action='export']").addEventListener("click", () => void this.exportPng());
    window.addEventListener("keydown", this.handleKeydown);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private parsePixelValue(raw: string): number | null {
    const match = raw.trim().replaceAll(",", "").match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|mm|cm|in)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = (match[2] ?? "px").toLowerCase();
    const inches = unit === "mm" ? amount / 25.4 : unit === "cm" ? amount / 2.54 : amount;
    const pixels = unit === "px" ? amount : inches * this.settings.unitPpi;
    return Math.round(pixels);
  }

  private setRegionValue(key: keyof RenderRegion, value: number): void {
    const region = this.settings.renderRegion;
    const centerX = region.x + region.width * 0.5;
    const centerY = region.y + region.height * 0.5;
    region[key] = value;
    if (key === "width") region.x = Math.round(centerX - value * 0.5);
    if (key === "height") region.y = Math.round(centerY - value * 0.5);
    this.updateRenderRegion();
    this.persistSettings();
    this.showRasterPreview("부분 렌더링 영역 변경됨 · 렌더링 준비 완료");
  }

  private centerRenderRegion(): void {
    const region = this.settings.renderRegion;
    region.x = Math.round((Math.max(16, this.stage.clientWidth) - region.width) * 0.5);
    region.y = Math.round((Math.max(16, this.stage.clientHeight) - region.height) * 0.5);
  }

  private bindNumericControl(name: string, apply: (value: number) => void): void {
    const slider = this.require<HTMLInputElement>(`[data-control='${name}']`);
    const number = this.require<HTMLInputElement>(`[data-number='${name}']`);
    const commit = (source: HTMLInputElement, normalizeNumber: boolean): void => {
      const rawValue = Number(source.value);
      if (!Number.isFinite(rawValue)) return;
      const value = THREE.MathUtils.clamp(rawValue, Number(slider.min), Number(slider.max));
      slider.value = String(value);
      if (source === slider || normalizeNumber) number.value = slider.value;
      apply(Number(slider.value));
    };
    slider.addEventListener("input", () => commit(slider, true));
    number.addEventListener("input", () => commit(number, false));
    number.addEventListener("change", () => commit(number, true));
  }

  private persistSettings(): void {
    this.settings.cameraPosition = this.camera.position.toArray() as [number, number, number];
    this.settings.cameraTarget = this.controls.target.toArray() as [number, number, number];
    this.settings.cameraZoom = this.camera.zoom;
    const status = this.root.querySelector<HTMLElement>("[data-output='save']");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      if (status) status.textContent = "자동 저장 실패";
      return;
    }
    if (!status) return;
    status.textContent = "방금 저장됨";
    window.clearTimeout(this.saveStatusTimer);
    this.saveStatusTimer = window.setTimeout(() => { status.textContent = "자동 저장 켜짐"; }, 1200);
  }

  private readonly handleCameraChange = (): void => {
    this.syncPathCamera();
    this.persistSettings();
    this.showRasterPreview("시점 변경됨 · 렌더링 준비 완료");
  };

  private readonly handleLightingChange = (kind: LightingChangeKind): void => {
    this.settings.lighting = this.lighting.state;
    if (kind === "selection") {
      this.attachSelectedLightGizmo();
      this.persistSettings();
      this.renderPreview();
      return;
    }
    const globals = this.lighting.state.globals;
    this.environment.setIntensity(globals.environmentIntensity);
    this.assembly.setOpticalLighting(globals.reflectionStrength, globals.refractionStrength);
    this.previewRenderer.toneMappingExposure = globals.exposure;
    this.renderer.toneMappingExposure = globals.exposure;
    this.previewBloom.strength = globals.bloomIntensity;
    this.pathBloom.strength = globals.bloomIntensity;
    this.pathTracer.updateLights();
    this.pathTracer.updateMaterials();
    this.pathTracer.updateEnvironment();
    this.pathTracer.reset();
    this.attachSelectedLightGizmo();
    this.persistSettings();
    this.showRasterPreview(kind === "transform" ? "조명 위치 변경됨 · 렌더링 준비 완료" : "조명 변경됨 · 렌더링 준비 완료");
  };

  private attachSelectedLightGizmo(): void {
    const object = this.lighting.selectedObject;
    if (object) this.transformControls.attach(object);
    else this.transformControls.detach();
  }

  private setLightEditingVisible(value: boolean): void {
    this.lighting.setEditingVisible(value);
    this.transformControls.getHelper().visible = value;
    this.renderPreview();
  }

  private renderPreview(): void {
    this.previewComposer.render();
    this.previewRenderer.autoClear = false;
    this.previewRenderer.clearDepth();
    this.previewRenderer.render(this.overlayScene, this.camera);
    this.previewRenderer.autoClear = true;
  }

  private renderPathComposite(): void {
    this.pathTexturePass.map = this.pathTracer.target.texture;
    this.pathComposer.render();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === "Tab" && !editing) {
      event.preventDefault(); this.inspectorPanel.toggle();
    } else if (event.key.toLowerCase() === "h" && !editing) this.inspectorPanel.toggle();
  };

  private readonly handleVisibility = (): void => {
    this.pathTracer.pausePathTracing = document.hidden || (!this.isRendering && this.exportJob === null);
  };

  setLook(look: CrystalLook): void {
    this.look = look;
    this.settings.look = look;
    this.assembly.setLook(look);
    this.pathTracer.updateMaterials();
    this.showRasterPreview("재질 변경됨 · 렌더링 준비 완료");
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.classList.toggle("active", button.dataset.look === look));
    const preset = look === "clear" ? [0.05, 0.045] : look === "smoked" ? [0.08, 0.055] : [0.04, 0.16];
    const roughness = this.require<HTMLInputElement>("[data-control='roughness']");
    const dispersion = this.require<HTMLInputElement>("[data-control='dispersion']");
    roughness.value = String(preset[0]);
    dispersion.value = String(preset[1]);
    this.require<HTMLInputElement>("[data-number='roughness']").value = String(preset[0]);
    this.require<HTMLInputElement>("[data-number='dispersion']").value = String(preset[1]);
    this.settings.roughness = preset[0];
    this.settings.dispersion = preset[1];
    this.persistSettings();
  }

  private resetCamera(): void {
    this.camera.position.set(0, 0, -12);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0.02, 0);
    this.controls.update();
    this.syncPathCamera();
    this.showRasterPreview("시점 초기화됨 · 렌더링 준비 완료");
  }

  private resize(): void {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const viewHeight = 6.7;
    const viewWidth = viewHeight * (width / height);
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    this.previewRenderer.setPixelRatio(pixelRatio);
    // The render-region inputs map 1:1 to exported PNG pixels. The preview may
    // use device DPR, but the path-traced crop deliberately stays at DPR 1.
    this.renderer.setPixelRatio(1);
    this.previewRenderer.setSize(width, height, false);
    this.previewComposer.setPixelRatio(pixelRatio);
    this.previewComposer.setSize(width, height);
    this.camera.left = -viewWidth * 0.5;
    this.camera.right = viewWidth * 0.5;
    this.camera.top = viewHeight * 0.5;
    this.camera.bottom = -viewHeight * 0.5;
    this.camera.updateProjectionMatrix();
    const initializedAtCenter = this.updateRenderRegion();
    if (initializedAtCenter) this.persistSettings();
    this.showRasterPreview();
  }

  private updateRenderRegion(): boolean {
    const stageWidth = Math.max(16, this.stage.clientWidth);
    const stageHeight = Math.max(16, this.stage.clientHeight);
    const region = this.settings.renderRegion;
    const initializeAtCenter = region.x < 0 || region.y < 0;
    region.width = THREE.MathUtils.clamp(Math.round(region.width), 16, stageWidth);
    region.height = THREE.MathUtils.clamp(Math.round(region.height), 16, stageHeight);
    if (initializeAtCenter) this.centerRenderRegion();
    region.x = THREE.MathUtils.clamp(Math.round(region.x), 0, stageWidth - region.width);
    region.y = THREE.MathUtils.clamp(Math.round(region.y), 0, stageHeight - region.height);

    this.regionGuide.style.left = `${region.x}px`;
    this.regionGuide.style.top = `${region.y}px`;
    this.regionGuide.style.width = `${region.width}px`;
    this.regionGuide.style.height = `${region.height}px`;
    this.require<HTMLElement>("[data-output='region-size']").textContent = `X ${region.x} · Y ${region.y} · ${region.width} × ${region.height} px`;

    this.renderer.setSize(region.width, region.height, false);
    this.pathComposer.setPixelRatio(1);
    this.pathComposer.setSize(region.width, region.height);
    Object.assign(this.renderer.domElement.style, {
      left: `${region.x}px`,
      top: `${region.y}px`,
      width: `${region.width}px`,
      height: `${region.height}px`,
    });

    (Object.keys(region) as Array<keyof RenderRegion>).forEach((key) => {
      const input = this.require<HTMLInputElement>(`[data-region='${key}']`);
      input.value = String(region[key]);
    });
    this.syncPathCamera();
    this.updateExportUi();
    return initializeAtCenter;
  }

  private updateExportUi(): void {
    const description = this.root.querySelector<HTMLElement>("[data-output='export-size']");
    if (description) description.textContent = this.exportDescription();
    this.root.querySelectorAll<HTMLButtonElement>("[data-export-ppi]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.exportPpi) === this.settings.exportPpi);
      button.disabled = this.exportJob !== null;
    });
    const button = this.root.querySelector<HTMLButtonElement>("[data-action='export-final']");
    if (!button) return;
    if (this.exportJob) {
      button.innerHTML = `<strong>최종 출력 취소</strong><span>${Math.floor(this.pathTracer.samples)} / ${this.exportJob.targetSamples} spp</span>`;
      button.classList.add("active");
    } else {
      button.innerHTML = `<strong>${this.settings.exportPpi}ppi 최종 렌더·저장</strong><span>${this.exportDescription(true)}</span>`;
      button.classList.remove("active");
    }
  }

  private syncPathCamera(): void {
    const stageWidth = Math.max(16, this.stage.clientWidth);
    const stageHeight = Math.max(16, this.stage.clientHeight);
    const region = this.settings.renderRegion;
    this.pathCamera.copy(this.camera);
    this.pathCamera.setViewOffset(stageWidth, stageHeight, region.x, region.y, region.width, region.height);
    this.pathCamera.updateProjectionMatrix();
    this.pathTracer.updateCamera();
  }

  private syncExportCamera(ppi: ExportPpi): void {
    const scale = ppi / this.settings.unitPpi;
    const region = this.settings.renderRegion;
    const fullWidth = Math.max(1, Math.round(this.stage.clientWidth * scale));
    const fullHeight = Math.max(1, Math.round(this.stage.clientHeight * scale));
    const offsetX = Math.round(region.x * scale);
    const offsetY = Math.round(region.y * scale);
    const { width, height } = this.getExportDimensions(ppi);
    this.pathCamera.copy(this.camera);
    this.pathCamera.setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height);
    this.pathCamera.updateProjectionMatrix();
    this.pathTracer.updateCamera();
  }

  private showRasterPreview(message = "준비 완료 · 빠른 미리보기"): void {
    if (this.exportJob) {
      this.exportJob = null;
      this.finishingExport = false;
      this.updateRenderRegion();
    }
    this.isRendering = false;
    this.pathTracer.pausePathTracing = true;
    this.renderer.domElement.classList.remove("visible");
    this.renderPreview();
    this.require<HTMLElement>("[data-output='samples']").textContent = message;
    this.updateRenderButtons();
    this.updateExportUi();
  }

  private startFinalExport(): void {
    if (this.isRendering) this.stopRender(false);
    const ppi = this.settings.exportPpi;
    const { width, height } = this.getExportDimensions(ppi);
    const maxTextureSize = this.renderer.capabilities.maxTextureSize;
    if (width > maxTextureSize || height > maxTextureSize) {
      this.require<HTMLElement>("[data-output='samples']").textContent = `출력 크기 ${width} × ${height}px가 GPU 한계 ${maxTextureSize}px를 초과함`;
      return;
    }
    const targetSamples = this.getExportSamples(ppi);
    this.exportJob = { ppi, width, height, targetSamples };
    this.finishingExport = false;
    this.isRendering = false;
    this.renderer.setSize(width, height, false);
    this.pathComposer.setSize(width, height);
    this.syncExportCamera(ppi);
    this.pathTracer.renderScale = 1;
    this.pathTracer.bounces = Math.max(this.settings.bounces, ppi === 300 ? 12 : ppi === 150 ? 10 : 8);
    this.pathTracer.transmissiveBounces = this.pathTracer.bounces + 4;
    this.pathTracer.reset();
    this.pathTracer.pausePathTracing = false;
    this.renderer.domElement.classList.add("visible");
    this.require<HTMLElement>("[data-output='samples']").textContent = `${ppi}ppi 최종 출력 중 0 / ${targetSamples} spp · ${width} × ${height}px`;
    this.updateRenderButtons();
    this.updateExportUi();
  }

  private cancelFinalExport(message: string): void {
    this.exportJob = null;
    this.finishingExport = false;
    this.pathTracer.pausePathTracing = true;
    this.updateRenderRegion();
    this.showRasterPreview(message);
  }

  private async finishFinalExport(job: ExportJob): Promise<void> {
    this.pathTracer.pausePathTracing = true;
    try {
      const sourceBlob = await this.canvasToPngBlob();
      if (this.exportJob !== job) return;
      const blob = await this.injectPngPpi(sourceBlob, job.ppi);
      if (this.exportJob !== job) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pleos-27-axis-${job.width}x${job.height}-${job.ppi}ppi-${this.look}-${job.targetSamples}spp.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      this.exportJob = null;
      this.finishingExport = false;
      this.updateRenderRegion();
      this.showRasterPreview(`${job.ppi}ppi PNG 저장 완료 · ${job.width} × ${job.height}px`);
    } catch (error) {
      this.cancelFinalExport(`최종 PNG 저장 실패 · ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }

  private canvasToPngBlob(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      this.renderer.domElement.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 인코딩 실패")), "image/png");
    });
  }

  private async injectPngPpi(blob: Blob, ppi: ExportPpi): Promise<Blob> {
    const source = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const ihdrLength = view.getUint32(8, false);
    const insertOffset = 8 + 12 + ihdrLength;
    const pixelsPerMeter = Math.round(ppi / 0.0254);
    const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]);
    const data = new Uint8Array(9);
    const dataView = new DataView(data.buffer);
    dataView.setUint32(0, pixelsPerMeter, false);
    dataView.setUint32(4, pixelsPerMeter, false);
    data[8] = 1;
    const crcInput = new Uint8Array(type.length + data.length);
    crcInput.set(type, 0);
    crcInput.set(data, type.length);
    const chunk = new Uint8Array(21);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, data.length, false);
    chunk.set(type, 4);
    chunk.set(data, 8);
    chunkView.setUint32(17, this.crc32(crcInput), false);
    const output = new Uint8Array(source.length + chunk.length);
    output.set(source.subarray(0, insertOffset), 0);
    output.set(chunk, insertOffset);
    output.set(source.subarray(insertOffset), insertOffset + chunk.length);
    return new Blob([output.buffer], { type: "image/png" });
  }

  private crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private startRender(quality: RenderQuality): void {
    this.renderQuality = quality;
    if (quality === "fast") {
      this.activeTargetSamples = FAST_RENDER_SAMPLES;
      this.pathTracer.renderScale = FAST_RENDER_SCALE;
      this.pathTracer.bounces = FAST_RENDER_BOUNCES;
      this.pathTracer.transmissiveBounces = FAST_RENDER_BOUNCES + 2;
    } else {
      this.activeTargetSamples = this.targetSamples;
      this.pathTracer.renderScale = this.settings.scale;
      this.pathTracer.bounces = this.settings.bounces;
      this.pathTracer.transmissiveBounces = Math.max(this.settings.bounces + 2, 8);
    }
    this.syncPathCamera();
    this.pathTracer.reset();
    this.pathTracer.pausePathTracing = false;
    this.isRendering = true;
    this.renderer.domElement.classList.add("visible");
    const label = quality === "fast" ? "빠른 렌더링" : "고품질 렌더링";
    this.require<HTMLElement>("[data-output='samples']").textContent = `${label} 중 0 / ${this.activeTargetSamples} spp`;
    this.updateRenderButtons();
  }

  private stopRender(completed: boolean): void {
    this.isRendering = false;
    this.pathTracer.pausePathTracing = true;
    const samples = Math.floor(this.pathTracer.samples);
    const label = this.renderQuality === "fast" ? "빠른 렌더링" : "고품질 렌더링";
    this.require<HTMLElement>("[data-output='samples']").textContent = completed
      ? `${label} 완료 · ${samples} spp`
      : `${label} 일시정지 · ${samples} spp`;
    this.updateRenderButtons();
  }

  private updateRenderButtons(): void {
    const fast = this.require<HTMLButtonElement>("[data-action='render-fast']");
    const high = this.require<HTMLButtonElement>("[data-action='render-high']");
    fast.innerHTML = this.isRendering && this.renderQuality === "fast"
      ? `<strong>렌더링 중지</strong><span>${Math.floor(this.pathTracer.samples)} / ${this.activeTargetSamples} spp</span>`
      : `<strong>빠른 렌더링</strong><span>${FAST_RENDER_SAMPLES} spp · ${Math.round(FAST_RENDER_SCALE * 100)}%</span>`;
    high.innerHTML = this.isRendering && this.renderQuality === "high"
      ? `<strong>렌더링 중지</strong><span>${Math.floor(this.pathTracer.samples)} / ${this.activeTargetSamples} spp</span>`
      : `<strong>고품질 렌더링</strong><span>${this.targetSamples} spp · ${Math.round(this.settings.scale * 100)}%</span>`;
    fast.classList.toggle("active", this.isRendering && this.renderQuality === "fast");
    high.classList.toggle("active", this.isRendering && this.renderQuality === "high");
    fast.disabled = this.exportJob !== null || (this.isRendering && this.renderQuality !== "fast");
    high.disabled = this.exportJob !== null || (this.isRendering && this.renderQuality !== "high");
  }

  private render = (): void => {
    this.controls.update();
    if (this.exportJob || this.isRendering) {
      this.pathTracer.renderSample();
      this.renderPathComposite();
    }
    this.frame += 1;
    if (this.exportJob && this.frame % 3 === 0) {
      const job = this.exportJob;
      const samples = Math.floor(this.pathTracer.samples);
      this.require<HTMLElement>("[data-output='samples']").textContent = `${job.ppi}ppi 최종 출력 중 ${samples} / ${job.targetSamples} spp · ${job.width} × ${job.height}px`;
      this.updateExportUi();
      if (samples >= job.targetSamples && !this.finishingExport) {
        this.finishingExport = true;
        void this.finishFinalExport(job);
      }
    } else if (this.isRendering && this.frame % 3 === 0) {
      const samples = Math.floor(this.pathTracer.samples);
      const label = this.renderQuality === "fast" ? "빠른 렌더링" : "고품질 렌더링";
      this.require<HTMLElement>("[data-output='samples']").textContent = `${label} 중 ${samples} / ${this.activeTargetSamples} spp`;
      this.updateRenderButtons();
      if (samples >= this.activeTargetSamples) this.stopRender(true);
    }
    this.animationFrame = requestAnimationFrame(this.render);
  };

  async exportPng(): Promise<void> {
    this.root.classList.add("exporting");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const blob = await new Promise<Blob>((resolve, reject) => this.renderer.domElement.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed")), "image/png"));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const region = this.settings.renderRegion;
      link.download = `pleos-27-axis-${region.width}x${region.height}-${this.look}-${Math.floor(this.pathTracer.samples)}spp.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } finally {
      this.root.classList.remove("exporting");
    }
  }

  inspect(): object {
    const context = this.renderer.getContext();
    return {
      renderer: "Three.js WebGLPathTracer",
      projection: "orthographic-isometric",
      threeRevision: THREE.REVISION,
      webgl2: this.renderer.capabilities.isWebGL2,
      samples: this.pathTracer.samples,
      bounces: this.pathTracer.bounces,
      transmissiveBounces: this.pathTracer.transmissiveBounces,
      renderScale: this.pathTracer.renderScale,
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
      renderRegion: { ...this.settings.renderRegion },
      renderRegionUnit: "css-px",
      look: this.look,
      lighting: {
        preset: this.lighting.state.preset,
        total: this.lighting.state.lights.length,
        enabled: this.lighting.state.lights.filter((light) => light.enabled).length,
        types: this.lighting.state.lights.map((light) => light.type),
        globals: { ...this.lighting.state.globals },
      },
      assembly: this.assembly.inspect(),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.clearTimeout(this.saveStatusTimer);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.handleCameraChange);
    this.controls.dispose();
    this.transformControls.dispose();
    window.removeEventListener("keydown", this.handleKeydown);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.pathTracer.dispose();
    this.previewComposer.dispose();
    this.pathComposer.dispose();
    this.lighting.dispose();
    this.assembly.dispose();
    this.environment.dispose();
    this.previewRenderer.dispose();
    this.renderer.dispose();
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
