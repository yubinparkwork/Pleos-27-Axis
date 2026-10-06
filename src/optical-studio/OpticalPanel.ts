import type { OpticalState } from './OpticalState';
import { CUBE0914, writeCube0914Weights } from './Cube0914';
import { AXIS_SPLIT, HYBRID_AB } from './HybridAB';
import { OPTICAL_ASPECTS, OPTICAL_CAMERA_KEYS, OPTICAL_DIMENSION_KEYS, OPTICAL_ZOOM_RANGE, normalizeLightColor, opticalAspectLabel, opticalCameraView, opticalDimensions, opticalVideoDimensions } from './OpticalState';
import { CYCLE_NAMES, writeLightWeights, opticalColorTiming } from './OpticalLighting';
import { opticalAxisPose } from './OpticalAxisMotion';
import { opticalCameraFloat } from './OpticalCameraFloat';
import { axisCameraLoopLimits, opticalCameraPose } from './OpticalCameraMotion';
import './OpticalStudio.css';

type NumericKey = {
  [Key in keyof OpticalState]: OpticalState[Key] extends number ? Key : never
}[keyof OpticalState];

export interface OpticalPanelActions {
  change(key: keyof OpticalState, value: number | boolean | string): void;
  saveCamera(): void;
  restoreCamera(): void;
  saveVariation(name: string): void;
  loadVariation(id: string): void;
  updateVariation(id: string): void;
  deleteVariation(id: string): void;
  beginEdit(): void;
  endEdit(): void;
  undo(): void;
  redo(): void;
  exportPng(): Promise<void>;
  exportVideo(): Promise<void>;
  cancelVideo(): void;
  reset(): void;
  togglePlay(): void;
  applyReference?(): void;
}

interface Control {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  describedBy?: string;
}

