import { FormatPresetRegistry } from "../../artboard/FormatPresetRegistry";
import type { ArtboardState } from "../../artboard/ArtboardState";
import { MotionPresetRegistry } from "../../motion/MotionPresetRegistry";
import type { MotionSettings } from "../../motion/types";
import { CRYSTAL_LOOKS, type CrystalLook } from "../CrystalAssembly";
import type { InspectorTab } from "../InspectorPanel";
import type { SpectralFlowState } from "../materials/SpectralFlowMaterial";
import type { SoftSpectralState } from "../materials/SoftSpectralMaterial";
import { PRISM_STYLE_PRESETS, type PhysicalLookParameters, type PrismStyleId } from "../presets/PrismStylePresets";

export interface StudioPanelModel {
  look: CrystalLook; prismStyle: PrismStyleId; physical: PhysicalLookParameters;
  variations: Array<{ id: string; label: string; builtin: boolean }>; selectedVariationId: string;
  gap: number; bevelRadius: number; roughness: number; dispersion: number;
  reflection: number; refraction: number; exposure: number; bloom: number;
  saturation: number; environment: number; motion: MotionSettings;
  artboard: ArtboardState; activeTab: InspectorTab; outputSamples: number;
  bounces: number; renderScale: number; ppi: number;
  renderRegion: { enabled: boolean; x: number; y: number; width: number; height: number; unitPpi: number };
  printOutput: string; spectralFlow: SpectralFlowState; softSpectral: SoftSpectralState;
}

const property = (name: string, label: string, min: number, max: number, step: number, value: number): string =>
  `<div class="property-row"><label for="${name}-range">${label}</label><input id="${name}-range" data-control="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-number="${name}" data-scrub type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} 값"></div>`;
const section = (title: string, content: string, subtitle = ""): string =>
  `<section class="studio-section"><header><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</header>${content}</section>`;
const advancedSection = (title: string, content: string, subtitle = ""): string =>
  `<details class="inspector-section"><summary><span><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ""}</span><i></i></summary><div class="section-content">${content}</div></details>`;

const TAB_LABELS: Record<"setup" | "look" | "motion" | "format" | "export", string> = {
  setup: "설정", look: "표현", motion: "모션", format: "판형", export: "내보내기",
};
const LOOK_LABELS: Record<CrystalLook, string> = {
  clear: "투명", prism: "프리즘", "spectral-flow": "스펙트럴", "soft-spectral": "소프트 스펙트럴", smoked: "스모크",
};

const spectralDirection = (state: SpectralFlowState): string =>
  [["axis-30", "축 30°"], ["axis-90", "축 90°"], ["axis-150", "축 150°"], ["reverse", "반대 방향"], ["auto", "자동 / 모션"]]
    .map(([value, label]) => `<option value="${value}" ${state.flowDirection === value ? "selected" : ""}>${label}</option>`).join("");

function spectralPrimary(state: SpectralFlowState, visible: boolean): string {
  const labels = { subtle: "절제", balanced: "균형", active: "강조" } as const;
  const descriptions = { subtle: "어둡고 절제된 표현", balanced: "흰색 중심광 강조", active: "강한 화면 존재감" } as const;
  return `<div class="spectral-flow-controls" data-spectral-flow-controls ${visible ? "" : "hidden"}>
    ${section("스타일", `<div class="preset-cards spectral-preset-grid">${(["subtle", "balanced", "active"] as const).map((preset) => `<button data-spectral-preset="${preset}" class="${state.preset === preset ? "active" : ""}"><strong>${labels[preset]}</strong><span>${descriptions[preset]}</span></button>`).join("")}</div>`)}
    ${section("기본 조정", `${property("spectral-flow-position", "흐름 위치", -3, 3, .01, state.flowPosition)}<label class="select-row"><span>흐름 방향</span><select data-spectral-direction>${spectralDirection(state)}</select></label>${property("spectral-spread", "스펙트럼", .1, 2.5, .01, state.spectrumSpread)}${property("spectral-core-intensity", "흰색 중심광", 0, 5, .01, state.coreIntensity)}${property("spectral-darkness", "어두움", .1, 1, .01, state.darkness)}`)}
  </div>`;
}

