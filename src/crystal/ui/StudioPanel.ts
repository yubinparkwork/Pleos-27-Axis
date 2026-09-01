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
  bounces: number; renderScale: number; ppi: number; viewLocked?: boolean;
  cameraPan: { x: number; y: number };
  renderRegion: { enabled: boolean; x: number; y: number; width: number; height: number; unitPpi: number };
  printOutput: string; spectralFlow: SpectralFlowState; softSpectral: SoftSpectralState;
}

const property = (name: string, label: string, min: number, max: number, step: number, value: number): string =>
  `<div class="property-row"><label for="${name}-range">${label}</label><input id="${name}-range" data-control="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-number="${name}" data-scrub type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} value"></div>`;

const section = (title: string, content: string, attributes = ""): string =>
  `<section class="studio-section" ${attributes}><header><h2>${title}</h2></header>${content}</section>`;

const details = (title: string, content: string, id: string): string =>
  `<details class="inspector-section contextual-advanced" data-context-advanced="${id}"><summary><span><strong>${title}</strong></span><i></i></summary><div class="section-content">${content}</div></details>`;

const selectRow = (label: string, select: string): string => `<label class="select-row"><span>${label}</span>${select}</label>`;

const LOOK_LABELS: Record<CrystalLook, string> = { clear: "Clear", prism: "Prism", "spectral-flow": "Spectral Flow", "soft-spectral": "Soft Spectral", smoked: "Smoked" };
const lookOptions = (selected: CrystalLook): string => (Object.keys(LOOK_LABELS) as CrystalLook[]).map((look) => `<option value="${look}" ${selected === look ? "selected" : ""}>${LOOK_LABELS[look]}</option>`).join("");
const prismStyleOptions = (selected: PrismStyleId): string => Object.values(PRISM_STYLE_PRESETS).map((preset) => `<option value="${preset.id}" ${selected === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
const spectralDirection = (state: SpectralFlowState): string => [["axis-30", "Axis 30°"], ["axis-90", "Axis 90°"], ["axis-150", "Axis 150°"], ["reverse", "Reverse"], ["auto", "Auto / Motion"]].map(([value, label]) => `<option value="${value}" ${state.flowDirection === value ? "selected" : ""}>${label}</option>`).join("");

function compactPresetButtons(kind: "spectral" | "soft-spectral", active: string): string {
  const labels = { subtle: "Subtle", balanced: "Balanced", active: "Active" } as const;
  return `<div class="compact-segments">${(["subtle", "balanced", "active"] as const).map((preset) => `<button data-${kind}-preset="${preset}" class="${active === preset ? "active" : ""}">${labels[preset]}</button>`).join("")}</div>`;
}

function spectralControls(state: SpectralFlowState, visible: boolean): string {
  return `<div class="look-specific" data-spectral-flow-controls ${visible ? "" : "hidden"}>
    ${section("Spectral Flow", `${compactPresetButtons("spectral", state.preset)}${property("spectral-flow-position", "Flow", -3, 3, .01, state.flowPosition)}${selectRow("Direction", `<select data-spectral-direction>${spectralDirection(state)}</select>`)}${property("spectral-spread", "Spectrum", .1, 2.5, .01, state.spectrumSpread)}${property("spectral-core-intensity", "Core", 0, 5, .01, state.coreIntensity)}${property("spectral-darkness", "Darkness", .1, 1, .01, state.darkness)}`)}
    ${details("Spectral Details", `${property("spectral-flow-speed", "Speed", 0, 3, .01, state.flowSpeed)}${property("spectral-flow-width", "Width", .08, 2.4, .01, state.flowWidth)}${property("spectral-flow-softness", "Softness", .05, 1, .01, state.flowSoftness)}${property("spectral-separation", "Separation", 0, 1.4, .01, state.spectrumSeparation)}${property("spectral-saturation", "Saturation", 0, 2, .01, state.saturation)}${property("spectral-lag", "Lag", 0, .75, .01, state.spectralLag)}${property("spectral-core-width", "Core width", .02, .8, .01, state.coreWidth)}${property("spectral-falloff", "Falloff", .25, 4, .01, state.falloff)}${property("spectral-bloom", "Bloom", 0, 1.5, .01, state.bloom)}${property("spectral-edge-attraction", "Edge focus", 0, 2.5, .01, state.edgeAttraction)}${property("spectral-reflection", "Reflection", 0, 3, .01, state.reflection)}`, "look-spectral")}
  </div>`;
}

function softSpectralControls(state: SoftSpectralState, visible: boolean): string {
  return `<div class="look-specific soft-spectral-controls" data-soft-spectral-controls ${visible ? "" : "hidden"}>
    ${section("Soft Spectral", `${compactPresetButtons("soft-spectral", state.preset)}${property("soft-glow", "Glow", 0, 2.5, .01, state.glow)}${property("soft-spectrum", "Spectrum", 0, 2, .01, state.spectrum)}${property("soft-edge", "Edge", 0, 2, .01, state.edge)}${property("soft-darkness", "Darkness", .1, 1, .01, state.darkness)}${property("soft-motion-depth", "Motion depth", 0, 1.5, .01, state.motionDepth)}`)}
    ${details("Soft Material Details", `${property("soft-center-radius", "Center radius", .1, 2.5, .01, state.centerRadius)}${property("soft-center-softness", "Center softness", .05, 1, .01, state.centerSoftness)}${property("soft-spread", "Spread", .1, 2.5, .01, state.spectrumSpread)}${property("soft-separation", "Separation", 0, 1, .01, state.spectrumSeparation)}${property("soft-saturation", "Saturation", 0, 1.5, .01, state.saturation)}${property("soft-phase-offset", "Phase", -1, 1, .01, state.phaseOffset)}${property("soft-edge-attraction", "Edge focus", 0, 2, .01, state.edgeAttraction)}${property("soft-edge-softness", "Edge softness", .05, 1, .01, state.edgeSoftness)}${property("soft-reflection", "Reflection", 0, 3, .01, state.reflection)}${property("soft-roughness", "Roughness", .02, .5, .01, state.roughness)}${property("soft-falloff", "Falloff", .3, 4, .01, state.falloff)}${property("soft-bloom", "Bloom", 0, 1, .01, state.bloom)}`, "look-soft")}
  </div>`;
}

export function studioPanelTemplate(model: StudioPanelModel): string {
  const motionOptions = MotionPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.motion.preset === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const formatOptions = FormatPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.artboard.id === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const exportRegion = details("부분 렌더", `<label class="toggle-row"><span>사용</span><input data-region-enabled type="checkbox" ${model.renderRegion.enabled ? "checked" : ""}></label><div class="render-region-actions"><button data-action="region-center">가운데</button><button data-action="region-full">전체</button></div>${selectRow("기준 PPI", `<span class="unit-value"><input data-unit-ppi data-scrub type="number" min="36" max="1200" value="${model.renderRegion.unitPpi}"><i>ppi</i></span>`)}<div class="motion-region-grid">${([['x','X',model.renderRegion.x],['y','Y',model.renderRegion.y],['width','W',model.renderRegion.width],['height','H',model.renderRegion.height]] as const).map(([key,label,value]) => `<label><span>${label}</span><input data-region="${key}" type="text" value="${value}"><i>px</i></label>`).join("")}</div>`, "export-region");
  const exportMotion = details("모션 시퀀스", `<p class="export-help">외부 후반 작업이 필요할 때 프레임 시퀀스 명령을 복사합니다.</p><button class="compact-action" data-action="copy-sequence">PNG 시퀀스 명령 복사</button><code data-output="sequence-command" hidden></code>`, "export-motion");
  const exportPanel = section("이미지 내보내기", `
        <div class="export-block"><strong>캔버스</strong>${selectRow("판형", `<select data-format="preset">${formatOptions}</select>`)}<div class="output-size-row"><span>내보내기 영역</span><b data-output="export-size">${model.artboard.width} × ${model.artboard.height}px</b></div><div class="dimension-grid"><label>W<input data-format="width" type="number" value="${model.artboard.width}"></label><label>H<input data-format="height" type="number" value="${model.artboard.height}"></label></div><label class="color-property"><span>배경</span><input data-format="background" type="color" value="${model.artboard.background}"></label><label class="toggle-row"><span>투명 배경</span><input data-format="transparent" type="checkbox" ${model.artboard.transparent ? "checked" : ""}></label></div>
        ${exportRegion}
        <div class="export-block"><strong>렌더</strong>${selectRow("유형", `<select data-export-type><option value="still">이미지</option><option value="video">영상 · MP4</option></select>`)}${selectRow("렌더러", `<select data-export-render><option value="path">패스 트레이싱</option><option value="raster">래스터</option></select>`)}<div data-path-settings>${property("scale", "렌더 비율", .4, 1, .05, model.renderScale)}${property("bounces", "반사 횟수", 3, 14, 1, model.bounces)}${property("target-samples", "샘플", 16, 2048, 16, model.outputSamples)}</div><div class="video-export-settings" data-video-settings hidden><div class="output-size-row"><span>범위</span><b>0초–${model.motion.duration.toFixed(1)}초</b></div><div class="output-size-row"><span>프레임</span><b>${Math.round(model.motion.duration * model.motion.fps)}장 · ${model.motion.fps} fps</b></div><p class="export-help">각 프레임을 설정된 샘플 수까지 패스트레이싱하고 디노이즈한 뒤 H.264 MP4로 저장합니다. 홀수 크기는 구도를 유지한 채 오른쪽 또는 아래에 배경 1px을 자동 추가합니다.</p></div></div>
        <div class="export-block"><strong>인쇄</strong>${selectRow("출력 PPI", `<select data-control="export-ppi">${[72,150,300].map((ppi) => `<option value="${ppi}" ${model.ppi === ppi ? "selected" : ""}>${ppi} ppi</option>`).join("")}</select>`)}<div class="export-summary"><span>최종 출력</span><b data-output="print-size">${model.printOutput}</b></div></div>
        ${exportMotion}
        <div class="render-progress" role="status" aria-live="polite"><div><span data-output="render-progress-text">준비됨</span><b data-output="render-progress-percent">0%</b></div><i><span data-output="render-progress-bar"></span></i></div><button class="render-primary" data-action="render-export">PNG 내보내기</button><button class="render-cancel" data-action="cancel-render" hidden>취소</button>`, "data-output-section data-panel-section='output'");
  const structurePanel = `<aside class="workspace-panel structure-panel" aria-label="구조 및 컴포지션 패널">
    <header class="panel-header"><div><strong>구조</strong><span>축·구도</span></div><button data-action="structure-close" title="구조 패널 접기" aria-label="구조 패널 접기">‹</button></header>
    <div class="panel-scroll">
      <div class="axis-overview" aria-label="Axis 구조 상태"><span class="axis-node"></span><div><strong>큐브 3개 / 축 1개</strong><small>공유 꼭지점 구조</small></div><b>활성</b></div>
      ${section("구조", `${property("gap", "큐브 간격", 0, .45, .01, model.gap)}${property("bevel-radius", "베벨", 0, .15, .001, model.bevelRadius)}<button class="compact-action" data-action="scene-reset">장면 초기화</button>`, "data-panel-section='geometry'")}
      ${section("카메라", `<label class="toggle-row"><span>시점 잠금</span><input data-control="view-lock" type="checkbox" ${model.viewLocked === false ? "" : "checked"}></label>${property("preview-zoom", "미리보기 확대", .5, 1.8, .05, model.artboard.previewZoom)}${property("camera-pan-x", "카메라 수평 이동", -3, 3, .01, model.cameraPan.x)}${property("camera-pan-y", "카메라 수직 이동", -3, 3, .01, model.cameraPan.y)}<button class="compact-action" data-action="camera-pan-center">카메라 위치 중앙 정렬</button><button class="compact-action" data-action="reset">카메라 시점 초기화</button>`, "data-panel-section='camera'")}
      ${section("구도", `${property("artboard-scale", "그래픽 크기", .25, 2, .01, model.artboard.scale)}${property("axis-anchor-x", "그래픽 가로 위치", 0, 1, .01, model.artboard.axisAnchor.gridX)}${property("axis-anchor-y", "그래픽 세로 위치", 0, 1, .01, model.artboard.axisAnchor.gridY)}${selectRow("맞춤", `<select data-format="fit"><option value="contain">Contain</option><option value="cover">Cover</option><option value="custom">Custom</option></select>`)}<label class="toggle-row"><span>안전 가이드</span><input data-format="safe-guide" type="checkbox" ${model.artboard.safeGuide ? "checked" : ""}></label>`, "data-panel-section='composition'")}
    </div>
    <button class="panel-rail-button" data-action="structure-open" title="구조 패널 펼치기" aria-label="구조 패널 펼치기">›</button>
  </aside>`;
  const appearancePanel = `<aside class="control-dock" aria-label="Glass 3D Inspector">
    <header class="inspector-header"><div><strong>외형</strong><span>유리 3D</span></div><button data-action="inspector-close" title="외형 패널 접기" aria-label="외형 패널 접기">›</button></header>
    <nav class="panel-nav" aria-label="Inspector 섹션"><button data-panel-jump="style">스타일</button><button data-panel-jump="lighting">조명</button><button data-panel-jump="motion">모션</button><button data-panel-jump="output">출력</button></nav>
    <div class="inspector-views"><div class="inspector-view active" data-mode-panel="glass-3d">
      ${section("스타일", `${selectRow("표현", `<select data-look-select>${lookOptions(model.look)}</select>`)}<div data-prism-style-panel ${model.look === "prism" ? "" : "hidden"}>${selectRow("프리셋", `<select data-prism-style-select>${prismStyleOptions(model.prismStyle)}</select>`)}</div>`, "data-panel-section='style'")}
      <div data-physical-optics ${model.look === "spectral-flow" || model.look === "soft-spectral" ? "hidden" : ""}>${section("재질", `${property("roughness", "거칠기", .02, .28, .01, model.roughness)}${property("dispersion", "분산", 0, .35, .01, model.dispersion)}${property("reflection-strength", "반사", 0, 3, .05, model.reflection)}`)}</div>
      ${spectralControls(model.spectralFlow, model.look === "spectral-flow")}
      ${softSpectralControls(model.softSpectral, model.look === "soft-spectral")}
      ${section("조명", `${property("master-intensity", "강도", 0, 3, .05, 1)}${selectRow("프리셋", `<span class="readonly-value">광학</span>`)}`, "data-panel-section='lighting'")}
      ${section("모션", `<label class="toggle-row"><span>사용</span><input data-motion="enabled" type="checkbox" ${model.motion.enabled ? "checked" : ""}></label>${selectRow("프리셋", `<select data-motion="preset"><option value="off">끄기</option>${motionOptions}</select>`)}${selectRow("강도", `<select data-motion="strength-mode"><option value="restrained">절제</option><option value="balanced" ${model.motion.strengthMode === "balanced" ? "selected" : ""}>균형</option><option value="active">강조</option></select>`)}${property("motion-strength", "적용량", 0, 1, .01, model.motion.strength)}`, "data-panel-section='motion'")}
      ${details("재질 세부 설정", `${property("refraction-strength", "굴절", 0, 1.25, .01, model.refraction)}${property("ior", "IOR", 1, 2.5, .001, model.physical.ior)}${property("thickness", "두께", .01, 10, .01, model.physical.thickness)}${property("attenuation-distance", "감쇠 거리", .1, 20, .1, model.physical.attenuationDistance)}${property("iridescence", "홍색", 0, 1, .01, model.physical.iridescence)}`, "look-material")}
      ${details("조명 세부 설정", `${property("environment-intensity", "환경광", 0, 3, .05, model.environment)}${property("exposure", "노출", .2, 2.5, .05, model.exposure)}${property("bloom-intensity", "블룸", 0, 1.5, .05, model.bloom)}${property("color-saturation", "채도", 0, 2, .05, model.saturation)}<section class="lighting-panel" data-lighting-panel></section>`, "look-lighting")}
      ${details("모션 세부 설정", `${property("motion-duration", "길이", 1, 12, .1, model.motion.duration)}${property("motion-fps", "FPS", 12, 60, 1, model.motion.fps)}<label class="toggle-row"><span>반복</span><input data-motion="loop" type="checkbox" ${model.motion.loop ? "checked" : ""}></label><div data-motion-parameters></div><button class="compact-action" data-action="motion-reset">모션 초기화</button>`, "motion-advanced")}
      ${exportPanel}
      <span data-output="save" hidden>Saved</span>
    </div></div>
    <button class="panel-rail-button inspector-rail-button" data-action="inspector-toggle" title="Inspector 펼치기" aria-label="Inspector 펼치기">‹</button>
  </aside>`;
  return structurePanel + appearancePanel;
}
