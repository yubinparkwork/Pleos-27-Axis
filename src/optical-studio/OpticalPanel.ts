import type { OpticalState } from './OpticalState';
import { OPTICAL_DIMENSION_KEYS, OPTICAL_ZOOM_RANGE, normalizeLightColor } from './OpticalState';
import { CYCLE_NAMES, writeLightWeights } from './OpticalLighting';
import './OpticalStudio.css';

type NumericKey = {
  [Key in keyof OpticalState]: OpticalState[Key] extends number ? Key : never
}[keyof OpticalState];

export interface OpticalPanelActions {
  change(key: keyof OpticalState, value: number | boolean | string): void;
  exportPng(): Promise<void>;
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

const controls: Control[] = [
  { key: 'gap', label: '큐브 간격', min: 0, max: 0.4, step: 0.005 },
  { key: 'bevel', label: '모서리 곡률', min: 0, max: 0.6, step: 0.005 },
  { key: 'ior', label: '굴절률', min: 1, max: 2.5, step: 0.01 },
  { key: 'dispersion', label: '색 분산', min: 0, max: 0.15, step: 0.001 },
  { key: 'roughness', label: '광학 확산', min: 0, max: 0.3, step: 0.005 },
  { key: 'surfaceCurvature', label: '면 곡률', min: 0, max: 0.24, step: 0.005, describedBy: 'optical-curvature-help' },
  { key: 'reflection', label: '반사 강도', min: 0, max: 2, step: 0.01 },
  { key: 'absorption', label: '빛 흡수', min: 0, max: 2, step: 0.01 },
  { key: 'bounces', label: '광선 추적 한도', min: 1, max: 16, step: 1, describedBy: 'optical-bounces-help' },
  { key: 'dimensionTop', label: '상단 큐브', min: 0, max: 12, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
  { key: 'dimensionLeft', label: '왼쪽 큐브', min: 0, max: 12, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
  { key: 'dimensionRight', label: '오른쪽 큐브', min: 0, max: 12, step: 0.05, unit: '겹', describedBy: 'optical-dimension-help' },
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
  { key: 'azimuth', label: '수평 회전', min: -180, max: 180, step: 0.1, unit: '°' },
  { key: 'elevation', label: '수직 회전', min: -80, max: 80, step: 0.1, unit: '°' },
  { key: 'duration', label: '재생 길이', min: 1, max: 30, step: 0.5, unit: '초' },
  { key: 'speed', label: '조명 이동폭', min: 0, max: 1, step: 0.05, unit: '×' },
];

const controlByKey = new Map(controls.map((control) => [control.key, control]));
const aspectSizes: Record<string, string> = {
  main: '3840 × 3840',
  '4x5': '3072 × 3840',
  '9x16': '2160 × 3840',
  '16x9': '3840 × 2160',
};

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
  return `<input id="optical-${control.key}-number" data-optical-number="${control.key}" type="number" inputmode="decimal" min="${control.min}" max="${control.max}" step="${control.step}" value="${valueText(state[control.key], control.step)}" aria-label="${control.label}${control.unit ? ` (${control.unit})` : ''}"${control.describedBy ? ` aria-describedby="${control.describedBy}"` : ''}${compact ? ' class="optical-compact-number"' : ''}>`;
}

function controlRow(key: NumericKey, state: OpticalState): string {
  const control = controlByKey.get(key)!;
  return `<div class="optical-control">
    <label for="optical-${key}-number">${control.label}</label>
    <input data-optical-range="${key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${state[key]}" aria-label="${control.label} 슬라이더"${control.describedBy ? ` aria-describedby="${control.describedBy}"` : ''}>
    <span class="optical-number-wrap">${numericInput(control, state)}${control.unit ? `<span class="optical-unit" aria-hidden="true">${control.unit}</span>` : ''}</span>
  </div>`;
}

function section(id: string, title: string, english: string, content: string, open = false): string {
  if (id === 'lighting') content = `<label class="optical-cycle-toggle"><input type="checkbox" data-optical-cycle aria-describedby="optical-cycle-help">RGB 주도색 순환</label><p class="optical-section-note" data-optical-cycle-status></p><p id="optical-cycle-help" class="optical-section-note">선택한 색을 시작으로 메인 80% · 서브 각 10%의 광량이 교대합니다. 아래 재생 길이가 한 바퀴이며, 재생 버튼으로 시작합니다. 색상은 시작 계열의 조명에 적용됩니다.</p>${content}`;
  return `<details class="optical-section" data-optical-section="${id}"${open ? ' open' : ''}>
    <summary><span>${title}</span><span class="optical-section-en" lang="en">${english}</span><span class="optical-chevron" aria-hidden="true"></span></summary>
    <div class="optical-section-content">${content}</div>
  </details>`;
}

/** Owns only the studio DOM. Rendering, persistence and camera gestures belong to the app. */
export function mountOpticalPanel(root: HTMLElement, state: OpticalState, actions: OpticalPanelActions): {
  update(state: OpticalState): void;
  status(message: string, busy?: boolean): void;
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
          <canvas id="optical-canvas" aria-label="세 개의 유리 큐브로 이루어진 Axis 실시간 미리보기"></canvas>
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
            <label class="optical-format-control"><span>화면 비율</span><select data-optical-aspect aria-label="화면 비율"><option value="main">1:1</option><option value="4x5">4:5</option><option value="9x16">9:16</option><option value="16x9">16:9</option></select></label>
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
          ${section('geometry', '형태', 'Geometry', `<p class="optical-section-note">세 개의 큐브, 하나의 Axis</p>${controlRow('gap', state)}${controlRow('bevel', state)}`)}
          ${section('dimensions', '디멘션 레이어', 'Layers', `<p id="optical-dimension-help" class="optical-section-note">큐브 안쪽 결을 따르는 빛의 층입니다. 0겹은 층만 끄며, 소수 값은 마지막 층을 부드럽게 나타냅니다.</p>${OPTICAL_DIMENSION_KEYS.map((key) => controlRow(key, state)).join('')}<details class="optical-layer-advanced"><summary>층의 형태 조정</summary>${['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight', 'dimensionSoftness', 'dimensionFalloff'].map(key => controlRow(key as NumericKey, state)).join('')}<p class="optical-section-note">층 간격은 큐브마다 따로 적용됩니다. 층 풀림·깊이 감쇠는 세 큐브 공통입니다. 큐브나 불투명 면을 추가하지 않는 광학적 연출입니다.</p></details>`, true)}
          ${section('optics', '광학', 'Optics', `<button type="button" data-optical-action="reference" class="optical-text-button"${actions.applyReference ? '' : ' disabled'} aria-describedby="optical-reference-help">레퍼런스 무드 적용</button><p id="optical-reference-help" class="optical-section-note">카메라·배치·판형은 유지하고 유리·조명·곡률을 조정합니다.</p>${['ior', 'dispersion', 'roughness', 'surfaceCurvature'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-curvature-help" class="optical-section-note">연마 유리의 완만한 렌즈 효과를 표면 법선으로 근사합니다. 0이면 평면 법선을 사용하며, 큐브 외곽과 Axis 구조는 변하지 않습니다.</p>${['reflection', 'absorption', 'bounces'].map((key) => controlRow(key as NumericKey, state)).join('')}<p id="optical-bounces-help" class="optical-section-note">실제 유리 광선의 계산 횟수입니다. 디멘션 레이어 수와는 별도입니다.</p>`, true)}
          ${section('lighting', '조명', 'Lighting', `<div class="optical-color-control"><label for="optical-light-color">조명 색상</label><input id="optical-light-color" data-optical-color type="color" value="${state.lightColor}" aria-label="조명 색상 선택"><input data-optical-color-hex type="text" value="${state.lightColor}" maxlength="7" spellcheck="false" aria-label="조명 색상 HEX" aria-describedby="optical-color-help"></div><div class="optical-light-swatches" aria-label="Pleos 조명 색상">${[['#FFFFFF','화이트'],['#FFCDD7','레드 1'],['#FA293C','레드 2'],['#B4FFD2','그린 1'],['#0ADC91','그린 2'],['#CDDCFF','블루 1'],['#2350FF','블루 3']].map(([hex,label])=>`<button type="button" data-optical-light-swatch="${hex}" aria-label="Pleos ${label}" title="Pleos ${label} ${hex}" style="--swatch:${hex}"></button>`).join('')}</div><p id="optical-color-help" class="optical-section-note">여러 방향의 광원을 하나의 색상·강도로 조정합니다. 화이트에서 색 분산이 가장 잘 보입니다.</p>${controlRow('lightIntensity', state)}${controlRow('lightSpread', state)}${controlRow('exposure', state)}${controlRow('bloom', state)}<p id="optical-bloom-help" class="optical-section-note">밝은 반사광의 부드러운 번짐입니다. 0이면 번짐을 끕니다.</p>`, true)}
          ${section('camera', '카메라', 'Camera', ['zoom', 'azimuth', 'elevation'].map((key) => controlRow(key as NumericKey, state)).join(''))}
          ${section('output', '출력', 'Output', '<p class="optical-section-note">현재 화면 비율과 재생 위치로 저장합니다.</p><dl class="optical-output-details"><div><dt>파일 형식</dt><dd>PNG</dd></div><div><dt>해상도</dt><dd data-optical-resolution>3840 × 3840 px</dd></div></dl>')}
        </div>
        <div class="optical-export-area">
          <p class="optical-status" role="status" aria-live="polite" aria-atomic="true" data-optical-status>실시간 미리보기</p>
          <button type="button" data-optical-action="export" class="optical-export-button">${icons.export}<span data-optical-export-label>4K PNG 저장</span></button>
          <p class="optical-export-description"><span data-optical-export-size>3840 × 3840</span><span>PNG · 긴 변 4K</span></p>
        </div>
      </aside>
    </div>`;
  root.replaceChildren(shell);

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
  const play = shell.querySelector<HTMLButtonElement>('[data-optical-action="play"]')!;
  const currentTime = shell.querySelector<HTMLOutputElement>('[data-optical-time]')!;
  const color = shell.querySelector<HTMLInputElement>('[data-optical-color]')!;
  const colorHex = shell.querySelector<HTMLInputElement>('[data-optical-color-hex]')!;
  const cycle = shell.querySelector<HTMLInputElement>('[data-optical-cycle]')!;
  const cycleStatus = shell.querySelector<HTMLElement>('[data-optical-cycle-status]')!;
  const cycleWeights = new Float32Array(3);
  let currentState = state;
  let busy = false;
  let exportPending = false;
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

  function status(message: string, isBusy = false): void {
    if (disposed) return;
    busy = isBusy || exportPending;
    statusNode.textContent = message;
    statusNode.dataset.state = busy ? 'busy' : /오류|실패|error|failed/i.test(message) ? 'error' : 'ready';
    exportButton.setAttribute('aria-busy', String(busy));
    exportLabel.textContent = busy ? 'PNG 저장 중…' : '4K PNG 저장';
    shell.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button:not([data-optical-action="inspector"])').forEach((control) => { control.disabled = busy; });
    shell.querySelector<HTMLButtonElement>('[data-optical-action="reference"]')!.disabled = busy || !actions.applyReference;
  }

  function update(next: OpticalState): void {
    if (disposed) return;
    currentState = next;
    cycle.checked = next.lightCycle;
    shell.querySelector<HTMLElement>('#optical-color-help')!.textContent = next.lightCycle
      ? '선택한 색은 시작 계열에 유지됩니다. 다른 두 계열은 Pleos 레드 2·그린 2·블루 3 중에서 사용합니다. 비중은 화면 면적이 아닌 광량 기준입니다.'
      : '여러 방향의 광원을 하나의 색상·강도로 조정합니다. 화이트에서 색 분산이 가장 잘 보입니다.';
    writeLightWeights(next, cycleWeights);
    cycleStatus.textContent = next.lightCycle
      ? `${next.playing ? '순환 중' : '일시 정지'} · ${CYCLE_NAMES.map((name, i) => `${name} ${Math.round(cycleWeights[i] * 100)}%`).join(' / ')}`
      : '단일 색상 조명 · 기존 설정 유지';
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
      if ((OPTICAL_DIMENSION_KEYS as readonly string[]).includes(key)) input.setAttribute('aria-valuetext', `${value}겹${value === 0 ? ', 디멘션 레이어 없음' : ''}`);
    }
    currentTime.value = timeText(next.time);
    shell.querySelector<HTMLElement>('[data-optical-duration]')!.textContent = timeText(next.duration);
    aspect.value = next.aspect;
    const dimensions = aspectSizes[next.aspect] ?? aspectSizes.main;
    shell.querySelector<HTMLElement>('[data-optical-resolution]')!.textContent = `${dimensions} px`;
    shell.querySelector<HTMLElement>('[data-optical-export-size]')!.textContent = dimensions;
    shell.querySelector<HTMLElement>('[data-optical-viewport-aspect]')!.textContent = next.aspect === 'main' ? '1:1' : next.aspect.replace('x', ':');
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
    const next = key === 'bounces' ? Math.round(clamped) : clamped;
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
    }
  }, listenerOptions);

  if (matchMedia('(max-width: 700px)').matches) setInspector(true);
  update(state);

  return {
    update,
    status,
    dispose() {
      disposed = true;
      events.abort();
      shell.remove();
    },
  };
}