function softSpectralPrimary(state: SoftSpectralState, visible: boolean): string {
  const labels = { subtle: "절제", balanced: "균형", active: "강조" } as const;
  const descriptions = { subtle: "잔잔한 광학 안개", balanced: "부드러운 스펙트럴 강조", active: "확장된 색상 영역" } as const;
  return `<div class="spectral-flow-controls soft-spectral-controls" data-soft-spectral-controls ${visible ? "" : "hidden"}>
    ${section("스타일", `<div class="preset-cards spectral-preset-grid">${(["subtle", "balanced", "active"] as const).map((preset) => `<button data-soft-spectral-preset="${preset}" class="${state.preset === preset ? "active" : ""}"><strong>${labels[preset]}</strong><span>${descriptions[preset]}</span></button>`).join("")}</div>`)}
    ${section("기본 조정", `${property("soft-glow", "광량", 0, 2.5, .01, state.glow)}${property("soft-spectrum", "스펙트럼", 0, 2, .01, state.spectrum)}${property("soft-edge", "모서리", 0, 2, .01, state.edge)}${property("soft-darkness", "어두움", .1, 1, .01, state.darkness)}${property("soft-motion-depth", "모션 깊이", 0, 1.5, .01, state.motionDepth)}`)}
    ${advancedSection("광학 영역", `${property("soft-center-radius", "중심 반경", .1, 2.5, .01, state.centerRadius)}${property("soft-center-softness", "중심 부드러움", .05, 1, .01, state.centerSoftness)}${property("soft-spread", "스펙트럼 확산", .1, 2.5, .01, state.spectrumSpread)}${property("soft-separation", "분리", 0, 1, .01, state.spectrumSeparation)}${property("soft-saturation", "채도", 0, 1.5, .01, state.saturation)}${property("soft-phase-offset", "위상 오프셋", -1, 1, .01, state.phaseOffset)}${property("soft-edge-attraction", "모서리 집중", 0, 2, .01, state.edgeAttraction)}${property("soft-edge-softness", "모서리 부드러움", .05, 1, .01, state.edgeSoftness)}${property("soft-reflection", "반사", 0, 3, .01, state.reflection)}${property("soft-roughness", "거칠기", .02, .5, .01, state.roughness)}${property("soft-falloff", "감쇠", .3, 4, .01, state.falloff)}${property("soft-bloom", "블룸", 0, 1, .01, state.bloom)}`, "소프트 스펙트럴 전용")}
  </div>`;
}

