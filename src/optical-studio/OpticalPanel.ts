import type { OpticalState } from './OpticalState';
import { CUBE0914, writeCube0914Weights } from './Cube0914';
import { HYBRID_AB } from './HybridAB';
import { OPTICAL_ASPECTS, OPTICAL_DIMENSION_KEYS, OPTICAL_ZOOM_RANGE, normalizeLightColor, opticalDimensions, opticalVideoDimensions } from './OpticalState';
import { CYCLE_NAMES, writeLightWeights } from './OpticalLighting';
import { opticalAxisPose } from './OpticalAxisMotion';
import { opticalCameraFloat } from './OpticalCameraFloat';
import { axisCameraLoopLimits, opticalCameraPose } from './OpticalCameraMotion';
import './OpticalStudio.css';

type NumericKey = {
  [Key in keyof OpticalState]: OpticalState[Key] extends number ? Key : never
}[keyof OpticalState];

export interface OpticalPanelActions {
  change(key: keyof OpticalState, value: number | boolean | string): void;
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

const hybridControls: Control[] = [
  { key: 'hybridOpening', label: '뒤쪽 개방', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-opening-help' },
  { key: 'hybridFaceReflection', label: '면 반사 강도', min: 0, max: 2, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridFaceWidth', label: '반사광 폭', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridRefractionOverlap', label: '굴절 중첩', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-face-help' },
  { key: 'hybridDistortion', label: '내부 굴절', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-distortion-help' },
  { key: 'hybridDensity', label: '내부 광학 밀도', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-density-help' },
  { key: 'hybridColorMix', label: 'RGB 혼합', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-color-mix-help' },
  { key: 'hybridDepthFlow', label: '안쪽 흐름 강도', min: 0, max: 1, step: .01, describedBy: 'optical-hybrid-depth-help' },
  { key: 'hybridDepthCycles', label: '깊이 반복 횟수', min: 1, max: 4, step: 1, unit: '회', describedBy: 'optical-hybrid-depth-help' },
];

const hybridColorModes = ['RGB 순환', 'RGB 균형 · 고정', '레드 우세 · 고정', '그린 우세 · 고정', '블루 우세 · 고정'];

const controls: Control[] = [
  ...(HYBRID_AB ? hybridControls : []),
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
  { key: 'dimensionDelayTop', label: '상단 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'dimensionDelayLeft', label: '하단 왼쪽 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'dimensionDelayRight', label: '하단 오른쪽 지연', min: 0, max: 30, step: .1, unit: '초' },
  { key: 'lightMotionCycles', label: '조명 반복 횟수', min: 0, max: 4, step: 1, unit: '회' },
  { key: 'layerFadeAmount', label: '층 페이드 강도', min: 0, max: 1, step: .01 },
  { key: 'layerFadeCycles', label: '층 반복 횟수', min: 0, max: 4, step: 1, unit: '회' },
  { key: 'layerStagger', label: '층별 시차', min: 0, max: 1, step: .01 },
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

function hybridSections(state: OpticalState): string {
  if (!HYBRID_AB) return '';
  return section('hybrid-material', 'A/B 통합 재질', 'Hybrid A/B', `<p class="optical-section-note">B의 얇은 축과 모션에 A의 내부 굴절·색의 깊이를 더합니다.</p>${controlRow('hybridDistortion', state)}<p id="optical-hybrid-distortion-help" class="optical-section-note">외곽 축은 유지하고 내부 반사가 굴절되는 정도를 조절합니다.</p>${controlRow('hybridDensity', state)}<p id="optical-hybrid-density-help" class="optical-section-note">값을 높이면 안쪽 광량의 감쇠를 완화해 반사가 더 풍부하게 남습니다. 층수는 디멘션 레이어에서 조절합니다.</p>`, true)
    + section('hybrid-color', '정지 컬러 / 순환', 'Color', `<label class="optical-output-control"><span>컬러 구성</span><select data-optical-hybrid-color-mode aria-label="통합안 컬러 구성" aria-describedby="optical-hybrid-color-help">${hybridColorModes.map((label, value) => `<option value="${value}">${label}</option>`).join('')}</select></label><p id="optical-hybrid-color-help" class="optical-section-note">고정은 컬러 비중만 고정합니다. 엑시스·카메라·층 모션은 현재 설정대로 재생됩니다. 정지 이미지는 원하는 시간에서 PNG로 저장하세요.</p>${controlRow('hybridColorMix', state)}<p id="optical-hybrid-color-mix-help" class="optical-section-note">선택한 컬러 구성 안에서 RGB 반사가 겹쳐 보이는 정도를 조절합니다.</p>`, true)
    + section('hybrid-depth', '공간 깊이 테스트 (Hall D 도면 미반영)', '', `<p id="optical-hybrid-depth-help" class="optical-section-note">층이 화면 안쪽으로 이어지는 개념 테스트입니다. 강도 0은 꺼짐이며, 반복 횟수는 한 루프 안에서의 흐름 횟수입니다. Hall D의 실제 화면 형상·치수·관람 위치를 반영한 현장 보정은 아닙니다.</p>${controlRow('hybridDepthFlow', state)}${controlRow('hybridDepthCycles', state)}`);
}

/** Owns only the studio DOM. Rendering, persistence and camera gestures belong to the app. */
export function mountOpticalPanel(root: HTMLElement, state: OpticalState, actions: OpticalPanelActions): {
  update(state: OpticalState): void;
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
        <div class="optical-inspector-heading"><span>장면 설정</span><button type="button" data-optical-action="reset" class="optical-text-button">초기화</button></div>
        <div class="optical-inspector-scroll">
          ${hybridSections(state)}
          ${section('axis-motion', '엑시스 회전', 'Axis Motion', ['axisMotion','axisYaw','axisRoll','axisMoveSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-axis-motion-help" class="optical-section-note">25엑시스 구간은 0°로 고정한 뒤 0 → + → 0 → − → 0으로 반복합니다. 음수 입력은 시작 방향을 반대로 합니다. 현재 시점에서 면이 뒤집히지 않도록 실제 회전폭을 자동 제한합니다. 왕복 주기는 영상 길이에 맞춰 정수 횟수로 조정됩니다. 아래 카메라 모션을 켜면 같은 안전 범위 안에서 시점도 함께 부유합니다.</p><p id="optical-axis-motion-status" class="optical-section-note"></p>', true)}
          ${section('identity', '25엑시스 → 디멘션', 'Transition', `<p id="optical-identity-help" class="optical-section-note">전환 사용: 0은 꺼짐, 1은 켜짐입니다. 1로 설정한 뒤 아래 타임라인을 0초로 옮기고 재생하세요.</p>${controlRow('identityTransition', state)}${controlRow('identityHold', state)}${controlRow('identityDissolve', state)}<p id="optical-identity-timing-help" class="optical-section-note">25엑시스의 같은 면에서 디멘션 반사층으로 이어집니다. 중심은 전환 중 이동하지 않습니다. 끝에 도달하면 처음부터 반복하며, 일시정지를 누르면 멈춥니다.</p>${controlRow('identityLayerStagger', state)}<p id="optical-identity-stagger-help" class="optical-section-note">Axis에 가까운 층부터 등장합니다. 1초는 다음 층이 1초 뒤에 시작하며, 0초는 모든 층이 함께 시작합니다. 마지막 층까지 보이도록 재생 길이가 자동으로 늘어납니다. 아래 ‘층별 시차’는 반복 모션의 밝기 타이밍을 조절합니다.</p>${controlRow('identityAxisAccent', state)}<p id=\"optical-identity-accent-help\" class=\"optical-section-note\">한 루프의 25엑시스 → 디멘션 전환 중 축의 빛을 한 번 강조합니다. 0은 꺼짐, 1은 기본 강도입니다. 기존 층의 순서·등장 스태거는 유지됩니다.</p>`, true)}
          ${section('motion', '빛 모션', 'Motion', `<p class="optical-section-note">재생 길이가 한 루프입니다. 같은 길이에서 반복 횟수를 늘리면 더 빠르게 움직입니다. 아래 재생 버튼·타임라인으로 확인하세요.</p>${['duration', 'speed', 'lightMotionCycles'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">조명 반복 0은 현재 궤도의 시작 위치에 고정합니다. 이동폭은 움직이는 범위입니다. ${HYBRID_AB ? 'RGB 순환과 고정은 위의 정지 컬러 / 순환에서 선택합니다.' : 'RGB 주도색 순환은 조명 패널에서 별도로 켭니다.'}</p>${['layerFadeAmount', 'layerFadeCycles', 'layerStagger'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">페이드 강도 0은 모든 층을 계속 표시합니다. 층 반복 0은 시작 밝기에 고정합니다. 층별 시차가 크면 안쪽 층이 순서대로 나타납니다. 형태는 휘지 않습니다. 변경값은 자동 저장됩니다.</p>`, true)}
          ${section('timing', '영역별 타이밍', 'Timing', `<p class="optical-section-note">각 영역의 층 페이드와 축 경계 흐름을 기존 시점보다 늦춥니다. RGB 조명 순환은 공통으로 유지됩니다.</p>${['dimensionDelayTop', 'dimensionDelayLeft', 'dimensionDelayRight'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">0초는 기존 타이밍입니다. 지연은 루프 안에서 순환하며, 시작 전 대기 화면을 만들지 않습니다. 층 페이드 강도·반복이 0이면 해당 모션의 지연은 보이지 않습니다.</p>`, true)}
          ${section('geometry', '형태', 'Geometry', `<p class="optical-section-note">세 개의 큐브, 하나의 Axis</p>${controlRow('gap', state)}${controlRow('bevel', state)}`)}
          ${section('dimensions', '디멘션 레이어', 'Layers', `<p id="optical-dimension-help" class="optical-section-note">큐브 안쪽 결을 따르는 디멘션 반사층입니다. 각 영역은 최대 50겹이며, 0겹은 층만 끕니다. 소수 값은 마지막 층을 부드럽게 나타냅니다.</p>${OPTICAL_DIMENSION_KEYS.map((key) => controlRow(key, state)).join('')}<details class="optical-layer-advanced"><summary>층의 형태 조정</summary>${['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight', 'dimensionSoftness', 'dimensionFalloff'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">층 간격은 큐브마다 따로 적용됩니다. 층 풀림·깊이 감쇠는 세 큐브 공통입니다. 불투명 큐브를 추가하지 않습니다. 층의 3D 가림·겹침은 시점에 따라 달라집니다.</p></details>`, true)}
          ${section('optics', '광학', 'Optics', `<button type="button" data-optical-action="reference" class="optical-text-button"${actions.applyReference ? '' : ' disabled'} aria-describedby="optical-reference-help">레퍼런스 무드 적용</button><p id="optical-reference-help" class="optical-section-note">카메라·간격·판형은 유지하고 유리·조명·반사층 표현을 조정합니다.</p>${['ior', 'dispersion', 'roughness', 'surfaceCurvature'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-curvature-help" class="optical-section-note">반사광이 모서리에 집중되는 정도를 조절합니다. 디멘션의 경로나 형태를 휘게 하지 않습니다.</p>${['reflection', 'absorption', 'bounces'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-bounces-help" class="optical-section-note">현재는 표면 반사를 제외한 디멘션 전용 표현이므로 광선 추적 한도는 적용되지 않습니다. 이전 값은 보존하며, 반복 층은 디멘션 레이어 수로 조절하세요.</p>`, true)}
          ${section('lighting', '조명', 'Lighting', `<div class="optical-color-control"><label for="optical-light-color">조명 색상</label><input id="optical-light-color" data-optical-color type="color" value="${state.lightColor}" aria-label="조명 색상 선택"><input data-optical-color-hex type="text" value="${state.lightColor}" maxlength="7" spellcheck="false" aria-label="조명 색상 HEX" aria-describedby="optical-color-help"></div><div class="optical-light-swatches" aria-label="Pleos 조명 색상">${[['#FFFFFF','화이트'],['#FFCDD7','레드 1'],['#FA293C','레드 2'],['#B4FFD2','그린 1'],['#0ADC91','그린 2'],['#CDDCFF','블루 1'],['#2350FF','블루 3']].map(([hex,label])=>`<button type="button" data-optical-light-swatch="${hex}" aria-label="Pleos ${label}" title="Pleos ${label} ${hex}" style="--swatch:${hex}"></button>`).join('')}</div><p id="optical-color-help" class="optical-section-note">여러 방향의 광원을 하나의 색상·강도로 조정합니다. 화이트에서 색 분산이 가장 잘 보입니다.</p>${controlRow('lightIntensity', state)}${controlRow('lightSpread', state)}${controlRow('exposure', state)}${controlRow('bloom', state)}<p id="optical-bloom-help" class="optical-section-note">밝은 반사광의 부드러운 번짐입니다. 0이면 번짐을 끕니다.</p>`, true)}
          ${section('camera', '카메라', 'Camera', ['zoom', 'panX', 'azimuth', 'elevation'].map((key) => controlRow(key as NumericKey, state)).join('') + '<p class="optical-section-note">각도는 모션의 기준 구도입니다. 좌우 이동: 0은 중앙, +는 오른쪽을 봅니다. 확대와 좌우 이동은 모션 중 유지됩니다.</p>' + ['cameraFloat','cameraFloatX','cameraFloatY','cameraFloatSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-float-help" class="optical-section-note">1은 켜짐, 0은 꺼짐. 25엑시스 이후 화면 평면에서 좌우·상하로 천천히 부유합니다. 각도·깊이는 바꾸지 않으며 폭은 각 방향 최대 10%입니다. 영상 끝에는 원위치로 돌아오고, 주기는 전체 길이에 맞춥니다.</p><p id="optical-float-status" class="optical-section-note"></p>' + ['cameraMotion','cameraOrbitHorizontal','cameraOrbitVertical','cameraMoveSeconds'].map(key=>controlRow(key as NumericKey,state)).join('') + '<p id="optical-camera-motion-help" class="optical-section-note">모션 1은 켜짐, 0은 고정입니다. 엑시스 회전이 켜져 있으면 수평·수직 회전 폭이 주기마다 반복되어 공간이 부유하는 느낌을 만듭니다. 두 회전을 합친 경로는 면을 넘지 않도록 자동으로 제한하며, MP4에도 같은 경로가 적용됩니다.</p><p id="optical-camera-motion-status" class="optical-section-note"></p>')}
          ${section('output', '출력', 'Output', `<p class="optical-section-note">PNG는 현재 장면 한 컷, MP4는 0초부터 재생 길이까지 한 루프를 저장합니다. 화면 비율과 카메라 설정은 그대로 유지합니다.</p><dl class="optical-output-details"><div><dt>PNG 해상도</dt><dd data-optical-resolution>3840 × 3840 px</dd></div></dl><div class="optical-video-settings" aria-label="영상 출력 설정">
            <label class="optical-output-control"><span>영상 해상도</span><select data-optical-video="videoLongEdge" aria-label="영상 해상도" aria-describedby="optical-video-size-help"><option value="3840">4K · 긴 변 3840</option><option value="1920">2K · 긴 변 1920</option></select></label>
            <label class="optical-output-control"><span>프레임레이트</span><select data-optical-video="videoFps" aria-label="영상 프레임레이트"><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
            <label class="optical-output-control"><span>프레임 품질</span><select data-optical-video="videoSamples" aria-label="영상 프레임 품질" aria-describedby="optical-video-quality-help"><option value="4">4 샘플</option><option value="16">16 샘플 · 최고</option></select></label>
          </div><p id="optical-video-quality-help" class="optical-section-note">샘플이 많을수록 가장자리를 정밀하게 계산합니다. 16 샘플·60 fps는 저장 시간이 더 걸립니다.</p><p class="optical-section-note">H.264 우선 · 고해상도 판형은 기기에 따라 HEVC MP4로 저장합니다. HEVC는 지원되는 플레이어가 필요합니다. 저장 중 이 탭을 열어 두세요.</p><dl class="optical-output-details"><div><dt>MP4 해상도</dt><dd id="optical-video-size-help" data-optical-video-size></dd></div><div><dt>영상 구간</dt><dd data-optical-video-range></dd></div></dl>`)}
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
    shell.querySelector('.optical-subtitle')!.textContent = 'A/B Hybrid · 열린 내부 굴절';
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
    shell.querySelector('.optical-subtitle')!.textContent = '09.14 Cube · Camera Motion';
    shell.querySelector('#optical-dimension-help')!.textContent = '9월 14일 원본의 큐브 내부 반사층입니다. 각 큐브 최대 12겹이며, 소수 값은 마지막 층을 부드럽게 나타냅니다.';
    shell.querySelector('#optical-bounces-help')!.textContent = '유리 내부 반사·굴절 광선의 계산 횟수입니다. 디멘션 레이어 수와 별도로 조절합니다.';
    shell.querySelector('#optical-curvature-help')!.textContent = '9월 14일 원본의 연마 유리 법선 곡률입니다. 0은 평면, 값을 높이면 반사와 굴절이 곡면처럼 휘어집니다.';
    for (const id of ['axis-motion','identity','motion','timing']) shell.querySelector<HTMLElement>(`[data-optical-section="${id}"]`)!.hidden = true;
    for (const key of ['cameraFloat','cameraFloatX','cameraFloatY','cameraFloatSeconds']) shell.querySelector(`[data-optical-number="${key}"]`)!.closest<HTMLElement>('.optical-control')!.hidden = true;
    for (const id of ['optical-float-help','optical-float-status']) shell.querySelector<HTMLElement>(`#${id}`)!.hidden = true;
    shell.querySelector('#optical-camera-motion-help')!.textContent = '1은 회전, 0은 고정입니다. 지정한 수평·수직 회전 폭까지 부드럽게 이동한 뒤 시작 구도로 돌아와 반복합니다. 미리보기와 MP4에 동일하게 적용됩니다.';
    shell.querySelector('#optical-cycle-help')!.textContent = '9월 14일 원본 조명 순환을 유지합니다. 선택한 색 계열에서 시작해 역방향 RGB 순환으로 주도색 80% · 서브 각 10%를 교대합니다.';
    shell.querySelector<HTMLDetailsElement>('[data-optical-section="camera"]')!.open = true;
    for (const key of ['dimensionTop','dimensionLeft','dimensionRight']) for (const el of shell.querySelectorAll<HTMLInputElement>(`[data-optical-number="${key}"], [data-optical-range="${key}"]`)) el.max='12';
  }

  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const numbers = [...shell.querySelectorAll<HTMLInputElement>('[data-optical-number]')];
  const ranges = [...shell.querySelectorAll<HTMLInputElement>('[data-optical-range]')];
  const inspector = shell.querySelector<HTMLElement>('#optical-inspector')!;
  const inspectorButton = shell.querySelector<HTMLButtonElement>('[data-optical-action="inspector"]')!;
  const aspect = shell.querySelector<HTMLSelectElement>('[data-optical-aspect]')!;
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
    videoCancel.disabled = !isVideo || videoCancelPending;
    shell.querySelector<HTMLButtonElement>('[data-optical-action="reference"]')!.disabled = busy || !actions.applyReference;
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

  function update(next: OpticalState): void {
    if (disposed) return;
    currentState = next;
    if (hybridColorMode && document.activeElement !== hybridColorMode) hybridColorMode.value = String(next.hybridColorMode);
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
    if (document.activeElement !== colorHex) colorHex.value = next.lightColor;
    shell.querySelectorAll<HTMLButtonElement>('[data-optical-light-swatch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.opticalLightSwatch === next.lightColor)));
    for (const input of numbers) {
      if (document.activeElement === input) continue;
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
    const dimensions = opticalDimensions(next.aspect).join(' × ');
    shell.querySelector<HTMLElement>('[data-optical-resolution]')!.textContent = `${dimensions} px`;
    shell.querySelector<HTMLElement>('[data-optical-export-size]')!.textContent = dimensions;
    shell.querySelectorAll<HTMLSelectElement>('[data-optical-video]').forEach(select => {
      const value = String(next[select.dataset.opticalVideo as NumericKey]);
      if (document.activeElement !== select && select.value !== value) select.value = value;
    });
    const videoDimensions = opticalVideoDimensions(next.aspect, next.videoLongEdge).join(' × ');
    shell.querySelector<HTMLElement>('[data-optical-video-size]')!.textContent = `${videoDimensions} px`;
    shell.querySelector<HTMLElement>('[data-optical-video-range]')!.textContent = `0 – ${valueText(next.duration)}초 · ${Math.ceil(next.duration * next.videoFps - 1e-7)} 프레임`;
    shell.querySelector<HTMLElement>('[data-optical-video-summary]')!.textContent = `${videoDimensions} · ${next.videoFps} fps · ${valueText(next.duration)}초`;
    if (!videoBusy && !videoPending) videoLabel.textContent = `${next.videoLongEdge === 1920 ? '2K' : '4K'} MP4 저장`;
    shell.querySelector<HTMLElement>('[data-optical-viewport-aspect]')!.textContent = OPTICAL_ASPECTS.find(preset=>preset.id===next.aspect)?.label ?? '1:1';
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
    if (!busy && target === color) actions.change('lightColor', color.value);
    if (!busy && target === colorHex) {
      const valid = normalizeLightColor(colorHex.value);
      colorHex.setAttribute('aria-invalid', String(!valid));
      if (valid) actions.change('lightColor', valid);
    }
    if (!busy && target instanceof HTMLInputElement && (target.dataset.opticalRange || target.dataset.opticalNumber)) inputChanged(target, false);
  }, listenerOptions);
  shell.addEventListener('change', (event) => {
    const target = event.target;
    if (busy) return;
    if (target === cycle) actions.change('lightCycle', cycle.checked);
    if (target instanceof HTMLInputElement && target.dataset.opticalNumber) inputChanged(target, true);
    if (target === aspect) actions.change('aspect', aspect.value);
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
      case 'reference':
        try {
          actions.applyReference?.();
          status('레퍼런스 무드를 적용했습니다.');
        } catch (error) {
          status(error instanceof Error ? error.message : '무드를 적용할 수 없습니다.');
        }
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
    status,
    videoProgress,
    dispose() {
      disposed = true;
      events.abort();
      shell.remove();
    },
  };
}
