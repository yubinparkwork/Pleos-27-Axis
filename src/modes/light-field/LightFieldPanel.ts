import type { LightFieldPresetId, LightFieldState } from "./LightFieldState";

interface PanelActions {
  change(): void;
  preset(id: LightFieldPresetId): void;
  export(): void;
  sequence(): void;
  saveVariation(): void;
}

const control = (label: string, path: string, min: number, max: number, step: number) => `<div class="property-row"><label>${label}</label><input aria-label="${label}" type="range" data-field-bind="${path}" min="${min}" max="${max}" step="${step}"><input aria-label="${label} 값" type="number" data-field-bind="${path}" min="${min}" max="${max}" step="${step}"></div>`;

function getPath(state: LightFieldState, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], state);
}

function setPath(state: LightFieldState, path: string, value: number | boolean | string): void {
  const keys = path.split(".");
  const target = keys.slice(0, -1).reduce<Record<string, unknown>>((current, key) => current[key] as Record<string, unknown>, state as unknown as Record<string, unknown>);
  target[keys.at(-1) as string] = value;
}

export class LightFieldPanel {
  constructor(private readonly root: HTMLElement, private readonly state: LightFieldState, private readonly actions: PanelActions) {
    this.root.innerHTML = this.template();
    this.bind();
    this.sync();
  }

  sync(): void {
    this.root.querySelectorAll<HTMLInputElement>("[data-field-bind]").forEach((input) => {
      const value = getPath(this.state, input.dataset.fieldBind ?? "");
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    });
    const preset = this.root.querySelector<HTMLSelectElement>("[data-field-preset]");
    if (preset) preset.value = this.state.preset;
    const size = this.root.querySelector<HTMLElement>("[data-field-output-size]");
    if (size) size.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }

  focusExport(): void { this.root.querySelector<HTMLElement>("[data-field-output]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  private bind(): void {
    this.root.querySelector<HTMLSelectElement>("[data-field-preset]")?.addEventListener("change", (event) => this.actions.preset((event.currentTarget as HTMLSelectElement).value as LightFieldPresetId));
    this.root.querySelectorAll<HTMLInputElement>("[data-field-bind]").forEach((input) => input.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLInputElement;
      const path = target.dataset.fieldBind ?? "";
      const value = target.type === "checkbox" ? target.checked : target.type === "color" ? target.value : Number(target.value);
      setPath(this.state, path, value);
      this.root.querySelectorAll<HTMLInputElement>(`[data-field-bind="${path}"]`).forEach((peer) => {
        if (peer !== target) peer.type === "checkbox" ? peer.checked = Boolean(value) : peer.value = String(value);
      });
      this.actions.change();
      this.sync();
    }));
    this.root.querySelector<HTMLElement>("[data-field-export]")?.addEventListener("click", () => this.actions.export());
    this.root.querySelector<HTMLElement>("[data-field-sequence]")?.addEventListener("click", () => this.actions.sequence());
    this.root.querySelector<HTMLElement>("[data-field-save-variation]")?.addEventListener("click", () => this.actions.saveVariation());
  }

  private template(): string {
    return `<aside class="control-dock light-field-panel" data-mode-panel="light-field">
      <div class="inspector-header"><div><strong>라이트 필드</strong><span>아이리데슨트 멤브레인 · 3패스</span></div></div>
      <div class="inspector-views">
        <section class="studio-section"><header><h2>프리셋</h2><p>PLEOS 큐브 표면에 적용되는 스펙트럴 막</p></header><label class="select-row"><span>스타일</span><select data-field-preset><option value="iridescent-pulse">아이리데슨트 펄스</option><option value="violet-membrane">바이올렛 멤브레인</option><option value="spectral-white">스펙트럴 화이트</option></select></label><button class="wide-button" data-field-save-variation>현재 변형 저장</button></section>
        <section class="studio-section"><header><h2>흐름 구조</h2><p>세 면을 끊지 않고 통과하는 비정형 막과 내부 보이드</p></header>
          ${control("큐브 크기", "field.massScale", .7, 1.8, .01)}
          ${control("큐브 간격", "geometry.cubeGap", 0, .4, .005)}
          ${control("베벨", "geometry.bevel", 0, .22, .002)}
          ${control("막 크기", "field.membraneScale", .5, 2, .01)}
          ${control("접힘 빈도", "field.foldFrequency", 1, 6, .05)}
          ${control("보이드 크기", "field.voidSize", .08, .9, .01)}
          ${control("백색 림 폭", "field.rimWidth", .025, .3, .005)}
          ${control("잔상 윤곽", "field.echoStrength", 0, 1, .01)}
        </section>
        <details class="studio-section field-details" open><summary>색·광량</summary><div>
          ${control("암부", "color.darkness", 0, 1, .01)}
          ${control("바이올렛", "color.violet", 0, 1, .01)}
          ${control("마젠타", "color.magenta", 0, 1, .01)}
          ${control("시안", "color.cyan", 0, 1, .01)}
          ${control("그린", "color.green", 0, 1, .01)}
          ${control("화이트 코어", "color.whiteCore", 0, 1, .01)}
          ${control("채도", "color.saturation", 0, 1, .01)}
        </div></details>
        <section class="studio-section"><header><h2>모션</h2><p>결정적 루프 · 시작 프레임과 끝 프레임 동일</p></header>${control("속도", "motion.speed", .1, 3, .05)}${control("변형 강도", "motion.strength", 0, 1, .01)}${control("길이", "motion.duration", 8, 16, .1)}<label class="toggle-row"><span>모션 사용</span><input type="checkbox" data-field-bind="motion.enabled"></label></section>
        <details class="studio-section field-details"><summary>고급 표면 설정</summary><div>
          ${control("비대칭", "advanced.asymmetry", 0, 1, .01)}
          ${control("면 깊이", "advanced.depth", .2, 1, .01)}
          ${control("중심 편향", "advanced.centerBias", 0, 1, .01)}
          ${control("왜곡", "advanced.warp", 0, 1, .01)}
          ${control("접촉 암부", "advanced.contactShadow", 0, 1, .01)}
          ${control("확산", "field.diffusion", 0, 1, .01)}
          ${control("블룸", "advanced.bloom", 0, .6, .01)}
          ${control("디더링", "advanced.dither", 0, 1, .01)}
        </div></details>
        <section class="studio-section"><header><h2>아트보드</h2><p>모드 전환 시 공통으로 유지되는 판형</p></header><div class="dimension-grid"><label>너비<input type="number" data-field-bind="artboard.width" min="16" max="8192" step="1"></label><label>높이<input type="number" data-field-bind="artboard.height" min="16" max="8192" step="1"></label></div>${control("구조 크기", "artboard.scale", .25, 2, .01)}<label class="toggle-row"><span>투명 배경</span><input type="checkbox" data-field-bind="artboard.transparent"></label><label class="select-row"><span>배경</span><input type="color" data-field-bind="artboard.background"></label></section>
        <section class="studio-section" data-field-output><header><h2>이미지 내보내기</h2><p>현재 아트보드와 정확히 같은 픽셀 크기</p></header><div class="export-summary"><span>PNG</span><b data-field-output-size></b></div>${control("PPI", "export.ppi", 72, 600, 1)}<button class="wide-button primary" data-field-export>PNG 내보내기</button><button class="wide-button" data-field-sequence>시퀀스 명령 복사</button></section>
      </div>
    </aside>`;
  }
}
