import type { KineticGlassPresetId, KineticGlassState } from "./KineticGlassState";

interface Actions { change(): void; preset(id: KineticGlassPresetId): void; resetPhysics(): void; resetAll(): void; export(): void }
const control = (label: string, path: string, min: number, max: number, step: number) => `<div class="property-row"><label>${label}</label><input aria-label="${label}" type="range" data-kinetic-bind="${path}" min="${min}" max="${max}" step="${step}"><input aria-label="${label} 값" type="number" data-kinetic-bind="${path}" min="${min}" max="${max}" step="${step}"></div>`;
const pathValue = (state: KineticGlassState, path: string): unknown => path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], state);
function setPath(state: KineticGlassState, path: string, value: number | boolean): void { const keys = path.split("."); const target = keys.slice(0, -1).reduce<Record<string, unknown>>((current, key) => current[key] as Record<string, unknown>, state as unknown as Record<string, unknown>); target[keys.at(-1) as string] = value; }

export class KineticGlassPanel {
  constructor(private readonly root: HTMLElement, private readonly state: KineticGlassState, private readonly actions: Actions) { this.root.innerHTML = this.template(); this.bind(); this.sync(); }
  sync(): void {
    this.root.querySelectorAll<HTMLInputElement>("[data-kinetic-bind]").forEach((input) => { const value = pathValue(this.state, input.dataset.kineticBind ?? ""); if (input.type === "checkbox") input.checked = Boolean(value); else input.value = String(value); });
    const preset = this.root.querySelector<HTMLSelectElement>("[data-kinetic-preset]"); if (preset) preset.value = this.state.preset;
    const size = this.root.querySelector<HTMLElement>("[data-kinetic-output-size]"); if (size) size.textContent = `${this.state.artboard.width} × ${this.state.artboard.height}px`;
  }
  focusExport(): void { this.root.querySelector<HTMLElement>("[data-kinetic-output]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  private bind(): void {
    this.root.querySelector<HTMLSelectElement>("[data-kinetic-preset]")?.addEventListener("change", (event) => this.actions.preset((event.currentTarget as HTMLSelectElement).value as KineticGlassPresetId));
    this.root.querySelectorAll<HTMLInputElement>("[data-kinetic-bind]").forEach((input) => input.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLInputElement, path = target.dataset.kineticBind ?? "";
      const value = target.type === "checkbox" ? target.checked : Number(target.value); setPath(this.state, path, value);
      this.root.querySelectorAll<HTMLInputElement>(`[data-kinetic-bind="${path}"]`).forEach((peer) => { if (peer !== target) { if (peer.type === "checkbox") peer.checked = Boolean(value); else peer.value = String(value); } });
      this.actions.change(); this.sync();
    }));
    this.root.querySelector("[data-kinetic-reset-physics]")?.addEventListener("click", () => this.actions.resetPhysics());
    this.root.querySelector("[data-kinetic-reset-all]")?.addEventListener("click", () => this.actions.resetAll());
    this.root.querySelector("[data-kinetic-export]")?.addEventListener("click", () => this.actions.export());
  }
  private template(): string {
    return `<aside class="control-dock light-field-panel kinetic-glass-panel" data-mode-panel="kinetic-glass"><div class="inspector-header"><div><strong>KINETIC GLASS</strong><span>THREE.JS · RAPIER</span></div></div><div class="inspector-views">
      <section class="studio-section"><header><h2>프리셋</h2><p>물리 반응과 유리 감도의 시작점</p></header><label class="select-row"><span>프리셋</span><select aria-label="Kinetic Glass 프리셋" data-kinetic-preset><option value="clear-attraction">Clear Attraction</option><option value="pleos-prism">PLEOS Prism</option><option value="dark-mass">Dark Mass</option></select></label><button class="wide-button" data-kinetic-reset-all>기본값으로 초기화</button></section>
      <section class="studio-section"><header><h2>물리 반응</h2><p>커서가 큐브를 밀고 세 축의 원래 위치로 복원됩니다</p></header>${control("중심 인력", "physics.attraction", .5, 18, .1)}${control("감쇠", "physics.damping", .2, 6, .05)}${control("반발", "physics.restitution", 0, 1, .01)}${control("커서 반경", "physics.interactionRadius", .2, 1.8, .01)}${control("밀어내는 힘", "physics.interactionStrength", .2, 7, .05)}<button class="wide-button" data-kinetic-reset-physics>큐브 위치 초기화</button></section>
      <section class="studio-section"><header><h2>유리</h2><p>HDR 스튜디오 반사와 물리 기반 투과 재질</p></header>${control("거칠기", "material.roughness", 0, .45, .005)}${control("투과", "material.transmission", 0, 1, .01)}${control("두께", "material.thickness", .1, 4, .05)}${control("IOR", "material.ior", 1.01, 2.2, .005)}${control("분산", "material.dispersion", 0, 1, .01)}${control("불투명도", "material.opacity", .1, 1, .01)}${control("환경 반사", "material.environment", 0, 5, .05)}</section>
      <section class="studio-section"><header><h2>구조와 조명</h2><p>PLEOS 30° 축과 공유 접점 배치</p></header>${control("큐브 크기", "geometry.scale", .65, 1.35, .01)}${control("큐브 갭", "geometry.gap", 0, .5, .005)}${control("베벨", "geometry.bevel", 0, .22, .005)}${control("노출", "lighting.exposure", .35, 2.5, .01)}${control("블룸", "lighting.bloom", 0, .6, .01)}<label class="toggle-row"><span>물리 모션</span><input aria-label="물리 모션" type="checkbox" data-kinetic-bind="motion.enabled"></label></section>
      <section class="studio-section"><header><h2>아트보드</h2><p>미리보기와 PNG 출력이 같은 구도를 공유합니다</p></header><div class="dimension-grid"><label>W<input aria-label="아트보드 너비" type="number" data-kinetic-bind="artboard.width" min="16" max="8192" step="1"></label><label>H<input aria-label="아트보드 높이" type="number" data-kinetic-bind="artboard.height" min="16" max="8192" step="1"></label></div>${control("구조 크기", "artboard.scale", .25, 2, .01)}<label class="toggle-row"><span>투명 배경</span><input aria-label="투명 배경" type="checkbox" data-kinetic-bind="artboard.transparent"></label></section>
      <section class="studio-section" data-kinetic-output><header><h2>이미지 내보내기</h2><p>현재 물리 상태를 PNG로 저장</p></header><div class="export-summary"><span>PNG</span><b data-kinetic-output-size></b></div>${control("PPI", "export.ppi", 72, 600, 1)}<button class="wide-button primary" data-kinetic-export>PNG 내보내기</button></section>
    </div></aside>`;
  }
}
