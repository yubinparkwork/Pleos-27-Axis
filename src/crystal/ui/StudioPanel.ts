import { FormatPresetRegistry } from "../../artboard/FormatPresetRegistry";
import type { ArtboardState } from "../../artboard/ArtboardState";
import { MotionPresetRegistry } from "../../motion/MotionPresetRegistry";
import type { MotionSettings } from "../../motion/types";
import type { CrystalLook } from "../CrystalAssembly";
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

const section = (title: string, content: string): string =>
  `<section class="studio-section"><header><h2>${title}</h2></header>${content}</section>`;

const advancedSection = (title: string, content: string, id: string, open = false): string =>
  `<details class="inspector-section contextual-advanced" data-context-advanced="${id}" ${open ? "open" : ""}><summary><span><strong>${title}</strong></span><i></i></summary><div class="section-content">${content}</div></details>`;

const TAB_LABELS: Record<"setup" | "look" | "motion" | "format" | "export", string> = {
  setup: "설정", look: "표현", motion: "모션", format: "판형", export: "내보내기",
};

const LOOK_LABELS: Record<CrystalLook, string> = {
  clear: "투명 유리", prism: "프리즘", "spectral-flow": "스펙트럴 플로우", "soft-spectral": "소프트 스펙트럴", smoked: "스모크",
};

const selectRow = (label: string, select: string): string => `<label class="select-row"><span>${label}</span>${select}</label>`;

const lookOptions = (selected: CrystalLook): string =>
  (Object.keys(LOOK_LABELS) as CrystalLook[]).map((look) => `<option value="${look}" ${selected === look ? "selected" : ""}>${LOOK_LABELS[look]}</option>`).join("");

