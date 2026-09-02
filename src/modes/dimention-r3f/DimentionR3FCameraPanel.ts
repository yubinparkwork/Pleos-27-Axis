import type { DimentionR3FState } from "./DimentionR3FState";

interface Actions { change(): void; center(): void; reset(): void; collapse(collapsed: boolean): void }
const property = (label: string, path: string, min: number, max: number, step: number) => `<div class="property-row"><label>${label}</label><input aria-label="${label}" type="range" data-r3f-camera="${path}" min="${min}" max="${max}" step="${step}"><input aria-label="${label} 값" type="number" data-r3f-camera="${path}" min="${min}" max="${max}" step="${step}"></div>`;
const pathValue = (state: DimentionR3FState, path: string): number => path.split(".").reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], state) as number;
function setPath(state: DimentionR3FState, path: string, value: number): void { const keys = path.split("."); const target = keys.slice(0, -1).reduce<Record<string, unknown>>((current, key) => current[key] as Record<string, unknown>, state as unknown as Record<string, unknown>); target[keys.at(-1) as string] = value; }

export class DimentionR3FCameraPanel {
  constructor(private readonly root: HTMLElement, private readonly state: DimentionR3FState, private readonly actions: Actions) { this.root.innerHTML = this.template(); this.bind(); this.sync(); }
  sync(): void {
    this.root.querySelectorAll<HTMLInputElement>("[data-r3f-camera]").forEach((input) => { input.value = String(pathValue(this.state, input.dataset.r3fCamera ?? "")); });
    const orbit = this.root.querySelector<HTMLInputElement>("[data-r3f-camera-orbit]"); if (orbit) orbit.checked = this.state.camera.freeOrbit;
    const mode = this.root.querySelector<HTMLElement>("[data-r3f-camera-mode]"); if (mode) mode.textContent = this.state.camera.freeOrbit ? "자유 시점" : "아이소메트릭 고정";
    const help = this.root.querySelector<HTMLElement>("[data-r3f-camera-help]"); if (help) help.textContent = this.state.camera.freeOrbit ? "캔버스 드래그 · 자동 저장" : "평행 이동 · 중앙 줌";
    const status = this.root.querySelector<HTMLElement>("[data-r3f-camera-status]"); if (status) status.textContent = this.state.camera.freeOrbit ? "회전" : "활성";
  }
  private bind(): void {
    this.root.querySelectorAll<HTMLInputElement>("[data-r3f-camera]").forEach((input) => input.addEventListener("input", (event) => { const target = event.currentTarget as HTMLInputElement; const path = target.dataset.r3fCamera ?? ""; const value = Number(target.value); setPath(this.state, path, value); this.root.querySelectorAll<HTMLInputElement>(`[data-r3f-camera="${path}"]`).forEach((peer) => { if (peer !== target) peer.value = String(value); }); this.actions.change(); }));
    this.root.querySelector<HTMLInputElement>("[data-r3f-camera-orbit]")?.addEventListener("change", (event) => { this.state.camera.freeOrbit = (event.currentTarget as HTMLInputElement).checked; this.actions.change(); });
    this.root.querySelector("[data-r3f-camera-center]")?.addEventListener("click", () => this.actions.center());
    this.root.querySelector("[data-r3f-camera-reset]")?.addEventListener("click", () => this.actions.reset());
    this.root.querySelector("[data-r3f-camera-close]")?.addEventListener("click", () => this.actions.collapse(true));
    this.root.querySelector("[data-r3f-camera-open]")?.addEventListener("click", () => this.actions.collapse(false));
  }
  private template(): string { return `<aside class="workspace-panel structure-panel dimention-camera-panel" aria-label="카메라 및 컴포지션 패널"><header class="panel-header"><div><strong>카메라</strong><span>화면·구도</span></div><button data-r3f-camera-close title="카메라 패널 접기" aria-label="카메라 패널 접기">‹</button></header><div class="panel-scroll"><div class="axis-overview" aria-label="카메라 상태"><span class="axis-node"></span><div><strong data-r3f-camera-mode>아이소메트릭 고정</strong><small data-r3f-camera-help>평행 이동 · 중앙 줌</small></div><b data-r3f-camera-status>활성</b></div><section class="studio-section"><header><h2>카메라</h2><p>캔버스 휠로 중앙 기준 줌, 자유 시점에서 드래그 회전</p></header><label class="toggle-row"><span>자유 시점 회전</span><input aria-label="자유 시점 회전" type="checkbox" data-r3f-camera-orbit></label>${property("수평 회전", "camera.orbitYaw", -180, 180, .1)}${property("수직 회전", "camera.orbitPitch", -80, 80, .1)}${property("카메라 줌", "camera.orbitZoom", .25, 4, .01)}${property("미리보기 확대", "artboard.previewZoom", .5, 1.8, .05)}${property("수평 이동", "camera.panX", -3, 3, .01)}${property("수직 이동", "camera.panY", -3, 3, .01)}<button class="compact-action" data-r3f-camera-center>카메라 위치 중앙 정렬</button><button class="compact-action" data-r3f-camera-reset>카메라 시점 초기화</button></section><section class="studio-section"><header><h2>구도</h2><p>공통 Axis 기준점과 출력 화면의 배치를 조절합니다</p></header>${property("그래픽 크기", "artboard.scale", .25, 2, .01)}${property("그래픽 가로 위치", "artboard.axisAnchor.gridX", 0, 1, .01)}${property("그래픽 세로 위치", "artboard.axisAnchor.gridY", 0, 1, .01)}</section></div><button class="panel-rail-button" data-r3f-camera-open title="카메라 패널 펼치기" aria-label="카메라 패널 펼치기">›</button></aside>`; }
}
