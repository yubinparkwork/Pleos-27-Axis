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
  type RawStudioListener,
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
  renderer: "Three.js WebGPU",
  gpuPreference: "WebGPU 우선 · WebGL2 자동 폴백",
  hdr: "Checking",
  floatColorBuffer: "Checking",
  maxTextureSize: null,
  maxRenderbufferSize: null,
  maxSamples: null,
  drawingBuffer: null,
  frameTimeMs: null,
  message: "렌더러를 준비하고 있습니다",
  level: "warning",
};

const OUTPUT_PRESETS = [
  { value: "1400x1040", label: "레퍼런스 절반", width: 1400, height: 1040 },
  { value: "2000x1486", label: "레퍼런스 중간", width: 2000, height: 1486 },
  { value: "2800x2080", label: "레퍼런스 원본", width: 2800, height: 2080 },
  { value: "3840x2160", label: "4K 16:9", width: 3840, height: 2160 },
  { value: "4096x4096", label: "정사각형 4K", width: 4096, height: 4096 },
  { value: "5600x4160", label: "레퍼런스 2배", width: 5600, height: 4160 },
] as const;

const TABS = [
  ["material", "스타일"],
  ["lighting", "조명"],
  ["output", "내보내기"],
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

function directLightControls(
  label: string,
  path: "key" | "fill" | "rim" | "upperLeft" | "lowerRight",
  open = false,
): string {
  return `<details class="raw-light-group"${open ? " open" : ""}>
    <summary><span>${label}</span><small>방향 · 높이 · 색감</small></summary>
    <div class="raw-light-controls">
      ${toggleField("사용", `lighting.${path}.enabled`)}
      ${rangeField("수평 각도", `lighting.${path}.azimuth`, -180, 180, 1)}
      ${rangeField("높이", `lighting.${path}.elevation`, -90, 90, 1)}
      ${rangeField("조명 거리", `lighting.${path}.distance`, 1, 20, 0.1)}
      ${rangeField("밝기", `lighting.${path}.intensity`, 0, 12, 0.05)}
      ${rangeField("빛 범위", `lighting.${path}.influenceRadius`, 0, 5, 0.01)}
      ${colorField("색상", `lighting.${path}.color`)}
    </div>
  </details>`;
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
    private readonly onStateChange?: RawStudioListener,
  ) {
    this.store = new RawStudioStore(initialState);
    this.root.innerHTML = this.template();
    this.stageHost = this.require<HTMLElement>("[data-raw-stage-host]");
    this.bindEvents();
    this.unsubscribe = this.store.subscribe((state, change) => {
      this.sync(state);
      this.controller.update(state, change);
      this.onStateChange?.(state, change);
    });
    this.controller.mount(this.stageHost);
    this.sync(initialState);
    this.syncStatus();
    this.controller.update(initialState, { path: "*", reason: "initialize" });
    this.onStateChange?.(initialState, { path: "*", reason: "initialize" });
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
        ${preset.experimental ? "<em>실험용</em>" : ""}
      </button>`).join("");
    const materialOptions = `
      <optgroup label="매트">${Object.entries(MATTE_PRESETS).map(([id, preset]) => option(id, preset.name)).join("")}</optgroup>
      <optgroup label="프리즘">${Object.entries(PRISM_PRESETS).map(([id, preset]) => option(id, preset.name)).join("")}</optgroup>`;
    const lightingOptions = Object.entries(LIGHTING_PRESETS).map(([id, preset]) => option(id, preset.name)).join("");

    return `<div class="raw-studio-shell" data-left-open="true" data-right-open="true">
      <header class="raw-studio-topbar">
        <div class="raw-brand"><strong>PLEOS</strong><span>27 AXIS</span></div>
        <div class="raw-material-switch" role="group" aria-label="재질 모드">
          <button data-material-mode="matte">매트</button><button data-material-mode="prism">프리즘</button>
        </div>
        <span class="raw-top-spacer"></span>
        <button class="raw-utility-button" data-toggle-panel="left" aria-label="프리셋 패널 열기와 닫기">프리셋</button>
        <button class="raw-utility-button" data-toggle-panel="right" aria-label="설정 패널 열기와 닫기">설정</button>
        <button class="raw-primary-button" data-command="export">PNG 내보내기</button>
      </header>

      <aside class="raw-studio-left" aria-label="장면 프리셋">
        <header><span>PLEOS 27 / AXIS</span><h1>렌더링 스터디</h1><p>축은 고정하고 재질과 조명을 확장합니다.</p></header>
        <div class="raw-preset-list">${sceneCards}</div>
      </aside>

      <main class="raw-studio-stage" aria-label="고품질 3D 렌더링 화면">
        <div class="raw-stage-host" data-raw-stage-host></div>
      </main>

      <aside class="raw-studio-right" aria-label="렌더링 설정">
        <nav class="raw-inspector-tabs" aria-label="설정 탭">
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
      ${section("스타일", `
        <label class="raw-field"><span>프리셋</span><select data-action="material-preset">${materialOptions}</select></label>
        <p class="raw-inline-status" data-material-summary></p>
      `)}
      ${section("형태 디테일", `
        <p class="raw-help">큰 면과 중앙 수렴점은 그대로 두고, 모서리에만 정밀한 커팅 면을 추가합니다.</p>
        ${toggleField("베벨 사용", "geometry.bevelEnabled")}
        ${rangeField("베벨 폭", "geometry.bevelWidth", 0.001, 0.12, 0.001)}
        ${rangeField("베벨 단계", "geometry.bevelSegments", 1, 12, 1)}
        ${rangeField("모서리 곡률", "geometry.bevelCurvature", 0, 1, 0.01)}
      `, "축 보호")}
      <div data-material-section="matte">${section("매트 표면", `
        ${colorField("기본 색상", "material.matte.baseColor")}
        ${rangeField("면 변화", "material.matte.faceVariation", 0, 0.5, 0.01)}
        ${rangeField("거칠기", "material.matte.roughness", 0.04, 1, 0.01)}
        ${rangeField("환경광", "material.matte.ambientStrength", 0, 1, 0.01)}
      `)}
      ${section("표면 컬러 텍스처", `
        <p class="raw-help">기존 육면체의 형태는 유지하면서 면 내부에 컬러 그라데이션과 발광 경계를 입힙니다.</p>
        <label class="raw-field"><span>질감 유형</span><select data-state-path="material.matte.texture.pattern">
          ${option("soft-caustic", "소프트 카우스틱")}
          ${option("amber-flow", "앰버 플로우")}
        </select></label>
        ${toggleField("사용", "material.matte.texture.enabled")}
        ${rangeField("적용 강도", "material.matte.texture.strength", 0, 1, 0.01)}
        ${rangeField("무늬 크기", "material.matte.texture.scale", 0.2, 8, 0.01)}
        ${rangeField("무늬 회전", "material.matte.texture.rotation", -180, 180, 1)}
        ${rangeField("흐름 방향", "material.matte.texture.flow", 0, 1, 0.01)}
        ${rangeField("색상 대비", "material.matte.texture.contrast", 0.2, 2.5, 0.01)}
        ${rangeField("모서리 발광", "material.matte.texture.edgeGlow", 0, 2, 0.01)}
        ${rangeField("발광 폭", "material.matte.texture.edgeWidth", 0.005, 0.2, 0.001)}
        ${toggleField("그라데이션 애니메이션", "material.matte.texture.animationEnabled")}
        ${toggleField("애니메이션 일시정지", "material.matte.texture.animationPaused")}
        ${rangeField("애니메이션 속도", "material.matte.texture.animationSpeed", -1, 1, 0.01)}
        ${rangeField("이동량", "material.matte.texture.animationTravel", 0, 2, 0.01)}
        ${rangeField("흐름 왜곡", "material.matte.texture.warpStrength", 0, 1.5, 0.01)}
        ${rangeField("미세 질감", "material.matte.texture.detailStrength", 0, 1, 0.01)}
        ${rangeField("쉬머 광택", "material.matte.texture.sheenStrength", 0, 1.5, 0.01)}
        ${colorField("어두운 색", "material.matte.texture.darkColor")}
        ${colorField("강조 색", "material.matte.texture.hotColor")}
        ${colorField("밝은 색", "material.matte.texture.softColor")}
        ${colorField("보조 색", "material.matte.texture.accentColor")}
      `, "참고 이미지 질감")}</div>
      <div data-material-section="prism">
        <div class="raw-experimental-banner" data-experimental-banner hidden>실험용 — 색상 검토 필요</div>
        ${section("프리즘 표면", `
        ${colorField("흡수 색상", "material.prism.absorptionColor")}
        ${rangeField("밀도", "material.prism.absorptionDensity", 0, 3, 0.01)}
        ${rangeField("스펙트럼", "material.prism.spectrumStrength", 0, 2, 0.01)}
        ${rangeField("거칠기", "material.prism.surfaceRoughness", 0, 0.8, 0.005)}
        ${rangeField("굴절", "material.prism.refractionStrength", 0, 3, 0.01)}
      `)}
      </div>
      ${section("공간 그래픽", `
        <p class="raw-help">축을 방해하지 않는 GPU 흐름장 파티클과 깊이 라인을 조절합니다.</p>
        ${toggleField("파티클 사용", "engine.particles.enabled")}
        ${rangeField("파티클 수", "engine.particles.count", 512, 16384, 256)}
        ${rangeField("크기", "engine.particles.size", 0.004, 0.08, 0.001)}
        ${rangeField("불투명도", "engine.particles.opacity", 0, 1, 0.01)}
        ${rangeField("이동 속도", "engine.particles.speed", 0, 1, 0.01)}
        ${rangeField("난류", "engine.particles.turbulence", 0, 1.5, 0.01)}
        ${rangeField("노이즈 크기", "engine.particles.noiseScale", 0.05, 3, 0.01)}
        ${rangeField("수명", "engine.particles.lifespan", 0.5, 20, 0.1)}
        ${rangeField("발생 반경", "engine.particles.spawnRadius", 0.5, 6, 0.05)}
        ${rangeField("중심 끌림", "engine.particles.attraction", 0, 1, 0.01)}
        ${rangeField("중심 반발", "engine.particles.repulsion", 0, 1, 0.01)}
        ${rangeField("깊이 반응", "engine.particles.depthResponse", 0, 1, 0.01)}
        ${rangeField("카메라 반응", "engine.particles.cameraInteraction", 0, 1, 0.01)}
        ${rangeField("흐름 X", "engine.particles.flowDirection.0", -1, 1, 0.01)}
        ${rangeField("흐름 Y", "engine.particles.flowDirection.1", -1, 1, 0.01)}
        ${rangeField("흐름 Z", "engine.particles.flowDirection.2", -1, 1, 0.01)}
        ${toggleField("공간 라인", "engine.lines.enabled")}
        ${rangeField("라인 두께", "engine.lines.width", 0.001, 0.03, 0.001)}
        ${rangeField("라인 불투명도", "engine.lines.opacity", 0, 1, 0.01)}
        ${rangeField("라인 속도", "engine.lines.flowSpeed", 0, 1, 0.01)}
        ${rangeField("라인 발광", "engine.lines.glowStrength", 0, 1, 0.01)}
      `, "GPU")}`;
  }

  private lightingPanel(lightingOptions: string): string {
    return `
      ${section("조명 설정", `
        <label class="raw-field"><span>조명 프리셋</span><select data-action="lighting-preset">${lightingOptions}</select></label>
        ${colorField("배경", "lighting.backgroundColor")}
        ${rangeField("환경광 밝기", "lighting.environmentIntensity", 0, 6, 0.01)}
        ${rangeField("환경광 회전", "lighting.environmentRotation", -180, 180, 1)}
      `)}
      ${section("3D 조명", `
        <p class="raw-help raw-light-help">고정된 축 주위로 조명을 움직입니다. 수평 각도는 오브젝트 주위를 회전하고, 높이는 조명을 위아래로 이동합니다. 빛 범위가 0이면 전체를 비춥니다.</p>
        ${directLightControls("주 조명", "key", true)}
        ${directLightControls("보조 조명", "fill")}
        ${directLightControls("윤곽 조명", "rim")}
        ${directLightControls("좌상단 조명", "upperLeft", true)}
        ${directLightControls("우하단 조명", "lowerRight", true)}
      `, "카메라 고정")}
      ${section("소프트 영역광", `
        <p class="raw-help raw-light-help">중심점에서 바깥쪽으로 사라지는 넓은 영역광입니다. 왼쪽 아래 면의 경계를 그림자 속으로 부드럽게 녹입니다.</p>
        ${toggleField("사용", "lighting.softArea.enabled")}
        ${rangeField("광원 크기", "lighting.softArea.sourceSize", 0, 3, 0.01)}
        ${rangeField("감쇠 지수", "lighting.softArea.falloffExponent", 0.25, 4, 0.01)}
        ${rangeField("페넘브라 폭", "lighting.softArea.penumbraWidth", 0.05, 1, 0.01)}
        ${rangeField("경계 부드러움", "lighting.softArea.edgeSoftness", 0, 1, 0.01)}
        ${rangeField("환경 밝기", "lighting.softArea.ambientIntensity", 0, 0.2, 0.001)}
        ${rangeField("스침광 강도", "lighting.softArea.grazingStrength", 0, 2, 0.01)}
        ${rangeField("접점 어둡기", "lighting.softArea.contactDarkening", 0, 1, 0.01)}
        ${rangeField("접점 범위", "lighting.softArea.contactRadius", 0.01, 0.5, 0.01)}
        ${rangeField("왼쪽 면 밝기", "lighting.softArea.lowerFaceBias.0", 0, 2, 0.01)}
        ${rangeField("아래 면 밝기", "lighting.softArea.lowerFaceBias.1", 0, 2, 0.01)}
        ${rangeField("바깥 면 밝기", "lighting.softArea.lowerFaceBias.2", 0, 2, 0.01)}
      `, "Pleos 전용")}
      ${section("화면 구성", `
        <p class="raw-help">30° 축 카메라는 고정되어 있습니다. 캔버스 위에서 마우스 휠로 확대·축소할 수 있습니다.</p>
      `, "축 보호")}`;
  }

  private outputPanel(): string {
    return `
      ${section("렌더링 엔진", `
        <label class="raw-field"><span>백엔드</span><select data-state-path="engine.backend">
          ${option("auto", "WebGPU 우선 · WebGL2 자동 폴백")}
          ${option("webgpu", "WebGPU 우선")}
          ${option("webgl2", "WebGL2 강제")}
        </select></label>
        <label class="raw-field"><span>품질</span><select data-state-path="engine.quality">
          ${option("adaptive", "자동")}
          ${option("performance", "성능 우선")}
          ${option("balanced", "균형")}
          ${option("ultra", "최고 품질")}
        </select></label>
        ${toggleField("적응형 품질", "engine.adaptiveQuality")}
        ${rangeField("목표 FPS", "engine.targetFps", 30, 120, 1)}
        ${toggleField("모션 일시정지", "engine.animationPaused")}
        ${rangeField("볼륨 그라데이션", "engine.gradient.volumetricStrength", 0, 1.5, 0.01)}
        ${rangeField("방향성 그라데이션", "engine.gradient.directionalStrength", 0, 1.5, 0.01)}
        ${rangeField("프레넬 컬러", "engine.gradient.fresnelStrength", 0, 1.5, 0.01)}
        ${rangeField("그라데이션 노이즈", "engine.gradient.noiseStrength", 0, 0.8, 0.01)}
        ${rangeField("그라데이션 속도", "engine.gradient.temporalSpeed", 0, 1, 0.01)}
        ${rangeField("밴딩 억제", "engine.gradient.ditherStrength", 0, 0.05, 0.001)}
      `, "Three.js · WebGPU")}
      ${section("최종 이미지", `
        <label class="raw-field"><span>해상도 프리셋</span><select data-action="output-preset">
          ${OUTPUT_PRESETS.map((preset) => option(preset.value, `${preset.label} / ${preset.width} × ${preset.height}`)).join("")}${option("custom", "직접 설정")}
        </select></label>
        ${numberField("가로", "output.width", 64, 16384, 1)}
        ${numberField("세로", "output.height", 64, 16384, 1)}
        ${toggleField("비율 고정", "output.aspectLock")}
        ${toggleField("투명 배경", "output.transparent")}
        <label class="raw-field"><span>파일 이름</span><input type="text" data-state-path="output.filename"></label>
        ${rangeField("노출", "output.post.exposure", -6, 6, 0.01)}
        <label class="raw-field"><span>톤 매핑</span><select data-state-path="output.post.toneMapping">
          ${option("neutral", "AgX 중립")}
          ${option("aces-fitted", "ACES 시네마틱")}
        </select></label>
        ${rangeField("대비", "output.post.contrast", 0.5, 1.8, 0.01)}
        ${rangeField("블랙 리프트", "output.post.blackLift", 0, 0.2, 0.001)}
        ${rangeField("화이트 포인트", "output.post.whitePoint", 0.4, 2, 0.01)}
        ${toggleField("밴딩 억제", "output.post.dither")}
        ${toggleField("광학 블룸", "output.post.bloomEnabled")}
        ${rangeField("블룸 강도", "output.post.bloomStrength", 0, 2, 0.01)}
        ${rangeField("블룸 반경", "output.post.bloomRadius", 0.5, 6, 0.01)}
        ${rangeField("발광 임계값", "output.post.bloomThreshold", 0.05, 3, 0.01)}
        <button class="raw-full-button" data-command="export">PNG 렌더링 및 내보내기</button>
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
      this.setStatus({ message: command.type === "export" ? "내보내기 이미지를 렌더링하고 있습니다…" : `${command.type} 실행 중…`, level: "warning" });
      const next = await this.controller.command(command, this.store.snapshot);
      if (next) this.store.replace(next, { path: command.type, reason: "command" });
      this.setStatus({ message: command.type === "export" ? "내보내기가 완료되었습니다" : `${command.type} 완료`, level: "ok" });
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
    summary.textContent = state.material.mode === "matte" ? "두 정육면체 축 고정 · 매트" : "두 정육면체 축 고정 · 프리즘";
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
