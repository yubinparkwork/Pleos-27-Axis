import type { AxisTrailsPresetId, AxisTrailsState } from "./AxisTrailsState";

interface Actions { change(): void; preset(id: AxisTrailsPresetId): void; reset(): void; export(): void }
const control = (label: string, path: string, min: number, max: number, step: number) => `<div class="property-row"><label>${label}</label><input aria-label="${label}" type="range" data-trails-bind="${path}" min="${min}" max="${max}" step="${step}"><input aria-label="${label} 값" type="number" data-trails-bind="${path}" min="${min}" max="${max}" step="${step}"></div>`;
const getPath = (state: AxisTrailsState, path: string): unknown => path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], state);
function setPath(state: AxisTrailsState, path: string, value: number | boolean): void { const keys = path.split("."); const target = keys.slice(0, -1).reduce<Record<string, unknown>>((value, key) => value[key] as Record<string, unknown>, state as unknown as Record<string, unknown>); target[keys.at(-1) as string] = value; }

export class AxisTrailsPanel {
  constructor(private readonly root: HTMLElement, private readonly state: AxisTrailsState, private readonly actions: Actions) { this.root.innerHTML = this.template(); this.bind(); this.sync(); }
  sync(): void {
    this.root.querySelectorAll<HTMLInputElement>("[data-trails-bind]").forEach((input) => { const value = getPath(this.state, input.dataset.trailsBind ?? ""); if (input.type === "checkbox") input.checked = Boolean(value); else input.value = String(value); });
    const preset = this.root.querySelector<HTMLSelectElement>("[data-trails-preset]"); if (preset) preset.value = this.state.preset;
    const size = this.root.querySelector<HTMLElement>("[data-trails-output-size]"); if (size) size.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }
  focusExport(): void { this.root.querySelector<HTMLElement>("[data-trails-output]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  private bind(): void {
    this.root.querySelector<HTMLSelectElement>("[data-trails-preset]")?.addEventListener("change", (event) => this.actions.preset((event.currentTarget as HTMLSelectElement).value as AxisTrailsPresetId));
    this.root.querySelectorAll<HTMLInputElement>("[data-trails-bind]").forEach((input) => input.addEventListener("input", (event) => { const target = event.currentTarget as HTMLInputElement; const path = target.dataset.trailsBind ?? ""; const value = target.type === "checkbox" ? target.checked : Number(target.value); setPath(this.state, path, value); this.root.querySelectorAll<HTMLInputElement>(`[data-trails-bind="${path}"]`).forEach((peer) => { if (peer !== target) peer.type === "checkbox" ? peer.checked = Boolean(value) : peer.value = String(value); }); this.actions.change(); this.sync(); }));
    this.root.querySelector("[data-trails-reset]")?.addEventListener("click", () => this.actions.reset());
    this.root.querySelector("[data-trails-export]")?.addEventListener("click", () => this.actions.export());
  }
  private template(): string {
    return `<aside class="control-dock light-field-panel axis-trails-panel" data-mode-panel="axis-trails"><div class="inspector-header"><div><strong>AXIS TRAILS</strong><span>30° SPRING LINES</span></div></div><div class="inspector-views">
      <section class="studio-section"><header><h2>스타일</h2><p>PLEOS 축 위에서 생성되고 해체되는 커서 추종 튜브</p></header><label class="select-row"><span>프리셋</span><select aria-label="Axis Trails 프리셋" data-trails-preset><option value="pleos-blue">PLEOS Blue</option><option value="spectral-signal">Spectral Signal</option><option value="white-axis">White Axis</option></select></label><button class="wide-button" data-trails-reset>기본값으로 초기화</button></section>
      <section class="studio-section"><header><h2>트레일</h2><p>모든 선은 하나의 공유 원점을 서로 다른 지연값으로 추종합니다</p></header>${control("선 개수", "trails.count", 6, 36, 1)}${control("선 길이", "trails.points", 16, 64, 1)}${control("튜브 두께", "trails.width", .004, .045, .001)}${control("점 간격", "trails.spacing", .025, .16, .005)}${control("불투명도", "trails.opacity", .15, 1, .01)}</section>
      <section class="studio-section"><header><h2>축 모션</h2><p>이동 벡터가 승인된 30° 방향군으로 수렴합니다</p></header>${control("탄성", "motion.stiffness", 4, 36, .5)}${control("감쇠", "motion.damping", .6, .96, .005)}${control("축 고정", "motion.axisLock", 0, 1, .01)}${control("커서 반응", "motion.cursorInfluence", 0, 1, .01)}${control("자동 움직임", "motion.autonomous", 0, 1, .01)}${control("속도", "motion.speed", .2, 2.5, .05)}<label class="toggle-row"><span>모션 사용</span><input aria-label="Axis Trails 모션" type="checkbox" data-trails-bind="motion.enabled"></label></section>
      <section class="studio-section"><header><h2>빛</h2><p>튜브의 코어와 잔상만 제한적으로 발광합니다</p></header>${control("블룸", "look.bloom", 0, 1.6, .01)}${control("노출", "look.exposure", .4, 2, .01)}${control("축 가이드", "look.guideOpacity", 0, .45, .01)}${control("공유 원점", "look.originGlow", 0, 1, .01)}</section>
      <section class="studio-section"><header><h2>아트보드</h2><p>다른 PLEOS 모드와 판형을 공유합니다</p></header><div class="dimension-grid"><label>W<input aria-label="아트보드 너비" type="number" data-trails-bind="artboard.width" min="16" max="8192" step="1"></label><label>H<input aria-label="아트보드 높이" type="number" data-trails-bind="artboard.height" min="16" max="8192" step="1"></label></div>${control("구조 크기", "artboard.scale", .25, 2, .01)}<label class="toggle-row"><span>투명 배경</span><input aria-label="투명 배경" type="checkbox" data-trails-bind="artboard.transparent"></label></section>
      <section class="studio-section" data-trails-output><header><h2>이미지 내보내기</h2><p>현재 모션 프레임을 PNG로 저장합니다</p></header><div class="export-summary"><span>PNG</span><b data-trails-output-size></b></div>${control("PPI", "export.ppi", 72, 600, 1)}<button class="wide-button primary" data-trails-export>PNG 내보내기</button></section>
    </div></aside>`;
  }
}