const cubeSurfaceControls: Control[] = [
  { key: 'cubeFaceLight', label: '겉면 빛 강도', min: 0, max: 2, step: .01, unit: '×', describedBy: 'optical-cube-surface-help' },
  { key: 'cubeSubPercent', label: '서브 컬러 각각', min: 0, max: 33, step: 1, unit: '%', describedBy: 'optical-rgb-ratio-help' },
];
const hybridControls: Control[] = [
  { key: 'axisFaceGap', label: '면 분리 간격', min: 0, max: .15, step: .005, describedBy: 'optical-axis-split-help' },
  { key: 'hybridOpening', label: '뒤쪽 개방', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-opening-help' },
  { key: 'hybridFaceReflection', label: '면 반사 강도', min: 0, max: 2, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridFaceWidth', label: '반사광 폭', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridRefractionOverlap', label: '굴절 중첩', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridDistortion', label: '내부 굴절', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-distortion-help' },
  { key: 'hybridDensity', label: '내부 광학 밀도', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-density-help' },
  { key: 'hybridColorMix', label: 'RGB 혼합', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-color-mix-help' },
  { key: 'hybridSubPercent', label: '서브 컬러 각각', min: 0, max: 33, step: 1, unit: '%', describedBy: 'optical-rgb-ratio-help' },
  { key: 'hybridDepthFlow', label: '안쪽 흐름 강도', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-depth-help' },
  { key: 'hybridDepthCycles', label: '깊이 반복 횟수', min: 1, max: 4, step: 1, unit: '회', describedBy: 'optical-hybrid-depth-help' },
];

const hybridColorModes = ['RGB 순환', 'RGB 균형 · 고정', '레드 우세 · 고정', '그린 우세 · 고정', '블루 우세 · 고정'];

const controls: Control[] = [
  ...(['Top','Left','Right'] as const).flatMap((region,index)=>(['X','Y','Z'] as const).map(axis=>({
    key:`structure${region}${axis}` as NumericKey,
    label:`${['상단','왼쪽','오른쪽'][index]} · ${axis==='Y'?'수평면':axis==='X'?'수직면 1':'수직면 2'}`,
    min:0,max:3,step:.01,unit:'×',describedBy:'optical-structure-light-help'
  }))),
  {key:'structureContrast',label:'구조 명암 대비',min:0,max:1,step:.01,describedBy:'optical-structure-light-help'},
  ...(['Top','Left','Right'] as const).flatMap((region,index)=>(['X','Y','Z'] as const).map(axis=>({
    key:`face${region}${axis}` as NumericKey,
    label:`${['상단','왼쪽','오른쪽'][index]} · ${axis==='Y'?'수평면':axis==='X'?'수직면 1':'수직면 2'}`,
    min:0,max:3,step:.01,unit:'×',describedBy:'optical-face-dimension-help'
  }))),
  {key:'faceDimensionContrast',label:'꺾임 대비',min:0,max:1,step:.01,describedBy:'optical-face-dimension-help'},
  ...(HYBRID_AB ? hybridControls : []),
  ...(CUBE0914 ? cubeSurfaceControls : []),
  { key: 'lightHoldRed', label: '레드 유지', min: 0, max: 60, step: .1, unit: '초' },
  { key: 'lightHoldGreen', label: '그린 유지', min: 0, max: 60, step: .1, unit: '초' },
  { key: 'lightHoldBlue', label: '블루 유지', min: 0, max: 60, step: .1, unit: '초' },
  { key: 'lightCrossfade', label: '색 전환 시간', min: .1, max: 30, step: .1, unit: '초', describedBy:'optical-rgb-timing-help' },
  {key:'cameraFloat',label:'부유 모션',min:0,max:1,step:1,describedBy:'optical-float-help'},
  {key:'cameraFloatX',label:'좌우 부유 폭',min:0,max:10,step:.1,unit:'%'},
  {key:'cameraFloatY',label:'상하 부유 폭',min:0,max:10,step:.1,unit:'%'},
  {key:'cameraFloatSeconds',label:'부유 주기',min:3,max:60,step:.5,unit:'초',describedBy:'optical-float-help'},
  { key: 'axisMotion', label: '엑시스 모션', min: 0, max: 1, step: 1, describedBy: 'optical-axis-motion-help' },
  { key: 'axisYaw', label: '입체 회전 폭', min: -90, max: 90, step: .5, unit: '°' },
  { key: 'axisRoll', label: '기울기 회전 폭', min: -45, max: 45, step: .5, unit: '°' },
  { key: 'axisMoveSeconds', label: '왕복 주기', min: 1, max: 30, step: .1, unit: '초', describedBy: 'optical-axis-motion-help' },
  { key: 'cameraMotion', label: '카메라 모션', min: 0, max: 1, step: 1, describedBy: 'optical-camera-motion-help' },
  { key: 'cameraOrbitHorizontal', label: '수평 회전 폭', min: -90, max: 90, step: .5, unit: '°' },
  { key: 'cameraOrbitVertical', label: '수직 회전 폭', min: -30, max: 30, step: .5, unit: '°' },
  { key: 'cameraMoveSeconds', label: '카메라 주기', min: 1, max: 30, step: .1, unit: '초', describedBy: 'optical-camera-motion-help' },
  { key: 'identityTransition', label: '전환 사용', min: 0, max: 1, step: 1, describedBy: 'optical-identity-help' },
  { key: 'identityHold', label: '25엑시스 구간', min: 0, max: 15, step: .01, unit: '초', describedBy: 'optical-identity-timing-help' },
  { key: 'identityDissolve', label: '빛 전환 시간', min: .5, max: 12, step: .1, unit: '초', describedBy: 'optical-identity-timing-help' },
  { key: 'identityLayerStagger', label: '등장 스태거', min: 0, max: 5, step: .05, unit: '초', describedBy: 'optical-identity-stagger-help' },
  { key: 'identityAxisAccent', label: '축 강조 강도', min: 0, max: 2, step: .05, describedBy: 'optical-identity-accent-help' },
  { key: 'identityTransitionBrightness', label: '전환 순간 밝기', min: 0, max: 2, step: .05, describedBy: 'optical-identity-brightness-help' },
  { key: 'dimensionDelayTop', label: '상단 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'dimensionDelayLeft', label: '하단 왼쪽 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'dimensionDelayRight', label: '하단 오른쪽 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'lightMotionCycles', label: '조명 반복 횟수', min: 0, max: 4, step: 1, unit: '회' },
  { key: 'layerFadeAmount', label: '층 페이드 강도', min: 0, max: 1, step: .01 },
  { key: 'layerFadeCycles', label: '층 반복 횟수', min: 0, max: 4, step: 1, unit: '회' },
  { key: 'layerStagger', label: '층별 시차', min: 0, max: 1, step: .01 },
  { key: 'layerLightContrast', label: '강약 대비', min: 0, max: 1, step: .01, describedBy: 'optical-layer-light-help' },
  { key: 'layerLightLength', label: '빛의 길이', min: .25, max: 6, step: .05, unit: '×', describedBy: 'optical-layer-light-help' },
  { key: 'layerLightCycles', label: '흐름 속도', min: 0, max: 6, step: 1, unit: '회', describedBy: 'optical-layer-light-help' },
  { key: 'gap', label: '큐브 간격', min: 0, max: 0.4, step: 0.005 },
  { key: 'bevel', label: '모서리 곡률', min: 0, max: 0.6, step: 0.005 },
  { key: 'ior', label: '굴절률', min: 1, max: 2.5, step: 0.01 },
  { key: 'dispersion', label: '색 분산', min: 0, max: 0.15, step: 0.001 },
  { key: 'roughness', label: '광학 확산', min: 0, max: 0.3, step: 0.005 },
  { key: 'surfaceCurvature', label: HYBRID_AB ? '유리 법선 곡률' : '반사광 선명도', min: 0, max: 0.24, step: 0.005, describedBy: 'optical-curvature-help' },
  { key: 'reflection', label: '반사 강도', min: 0, max: 2, step: 0.01 },
  { key: 'absorption', label: '빛 흡수', min: 0, max: 2, step: 0.01 },
  { key: 'bounces', label: '광선 추적 한도', min: 1, max: 16, step: 1, describedBy: 'optical-bounces-help' },
  { key: 'dimensionTop', label: '상단 큐브', min: 0, max: 50, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
  { key: 'dimensionLeft', label: '왼쪽 큐브', min: 0, max: 50, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
  { key: 'dimensionRight', label: '오른쪽 큐브', min: 0, max: 50, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
  { key: 'dimensionSpacingTop', label: '상단 층 간격', min: 0.06, max: 0.3, step: 0.005 },
  { key: 'dimensionSpacingLeft', label: '왼쪽 층 간격', min: 0.06, max: 0.3, step: 0.005 },
  { key: 'dimensionSpacingRight', label: '오른쪽 층 간격', min: 0.06, max: 0.3, step: 0.005 },
  { key: 'dimensionSoftness', label: '층 풀림', min: 0.05, max: 1, step: 0.01 },
  { key: 'dimensionFalloff', label: '깊이 감쇠', min: 0, max: 1, step: 0.01 },
  { key: 'lightIntensity', label: '조명 강도', min: 0, max: 5, step: 0.05 },
  { key: 'lightSpread', label: '조명 폭', min: 0.2, max: 2, step: 0.01 },
  { key: 'exposure', label: '노출', min: 0.25, max: 3, step: 0.01 },
  { key: 'bloom', label: '빛 번짐', min: 0, max: 1, step: 0.01, describedBy: 'optical-bloom-help' },
  { key: 'zoom', label: '확대', min: OPTICAL_ZOOM_RANGE[0], max: OPTICAL_ZOOM_RANGE[1], step: 0.01, unit: '×' },
  { key: 'panX', label: '좌우 이동', min: -100, max: 100, step: 0.1, unit: '%' },
  { key: 'azimuth', label: '수평 회전', min: -180, max: 180, step: 0.1, unit: '°' },
  { key: 'elevation', label: '수직 회전', min: -80, max: 80, step: 0.1, unit: '°' },
  { key: 'duration', label: '재생 길이', min: 1, max: 300, step: 0.5, unit: '초' },
  { key: 'speed', label: '조명 이동폭', min: 0, max: 1, step: 0.05, unit: '×' },
];

const controlByKey = new Map(controls.map((control) => [control.key, control]));

const icons = {
  panel: '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="3.5" width="13" height="11" rx="1"/><path d="M11.5 3.5v11"/></svg>',
  play: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m6 4 7 5-7 5Z" class="optical-icon-fill"/></svg>',
  pause: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4v10M12 4v10" stroke-width="2.5"/></svg>',
  export: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.5v8m-3-3 3 3 3-3M3.5 11v4h11v-4"/></svg>',
};

function valueText(value: number, step = 0.01): string {
  const precision = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  // Keep externally restored values legible even when they fall between slider steps.
  return Number(value.toFixed(Math.max(precision, 3))).toString();
}

function timeText(value: number): string {
  const seconds = Math.max(0, value);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

function numericInput(control: Control, state: OpticalState, compact = false): string {
  return `<input id="optical-${control.key}${compact ? '-compact' : ''}-number" data-optical-number="${control.key}" type="number" inputmode="decimal" min="${control.min}" max="${control.max}" step="${control.step}" value="${valueText(state[control.key], control.step)}" aria-label="${control.label}${control.unit ? ` (${control.unit})` : ''}"${control.describedBy ? ` aria-describedby="${control.describedBy}"` : ''}${compact ? ' class="optical-compact-number"' : ''}>`;
}

function controlRow(key: NumericKey, state: OpticalState): string {
  const control = controlByKey.get(key)!;
  const row = `<div class="optical-control">
    <label for="optical-${key}-number">${control.label}</label>
    <input data-optical-range="${key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${state[key]}" aria-label="${control.label} 슬라이더"${control.describedBy ? ` aria-describedby="${control.describedBy}"` : ''}>
    <span class="optical-number-wrap">${numericInput(control, state)}${control.unit ? `<span class="optical-unit" aria-hidden="true">${control.unit}</span>` : ''}</span>
  </div>`;
  // Stored physical-shell settings stay intact for earlier saved versions.
  return key === 'bounces' && !CUBE0914 && !HYBRID_AB ? row.replaceAll('<input ', '<input disabled data-optical-legacy ') : row;
}

function section(id: string, title: string, english: string, content: string, open = false): string {
  if (id === 'lighting') content = `<label class="optical-cycle-toggle"><input type="checkbox" data-optical-cycle aria-describedby="optical-cycle-help">RGB 주도색 순환</label><p class="optical-section-note" data-optical-cycle-status></p><p id="optical-cycle-help" class="optical-section-note">레드 → 그린 → 블루 순으로 메인 80% · 서브 각 10%의 광량이 교대합니다. 화면 점유율이 아니라 조명 비중입니다. 아래 재생 길이가 한 바퀴이며, 색상을 편집해도 순서는 유지됩니다.</p>${content}`;
  return `<details class="optical-section" data-optical-section="${id}"${open ? ' open' : ''}>
    <summary><span>${title}</span><span class="optical-section-en" lang="en">${english}</span><span class="optical-chevron" aria-hidden="true"></span></summary>
    <div class="optical-section-content">${content}</div>
  </details>`;
}

function cameraProfileControls(): string {
  return `<div class="optical-camera-profile">
    <div class="optical-camera-profile-heading"><span>판형별 구도</span><span data-optical-camera-aspect></span></div>
    <p class="optical-section-note" data-optical-camera-profile-status role="status"></p>
    <div class="optical-camera-profile-actions">
      <button type="button" data-optical-action="save-camera" class="optical-text-button" aria-label="현재 판형의 카메라 구도 저장">현재 구도 저장</button>
      <button type="button" data-optical-action="restore-camera" class="optical-text-button" aria-label="현재 판형에 저장된 카메라 구도 복원">저장 구도 복원</button>
    </div>
    <p class="optical-section-note">확대·좌우 이동·수평/수직 회전만 판형별로 보관합니다. 조명과 모션은 공통입니다. 편집 중 구도도 자동 보관되며, 저장 버튼으로 복원 지점을 지정합니다.</p>
  </div>`;
}

function variationControls(): string {
  return `<p class="optical-section-note">판형·카메라와 현재의 재질, 라이팅, 디멘션, 모션, 출력 수치를 함께 보관합니다. 저장본을 불러오기 전 현재 편집값은 자동 저장되며, 되돌리기도 가능합니다.</p>
    <label class="optical-output-control"><span>저장본</span><select data-optical-variation aria-label="판형 배리에이션 저장본"><option value="">저장본 선택</option></select></label>
    <div class="optical-variation-actions"><button type="button" data-optical-action="load-variation" class="optical-text-button">불러오기</button><button type="button" data-optical-action="update-variation" class="optical-text-button">선택본 갱신</button><button type="button" data-optical-action="delete-variation" class="optical-text-button">삭제</button></div>
    <div class="optical-variation-save"><input data-optical-variation-name type="text" maxlength="60" placeholder="예: Hall D · 16:9 확대컷" aria-label="새 판형 배리에이션 이름"><button type="button" data-optical-action="save-variation">새로 저장</button></div>
    <p class="optical-section-note" data-optical-variation-status role="status">현재 작업값은 자동 저장 중입니다. 이름 붙인 저장본은 직접 갱신할 때만 바뀝니다.</p>
    <div class="optical-custom-aspect" data-optical-custom-aspect hidden>
      <div class="optical-camera-profile-heading"><span>사용자 지정 비율</span><span>가로 : 세로</span></div>
      <div class="optical-custom-aspect-fields"><input data-optical-custom-width type="number" min="1" max="10000" step="1" aria-label="사용자 지정 비율 가로"><span aria-hidden="true">:</span><input data-optical-custom-height type="number" min="1" max="10000" step="1" aria-label="사용자 지정 비율 세로"></div>
      <p class="optical-section-note">비율 범위는 1:20–20:1입니다. PNG는 긴 변 3840px, MP4는 출력 해상도 설정을 사용합니다.</p>
    </div>`;
}

function hybridSections(state: OpticalState): string {
  if (!HYBRID_AB) return '';
  return section('hybrid-material', 'A/B 통합 재질', 'Hybrid A/B', `<p class="optical-section-note">B의 얇은 축과 모션에 A의 내부 굴절·색의 깊이를 더합니다.</p>${controlRow('hybridDistortion', state)}<p id="optical-hybrid-distortion-help" class="optical-section-note">외곽 축은 유지하고 내부 반사가 굴절되는 정도를 조절합니다.</p>${controlRow('hybridDensity', state)}<p id="optical-hybrid-density-help" class="optical-section-note">값을 높이면 안쪽 광량의 감쇠를 완화해 반사가 더 풍부하게 남습니다. 층수는 디멘션 레이어에서 조절합니다.</p>`, true)
    + section('hybrid-color', '정지 컬러 / 순환', 'Color', `<label class="optical-output-control"><span>컬러 구성</span><select data-optical-hybrid-color-mode aria-label="통합안 컬러 구성" aria-describedby="optical-hybrid-color-help">${hybridColorModes.map((label, value) => `<option value="${value}">${label}</option>`).join('')}</select></label><p id="optical-hybrid-color-help" class="optical-section-note">고정은 컬러 비중만 고정합니다. 엑시스·카메라·층 모션은 현재 설정대로 재생됩니다. 정지 이미지는 원하는 시간에서 PNG로 저장하세요.</p>${controlRow('hybridColorMix', state)}<p id="optical-hybrid-color-mix-help" class="optical-section-note">선택한 컬러 구성 안에서 RGB 반사가 겹쳐 보이는 정도를 조절합니다.</p>`, true)
    + section('hybrid-depth', '공간 깊이 테스트 (Hall D 도면 미반영)', '', `<p id="optical-hybrid-depth-help" class="optical-section-note">층이 화면 안쪽으로 이어지는 개념 테스트입니다. 강도 0은 꺼짐이며, 반복 횟수는 한 루프 안에서의 흐름 횟수입니다. Hall D의 실제 화면 형상·치수·관람 위치를 반영한 현장 보정은 아닙니다.</p>${controlRow('hybridDepthFlow', state)}${controlRow('hybridDepthCycles', state)}`);
}

/** Owns only the studio DOM. Rendering, persistence and camera gestures belong to the app. */
export function mountOpticalPanel(root: HTMLElement, state: OpticalState, actions: OpticalPanelActions): {
  update(state: OpticalState, force?: boolean): void;
  history(canUndo: boolean, canRedo: boolean): void;
  status(message: string, busy?: boolean): void;
  videoProgress(message: string, fraction: number, busy: boolean): void;
  dispose(): void;
} {
  const shell = document.createElement('div');
  shell.className = 'optical-studio';
  shell.innerHTML = `
    <header class="optical-header">
      <div class="optical-identity"><strong>PLEOS 27 <span>AXIS</span></strong><span class="optical-subtitle" lang="en">Optical studio</span></div>
      <div class="optical-header-actions"><a href="?renderer=studio" class="optical-archive-link">이전 스튜디오 <span aria-hidden="true">↗</span></a><button type="button" data-optical-action="inspector" class="optical-icon-button" aria-label="설정 패널 접기" aria-controls="optical-inspector" aria-expanded="true" title="설정 패널 접기">${icons.panel}</button></div>
    </header>
    <div class="optical-workspace">
      <div class="optical-stage">
        <main class="optical-viewport" aria-label="Axis 미리보기">
          <canvas id="optical-canvas" aria-label="세 영역의 디멘션 반사층으로 이루어진 Axis 실시간 미리보기"></canvas>
          <div class="optical-viewport-caption" aria-hidden="true"><span>AXIS / 03</span><span data-optical-viewport-aspect>1:1</span></div>
          <p class="optical-viewport-hint">드래그로 회전 · 핀치로 확대</p>
        </main>
        <footer class="optical-transport" aria-label="모션 재생 및 화면 비율">
          <div class="optical-timeline">
            <button type="button" data-optical-action="play" class="optical-icon-button optical-play-button" aria-label="일시 정지" title="일시 정지">${icons.pause}</button>
            <output class="optical-time" data-optical-time aria-label="현재 재생 시간">00:00.00</output>
            <input class="optical-time-range" data-optical-range="time" type="range" min="0" max="${state.duration}" step="0.01" value="${state.time}" aria-label="재생 위치 (초)">
            <span class="optical-total-time" data-optical-duration>${timeText(state.duration)}</span>
          </div>
          <div class="optical-transport-options">
            <label class="optical-format-control"><span>화면 비율</span><select data-optical-aspect aria-label="화면 비율">${OPTICAL_ASPECTS.map(preset=>`<option value="${preset.id}">${preset.label}</option>`).join('')}</select></label>
            <div class="optical-motion-settings">
              <label class="optical-inline-control"><span>길이</span>${numericInput(controlByKey.get('duration')!, state, true)}<span class="optical-inline-unit">초</span></label>
              <label class="optical-inline-control"><span>이동폭</span>${numericInput(controlByKey.get('speed')!, state, true)}<span class="optical-inline-unit">×</span></label>
            </div>
          </div>
        </footer>
      </div>
      <aside id="optical-inspector" class="optical-inspector" aria-label="유리와 조명 설정">
        <div class="optical-inspector-heading"><span>장면 설정</span><div class="optical-history-actions"><button type="button" data-optical-action="undo" class="optical-text-button" aria-label="설정 실행 취소" title="실행 취소 (⌘Z / Ctrl+Z)" disabled>되돌리기</button><button type="button" data-optical-action="redo" class="optical-text-button" aria-label="설정 다시 실행" title="다시 실행 (⌘⇧Z / Ctrl+Shift+Z)" disabled>다시</button><button type="button" data-optical-action="reset" class="optical-text-button">초기화</button></div></div>
        <div class="optical-inspector-scroll">
          ${section('variations', '판형 배리에이션', 'Variations', variationControls(), true)}
          ${hybridSections(state)}
          ${HYBRID_AB||CUBE0914?section('rgb-ratio','RGB 메인 / 서브 비율','Ratio',controlRow(CUBE0914?'cubeSubPercent':'hybridSubPercent',state)+'<p data-optical-rgb-ratio-status class="optical-section-note" role="status"></p><p id="optical-rgb-ratio-help" class="optical-section-note">서브 두 색에 같은 비중을 주고 메인은 나머지로 계산합니다. 빛의 혼합 비중이며 화면 면적 비율은 아닙니다. RGB 순환에만 적용됩니다.</p>',true):''}
${section('rgb-timing','RGB 유지시간','Timing',`<label class="optical-output-control"><span>시간 방식</span><select data-optical-rgb-timing aria-label="RGB 시간 방식" aria-describedby="optical-rgb-timing-help"><option value="0">기존 자동 순환</option><option value="1">시간 직접 지정</option></select></label><fieldset class="optical-rgb-times" data-optical-rgb-times><legend class="optical-sr-only">색별 유지시간</legend>${['lightHoldRed','lightHoldGreen','lightHoldBlue','lightCrossfade'].map(key=>controlRow(key as NumericKey,state)).join('')}</fieldset><p id="optical-rgb-timing-help" class="optical-section-note">유지는 해당 색이 메인으로 머무는 시간입니다. 전환은 다음 색으로 부드럽게 바뀌는 시간이며, 레드 → 그린 → 블루 → 레드 순서로 반복합니다. 직접 지정은 첫 디멘션 빛이 나타날 때부터 시간을 셉니다. 층이 등장하는 시간도 유지시간에 포함됩니다. 영상 길이는 자동으로 바뀌지 않습니다.</p><p class="optical-section-note" data-optical-rgb-timing-status role="status"></p>`,true)}
          ${section('axis-motion', '엑시스 회전', 'Axis Motion', ['axisMotion','axisYaw','axisRoll','axisMoveSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-axis-motion-help" class="optical-section-note">25엑시스 구간은 0°로 고정한 뒤 0 → + → 0 → − → 0으로 반복합니다. 음수 입력은 시작 방향을 반대로 합니다. 현재 시점에서 면이 뒤집히지 않도록 실제 회전폭을 자동 제한합니다. 왕복 주기는 영상 길이에 맞춰 정수 횟수로 조정됩니다. 아래 카메라 모션을 켜면 같은 안전 범위 안에서 시점도 함께 부유합니다.</p><p id="optical-axis-motion-status" class="optical-section-note"></p>', true)}
          ${section('identity', '25엑시스 → 디멘션', 'Transition', `<p id="optical-identity-help" class="optical-section-note">전환 사용: 0은 꺼짐, 1은 켜짐입니다. 1로 설정한 뒤 아래 타임라인을 0초로 옮기고 재생하세요.</p>${controlRow('identityTransition', state)}${controlRow('identityHold', state)}${controlRow('identityDissolve', state)}<p id="optical-identity-timing-help" class="optical-section-note">25엑시스의 같은 면에서 디멘션 반사층으로 이어집니다. 중심은 전환 중 이동하지 않습니다. 끝에 도달하면 처음부터 반복하며, 일시정지를 누르면 멈춥니다.</p>${HYBRID_AB ? `${controlRow('identityTransitionBrightness', state)}<p id="optical-identity-brightness-help" class="optical-section-note">전환 중 컬러 빛만 조절합니다. 1은 기존 밝기, 0은 중간 밝기를 최대 65% 낮추고 2는 높입니다. 전환 전·후 화면은 그대로입니다.</p>` : ''}${controlRow('identityLayerStagger', state)}<p id="optical-identity-stagger-help" class="optical-section-note">Axis에 가까운 층부터 등장합니다. 1초는 다음 층이 1초 뒤에 시작하며, 0초는 모든 층이 함께 시작합니다. 마지막 층까지 보이도록 재생 길이가 자동으로 늘어납니다. 아래 ‘층별 시차’는 반복 모션의 밝기 타이밍을 조절합니다.</p>${controlRow('identityAxisAccent', state)}<p id=\"optical-identity-accent-help\" class=\"optical-section-note\">한 루프의 25엑시스 → 디멘션 전환 중 축의 빛을 한 번 강조합니다. 0은 꺼짐, 1은 기본 강도입니다. 기존 층의 순서·등장 스태거는 유지됩니다.</p>`, true)}
          ${section('motion', '빛 모션', 'Motion', `<p class="optical-section-note">재생 길이가 한 루프입니다. 같은 길이에서 반복 횟수를 늘리면 더 빠르게 움직입니다. 아래 재생 버튼·타임라인으로 확인하세요.</p>${['duration', 'speed', 'lightMotionCycles'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">조명 반복 0은 현재 궤도의 시작 위치에 고정합니다. 이동폭은 움직이는 범위입니다. ${HYBRID_AB ? 'RGB 순환과 고정은 위의 정지 컬러 / 순환에서 선택합니다.' : 'RGB 주도색 순환은 조명 패널에서 별도로 켭니다.'}</p>${['layerFadeAmount', 'layerFadeCycles', 'layerStagger'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">페이드 강도 0은 모든 층을 계속 표시합니다. 층 반복 0은 시작 밝기에 고정합니다. 층별 시차가 크면 안쪽 층이 순서대로 나타납니다. 형태는 휘지 않습니다. 변경값은 자동 저장됩니다.</p>`, true)}
          ${section('timing', '영역별 타이밍', 'Timing', `<p class="optical-section-note">각 영역의 층 페이드와 축 경계 흐름을 기존 시점보다 늦춥니다. RGB 조명 순환은 공통으로 유지됩니다.</p>${['dimensionDelayTop', 'dimensionDelayLeft', 'dimensionDelayRight'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">0초는 기존 타이밍입니다. 지연은 루프 안에서 순환하며, 시작 전 대기 화면을 만들지 않습니다. 층 페이드 강도·반복이 0이면 해당 모션의 지연은 보이지 않습니다.</p>`, true)}
          ${section('layer-light', '층 내부 밝기 변화', 'Light Flow', `${['layerLightContrast','layerLightLength','layerLightCycles'].map(key=>controlRow(key as NumericKey,state)).join('')}<p id="optical-layer-light-help" class="optical-section-note">한 층의 길이를 따라 밝기만 흐릅니다. 세 영역 공통이며 축과 층의 형태는 바뀌지 않습니다. 대비 0은 기존 표현, 길이는 밝은 구간의 간격과 길이, 속도는 영상 한 루프의 반복 횟수입니다. 속도 0은 정지된 강약입니다. 추천: 대비 0.6 · 길이 1.5 · 속도 1. 자동 저장됩니다.</p>`, true)}
          ${section('geometry', '형태', 'Geometry', `<p class="optical-section-note">세 개의 큐브, 하나의 Axis</p>${controlRow('gap', state)}${controlRow('bevel', state)}`)}
          ${section('dimensions', '디멘션 레이어', 'Layers', `<p id="optical-dimension-help" class="optical-section-note">큐브 안쪽 결을 따르는 디멘션 반사층입니다. 각 영역은 최대 50겹이며, 0겹은 층만 끕니다. 소수 값은 마지막 층을 부드럽게 나타냅니다.</p>${OPTICAL_DIMENSION_KEYS.map((key) => controlRow(key, state)).join('')}<details class="optical-layer-advanced"><summary>층의 형태 조정</summary>${['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight', 'dimensionSoftness', 'dimensionFalloff'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">층 간격은 큐브마다 따로 적용됩니다. 층 풀림·깊이 감쇠는 세 큐브 공통입니다. 불투명 큐브를 추가하지 않습니다. 층의 3D 가림·겹침은 시점에 따라 달라집니다.</p></details>`, true)}
          ${section('optics', '광학', 'Optics', `<button type="button" data-optical-action="reference" class="optical-text-button"${actions.applyReference ? '' : ' disabled'} aria-describedby="optical-reference-help">레퍼런스 무드 적용</button><p id="optical-reference-help" class="optical-section-note">카메라·간격·판형은 유지하고 유리·조명·반사층 표현을 조정합니다.</p>${['ior', 'dispersion', 'roughness', 'surfaceCurvature'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-curvature-help" class="optical-section-note">반사광이 모서리에 집중되는 정도를 조절합니다. 디멘션의 경로나 형태를 휘게 하지 않습니다.</p>${['reflection', 'absorption', 'bounces'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-bounces-help" class="optical-section-note">현재는 표면 반사를 제외한 디멘션 전용 표현이므로 광선 추적 한도는 적용되지 않습니다. 이전 값은 보존하며, 반복 층은 디멘션 레이어 수로 조절하세요.</p>`, true)}
          ${section('lighting', '조명', 'Lighting', `<div class="optical-color-control"><label for="optical-light-color">조명 색상</label><input id="optical-light-color" data-optical-color type="color" value="${state.lightColor}" aria-label="조명 색상 선택"><input data-optical-color-hex type="text" value="${state.lightColor}" maxlength="7" spellcheck="false" aria-label="조명 색상 HEX" aria-describedby="optical-color-help"></div><div class="optical-light-swatches" aria-label="Pleos 조명 색상">${[['#FFFFFF','화이트'],['#FFCDD7','레드 1'],['#FA293C','레드 2'],['#B4FFD2','그린 1'],['#0ADC91','그린 2'],['#CDDCFF','블루 1'],['#2350FF','블루 3']].map(([hex,label])=>`<button type="button" data-optical-light-swatch="${hex}" aria-label="Pleos ${label}" title="Pleos ${label} ${hex}" style="--swatch:${hex}"></button>`).join('')}</div><p id="optical-color-help" class="optical-section-note">여러 방향의 광원을 하나의 색상·강도로 조정합니다. 화이트에서 색 분산이 가장 잘 보입니다.</p>${controlRow('lightIntensity', state)}${controlRow('lightSpread', state)}${controlRow('exposure', state)}${controlRow('bloom', state)}<p id="optical-bloom-help" class="optical-section-note">밝은 반사광의 부드러운 번짐입니다. 0이면 번짐을 끕니다.</p>`, true)}
          ${section('camera', '카메라', 'Camera', cameraProfileControls() + ['zoom', 'panX', 'azimuth', 'elevation'].map((key) => controlRow(key as NumericKey, state)).join('') + '<p class="optical-section-note">각도는 모션의 기준 구도입니다. 좌우 이동: 0은 중앙, +는 오른쪽을 봅니다. 확대와 좌우 이동은 모션 중 유지됩니다.</p>' + ['cameraFloat','cameraFloatX','cameraFloatY','cameraFloatSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-float-help" class="optical-section-note">1은 켜짐, 0은 꺼짐. 25엑시스 이후 화면 평면에서 좌우·상하로 천천히 부유합니다. 각도·깊이는 바꾸지 않으며 폭은 각 방향 최대 10%입니다. 영상 끝에는 원위치로 돌아오고, 주기는 전체 길이에 맞춥니다.</p><p id="optical-float-status" class="optical-section-note"></p>' + ['cameraMotion','cameraOrbitHorizontal','cameraOrbitVertical','cameraMoveSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-camera-motion-help" class="optical-section-note">모션 1은 켜짐, 0은 고정입니다. 엑시스 회전이 켜져 있으면 수평·수직 회전 폭이 주기마다 반복되어 공간이 부유하는 느낌을 만듭니다. 두 회전을 합친 경로는 면을 넘지 않도록 자동으로 제한하며, MP4에도 같은 경로가 적용됩니다.</p><p id="optical-camera-motion-status" class="optical-section-note"></p>')}
          ${section('output', '출력', 'Output', `<p class="optical-section-note">PNG는 현재 장면 한 컷, MP4는 0초부터 재생 길이까지 한 루프를 저장합니다. 화면 비율과 카메라 설정은 그대로 유지합니다.</p><dl class="optical-output-details"><div><dt>PNG 해상도</dt><dd data-optical-resolution>3840 × 3840 px</dd></div></dl><div class="optical-video-settings" aria-label="영상 출력 설정">
            <label class="optical-output-control"><span>영상 해상도</span><select data-optical-video="videoLongEdge" aria-label="영상 해상도" aria-describedby="optical-video-size-help"><option value="3840">4K · 긴 변 3840</option><option value="1920">2K · 긴 변 1920</option></select></label>
            <label class="optical-output-control"><span>프레임레이트</span><select data-optical-video="videoFps" aria-label="영상 프레임레이트"><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
            <label class="optical-output-control"><span>프레임 품질</span><select data-optical-video="videoSamples" aria-label="영상 프레임 품질" aria-describedby="optical-video-quality-help"><option value="4">4 샘플 · 빠름</option><option value="16">16 샘플 · 고품질</option><option value="64">64 샘플 · 정밀</option></select></label>
          </div><p id="optical-video-quality-help" class="optical-section-note">가는 반사선이 깨져 보이면 64 샘플을 선택하세요. 16 샘플보다 계산량이 약 4배 많습니다. PNG는 항상 64 샘플로 저장합니다.</p><p class="optical-section-note">H.264 우선 · 고해상도 판형은 기기에 따라 HEVC MP4로 저장합니다. HEVC는 지원되는 플레이어가 필요합니다. 저장 중 이 탭을 열어 두세요.</p><dl class="optical-output-details"><div><dt>MP4 해상도</dt><dd id="optical-video-size-help" data-optical-video-size></dd></div><div><dt>영상 구간</dt><dd data-optical-video-range></dd></div></dl>`)}
        </div>
        <div class="optical-export-area">
          <p class="optical-status" role="status" aria-live="polite" aria-atomic="true" data-optical-status>실시간 미리보기</p>
          <button type="button" data-optical-action="export" class="optical-export-button">${icons.export}<span data-optical-export-label>4K PNG 저장</span></button>
          <p class="optical-export-description"><span data-optical-export-size>3840 × 3840</span><span>PNG · 긴 변 4K</span></p>
          <button type="button" data-optical-action="export-video" class="optical-export-button optical-video-button" aria-describedby="optical-video-summary">${icons.export}<span data-optical-video-label>4K MP4 저장</span></button>
          <p id="optical-video-summary" class="optical-export-description" data-optical-video-summary></p>
          <div class="optical-video-progress" data-optical-video-progress hidden>
            <progress max="1" value="0" data-optical-video-progressbar aria-label="영상 저장 진행률" aria-describedby="optical-video-status"></progress>
            <div class="optical-video-progress-row"><p id="optical-video-status" role="status" aria-live="polite" aria-atomic="true" data-optical-video-status></p><button type="button" data-optical-action="cancel-video" class="optical-text-button" disabled>취소</button></div>
          </div>
        </div>
      </aside>
    </div>`;
  root.replaceChildren(shell);
  if (HYBRID_AB) {
    shell.querySelector('[data-optical-section="hybrid-material"]')!.insertAdjacentHTML('beforebegin',section('structure-light','구조 라이팅','Structure Lighting',
      `<p id="optical-structure-light-help" class="optical-section-note">기준 구도에서 보이는 두 면씩 조절합니다. 상단은 수직면 두 개, 왼쪽·오른쪽은 수직면과 수평면입니다. 큰 면에 속한 빛 전체가 함께 바뀝니다. 1배는 기존 밝기, 0은 꺼짐. 숨긴 면의 저장값은 유지되며 회전해도 조절 대상은 바뀌지 않습니다.</p>${controlRow('structureContrast',state)}${(['Top','Left','Right'] as const).map((region,index)=>`<details open><summary>${['상단 구조','왼쪽 구조','오른쪽 구조'][index]}</summary>${(['X','Y','Z'] as const).map(axis=>controlRow(`structure${region}${axis}` as NumericKey,state)).join('')}</details>`).join('')}`,true));
    // Standard Axis view: top X/Z, left X/Y, right Y/Z. Keep the hidden
    // inputs/state intact; no gain reset and no view-dependent UI switching.
    for(const key of ['structureTopY','structureLeftZ','structureRightX']) {
      shell.querySelector(`[data-optical-number="${key}"]`)!.closest<HTMLElement>('.optical-control')!.hidden=true;
    }
    shell.querySelector('[data-optical-section="hybrid-material"]')!.insertAdjacentHTML('afterend',section('face-dimension','면별 디멘션 라이팅','Face Lighting',
      `<p id="optical-face-dimension-help" class="optical-section-note">현재 밝기 1배 · 0은 해당 면의 디멘션 빛을 끕니다. 각 구조의 실제 X/Z 수직면과 Y 수평면에 연결되어 회전해도 같은 면을 조절합니다. 베벨에서는 부드럽게 연결됩니다. 꺾임 대비를 높이면 수직면이 밝아지고 수평면이 어두워집니다. RGB 색·층 형태·축은 유지하며 자동 저장됩니다.</p>${controlRow('faceDimensionContrast',state)}${(['Top','Left','Right'] as const).map((region,index)=>`<details open><summary>${['상단 구조','왼쪽 구조','오른쪽 구조'][index]}</summary>${(['X','Y','Z'] as const).map(axis=>controlRow(`face${region}${axis}` as NumericKey,state)).join('')}</details>`).join('')}`,true));
    if (AXIS_SPLIT) shell.querySelector('[data-optical-section="hybrid-material"] .optical-section-content')!.insertAdjacentHTML('afterbegin', `${controlRow('axisFaceGap',state)}<p id="optical-axis-split-help" class="optical-section-note">별도 시안 · 접힌 면 사이에 공간 틈을 만듭니다. 0은 기존 연결면이며 빛·층·모션 설정은 유지됩니다. 현재 조정안의 저장값에는 영향을 주지 않습니다.</p>`);
    shell.querySelector('.optical-subtitle')!.textContent = AXIS_SPLIT ? 'A/B Hybrid · 축 면 분리 시안' : 'A/B Hybrid · 열린 내부 굴절';
    shell.querySelector('[data-optical-section="hybrid-material"] .optical-section-content')!.insertAdjacentHTML('beforeend', `${controlRow('hybridOpening',state)}<p id="optical-hybrid-opening-help" class="optical-section-note">0은 기존 닫힌 반사층, 1은 뒤쪽으로 열린 반사층입니다. 중심 축은 고정하고 굴절층과 반사 경로를 함께 바깥으로 확장합니다. 변경값은 자동 저장됩니다.</p>`);
    shell.querySelector('[data-optical-section="hybrid-material"] .optical-section-content')!.insertAdjacentHTML('beforeend', `${controlRow('hybridFaceReflection',state)}${controlRow('hybridFaceWidth',state)}${controlRow('hybridRefractionOverlap',state)}<p id="optical-hybrid-face-help" class="optical-section-note">열린 반사층 안쪽으로 넓게 맺히는 빛입니다. 폭은 퍼짐, 중첩은 어긋난 굴절광을 조절합니다. 면 반사 강도 0은 V3 표현이며, 뒤쪽 개방이 0이면 추가 반사는 꺼집니다. 자동 저장됩니다.</p>`);
    shell.querySelector('#optical-bounces-help')!.textContent = 'A안의 실제 내부 반사·굴절 경로를 계산합니다. 횟수가 높을수록 깊은 반사까지 추적하며, 디멘션 레이어 수와는 별개입니다.';
    shell.querySelector('#optical-hybrid-distortion-help')!.textContent = 'A안처럼 실제 입사면에서 굴절된 내부 레이어의 둥근 굴곡을 조절합니다. B안의 외곽 축은 그대로 유지합니다.';
    shell.querySelector('#optical-curvature-help')!.textContent = '내부 광선에 쓰는 유리 법선 곡률입니다. 값을 높이면 반사·굴절이 휘어집니다. 축의 바깥 경계는 바뀌지 않습니다.';
    const legacyCycleToggle = shell.querySelector<HTMLInputElement>('[data-optical-cycle]')!.closest<HTMLElement>('label')!;
    legacyCycleToggle.hidden = true;
    legacyCycleToggle.style.display = 'none';
    shell.querySelector<HTMLElement>('[data-optical-cycle-status]')!.hidden = true;
    shell.querySelector<HTMLElement>('#optical-cycle-help')!.hidden = true;
  }
  if (CUBE0914) {
    shell.querySelector('[data-optical-section="geometry"]')!.insertAdjacentHTML('beforebegin', section('cube-surface', '겉면 그라데이션', 'Surface', `${controlRow('cubeFaceLight',state)}<p id="optical-cube-surface-help" class="optical-section-note">디멘션 뒤에서 큐브 면을 넓게 채우는 빛을 조절합니다. 0은 면광 제거 · 1은 기존 광량 · 2는 두 배입니다. 디멘션 층의 밝기·형태·색상 계산은 유지됩니다. 변경값은 자동 저장됩니다.</p>`, true));
    shell.querySelector('.optical-subtitle')!.textContent = '09.14 Cube · Camera Motion';
    shell.querySelector('#optical-dimension-help')!.textContent = '9월 14일 원본의 큐브 내부 반사층입니다. 각 큐브 최대 12겹이며, 소수 값은 마지막 층을 부드럽게 나타냅니다.';
    shell.querySelector('#optical-bounces-help')!.textContent = '유리 내부 반사·굴절 광선의 계산 횟수입니다. 디멘션 레이어 수와 별도로 조절합니다.';
    shell.querySelector('#optical-curvature-help')!.textContent = '9월 14일 원본의 연마 유리 법선 곡률입니다. 0은 평면, 값을 높이면 반사와 굴절이 곡면처럼 휘어집니다.';
    for (const id of ['axis-motion','identity','motion','timing','layer-light']) shell.querySelector<HTMLElement>(`[data-optical-section="${id}"]`)!.hidden = true;
    for (const key of ['cameraFloat','cameraFloatX','cameraFloatY','cameraFloatSeconds']) shell.querySelector(`[data-optical-number="${key}"]`)!.closest<HTMLElement>('.optical-control')!.hidden = true;
    for (const id of ['optical-float-help','optical-float-status']) shell.querySelector<HTMLElement>(`#${id}`)!.hidden = true;
    shell.querySelector('#optical-camera-motion-help')!.textContent = '1은 회전, 0은 고정입니다. 지정한 수평·수직 회전 폭까지 부드럽게 이동한 뒤 시작 구도로 돌아와 반복합니다. 미리보기와 MP4에 동일하게 적용됩니다.';
    shell.querySelector('#optical-cycle-help')!.textContent = '9월 14일 원본 조명 순환을 유지합니다. 선택한 색 계열에서 시작해 역방향 RGB 순환합니다. 메인·서브의 광량 비중은 위의 RGB 메인 / 서브 비율에서 조절합니다.';
    shell.querySelector<HTMLDetailsElement>('[data-optical-section="camera"]')!.open = true;
    for (const key of ['dimensionTop','dimensionLeft','dimensionRight']) for (const el of shell.querySelectorAll<HTMLInputElement>(`[data-optical-number="${key}"], [data-optical-range="${key}"]`)) el.max='12';
  }

  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const numbers = [...shell.querySelectorAll<HTMLInputElement>('[data-optical-number]')];
  const ranges = [...shell.querySelectorAll<HTMLInputElement>('[data-optical-range]')];
  const inspector = shell.querySelector<HTMLElement>('#optical-inspector')!;
  const inspectorButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="inspector"]')!;
  const undoButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="undo"]')!;
  const redoButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="redo"]')!;
  const aspect = shell.querySelector<HTMLSelectElement>('[data-optical-aspect]')!;
  const variationSelect = shell.querySelector<HTMLSelectElement>('[data-optical-variation]')!;
  const variationName = shell.querySelector<HTMLInputElement>('[data-optical-variation-name]')!;
  const customAspect = shell.querySelector<HTMLElement>('[data-optical-custom-aspect]')!;
  const customWidth = shell.querySelector<HTMLInputElement>('[data-optical-custom-width]')!;
  const customHeight = shell.querySelector<HTMLInputElement>('[data-optical-custom-height]')!;
  const statusNode = shell.querySelector<HTMLElement>('[data-optical-status]')!;
  const exportButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="export"]')!;
  const exportLabel = shell.querySelector<HTMLElement>('[data-optical-export-label]')!;
  const videoButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="export-video"]')!;
  const videoLabel = shell.querySelector<HTMLElement>('[data-optical-video-label]')!;
  const videoCancel = shell.querySelector<HTMLButtonElement>('[data-optical-action="cancel-video"]')!;
  const videoProgressNode = shell.querySelector<HTMLElement>('[data-optical-video-progress]')!;
  const videoProgressBar = shell.querySelector<HTMLProgressElement>('[data-optical-video-progressbar]')!;
  const videoStatus = shell.querySelector<HTMLElement>('[data-optical-video-status]')!;
  const play = shell.querySelector<HTMLButtonElement>('[data-optical-action="play"]')!;
  const currentTime = shell.querySelector<HTMLOutputElement>('[data-optical-time]')!;
  const color = shell.querySelector<HTMLInputElement>('[data-optical-color]')!;
  const colorHex = shell.querySelector<HTMLInputElement>('[data-optical-color-hex]')!;
  const cycle = shell.querySelector<HTMLInputElement>('[data-optical-cycle]')!;
  const cycleStatus = shell.querySelector<HTMLElement>('[data-optical-cycle-status]')!;
  const hybridColorMode = shell.querySelector<HTMLSelectElement>('[data-optical-hybrid-color-mode]');
  const rgbTiming=shell.querySelector<HTMLSelectElement>('[data-optical-rgb-timing]')!;
  const rgbTimes=shell.querySelector<HTMLFieldSetElement>('[data-optical-rgb-times]')!;
  const rgbTimingStatus=shell.querySelector<HTMLElement>('[data-optical-rgb-timing-status]')!;
  const cycleWeights = new Float32Array(3);
  let currentState = state;
  let busy = false;
  let exportPending = false;
  let videoPending = false;
  let videoBusy = false;
  let videoCancelPending = false;
  let externalBusy = false;
  let disposed = false;
  let renderedPlaying: boolean | undefined;
  let canUndo = false, canRedo = false;
  let variationSignature = '';
  let renderedVariationId = '';

  function history(undo: boolean, redo: boolean): void {
    canUndo = undo; canRedo = redo;
    undoButton.disabled = busy || !undo;
    redoButton.disabled = busy || !redo;
  }

  function setInspector(collapsed: boolean): void {
    shell.classList.toggle('optical-inspector-collapsed', collapsed);
    inspector.inert = collapsed;
    inspectorButton.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? '설정 패널 펼치기' : '설정 패널 접기';
    inspectorButton.setAttribute('aria-label', label);
    inspectorButton.title = label;
  }

  function refreshBusy(): void {
    busy = externalBusy || exportPending || videoPending || videoBusy;
    const isVideo = videoPending || videoBusy;
    exportButton.setAttribute('aria-busy', String(busy && !isVideo));
    exportLabel.textContent = busy && !isVideo ? 'PNG 저장 중…' : '4K PNG 저장';
    videoButton.setAttribute('aria-busy', String(isVideo));
    videoLabel.textContent = isVideo ? 'MP4 저장 중…' : `${currentState.videoLongEdge === 1920 ? '2K' : '4K'} MP4 저장`;
    shell.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button:not([data-optical-action="inspector"])').forEach((control) => { control.disabled = busy || control.matches('[data-optical-legacy]'); });
    history(canUndo, canRedo);
    videoCancel.disabled = !isVideo || videoCancelPending;
    shell.querySelector<HTMLButtonElement>('[data-optical-action="reference"]')!.disabled = busy || !actions.applyReference;
    updateCameraProfile(currentState);
    updateVariationControls(currentState);
    updateRgbTiming(currentState);
  }

  function updateVariationControls(next: OpticalState): void {
    const signature = next.variations.map(v => `${v.id}:${v.name}:${v.savedAt}`).join('|');
    if (signature !== variationSignature) {
      const selected = variationSelect.value;
      variationSelect.replaceChildren(new Option('저장본 선택', ''), ...next.variations.map(v => new Option(`${v.name} · ${opticalAspectLabel(v.settings as OpticalState)}`, v.id)));
      variationSelect.value = next.variations.some(v => v.id === selected) ? selected : next.activeVariationId;
      variationSignature = signature;
    }
    if (renderedVariationId !== next.activeVariationId) {
      variationSelect.value = next.activeVariationId;
      renderedVariationId = next.activeVariationId;
    }
    const selected = next.variations.find(v => v.id === variationSelect.value);
    shell.querySelector<HTMLElement>('[data-optical-variation-status]')!.textContent = next.activeVariationId
      ? `현재 작업: ${next.variations.find(v => v.id === next.activeVariationId)?.name ?? '새 작업'} · 수정값은 자동 저장되지만 이름 붙인 저장본은 그대로입니다.`
      : '현재 작업값은 자동 저장 중입니다. 이름 붙인 저장본은 직접 갱신할 때만 바뀝니다.';
    for (const action of ['load-variation', 'update-variation', 'delete-variation']) {
      shell.querySelector<HTMLButtonElement>(`[data-optical-action="${action}"]`)!.disabled = busy || !selected;
    }
    shell.querySelector<HTMLButtonElement>('[data-optical-action="save-variation"]')!.disabled = busy || !variationName.value.trim() || next.variations.length >= 60;
    customAspect.hidden = next.aspect !== 'custom';
    if (document.activeElement !== customWidth) customWidth.value = String(next.customAspectWidth);
    if (document.activeElement !== customHeight) customHeight.value = String(next.customAspectHeight);
  }

  function updateCameraProfile(next: OpticalState): void {
    const label = opticalAspectLabel(next);
    const saved = next.cameraProfiles[next.aspect];
    const current = opticalCameraView(next);
    const matches = !!saved && OPTICAL_CAMERA_KEYS.every(key => saved[key] === current[key]);
    shell.querySelector<HTMLElement>('[data-optical-camera-aspect]')!.textContent = label;
    shell.querySelector<HTMLElement>('[data-optical-camera-profile-status]')!.textContent = !saved
      ? `${label} · 아직 구도를 저장하지 않았습니다. 편집값은 자동 보관됩니다.`
      : matches ? `${label} · 저장된 구도를 사용 중입니다.`
        : `${label} · 저장 후 변경됨. 편집값은 자동 보관됩니다.`;
    shell.querySelector<HTMLButtonElement>('[data-optical-action="restore-camera"]')!.disabled = busy || !saved || matches;
  }

  function updateRgbTiming(next: OpticalState): void {
    const ratioActive=CUBE0914?next.lightCycle:next.hybridColorMode===0;
    const subPercent=CUBE0914?next.cubeSubPercent:next.hybridSubPercent;
    const ratioStatus=shell.querySelector<HTMLElement>('[data-optical-rgb-ratio-status]');
    if(ratioStatus)ratioStatus.textContent=ratioActive
      ?`메인 ${valueText(100-2*subPercent)}% · 서브 ${valueText(subPercent)}% / ${valueText(subPercent)}%`
      :'RGB 순환에서 적용됩니다. 고정 컬러의 비율은 유지됩니다.';
    shell.querySelectorAll<HTMLInputElement>('[data-optical-number="hybridSubPercent"], [data-optical-range="hybridSubPercent"], [data-optical-number="cubeSubPercent"], [data-optical-range="cubeSubPercent"]').forEach(input=>{input.disabled=busy||!ratioActive;});
    const active=HYBRID_AB?next.hybridColorMode===0:next.lightCycle;
    const timing=opticalColorTiming(next);
    if(document.activeElement!==rgbTiming)rgbTiming.value=String(next.lightTimingCustom);
    rgbTiming.disabled=busy||!active||CUBE0914;
    rgbTimes.disabled=busy||!active||CUBE0914||!timing.custom;
    rgbTimingStatus.textContent=CUBE0914?'이 원본 모드는 기존 컬러 시계를 사용합니다.'
      : !active?'RGB 순환을 선택하면 시간 조절이 적용됩니다. 입력값은 유지됩니다.'
      : timing.custom?`RGB 한 주기 ${valueText(timing.period)}초 · 시작 ${valueText(timing.start)}초. 한 주기 종료 ${valueText(timing.start+timing.period)}초. 영상이 먼저 끝나면 색 순환도 그 위치에서 끝납니다.`
      : `기존 자동 순환 유지 · 각 색 유지 약 ${timing.red.toFixed(2)}초 / 전환 약 ${timing.crossfade.toFixed(2)}초`;
  }

  function status(message: string, isBusy = false): void {
    if (disposed) return;
    externalBusy = isBusy;
    statusNode.textContent = message;
    refreshBusy();
    statusNode.dataset.state = busy ? 'busy' : /오류|실패|error|failed/i.test(message) ? 'error' : 'ready';
  }

  function videoProgress(message: string, fraction: number, isBusy: boolean): void {
    if (disposed) return;
    if (!isBusy || (!videoBusy && !videoPending)) videoCancelPending = false;
    videoBusy = isBusy;
    externalBusy = false;
    videoProgressNode.hidden = false;
    videoProgressBar.value = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    videoStatus.textContent = message;
    videoStatus.dataset.state = /오류|실패|error|failed/i.test(message) ? 'error' : isBusy ? 'busy' : 'ready';
    refreshBusy();
  }

  function update(next: OpticalState, force = false): void {
    if (disposed) return;
    currentState = next;
    updateCameraProfile(next);
    updateRgbTiming(next);
    if (hybridColorMode && (force || document.activeElement !== hybridColorMode)) hybridColorMode.value = String(next.hybridColorMode);
    const floating=opticalCameraFloat(next);
    shell.querySelector<HTMLElement>('#optical-float-status')!.textContent=next.cameraFloat
      ? `실제 주기 ${floating.period.toFixed(1)}초 · 카메라 방향·깊이 고정`
      : '부유 모션 꺼짐 · 설정값은 유지됩니다.';
    const swing=opticalAxisPose(next);
    shell.querySelector<HTMLElement>('#optical-axis-motion-status')!.textContent = next.axisMotion
      ? `실제 범위 · 입체 ±${Math.abs(swing.safeYaw).toFixed(1)}° · 기울기 ±${Math.abs(swing.safeRoll).toFixed(1)}°${swing.safetyLimited?' (안전 보정)':''} · ${swing.period.toFixed(1)}초마다 왕복`
      : '엑시스 모션 꺼짐 · 입력값은 유지됩니다.';
    const cameraPose = opticalCameraPose(next);
    const cameraLoop = axisCameraLoopLimits(next);
    shell.querySelector<HTMLElement>('#optical-camera-motion-status')!.textContent = next.cameraMotion
      ? next.axisMotion
        ? `실제 범위 · 수평 ±${Math.abs(cameraLoop.horizontal).toFixed(1)}° · 수직 ±${Math.abs(cameraLoop.vertical).toFixed(1)}°${cameraLoop.scale < .999 ? ' (안전 보정)' : ''} · ${cameraPose.period?.toFixed(1) ?? '—'}초마다 반복`
        : `현재 구도에서 수평 ${cameraPose.horizontal.toFixed(1)}° · 수직 ${cameraPose.vertical.toFixed(1)}°`
      : '카메라 모션 꺼짐 · 입력값은 유지됩니다.';
    cycle.checked = next.lightCycle;
    shell.querySelector<HTMLElement>('#optical-color-help')!.textContent = HYBRID_AB
      ? '선택한 색은 해당 계열 조명에 적용됩니다. RGB의 비중과 순환 여부는 위의 정지 컬러 / 순환에서 조절합니다. 비중은 화면 면적이 아닌 광량 기준입니다.'
      : next.lightCycle
        ? '선택한 색은 해당 계열 조명에 적용됩니다. 다른 두 계열은 Pleos 레드 2·그린 2·블루 3 중에서 사용합니다. 비중은 화면 면적이 아닌 광량 기준입니다.'
        : '여러 방향의 광원을 하나의 색상·강도로 조정합니다. 화이트에서 색 분산이 가장 잘 보입니다.';
    (CUBE0914 ? writeCube0914Weights : writeLightWeights)(next, cycleWeights);
    cycleStatus.textContent = next.lightCycle
      ? `${next.playing ? '순환 중' : '일시 정지'} · ${CYCLE_NAMES.map((name, i) => `${name} ${Math.round(cycleWeights[i] * 100)}%`).join(' / ')}`
      : '단일 색상 조명 · 저장값 유지';
    color.value = next.lightColor;
    if (force || document.activeElement !== colorHex) colorHex.value = next.lightColor;
    shell.querySelectorAll<HTMLButtonElement>('[data-optical-light-swatch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.opticalLightSwatch === next.lightColor)));
    for (const input of numbers) {
      if (!force && document.activeElement === input) continue;
      const key = input.dataset.opticalNumber as NumericKey;
      const formatted = valueText(next[key], controlByKey.get(key)?.step);
      if (input.value !== formatted) input.value = formatted;
    }
    for (const input of ranges) {
      const key = input.dataset.opticalRange as NumericKey;
      if (key === 'time') input.max = String(next.duration);
      const value = next[key];
      if (input.valueAsNumber !== value) input.value = String(value);
      const progress = (value - Number(input.min)) / (Number(input.max) - Number(input.min));
      input.style.setProperty('--optical-range-fill', `${Math.max(0, Math.min(1, progress)) * 100}%`);
      if (key === 'time') input.setAttribute('aria-valuetext', `${value.toFixed(2)}초 / ${next.duration}초`);
      if (key === 'identityTransition') input.setAttribute('aria-valuetext', value >= .5 ? '1, 전환 켜짐' : '0, 전환 꺼짐');
      if (key === 'identityLayerStagger') input.setAttribute('aria-valuetext', value === 0 ? '0초, 모든 층 함께 등장' : `${value}초, 다음 층 등장 간격`);
      if (key === 'identityAxisAccent') input.setAttribute('aria-valuetext', value === 0 ? '0, 축 강조 꺼짐' : `${value}, 전환 중 축 강조 강도`);
      if (key === 'hybridDepthFlow') input.setAttribute('aria-valuetext', value === 0 ? '0, 안쪽 흐름 꺼짐' : `${value}, 안쪽 흐름 강도`);
      if (key === 'hybridDepthCycles') input.setAttribute('aria-valuetext', `한 루프에 ${value}회`);
      if ((OPTICAL_DIMENSION_KEYS as readonly string[]).includes(key)) input.setAttribute('aria-valuetext', `${value}겹${value === 0 ? ', 디멘션 레이어 없음' : ''}`);
    }
    currentTime.value = timeText(next.time);
    shell.querySelector<HTMLElement>('[data-optical-duration]')!.textContent = timeText(next.duration);
    aspect.value = next.aspect;
    const dimensions = opticalDimensions(next).join(' × ');
    shell.querySelector<HTMLElement>('[data-optical-resolution]')!.textContent = `${dimensions} px`;
    shell.querySelector<HTMLElement>('[data-optical-export-size]')!.textContent = dimensions;
    shell.querySelectorAll<HTMLSelectElement>('[data-optical-video]').forEach(select => {
      const value = String(next[select.dataset.opticalVideo as NumericKey]);
      if ((force || document.activeElement !== select) && select.value !== value) select.value = value;
    });
    const videoDimensions = opticalVideoDimensions(next, next.videoLongEdge).join(' × ');
    shell.querySelector<HTMLElement>('[data-optical-video-size]')!.textContent = `${videoDimensions} px`;
    shell.querySelector<HTMLElement>('[data-optical-video-range]')!.textContent = `0 – ${valueText(next.duration)}초 · ${Math.ceil(next.duration * next.videoFps - 1e-7)} 프레임`;
    shell.querySelector<HTMLElement>('[data-optical-video-summary]')!.textContent = `${videoDimensions} · ${next.videoFps} fps · ${valueText(next.duration)}초`;
    if (!videoBusy && !videoPending) videoLabel.textContent = `${next.videoLongEdge === 1920 ? '2K' : '4K'} MP4 저장`;
    shell.querySelector<HTMLElement>('[data-optical-viewport-aspect]')!.textContent = opticalAspectLabel(next);
    updateVariationControls(next);
    if (renderedPlaying !== next.playing) {
      renderedPlaying = next.playing;
      play.innerHTML = next.playing ? icons.pause : icons.play;
      play.setAttribute('aria-label', next.playing ? '일시 정지' : '재생');
      play.title = next.playing ? '일시 정지' : '재생';
    }
  }

  function inputChanged(input: HTMLInputElement, commit: boolean): void {
    const key = (input.dataset.opticalNumber ?? input.dataset.opticalRange) as NumericKey;
    const value = input.valueAsNumber;
    if (!Number.isFinite(value)) {
      if (commit) input.value = valueText(currentState[key], controlByKey.get(key)?.step);
      return;
    }
    const min = Number(input.min);
    const max = Number(input.max);
    const clamped = Math.min(max, Math.max(min, value));
    if (!commit && input.type === 'number' && value !== clamped) return;
    const next = key === 'bounces' || key === 'identityTransition' || key === 'hybridDepthCycles' ? Math.round(clamped) : clamped;
    if (commit) input.value = valueText(next, controlByKey.get(key)?.step);
    actions.change(key, next);
  }

  shell.addEventListener('input', (event) => {
    const target = event.target;
    if (target === variationName) updateVariationControls(currentState);
    if (!busy && target === color) actions.change('lightColor', color.value);
    if (!busy && target === colorHex) {
      const valid = normalizeLightColor(colorHex.value);
      colorHex.setAttribute('aria-invalid', String(!valid));
      if (valid) actions.change('lightColor', valid);
    }
    if (!busy && target instanceof HTMLInputElement && (target.dataset.opticalRange || target.dataset.opticalNumber)) inputChanged(target, false);
  }, listenerOptions);
  let pointerEditing = false;
  shell.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!busy && target instanceof HTMLInputElement && (target.type === 'range' || target.type === 'color')) {
      pointerEditing = true;
      const focused = document.activeElement;
      actions.endEdit();
      // Blur commits the previous numeric/HEX edit before this drag begins.
      if (!(focused instanceof HTMLInputElement && (focused.type === 'number' || focused === colorHex))) actions.beginEdit();
    }
  }, listenerOptions);
  const endPointerEdit = () => { if (pointerEditing) actions.endEdit(); pointerEditing = false; };
  window.addEventListener('pointerup', endPointerEdit, listenerOptions);
  window.addEventListener('pointercancel', endPointerEdit, listenerOptions);
  shell.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!busy && target instanceof HTMLInputElement && (target.type === 'number' || target === colorHex || target.type === 'color')) actions.beginEdit();
  }, listenerOptions);
  shell.addEventListener('change', (event) => {
    const target = event.target;
    if (busy) return;
    if (target === cycle) actions.change('lightCycle', cycle.checked);
    if(target===rgbTiming)actions.change('lightTimingCustom',Number(rgbTiming.value));
    if (target instanceof HTMLInputElement && target.dataset.opticalNumber) inputChanged(target, true);
    if (target === aspect) actions.change('aspect', aspect.value);
    if (target === variationSelect) updateVariationControls(currentState);
    if (target === customWidth || target === customHeight) {
      const width = Math.max(1, Math.min(10000, Math.round(customWidth.valueAsNumber)));
      const height = Math.max(1, Math.min(10000, Math.round(customHeight.valueAsNumber)));
      if (Number.isFinite(width) && Number.isFinite(height)) {
        actions.change(target === customWidth ? 'customAspectWidth' : 'customAspectHeight', target === customWidth ? width : height);
      } else updateVariationControls(currentState);
    }
    if (target === hybridColorMode && hybridColorMode) actions.change('hybridColorMode', Number(hybridColorMode.value));
    if (target instanceof HTMLSelectElement && target.dataset.opticalVideo) actions.change(target.dataset.opticalVideo as NumericKey, Number(target.value));
  }, listenerOptions);
  shell.addEventListener('focusout', (event) => {
    const target = event.target;
    if (target === colorHex) { colorHex.value = currentState.lightColor; colorHex.removeAttribute('aria-invalid'); }
    if (target instanceof HTMLInputElement && target.dataset.opticalNumber) {
      const key = target.dataset.opticalNumber as NumericKey;
      target.value = valueText(currentState[key], controlByKey.get(key)?.step);
    }
    if (target instanceof HTMLInputElement && (target.type === 'number' || target === colorHex || target.type === 'color')) {
      actions.endEdit();
      if (pointerEditing) actions.beginEdit();
    }
  }, listenerOptions);
  shell.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shell.classList.contains('optical-inspector-collapsed') && matchMedia('(max-width: 700px)').matches) {
      setInspector(true);
      inspectorButton.focus();
    }
  }, listenerOptions);
  shell.addEventListener('click', async (event) => {
    const swatch = (event.target as Element).closest<HTMLButtonElement>('[data-optical-light-swatch]');
    if (swatch && !busy) actions.change('lightColor', swatch.dataset.opticalLightSwatch!);
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-optical-action]');
    if (!button || button.disabled) return;
    switch (button.dataset.opticalAction) {
      case 'inspector':
        setInspector(!shell.classList.contains('optical-inspector-collapsed'));
        break;
      case 'reset':
        actions.reset();
        status('기본 장면으로 초기화했습니다.');
        break;
      case 'undo':
        actions.undo();
        break;
      case 'redo':
        actions.redo();
        break;
      case 'reference':
        try {
          actions.applyReference?.();
          status('레퍼런스 무드를 적용했습니다.');
        } catch (error) {
          status(error instanceof Error ? error.message : '무드를 적용할 수 없습니다.');
        }
        break;
      case 'save-camera':
        actions.saveCamera();
        break;
      case 'restore-camera':
        actions.restoreCamera();
        break;
      case 'save-variation':
        if (!variationName.value.trim()) { variationName.focus(); break; }
        actions.saveVariation(variationName.value.trim());
        variationName.value = '';
        updateVariationControls(currentState);
        break;
      case 'load-variation':
        if (variationSelect.value) actions.loadVariation(variationSelect.value);
        break;
      case 'update-variation':
        if (variationSelect.value) actions.updateVariation(variationSelect.value);
        break;
      case 'delete-variation':
        if (variationSelect.value && confirm('선택한 판형 배리에이션 저장본을 삭제할까요? 현재 화면의 설정은 유지됩니다.')) actions.deleteVariation(variationSelect.value);
        break;
      case 'play':
        actions.togglePlay();
        break;
      case 'export':
        if (busy) return;
        exportPending = true;
        status('4K PNG를 만드는 중…', true);
        try {
          await actions.exportPng();
          exportPending = false;
          status('PNG를 저장했습니다.');
        } catch (error) {
          exportPending = false;
          status(`저장 실패: ${error instanceof Error ? error.message : '다시 시도해 주세요.'}`);
        }
        break;
      case 'export-video': {
        if (busy) return;
        videoCancelPending = false;
        videoPending = true;
        videoProgress('영상 저장을 준비하는 중…', 0, true);
        let message = 'MP4를 저장했습니다.';
        let complete = true;
        try {
          await actions.exportVideo();
        } catch (error) {
          complete = false;
          message = error instanceof Error && error.name === 'AbortError' ? '영상 저장을 취소했습니다.' : `영상 저장 실패: ${error instanceof Error ? error.message : '다시 시도해 주세요.'}`;
        } finally {
          videoPending = false;
          videoProgress(message, complete ? 1 : videoProgressBar.value, false);
        }
        break;
      }
      case 'cancel-video':
        videoCancelPending = true;
        actions.cancelVideo();
        videoCancel.disabled = true;
        videoStatus.textContent = '저장을 취소하는 중…';
        break;
    }
  }, listenerOptions);

  if (matchMedia('(max-width: 700px)').matches) setInspector(true);
  update(state);

  return {
    update,
    history,
    status,
    videoProgress,
    dispose() {
      disposed = true;
      events.abort();
      shell.remove();
    },
  };
}
