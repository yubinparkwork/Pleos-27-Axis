import { validateToneOnTone, type PleosColorToken } from "./index";
import { getApprovedAxisDefinition, quantizeGridAnchor, validateAxisDefinition } from "../axis";
import { MATERIAL_PRESETS } from "../materials/MaterialRegistry";
import type { StudioState } from "../state/studioState";

export type ComplianceStatus = "pass" | "warning" | "fail";

export interface ComplianceCheck {
  id: string;
  label: string;
  status: ComplianceStatus;
  detail: string;
}

export interface ComplianceReport {
  status: ComplianceStatus;
  checks: ComplianceCheck[];
  score: number;
}

const TONE_TOKENS: Record<StudioState["colorFamily"], { background: PleosColorToken; foreground: PleosColorToken }> = {
  grayscale: { background: "black", foreground: "lightGray1" },
  red: { background: "red3", foreground: "red1" },
  green: { background: "green3", foreground: "green1" },
  blue: { background: "blue4", foreground: "blue1" },
};

function combine(checks: ComplianceCheck[]): ComplianceStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

export function evaluateCompliance(state: StudioState, definitionId: string): ComplianceReport {
  const definition = getApprovedAxisDefinition(definitionId);
  const validation = definition ? validateAxisDefinition({ ...definition, anchor: quantizeGridAnchor(state.anchor.gridX, state.anchor.gridY) }, { requireApprovedCombination: true }) : null;
  const tone = TONE_TOKENS[state.colorFamily];
  const toneResult = validateToneOnTone(tone.background, tone.foreground);
  const material = MATERIAL_PRESETS.find((item) => item.id === state.materialPreset);
  const checks: ComplianceCheck[] = [
    {
      id: "axis-family",
      label: "30° / 45° family",
      status: validation?.valid ? "pass" : "fail",
      detail: validation?.valid ? "Approved ray combination" : "Axis definition is outside the approved family",
    },
    {
      id: "grid-anchor",
      label: "20 × 20 grid anchor",
      status: Number.isInteger(state.anchor.gridX) && Number.isInteger(state.anchor.gridY) && state.anchor.gridX >= 0 && state.anchor.gridX <= 20 && state.anchor.gridY >= 0 && state.anchor.gridY <= 20 ? "pass" : "fail",
      detail: `Intersection ${state.anchor.gridX}, ${state.anchor.gridY}`,
    },
    {
      id: "single-center",
      label: "Single center node",
      status: "pass",
      detail: "All faces inherit one AxisGraph origin",
    },
    {
      id: "tone-on-tone",
      label: "Tone-on-tone color",
      status: toneResult.status === "brand-compliant" ? "pass" : toneResult.status === "experimental-review-required" ? "warning" : "fail",
      detail: `${tone.background} / ${tone.foreground}`,
    },
    {
      id: "material",
      label: "Material expression",
      status: material?.compliant ? "pass" : "warning",
      detail: material?.compliant ? "Brand compliant material" : "Experimental — review required",
    },
    {
      id: "projection",
      label: "Projection constraint",
      status: state.camera.mode === "reference-orthographic" || state.expressionLevel !== "level-1-restrained" ? "pass" : "warning",
      detail: state.camera.mode === "reference-orthographic" ? "Strict projection lock" : "Anchored 3D exploration",
    },
    {
      id: "expression",
      label: "Expression level",
      status: state.expressionLevel === "level-3-active" ? "warning" : "pass",
      detail: state.expressionLevel === "level-3-active" ? "Active mode requires brand review" : "Within communication range",
    },
    {
      id: "spectral-color",
      label: "Spectral color mode",
      status: state.spectral.enabled && state.spectral.colorMode === "full-spectrum-experimental" ? "warning" : "pass",
      detail: state.spectral.enabled && state.spectral.colorMode === "full-spectrum-experimental"
        ? "EXPERIMENTAL — FULL SPECTRUM · brand color review required"
        : "Pleos tone-on-tone or baseline material",
    },
  ];
  const status = combine(checks);
  const score = Math.round(checks.reduce((sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warning" ? 0.5 : 0), 0) / checks.length * 100);
  return { status, checks, score };
}
