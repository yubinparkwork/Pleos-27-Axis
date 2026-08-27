import { MotionPresetRegistry } from "../../motion/MotionPresetRegistry";
import type { MotionSettings } from "../../motion/types";

export function renderMotionParameters(container: HTMLElement, settings: MotionSettings): void {
  const preset = MotionPresetRegistry.get(settings.preset);
  if (!preset) { container.innerHTML = `<p class="empty-state">모션이 꺼져 있습니다.</p>`; return; }
  const labels: Record<string, string> = {
    direction: "방향", sweepWidth: "이동 폭", spectralLag: "스펙트럴 지연", colorSaturation: "색상 채도", originPulse: "중심 맥동",
    amount: "양", frequency: "빈도", phase: "위상", materialResponse: "재질 반응", reflectionResponse: "반사 반응",
    distance: "거리", stagger: "시차", hold: "유지", rejoinImpact: "결합 충격", microRotation: "미세 회전",
  };
  container.innerHTML = Object.entries(preset.parameters).filter(([key]) => labels[key]).map(([key, fallback]) => {
    const value = settings.parameters[key] ?? fallback;
    const max = key === "microRotation" ? 2 : key === "frequency" ? 3 : key === "direction" ? 5 : 1;
    const step = key === "direction" ? 1 : 0.01;
    return `<div class="property-row compact"><label>${labels[key]}</label><input data-motion-param="${key}" type="range" min="0" max="${max}" step="${step}" value="${value}"><input data-motion-param-number="${key}" type="number" min="0" max="${max}" step="${step}" value="${value}"></div>`;
  }).join("");
}