const prismStyleOptions = (selected: PrismStyleId): string =>
  Object.values(PRISM_STYLE_PRESETS).map((preset) => `<option value="${preset.id}" ${selected === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");

const spectralDirection = (state: SpectralFlowState): string =>
  [["axis-30", "축 30°"], ["axis-90", "축 90°"], ["axis-150", "축 150°"], ["reverse", "반대 방향"], ["auto", "자동 / 모션"]]
    .map(([value, label]) => `<option value="${value}" ${state.flowDirection === value ? "selected" : ""}>${label}</option>`).join("");

function compactPresetButtons(kind: "spectral" | "soft-spectral", active: string): string {
  const labels = { subtle: "절제", balanced: "균형", active: "강조" } as const;
  return `<div class="compact-segments">${(["subtle", "balanced", "active"] as const).map((preset) =>
    `<button data-${kind}-preset="${preset}" class="${active === preset ? "active" : ""}">${labels[preset]}</button>`).join("")}</div>`;
}

function spectralControls(state: SpectralFlowState, visible: boolean): string {
  return `<div class="look-specific" data-spectral-flow-controls ${visible ? "" : "hidden"}>
    ${section("스펙트럴", `${compactPresetButtons("spectral", state.preset)}${property("spectral-flow-position", "흐름 위치", -3, 3, .01, state.flowPosition)}${selectRow("흐름 방향", `<select data-spectral-direction>${spectralDirection(state)}</select>`)}${property("spectral-spread", "스펙트럼", .1, 2.5, .01, state.spectrumSpread)}${property("spectral-core-intensity", "중심광", 0, 5, .01, state.coreIntensity)}${property("spectral-darkness", "어두움", .1, 1, .01, state.darkness)}`)}
    ${advancedSection("고급 스펙트럴", `${property("spectral-flow-speed", "속도", 0, 3, .01, state.flowSpeed)}${property("spectral-flow-width", "폭", .08, 2.4, .01, state.flowWidth)}${property("spectral-flow-softness", "부드러움", .05, 1, .01, state.flowSoftness)}${property("spectral-separation", "분리", 0, 1.4, .01, state.spectrumSeparation)}${property("spectral-saturation", "채도", 0, 2, .01, state.saturation)}${property("spectral-lag", "지연", 0, .75, .01, state.spectralLag)}${property("spectral-core-width", "중심광 폭", .02, .8, .01, state.coreWidth)}${property("spectral-falloff", "감쇠", .25, 4, .01, state.falloff)}${property("spectral-bloom", "블룸", 0, 1.5, .01, state.bloom)}${property("spectral-edge-attraction", "모서리 집중", 0, 2.5, .01, state.edgeAttraction)}${property("spectral-reflection", "반사", 0, 3, .01, state.reflection)}`, "look-spectral")}
  </div>`;
}

function softSpectralControls(state: SoftSpectralState, visible: boolean): string {
  return `<div class="look-specific soft-spectral-controls" data-soft-spectral-controls ${visible ? "" : "hidden"}>
    ${section("소프트 스펙트럴", `${compactPresetButtons("soft-spectral", state.preset)}${property("soft-glow", "광량", 0, 2.5, .01, state.glow)}${property("soft-spectrum", "스펙트럼", 0, 2, .01, state.spectrum)}${property("soft-edge", "모서리", 0, 2, .01, state.edge)}${property("soft-darkness", "어두움", .1, 1, .01, state.darkness)}${property("soft-motion-depth", "모션 깊이", 0, 1.5, .01, state.motionDepth)}`)}
    ${advancedSection("고급 소프트 재질", `${property("soft-center-radius", "중심 반경", .1, 2.5, .01, state.centerRadius)}${property("soft-center-softness", "중심 부드러움", .05, 1, .01, state.centerSoftness)}${property("soft-spread", "스펙트럼 확산", .1, 2.5, .01, state.spectrumSpread)}${property("soft-separation", "분리", 0, 1, .01, state.spectrumSeparation)}${property("soft-saturation", "채도", 0, 1.5, .01, state.saturation)}${property("soft-phase-offset", "위상 오프셋", -1, 1, .01, state.phaseOffset)}${property("soft-edge-attraction", "모서리 집중", 0, 2, .01, state.edgeAttraction)}${property("soft-edge-softness", "모서리 부드러움", .05, 1, .01, state.edgeSoftness)}${property("soft-reflection", "반사", 0, 3, .01, state.reflection)}${property("soft-roughness", "거칠기", .02, .5, .01, state.roughness)}${property("soft-falloff", "감쇠", .3, 4, .01, state.falloff)}${property("soft-bloom", "블룸", 0, 1, .01, state.bloom)}`, "look-soft")}
  </div>`;
}

export function studioPanelTemplate(model: StudioPanelModel): string {
  const tabs: Array<keyof typeof TAB_LABELS> = ["setup", "look", "motion", "format", "export"];
  const motionOptions = MotionPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.motion.preset === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const formatOptions = FormatPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.artboard.id === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const variationOptions = `<option value="" ${model.selectedVariationId ? "" : "selected"}>현재 설정</option>` + model.variations.map((item) => `<option value="${item.id}" ${item.id === model.selectedVariationId ? "selected" : ""}>${item.label}${item.builtin ? "" : " · 사용자"}</option>`).join("");

  return `<aside class="control-dock" aria-label="Pleos Axis 설정 패널">
      <header class="inspector-header"><div><strong>INSPECTOR</strong><span data-output="save">저장됨</span></div><button data-action="inspector-close" title="Inspector 닫기">×</button></header>
      <div class="variation-bar"><label><span>Variation</span><select data-variation>${variationOptions}</select></label><details class="variation-actions"><summary aria-label="Variation 작업">•••</summary><div><button data-action="variation-save">새로 저장</button><button data-action="variation-duplicate">복제</button><button data-action="variation-rename">이름 변경</button><button data-action="variation-delete" class="danger">삭제</button></div></details></div>
      <nav class="inspector-tabs" role="tablist">${tabs.map((tab) => `<button role="tab" data-inspector-tab="${tab}" class="${model.activeTab === tab ? "active" : ""}">${TAB_LABELS[tab]}</button>`).join("")}</nav>
      <div class="inspector-views">
        <div class="inspector-view" data-inspector-view="setup">
          ${section("Axis", `<div class="axis-contract"><span>30°</span><span>공유 중심</span><span data-output="vertex-status">정상</span></div>`)}
          ${section("Geometry", `${property("gap", "큐브 간격", 0, .45, .01, model.gap)}${property("bevel-radius", "베벨", 0, .15, .001, model.bevelRadius)}`)}
          ${section("View", `<label class="toggle-row">시점 잠금<input data-control="view-lock" type="checkbox" checked></label><button class="compact-action" data-action="reset">카메라 초기화</button>`)}
          ${advancedSection("고급 Geometry", `<button class="compact-action" data-action="scene-reset">장면 전체 초기화</button><p class="section-note">Axis 중심과 30° 투영 관계는 잠겨 있습니다.</p>`, "setup-geometry")}
          ${advancedSection("고급 Camera", `${property("preview-zoom", "미리보기 확대", .5, 1.8, .05, model.artboard.previewZoom)}`, "setup-camera")}
        </div>

        <div class="inspector-view" data-inspector-view="look">
          ${section("Look", `${selectRow("Type", `<select data-look-select>${lookOptions(model.look)}</select>`)}<div data-prism-style-panel ${model.look === "prism" ? "" : "hidden"}>${selectRow("Style", `<select data-prism-style-select>${prismStyleOptions(model.prismStyle)}</select>`)}</div>`)}
          <div data-physical-optics ${model.look === "spectral-flow" || model.look === "soft-spectral" ? "hidden" : ""}>${section("Primary", `${property("roughness", "거칠기", .02, .28, .01, model.roughness)}${property("dispersion", "분산", 0, .35, .01, model.dispersion)}${property("reflection-strength", "반사", 0, 3, .05, model.reflection)}${property("refraction-strength", "굴절", 0, 1.25, .01, model.refraction)}${property("master-intensity", "조명 강도", 0, 3, .05, 1)}`)}</div>
          ${spectralControls(model.spectralFlow, model.look === "spectral-flow")}
          ${softSpectralControls(model.softSpectral, model.look === "soft-spectral")}
          ${advancedSection("고급 Material", `${property("ior", "굴절률 (IOR)", 1, 2.5, .001, model.physical.ior)}${property("thickness", "두께", .01, 10, .01, model.physical.thickness)}${property("attenuation-distance", "감쇠 거리", .1, 20, .1, model.physical.attenuationDistance)}${property("iridescence", "무지갯빛", 0, 1, .01, model.physical.iridescence)}`, "look-material")}
          ${advancedSection("고급 Lighting", `${section("Global", `${property("environment-intensity", "환경광", 0, 3, .05, model.environment)}${property("exposure", "노출", .2, 2.5, .05, model.exposure)}${property("bloom-intensity", "블룸", 0, 1.5, .05, model.bloom)}${property("color-saturation", "채도", 0, 2, .05, model.saturation)}`)}<section class="lighting-panel" data-lighting-panel></section>`, "look-lighting")}
        </div>

        <div class="inspector-view" data-inspector-view="motion">
          ${section("Motion", `<label class="toggle-row">모션 사용<input data-motion="enabled" type="checkbox" ${model.motion.enabled ? "checked" : ""}></label>${selectRow("Preset", `<select data-motion="preset"><option value="off">끄기</option>${motionOptions}</select>`)}${selectRow("Strength", `<select data-motion="strength-mode"><option value="restrained">절제</option><option value="balanced" ${model.motion.strengthMode === "balanced" ? "selected" : ""}>균형</option><option value="active">강조</option></select>`)}${property("motion-strength", "강도", 0, 1, .01, model.motion.strength)}${property("motion-duration", "길이", 1, 12, .1, model.motion.duration)}<label class="toggle-row">반복<input data-motion="loop" type="checkbox" ${model.motion.loop ? "checked" : ""}></label>`)}
          ${advancedSection("고급 Motion", `${property("motion-fps", "FPS", 12, 60, 1, model.motion.fps)}<div data-motion-parameters></div><button class="compact-action" data-action="motion-reset">모션 초기화</button>`, "motion-advanced")}
        </div>

        <div class="inspector-view" data-inspector-view="format">
          ${section("Artboard", `${selectRow("Preset", `<select data-format="preset">${formatOptions}</select>`)}<div class="dimension-grid"><label>W<input data-format="width" type="number" value="${model.artboard.width}"></label><label>H<input data-format="height" type="number" value="${model.artboard.height}"></label></div>${property("artboard-scale", "크기", .25, 2, .01, model.artboard.scale)}${property("axis-anchor-y", "세로 위치", 0, 1, .01, model.artboard.axisAnchor.gridY)}<label class="color-property"><span>배경</span><input data-format="background" type="color" value="${model.artboard.background}"></label><label class="toggle-row">투명 배경<input data-format="transparent" type="checkbox" ${model.artboard.transparent ? "checked" : ""}></label><label class="toggle-row">안전 영역<input data-format="safe-guide" type="checkbox" ${model.artboard.safeGuide ? "checked" : ""}></label>`)}
          ${advancedSection("고급 Artboard", `${property("axis-anchor-x", "축 X", 0, 1, .01, model.artboard.axisAnchor.gridX)}${selectRow("맞춤 방식", `<select data-format="fit"><option value="contain">맞춰 넣기</option><option value="cover">채우기</option><option value="custom">사용자 설정</option></select>`)}`, "format-advanced")}
        </div>

        <div class="inspector-view" data-inspector-view="export">
          ${section("Output", `${selectRow("Type", `<select data-export-type><option value="still">스틸 이미지</option><option value="motion">모션 시퀀스</option></select>`)}${selectRow("Render", `<select data-export-render><option value="path">패스 트레이싱</option><option value="raster">래스터</option></select>`)}${selectRow("Quality", `<select data-export-quality><option value="draft">Draft</option><option value="preview">Preview</option><option value="high" selected>High</option><option value="print">Print</option><option value="custom">Custom</option></select>`)}<div class="export-summary"><span>출력</span><b data-output="export-size">${model.artboard.width} × ${model.artboard.height}px</b></div><label class="toggle-row">투명 배경<input data-format="transparent-mirror" type="checkbox" ${model.artboard.transparent ? "checked" : ""}></label>`)}
          <section class="render-workflow"><button class="render-primary" data-action="render-export">렌더 및 내보내기</button><button class="render-cancel" data-action="cancel-render" hidden>취소</button><div class="render-progress"><div><span data-output="render-progress-text">준비됨</span><b data-output="render-progress-percent">0%</b></div><i><span data-output="render-progress-bar"></span></i></div></section>
          ${advancedSection("Custom Render", `<div class="render-quality-grid"><button data-action="render-fast"><strong>빠른 미리보기</strong><span>16 spp</span></button><button data-action="render-high"><strong>고품질</strong><span>${model.outputSamples} spp</span></button></div>${property("scale", "렌더 배율", .4, 1, .05, model.renderScale)}${property("bounces", "반사 횟수", 3, 14, 1, model.bounces)}${property("target-samples", "샘플 수", 16, 512, 16, model.outputSamples)}`, "export-custom")}
          ${advancedSection("부분 렌더링", `<label class="toggle-row">부분 렌더링<input data-region-enabled type="checkbox" ${model.renderRegion.enabled ? "checked" : ""}></label><div class="render-region-actions"><button data-action="region-center">가운데 정렬</button><button data-action="region-full">전체</button></div>${selectRow("단위 기준", `<span class="unit-value"><input data-unit-ppi data-scrub type="number" min="36" max="1200" value="${model.renderRegion.unitPpi}"><i>ppi</i></span>`)}<div class="motion-region-grid">${([['x','X',model.renderRegion.x],['y','Y',model.renderRegion.y],['width','W',model.renderRegion.width],['height','H',model.renderRegion.height]] as const).map(([key,label,value]) => `<label><span>${label}</span><input data-region="${key}" type="text" value="${value}"><i>px</i></label>`).join("")}</div>`, "export-region")}
          ${advancedSection("Print Metadata", `${selectRow("출력 PPI", `<select data-control="export-ppi">${[72,150,300].map((ppi) => `<option value="${ppi}" ${model.ppi === ppi ? "selected" : ""}>${ppi} ppi</option>`).join("")}</select>`)}<div class="export-summary"><span>인쇄 출력</span><b data-output="print-size">${model.printOutput}</b></div>`, "export-print")}
          ${advancedSection("Motion Sequence", `<button class="compact-action" data-action="copy-sequence">PNG 시퀀스 명령 복사</button><code data-output="sequence-command" hidden></code>`, "export-motion")}
        </div>
      </div>
    </aside>`;
}