export function studioPanelTemplate(model: StudioPanelModel): string {
  const tabs: Array<keyof typeof TAB_LABELS> = ["setup", "look", "motion", "format", "export"];
  const motionOptions = MotionPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.motion.preset === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const formatOptions = FormatPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.artboard.id === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const styleCards = Object.values(PRISM_STYLE_PRESETS).map((preset) => `<button data-prism-style="${preset.id}" class="${model.prismStyle === preset.id ? "active" : ""}"><strong>${preset.label}</strong><span>${preset.description}</span></button>`).join("");
  const variationOptions = `<option value="" ${model.selectedVariationId ? "" : "selected"}>현재 설정</option>` + model.variations.map((item) => `<option value="${item.id}" ${item.id === model.selectedVariationId ? "selected" : ""}>${item.label}${item.builtin ? "" : " · 사용자"}</option>`).join("");
  const formatButtons = FormatPresetRegistry.list().filter((item) => item.id !== "custom").map((item) => `<button data-format-preset="${item.id}" class="${model.artboard.id === item.id ? "active" : ""}">${item.shortLabel}</button>`).join("");
  return `<button class="inspector-toggle" data-action="inspector-toggle" aria-label="설정 패널 표시 또는 숨기기"><span></span><span></span></button>
    <aside class="control-dock" aria-label="Pleos Axis 설정 패널">
      <header class="inspector-header"><div><strong>Pleos Axis</strong><span data-output="save">자동 저장</span></div><button data-action="advanced-toggle">고급</button><button data-action="inspector-close">×</button></header>
      <div class="variation-bar"><label><span>변형</span><select data-variation>${variationOptions}</select></label><div><button data-action="variation-save" class="primary">+ 저장</button><button data-action="variation-duplicate" title="복제">⧉</button><button data-action="variation-rename" title="이름 변경">✎</button><button data-action="variation-delete" title="삭제">×</button></div></div>
      <nav class="inspector-tabs" role="tablist">${tabs.map((tab) => `<button role="tab" data-inspector-tab="${tab}" class="${model.activeTab === tab ? "active" : ""}">${TAB_LABELS[tab]}</button>`).join("")}</nav>
      <div class="inspector-views">
        <div class="inspector-view" data-inspector-view="setup">${section("축", `<div class="axis-status"><span>계열</span><b>30°</b><span>중심</span><b>공유</b><span>꼭짓점</span><b data-output="vertex-status">정상</b></div>`, "브랜드 구조는 잠겨 있고 표현만 조정됩니다.")}${section("모델", `${property("gap", "큐브 간격", 0, .45, .01, model.gap)}${property("bevel-radius", "모서리 둥글기", 0, .15, .001, model.bevelRadius)}`)}${section("보기", `<div class="button-grid"><button data-action="reset">카메라 초기화</button><button data-action="scene-reset">장면 초기화</button></div><label class="toggle-row">시점 잠금<input data-control="view-lock" type="checkbox" checked></label>`)}</div>
        <div class="inspector-view" data-inspector-view="look">
          ${section("표현 방식", `<div class="segmented look-segmented">${CRYSTAL_LOOKS.map((look) => `<button data-look="${look}" class="${model.look === look ? "active" : ""}">${LOOK_LABELS[look]}</button>`).join("")}</div>`)}
          <div data-physical-optics ${model.look === "spectral-flow" ? "hidden" : ""}><div data-prism-style-panel ${model.look === "prism" ? "" : "hidden"}>${section("스타일", `<div class="preset-cards">${styleCards}</div>`)}</div>${section("기본 조정", `${property("roughness", "거칠기", .02, .28, .01, model.roughness)}${property("dispersion", "분산", 0, .35, .01, model.dispersion)}${property("reflection-strength", "반사", 0, 3, .05, model.reflection)}${property("refraction-strength", "굴절", 0, 1.25, .01, model.refraction)}${property("master-intensity", "조명 강도", 0, 3, .05, 1)}`)}</div>
          ${spectralPrimary(model.spectralFlow, model.look === "spectral-flow")}<button class="advanced-link" data-action="advanced-toggle">표현 고급 설정 →</button>
        </div>
        <div class="inspector-view" data-inspector-view="motion">${section("모션", `<label class="toggle-row primary-toggle">모션 사용<input data-motion="enabled" type="checkbox" ${model.motion.enabled ? "checked" : ""}></label><label class="select-row"><span>프리셋</span><select data-motion="preset"><option value="off">끄기</option>${motionOptions}</select></label><label class="select-row"><span>성격</span><select data-motion="strength-mode"><option value="restrained">절제</option><option value="balanced" ${model.motion.strengthMode === "balanced" ? "selected" : ""}>균형</option><option value="active">강조</option></select></label>${property("motion-strength", "강도", 0, 1, .01, model.motion.strength)}${property("motion-duration", "길이", 1, 12, .1, model.motion.duration)}<label class="toggle-row">반복<input data-motion="loop" type="checkbox" ${model.motion.loop ? "checked" : ""}></label><button class="wide-button" data-action="motion-reset">모션 초기화</button>`)}<button class="advanced-link" data-action="advanced-toggle">모션 고급 설정 →</button></div>
        <div class="inspector-view" data-inspector-view="format">${section("프리셋", `<div class="format-segmented">${formatButtons}</div>`)}${section("구성", `${property("artboard-scale", "크기", .25, 2, .01, model.artboard.scale)}${property("axis-anchor-x", "축 X", 0, 1, .01, model.artboard.axisAnchor.gridX)}${property("axis-anchor-y", "축 Y", 0, 1, .01, model.artboard.axisAnchor.gridY)}<label class="color-property"><span>배경색</span><input data-format="background" type="color" value="${model.artboard.background}"></label><label class="toggle-row">투명 배경<input data-format="transparent" type="checkbox" ${model.artboard.transparent ? "checked" : ""}></label>`)}<button class="advanced-link" data-action="advanced-toggle">판형 고급 설정 →</button></div>
        <div class="inspector-view" data-inspector-view="export">${section("스틸 이미지", `<button class="wide-button" data-action="export-raster">실시간 PNG</button><button class="wide-button primary" data-action="render-current-high">패스 트레이싱 PNG</button>`)}${section("모션", `<button class="wide-button" data-action="copy-sequence">PNG 시퀀스 명령 복사</button><code data-output="sequence-command" hidden></code>`)}${section("출력", `<div class="export-summary"><span>픽셀 크기</span><b data-output="export-size">${model.artboard.width} × ${model.artboard.height}px</b></div>`)}<button class="advanced-link" data-action="advanced-toggle">내보내기 고급 설정 →</button></div>
      </div>
      <div class="advanced-drawer" data-advanced hidden><header><div><strong>고급 설정</strong><span>세부 기술 조정</span></div><button data-action="advanced-close">×</button></header>
        ${advancedSection("물리 유리", `${property("ior", "굴절률 (IOR)", 1, 2.5, .001, model.physical.ior)}${property("thickness", "두께", .01, 10, .01, model.physical.thickness)}${property("attenuation-distance", "감쇠 거리", .1, 20, .1, model.physical.attenuationDistance)}${property("iridescence", "무지갯빛", 0, 1, .01, model.physical.iridescence)}${property("environment-intensity", "환경광", 0, 3, .05, model.environment)}${property("exposure", "노출", .2, 2.5, .05, model.exposure)}${property("bloom-intensity", "블룸", 0, 1.5, .05, model.bloom)}${property("color-saturation", "채도", 0, 2, .05, model.saturation)}`)}
        ${advancedSection("스펙트럴 흐름", `${property("spectral-flow-speed", "속도", 0, 3, .01, model.spectralFlow.flowSpeed)}${property("spectral-flow-width", "폭", .08, 2.4, .01, model.spectralFlow.flowWidth)}${property("spectral-flow-softness", "부드러움", .05, 1, .01, model.spectralFlow.flowSoftness)}${property("spectral-separation", "분리", 0, 1.4, .01, model.spectralFlow.spectrumSeparation)}${property("spectral-saturation", "채도", 0, 2, .01, model.spectralFlow.saturation)}${property("spectral-lag", "스펙트럴 지연", 0, .75, .01, model.spectralFlow.spectralLag)}${property("spectral-core-width", "중심광 폭", .02, .8, .01, model.spectralFlow.coreWidth)}${property("spectral-falloff", "감쇠", .25, 4, .01, model.spectralFlow.falloff)}${property("spectral-bloom", "블룸", 0, 1.5, .01, model.spectralFlow.bloom)}${property("spectral-edge-attraction", "모서리 집중", 0, 2.5, .01, model.spectralFlow.edgeAttraction)}${property("spectral-reflection", "반사", 0, 3, .01, model.spectralFlow.reflection)}`)}
        ${advancedSection("모션 세부", `${property("motion-fps", "초당 프레임 (FPS)", 12, 60, 1, model.motion.fps)}<div data-motion-parameters></div>`)}
        ${advancedSection("판형 세부", `<label class="select-row"><span>판형</span><select data-format="preset">${formatOptions}</select></label><div class="dimension-grid"><label>너비<input data-format="width" type="number" value="${model.artboard.width}"></label><label>높이<input data-format="height" type="number" value="${model.artboard.height}"></label></div><label class="select-row"><span>맞춤 방식</span><select data-format="fit"><option value="contain">맞춰 넣기</option><option value="cover">채우기</option><option value="custom">사용자 설정</option></select></label>${property("preview-zoom", "미리보기 확대", .5, 1.8, .05, model.artboard.previewZoom)}<label class="toggle-row">안전 영역<input data-format="safe-guide" type="checkbox" ${model.artboard.safeGuide ? "checked" : ""}></label>`)}
        ${advancedSection("패스 트레이싱", `<div class="render-quality-grid"><button data-action="render-fast"><strong>빠른 미리보기</strong><span>16 spp</span></button><button data-action="render-high"><strong>고품질</strong><span>${model.outputSamples} spp</span></button></div>${property("scale", "렌더 배율", .4, 1, .05, model.renderScale)}${property("bounces", "반사 횟수", 3, 14, 1, model.bounces)}${property("target-samples", "샘플 수", 16, 512, 16, model.outputSamples)}`)}
        ${advancedSection("부분 렌더링", `<label class="toggle-row primary-toggle">부분 렌더링 사용<input data-region-enabled type="checkbox" ${model.renderRegion.enabled ? "checked" : ""}></label><div class="render-region-actions"><button data-action="region-center">가운데</button><button data-action="region-full">전체</button></div><label class="select-row"><span>단위 기준</span><span class="unit-value"><input data-unit-ppi data-scrub type="number" min="36" max="1200" value="${model.renderRegion.unitPpi}"><i>ppi</i></span></label><div class="motion-region-grid">${([['x','X',model.renderRegion.x],['y','Y',model.renderRegion.y],['width','너비',model.renderRegion.width],['height','높이',model.renderRegion.height]] as const).map(([key,label,value]) => `<label><span>${label}</span><input data-region="${key}" type="text" value="${value}"><i>px</i></label>`).join("")}</div>`)}
        ${advancedSection("인쇄 출력", `<label class="select-row"><span>출력 PPI</span><select data-control="export-ppi">${[72,150,300].map((ppi) => `<option value="${ppi}" ${model.ppi === ppi ? "selected" : ""}>${ppi}</option>`).join("")}</select></label><div class="export-summary"><span>물리 크기 출력</span><b data-output="print-size">${model.printOutput}</b></div><button class="wide-button primary" data-action="export-print">PPI 기준 렌더·저장</button>`)}
        ${advancedSection("개별 조명", `<section class="lighting-panel" data-lighting-panel></section>`)}
      </div>
      ${softSpectralPrimary(model.softSpectral, model.look === "soft-spectral")}
    </aside>`;
}
