import { FormatPresetRegistry } from "../../artboard/FormatPresetRegistry";
import type { ArtboardState } from "../../artboard/ArtboardState";
import { MotionPresetRegistry } from "../../motion/MotionPresetRegistry";
import type { MotionSettings } from "../../motion/types";
import { CRYSTAL_LOOKS, type CrystalLook } from "../CrystalAssembly";
import type { InspectorTab } from "../InspectorPanel";
import type { SpectralFlowState } from "../materials/SpectralFlowMaterial";

export interface StudioPanelModel {
  look: CrystalLook; gap: number; bevelRadius: number; roughness: number; dispersion: number;
  reflection: number; refraction: number; exposure: number; bloom: number;
  saturation: number; environment: number; motion: MotionSettings;
  artboard: ArtboardState; activeTab: InspectorTab; outputSamples: number;
  bounces: number; renderScale: number; ppi: number;
  renderRegion: { enabled: boolean; x: number; y: number; width: number; height: number; unitPpi: number };
  printOutput: string;
  spectralFlow: SpectralFlowState;
}

const property = (name: string, label: string, min: number, max: number, step: number, value: number): string =>
  `<div class="property-row"><label for="${name}-range">${label}</label><input id="${name}-range" data-control="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-number="${name}" data-scrub type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} 값"></div>`;
const section = (title: string, content: string, subtitle = ""): string =>
  `<section class="studio-section"><header><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</header>${content}</section>`;

function spectralFlowControls(state: SpectralFlowState, visible: boolean): string {
  const directionOptions = [
    ["axis-30", "Axis 30°"], ["axis-90", "Axis 90°"], ["axis-150", "Axis 150°"],
    ["reverse", "Reverse"], ["auto", "Auto / Motion"],
  ].map(([value, label]) => `<option value="${value}" ${state.flowDirection === value ? "selected" : ""}>${label}</option>`).join("");
  return `<div class="spectral-flow-controls" data-spectral-flow-controls ${visible ? "" : "hidden"}>
    ${section("SPECTRAL FLOW", `<div class="spectral-preset-grid">${(["subtle", "balanced", "active"] as const).map((preset) => `<button data-spectral-preset="${preset}" class="${state.preset === preset ? "active" : ""}">${preset.toUpperCase()}</button>`).join("")}</div>`, "실시간 래스터 셰이더 · 기존 Axis와 MotionClock을 공유합니다.")}
    ${section("FLOW", `${property("spectral-flow-position", "Position", -3, 3, .01, state.flowPosition)}<label class="select-row"><span>Direction</span><select data-spectral-direction>${directionOptions}</select></label>${property("spectral-flow-speed", "Speed", 0, 3, .01, state.flowSpeed)}${property("spectral-flow-width", "Width", .08, 2.4, .01, state.flowWidth)}${property("spectral-flow-softness", "Softness", .05, 1, .01, state.flowSoftness)}`)}
    ${section("SPECTRUM", `${property("spectral-spread", "Spread", .1, 2.5, .01, state.spectrumSpread)}${property("spectral-separation", "Separation", 0, 1.4, .01, state.spectrumSeparation)}${property("spectral-saturation", "Saturation", 0, 2, .01, state.saturation)}${property("spectral-lag", "Spectral Lag", 0, .75, .01, state.spectralLag)}`)}
    ${section("LIGHT", `${property("spectral-core-intensity", "Core Intensity", 0, 5, .01, state.coreIntensity)}${property("spectral-core-width", "Core Width", .02, .8, .01, state.coreWidth)}${property("spectral-falloff", "Falloff", .25, 4, .01, state.falloff)}${property("spectral-bloom", "Bloom", 0, 1.5, .01, state.bloom)}`)}
    ${section("SURFACE", `${property("spectral-edge-attraction", "Edge Attraction", 0, 2.5, .01, state.edgeAttraction)}${property("spectral-reflection", "Reflection", 0, 3, .01, state.reflection)}${property("spectral-darkness", "Darkness", .1, 1, .01, state.darkness)}`)}
  </div>`;
}

