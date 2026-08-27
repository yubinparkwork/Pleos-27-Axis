import { MotionPresetRegistry } from "../../motion/MotionPresetRegistry";
import type { MotionSettings } from "../../motion/types";

export function renderMotionParameters(container: HTMLElement, settings: MotionSettings): void {
  const preset = MotionPresetRegistry.get(settings.preset);
  if (!preset) { container.innerHTML = `<p class="empty-state">Motion is off.</p>`; return; }
  const labels: Record<string, string> = {
    direction: "Direction", sweepWidth: "Sweep width", spectralLag: "Spectral lag", colorSaturation: "Color saturation", originPulse: "Origin pulse",
    amount: "Amount", frequency: "Frequency", phase: "Phase", materialResponse: "Material response", reflectionResponse: "Reflection response",
    distance: "Distance", stagger: "Stagger", hold: "Hold", rejoinImpact: "Rejoin impact", microRotation: "Micro rotation",
  };
  container.innerHTML = Object.entries(preset.parameters).filter(([key]) => labels[key]).map(([key, fallback]) => {
    const value = settings.parameters[key] ?? fallback;
    const max = key === "microRotation" ? 2 : key === "frequency" ? 3 : key === "direction" ? 5 : 1;
    const step = key === "direction" ? 1 : 0.01;
    return `<div class="property-row compact"><label>${labels[key]}</label><input data-motion-param="${key}" type="range" min="0" max="${max}" step="${step}" value="${value}"><input data-motion-param-number="${key}" type="number" min="0" max="${max}" step="${step}" value="${value}"></div>`;
  }).join("");
}
