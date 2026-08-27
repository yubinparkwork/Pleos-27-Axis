import type { LightingGlobals, LightingPresetName, LightingSystem, PleosLightData, PleosLightType } from "./LightingSystem";
import { PLEOS_BRAND_COLORS } from "./LightingSystem";
import { bindScrubbableNumbers } from "./InspectorScrub";

type GizmoMode = "translate" | "rotate";

const PRESETS: Array<{ id: Exclude<LightingPresetName, "custom">; label: string }> = [
  { id: "pleos-rgb", label: "Pleos RGB" }, { id: "pleos-blue", label: "Pleos 블루" },
  { id: "pleos-prism", label: "Pleos 프리즘" }, { id: "dark-studio", label: "어두운 스튜디오" },
  { id: "soft-glass", label: "부드러운 유리" },
];

const TYPES: Array<{ id: PleosLightType; label: string }> = [
  { id: "rect", label: "사각 영역광" }, { id: "spot", label: "스폿 조명" },
  { id: "point", label: "점광원" }, { id: "directional", label: "방향광" },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function localizeLightName(value: string): string {
  const words: Record<string, string> = {
    White: "흰색", Blue: "파랑", Red: "빨강", Green: "초록", Neutral: "무채색",
    Key: "주광", Fill: "보조광", Rim: "윤곽광", Back: "후면광", Side: "측면광",
    Accent: "강조광", Top: "상단광", Bottom: "하단광", Optical: "광학", Hard: "강한",
    Large: "대형", Soft: "부드러운", Light: "조명",
  };
  return value.split(" ").map((word) => words[word] ?? word).join(" ");
}

function localizeColorName(value: string): string {
  return value
    .replace("Light Gray", "밝은 회색")
    .replace("Dark Gray", "어두운 회색")
    .replace("White", "흰색")
    .replace("Black", "검정")
    .replace("Red", "빨강")
    .replace("Green", "초록")
    .replace("Blue", "파랑");
}

export class LightingPanel {
  private readonly host: HTMLElement;
  private readonly lighting: LightingSystem;
  private readonly onGizmoMode: (mode: GizmoMode) => void;

  constructor(host: HTMLElement, lighting: LightingSystem, onGizmoMode: (mode: GizmoMode) => void) {
    this.host = host; this.lighting = lighting; this.onGizmoMode = onGizmoMode; this.render();
  }

  render(): void {
    const state = this.lighting.state; const selected = this.lighting.selected;
    this.host.innerHTML = `
      <div class="light-toolbar"><button data-light-action="add">+ 조명 추가</button><span>${state.lights.filter((light) => light.enabled).length} / ${state.lights.length} 활성</span></div>
      <details class="inspector-section lighting-global-section" open><summary><span><strong>전체 조명</strong><small>장면 전체의 광학 반응</small></span><i></i></summary><div class="section-content lighting-global">
          ${this.slider("global-masterIntensity", "전체 강도", 0, 4, .05, state.globals.masterIntensity)}
          ${this.slider("global-environmentIntensity", "환경광", 0, 3, .05, state.globals.environmentIntensity)}
          ${this.slider("global-exposure", "노출", .2, 3, .05, state.globals.exposure)}
          ${this.slider("global-bloomIntensity", "블룸", 0, 1.5, .01, state.globals.bloomIntensity)}
          ${this.slider("global-colorSaturation", "채도", 0, 2, .05, state.globals.colorSaturation)}
      </div></details>
      <details class="inspector-section"><summary><span><strong>조명 프리셋</strong><small>선택 후 개별 수정 가능</small></span><i></i></summary><div class="section-content"><div class="lighting-presets">${PRESETS.map((preset) => `<button data-lighting-preset="${preset.id}" class="${state.preset === preset.id ? "active" : ""}">${preset.label}</button>`).join("")}</div></div></details>
      <div class="lighting-subhead list-heading"><strong>조명 목록</strong><small>하나를 선택해 편집</small></div>
      <div class="light-list">${state.lights.map((light, index) => this.lightListItem(light, index)).join("")}</div>
      ${selected ? this.editor(selected) : ""}`;
    this.bind();
    bindScrubbableNumbers(this.host);
  }

  refreshValues(): void { this.render(); }

  private lightListItem(light: PleosLightData, index: number): string {
    const displayName = localizeLightName(light.name);
    return `<div class="light-list-item ${light.id === this.lighting.state.selectedId ? "selected" : ""}" data-light-row="${light.id}">
      <button class="light-select" data-light-select="${light.id}"><i style="--light-color:${light.color}"></i><span>${escapeHtml(displayName)}</span><small>${TYPES.find((type) => type.id === light.type)?.label ?? light.type}</small></button>
      <button class="light-icon ${light.enabled ? "enabled" : ""}" data-light-toggle="${light.id}" title="켜기/끄기" aria-label="${escapeHtml(displayName)} 켜기/끄기">${light.enabled ? "●" : "○"}</button>
      <button class="light-icon" data-light-duplicate="${light.id}" title="복제" aria-label="${escapeHtml(displayName)} 복제">＋</button>
      <button class="light-icon" data-light-delete="${light.id}" title="삭제" aria-label="${escapeHtml(displayName)} 삭제" ${this.lighting.state.lights.length <= 1 ? "disabled" : ""}>×</button>
      <b>${String(index + 1).padStart(2, "0")}</b>
    </div>`;
  }

  private editor(light: PleosLightData): string {
    const selectedColor = PLEOS_BRAND_COLORS.find((swatch) => swatch.value.toLowerCase() === light.color.toLowerCase());
    const displayName = localizeLightName(light.name);
    const familyLabels = { Red: "빨강", Green: "초록", Blue: "파랑", Neutral: "무채색" } as const;
    const palette = (["Red", "Green", "Blue", "Neutral"] as const).map((family) => `<div class="palette-family"><small>${familyLabels[family]}</small><div>${PLEOS_BRAND_COLORS.filter((swatch) => swatch.family === family).map((swatch) => `<button data-light-swatch="${swatch.value}" class="${swatch.value.toLowerCase() === light.color.toLowerCase() ? "active" : ""}" title="Pleos ${swatch.name}" aria-label="Pleos ${swatch.name}" style="--swatch:${swatch.value}"></button>`).join("")}</div></div>`).join("");
    const conditional = light.type === "rect" ? this.section("크기", "사각 영역광의 크기", `<div class="xyz-grid two">${this.number("width", "너비", light.width, .05, 20, .05)}${this.number("height", "높이", light.height, .05, 20, .05)}</div>`)
      : light.type === "spot" ? this.section("스폿", "원뿔 범위와 감쇠", `${this.slider("angle", "각도", 1, 89, 1, light.angle)}${this.slider("penumbra", "반그림자", 0, 1, .01, light.penumbra)}${this.slider("distance", "거리", 0, 100, .5, light.distance)}${this.slider("decay", "감쇠", 0, 4, .1, light.decay)}`)
      : light.type === "point" ? this.section("점광원", "거리에 따른 감쇠", `${this.slider("distance", "거리", 0, 100, .5, light.distance)}${this.slider("decay", "감쇠", 0, 4, .1, light.decay)}`) : "";
    return `<div class="light-editor" data-selected-light="${light.id}">
      <div class="selected-light-head"><div><strong>${escapeHtml(displayName)}</strong><small>${TYPES.find((type) => type.id === light.type)?.label}</small></div><div class="gizmo-modes"><button data-gizmo-mode="translate" class="active">이동</button><button data-gizmo-mode="rotate">회전</button></div></div>
      ${this.section("조명", "이름과 유형", `<label class="light-name"><span>이름</span><input data-light-name type="text" maxlength="40" value="${escapeHtml(displayName)}"></label><label class="light-type"><span>유형</span><select data-light-type>${TYPES.map((type) => `<option value="${type.id}" ${light.type === type.id ? "selected" : ""}>${type.label}</option>`).join("")}</select></label><label class="toggle-line"><span>사용</span><input data-light-boolean="enabled" type="checkbox" ${light.enabled ? "checked" : ""}></label>`)}
      ${this.section("변형", "화면 또는 숫자로 조정", `<label class="axis-label">위치</label><div class="xyz-grid">${this.vectorNumbers("position", light.position, -30, 30, .1)}</div><label class="axis-label">회전</label><div class="xyz-grid">${this.vectorNumbers("rotation", light.rotation, -360, 360, 1)}</div>`)}
      ${this.section("색상", "Pleos 브랜드 색상", `<div class="color-line"><input data-light-color type="color" value="${light.color}"><input data-light-color-hex type="text" value="${light.color.toUpperCase()}" maxlength="7"></div><div class="brand-palette" aria-label="Pleos 브랜드 색상">${palette}</div><div class="selected-color-info"><i style="--selected-color:${light.color}"></i><span><strong>${selectedColor ? `Pleos ${localizeColorName(selectedColor.name)}` : "사용자 색상"}</strong><small>${light.color.toUpperCase()}</small></span></div>`)}
      ${this.section("출력", "조명 에너지", `${this.slider("intensity", "강도", 0, 100, .5, light.intensity)}${this.slider("exposure", "노출", -8, 8, .1, light.exposure)}`)}
      ${conditional}
      ${this.section("그림자", "광원의 물리 크기로 부드러움 조정", `<label class="toggle-line"><span>그림자 생성</span><input data-light-boolean="castShadow" type="checkbox" ${light.castShadow ? "checked" : ""}></label>${this.slider("shadowIntensity", "강도", 0, 1, .05, light.shadowIntensity)}${this.slider("shadowSoftness", "부드러움", 0, 20, .25, light.shadowSoftness)}${this.slider("bias", "바이어스", -.02, .02, .0001, light.bias)}${this.slider("normalBias", "노멀 바이어스", 0, 1, .005, light.normalBias)}<p class="physical-note">최종 패스 트레이싱에서는 영역광 크기와 스폿 반경이 실제 반그림자를 만듭니다.</p>`, false)}
    </div>`;
  }

  private section(title: string, description: string, content: string, open = true): string {
    return `<details class="inspector-section light-inspector-section" ${open ? "open" : ""}><summary><span><strong>${title}</strong><small>${description}</small></span><i></i></summary><div class="section-content">${content}</div></details>`;
  }

  private slider(key: string, label: string, min: number, max: number, step: number, value: number): string {
    return `<div class="light-slider inspector-property"><label>${label}</label><input data-light-range="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-light-number="${key}" data-scrub title="클릭 입력 · 좌우 드래그 · Shift 정밀 조정" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }

  private number(key: string, label: string, value: number, min: number, max: number, step: number): string {
    return `<label><span>${label}</span><input data-light-number="${key}" data-scrub type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }

  private vectorNumbers(key: "position" | "rotation", values: [number, number, number], min: number, max: number, step: number): string {
    return (["X", "Y", "Z"] as const).map((axis, index) => `<label><span>${axis}</span><input data-light-vector="${key}" data-vector-index="${index}" data-scrub type="number" min="${min}" max="${max}" step="${step}" value="${Number(values[index].toFixed(3))}"></label>`).join("");
  }

  private bind(): void {
    this.host.querySelectorAll<HTMLButtonElement>("[data-lighting-preset]").forEach((button) => button.addEventListener("click", () => { this.lighting.applyPreset(button.dataset.lightingPreset as Exclude<LightingPresetName, "custom">); this.render(); }));
    this.host.querySelector<HTMLButtonElement>("[data-light-action='add']")?.addEventListener("click", () => { this.lighting.add(); this.render(); });
    this.host.querySelectorAll<HTMLButtonElement>("[data-light-select]").forEach((button) => button.addEventListener("click", () => { this.lighting.select(button.dataset.lightSelect ?? ""); this.render(); }));
    this.host.querySelectorAll<HTMLButtonElement>("[data-light-toggle]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.lightToggle ?? ""; const light = this.lighting.state.lights.find((item) => item.id === id); if (light) this.lighting.updateLight(id, "enabled", !light.enabled); this.render(); }));
    this.host.querySelectorAll<HTMLButtonElement>("[data-light-duplicate]").forEach((button) => button.addEventListener("click", () => { this.lighting.duplicate(button.dataset.lightDuplicate ?? ""); this.render(); }));
    this.host.querySelectorAll<HTMLButtonElement>("[data-light-delete]").forEach((button) => button.addEventListener("click", () => { this.lighting.remove(button.dataset.lightDelete ?? ""); this.render(); }));
    const selected = this.lighting.selected; if (!selected) return;
    this.host.querySelector<HTMLInputElement>("[data-light-name]")?.addEventListener("change", (event) => { this.lighting.updateLight(selected.id, "name", (event.currentTarget as HTMLInputElement).value.trim() || selected.name); this.render(); });
    this.host.querySelector<HTMLSelectElement>("[data-light-type]")?.addEventListener("change", (event) => { this.lighting.updateLight(selected.id, "type", (event.currentTarget as HTMLSelectElement).value as PleosLightType); this.render(); });
    this.host.querySelectorAll<HTMLInputElement>("[data-light-vector]").forEach((input) => input.addEventListener("input", () => { const key = input.dataset.lightVector as "position" | "rotation"; const index = Number(input.dataset.vectorIndex); const vector = [...selected[key]] as [number, number, number]; vector[index] = Number(input.value); this.lighting.updateLight(selected.id, key, vector); }));
    const color = this.host.querySelector<HTMLInputElement>("[data-light-color]"); const colorHex = this.host.querySelector<HTMLInputElement>("[data-light-color-hex]");
    color?.addEventListener("input", () => { if (colorHex) colorHex.value = color.value.toUpperCase(); this.lighting.updateLight(selected.id, "color", color.value.toUpperCase()); });
    colorHex?.addEventListener("change", () => { if (!/^#[0-9a-f]{6}$/i.test(colorHex.value)) { colorHex.value = selected.color; return; } const value = colorHex.value.toUpperCase(); if (color) color.value = value; this.lighting.updateLight(selected.id, "color", value); });
    this.host.querySelectorAll<HTMLButtonElement>("[data-light-swatch]").forEach((button) => button.addEventListener("click", () => { const value = button.dataset.lightSwatch ?? "#FFFFFF"; this.lighting.updateLight(selected.id, "color", value); if (color) color.value = value; if (colorHex) colorHex.value = value; }));
    this.host.querySelectorAll<HTMLInputElement>("[data-light-boolean]").forEach((input) => input.addEventListener("change", () => this.lighting.updateLight(selected.id, input.dataset.lightBoolean as "castShadow" | "enabled", input.checked)));
    this.bindSliders(selected);
    this.host.querySelectorAll<HTMLButtonElement>("[data-gizmo-mode]").forEach((button) => button.addEventListener("click", () => { this.host.querySelectorAll("[data-gizmo-mode]").forEach((item) => item.classList.remove("active")); button.classList.add("active"); this.onGizmoMode(button.dataset.gizmoMode as GizmoMode); }));
  }

  private bindSliders(selected: PleosLightData): void {
    this.host.querySelectorAll<HTMLInputElement>("[data-light-range]").forEach((range) => {
      const key = range.dataset.lightRange ?? ""; const number = this.host.querySelector<HTMLInputElement>(`[data-light-number='${key}']`);
      range.addEventListener("input", () => { if (number) number.value = range.value; this.commitNumber(key, Number(range.value), selected); });
    });
    this.host.querySelectorAll<HTMLInputElement>("[data-light-number]").forEach((number) => {
      const key = number.dataset.lightNumber ?? ""; const range = this.host.querySelector<HTMLInputElement>(`[data-light-range='${key}']`);
      number.addEventListener("input", () => { if (range) range.value = number.value; this.commitNumber(key, Number(number.value), selected); });
    });
  }

  private commitNumber(key: string, value: number, selected: PleosLightData): void {
    if (!Number.isFinite(value)) return;
    if (key.startsWith("global-")) this.lighting.updateGlobal(key.slice(7) as keyof LightingGlobals, value);
    else this.lighting.updateLight(selected.id, key as keyof PleosLightData, value as never);
  }
}