export function studioPanelTemplate(model: StudioPanelModel): string {
  const tabs: InspectorTab[] = ["setup", "look", "motion", "format", "export"];
  const motionOptions = MotionPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.motion.preset === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  const formatOptions = FormatPresetRegistry.list().map((preset) => `<option value="${preset.id}" ${model.artboard.id === preset.id ? "selected" : ""}>${preset.label}</option>`).join("");
  return `
    <button class="inspector-toggle" data-action="inspector-toggle" aria-label="Inspector 표시 또는 숨기기"><span></span><span></span></button>
    <aside class="control-dock" aria-label="Pleos Axis Inspector">
      <header class="inspector-header"><div><strong>Inspector</strong><span data-output="save">자동 저장</span></div><button data-action="advanced-toggle" aria-label="고급 설정">⚙</button><button data-action="inspector-close" aria-label="Inspector 닫기">×</button></header>
      <nav class="inspector-tabs" role="tablist" aria-label="Inspector 범주">${tabs.map((tab) => `<button role="tab" data-inspector-tab="${tab}" class="${model.activeTab === tab ? "active" : ""}">${tab.toUpperCase()}</button>`).join("")}</nav>
      <div class="inspector-views">
        <div class="inspector-view" data-inspector-view="setup" role="tabpanel">
          ${section("Axis 상태", `<div class="axis-status"><span>Axis</span><b>30°</b><span>Origin</span><b>Locked</b><span>Shared Vertex</span><b data-output="vertex-status">Valid</b><span>Projection</span><b>Reference</b></div>`)}
          ${section("모델링", `${property("gap", "큐브 간격", 0, 0.45, 0.01, model.gap)}${property("bevel-radius", "베벨 반경", 0, 0.15, 0.001, model.bevelRadius)}`, "베벨을 변경해도 세 육면체의 공유 꼭지점은 유지됩니다.")}
          ${section("장면", `<div class="button-grid"><button data-action="reset">카메라 초기화</button><button data-action="scene-reset">장면 초기화</button></div><label class="toggle-row">시점 잠금<input data-control="view-lock" type="checkbox" checked></label>`)}
        </div>
        <div class="inspector-view" data-inspector-view="look" role="tabpanel">
          ${section("Look", `<div class="segmented look-segmented" role="group">${CRYSTAL_LOOKS.map((look) => `<button data-look="${look}" class="${model.look === look ? "active" : ""}">${look === "spectral-flow" ? "Spectral Flow" : look[0].toUpperCase() + look.slice(1)}</button>`).join("")}</div>`)}
          <div data-physical-optics ${model.look === "spectral-flow" ? "hidden" : ""}>
          ${section("Optics", `${property("roughness", "Roughness", 0.02, 0.28, 0.01, model.roughness)}${property("dispersion", "Dispersion", 0, 0.35, 0.01, model.dispersion)}${property("reflection-strength", "Reflection", 0, 3, 0.05, model.reflection)}${property("refraction-strength", "Refraction", 0, 1.25, 0.01, model.refraction)}`)}
          ${section("Lighting", `${property("master-intensity", "Master Light", 0, 3, 0.05, 1)}${property("environment-intensity", "Environment", 0, 3, 0.05, model.environment)}${property("exposure", "Exposure", 0.2, 2.5, 0.05, model.exposure)}${property("bloom-intensity", "Bloom", 0, 1.5, 0.05, model.bloom)}${property("color-saturation", "Saturation", 0, 2, 0.05, model.saturation)}`)}
          </div>
          ${spectralFlowControls(model.spectralFlow, model.look === "spectral-flow")}
        </div>
        <div class="inspector-view" data-inspector-view="motion" role="tabpanel">
          ${section("Motion", `<label class="toggle-row primary-toggle">Motion On<input data-motion="enabled" type="checkbox" ${model.motion.enabled ? "checked" : ""}></label><label class="select-row"><span>Preset</span><select data-motion="preset"><option value="off">Off</option>${motionOptions}</select></label><label class="select-row"><span>Strength</span><select data-motion="strength-mode"><option value="restrained">Restrained</option><option value="balanced" ${model.motion.strengthMode === "balanced" ? "selected" : ""}>Balanced</option><option value="active">Active</option></select></label>${property("motion-strength", "Intensity", 0, 1, 0.01, model.motion.strength)}${property("motion-duration", "Duration", 1, 12, 0.1, model.motion.duration)}${property("motion-fps", "FPS", 12, 60, 1, model.motion.fps)}<label class="toggle-row">Loop<input data-motion="loop" type="checkbox" ${model.motion.loop ? "checked" : ""}></label><button class="wide-button" data-action="motion-reset">Reset Motion</button>`)}
          ${section("Preset controls", `<div data-motion-parameters></div>`, "선택한 모션에 필요한 값만 표시합니다.")}
        </div>
        <div class="inspector-view" data-inspector-view="format" role="tabpanel">
          ${section("Artboard", `<label class="select-row"><span>Format</span><select data-format="preset">${formatOptions}</select></label><div class="dimension-grid"><label>W<input data-format="width" type="number" value="${model.artboard.width}" min="16" max="8192"></label><label>H<input data-format="height" type="number" value="${model.artboard.height}" min="16" max="8192"></label></div><label class="select-row"><span>Fit</span><select data-format="fit"><option value="contain">Contain</option><option value="cover">Cover</option><option value="custom">Custom</option></select></label>${property("artboard-scale", "Scale", 0.25, 2, 0.01, model.artboard.scale)}${property("preview-zoom", "Preview Zoom", 0.5, 1.8, 0.05, model.artboard.previewZoom)}<label class="toggle-row">Safe guide<input data-format="safe-guide" type="checkbox" ${model.artboard.safeGuide ? "checked" : ""}></label><label class="toggle-row">Transparent<input data-format="transparent" type="checkbox" ${model.artboard.transparent ? "checked" : ""}></label>`)}
        </div>
        <div class="inspector-view" data-inspector-view="export" role="tabpanel">
          ${section("Render preview", `<div class="render-quality-grid"><button data-action="render-fast"><strong>빠른 렌더링</strong><span data-output="render-fast-detail">16 spp · 50%</span></button><button data-action="render-high"><strong>고품질 렌더링</strong><span data-output="render-high-detail">${model.outputSamples} spp · ${Math.round(model.renderScale * 100)}%</span></button></div>`, "예전 Still Studio의 빠른 확인 / 최종 품질 누적 렌더를 유지합니다.")}
          ${section("Current frame", `<div class="export-summary"><span>Pixel dimensions</span><b data-output="export-size">${model.artboard.width} × ${model.artboard.height}px</b></div><button class="wide-button" data-action="export-raster">Raster PNG 저장</button><button class="wide-button primary" data-action="render-current-high">High Quality PNG 저장</button>`)}
          ${section("Print output", `<div class="export-summary"><span>Physical-size output</span><b data-output="print-size">${model.printOutput}</b></div><button class="wide-button primary" data-action="export-print">PPI 기준 최종 렌더·저장</button>`, "100% 네이티브 해상도 · 512 spp 이상 · 유리 경계 보존 디노이즈를 자동 적용합니다.")}
          ${section("Motion sequence", `<code data-output="sequence-command">npm run render:motion -- --preset ${model.motion.preset} --width ${model.artboard.width} --height ${model.artboard.height}</code><button class="wide-button" data-action="copy-sequence">명령 복사</button>`)}
        </div>
      </div>
      <div class="advanced-drawer" data-advanced hidden>
        <header><strong>Advanced</strong><button data-action="advanced-close" aria-label="고급 설정 닫기">×</button></header>
        ${section("Path tracing", `${property("scale", "Render Scale", 0.4, 1, 0.05, model.renderScale)}${property("bounces", "Bounces", 3, 14, 1, model.bounces)}${property("target-samples", "Target Samples", 16, 512, 16, model.outputSamples)}`)}
        ${section("Render region", `<label class="toggle-row primary-toggle">부분 렌더링<input data-region-enabled type="checkbox" ${model.renderRegion.enabled ? "checked" : ""}></label><div class="render-region-actions"><button data-action="region-center" aria-label="렌더 영역 가운데 정렬">가운데</button><button data-action="region-full">전체</button></div><label class="select-row"><span>단위 변환 기준</span><span class="unit-value"><input data-unit-ppi data-scrub type="number" min="36" max="1200" step="1" value="${model.renderRegion.unitPpi}" aria-label="단위 변환 PPI"><i>ppi</i></span></label><div class="motion-region-grid">${([['x','X',model.renderRegion.x],['y','Y',model.renderRegion.y],['width','W',model.renderRegion.width],['height','H',model.renderRegion.height]] as const).map(([key,label,value]) => `<label><span>${label}</span><input data-region="${key}" type="text" inputmode="decimal" value="${value}" aria-label="부분 렌더링 ${label}"><i>px</i></label>`).join("")}</div><p class="region-help">px · mm · cm · in 입력 가능 · ↑↓ 1px · Shift + ↑↓ 10px</p>`)}
        ${section("Print metadata", `<label class="select-row"><span>Output PPI</span><select data-control="export-ppi">${[72,150,300].map((ppi) => `<option value="${ppi}" ${model.ppi === ppi ? "selected" : ""}>${ppi}</option>`).join("")}</select></label><p class="region-help">일반 PNG에서는 metadata만 기록되고, Print output에서만 물리 크기 비율로 픽셀이 확장됩니다.</p>`)}
        ${section("Individual lights", `<section class="lighting-panel" data-lighting-panel aria-label="LIGHTING 조명 시스템"></section>`)}
      </div>
    </aside>`;
}
