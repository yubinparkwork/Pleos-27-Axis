import { isAngleInFamily, quantizeAxisAngle } from "./angles";
import { isGridIndex, quantizeGridAnchor } from "./grid";
import { isApprovedRayCombination } from "./presets";
import type {
  AxisDefinition,
  AxisDefinitionInput,
  AxisValidationIssue,
  AxisValidationResult,
} from "./types";

export interface AxisValidationOptions {
  readonly requireApprovedCombination?: boolean;
}

export interface NormalizeAxisDefinitionOptions extends AxisValidationOptions {
  readonly snapAnchor?: boolean;
}

export function normalizeAxisDefinition(
  input: AxisDefinitionInput,
  options: NormalizeAxisDefinitionOptions = {},
): AxisDefinition {
  const anchor = options.snapAnchor === false
    ? { gridX: input.anchor.gridX, gridY: input.anchor.gridY }
    : quantizeGridAnchor(input.anchor.gridX, input.anchor.gridY);
  const normalized: AxisDefinition = {
    id: input.id,
    name: input.name,
    family: input.family,
    rays: input.rays.map((ray) => ({
      ...ray,
      angleDeg: quantizeAxisAngle(ray.angleDeg, input.family),
    })),
    anchor: anchor as AxisDefinition["anchor"],
    referenceLineWidthPx: input.referenceLineWidthPx,
  };
  return normalized;
}

export function createAxisDefinition(
  input: AxisDefinitionInput,
  options: NormalizeAxisDefinitionOptions = {},
): AxisDefinition {
  const normalized = normalizeAxisDefinition(input, options);
  assertValidAxisDefinition(normalized, options);
  return normalized;
}

export function validateAxisDefinition(
  definition: AxisDefinition,
  options: AxisValidationOptions = {},
): AxisValidationResult {
  const requireApproved = options.requireApprovedCombination ?? true;
  const issues: AxisValidationIssue[] = [];

  if (definition.id.trim().length === 0) {
    issues.push(issue("invalid-id", "error", "id", "Axis definition id cannot be empty."));
  }
  if (!Number.isFinite(definition.referenceLineWidthPx) || definition.referenceLineWidthPx <= 0) {
    issues.push(issue(
      "invalid-line-width",
      "error",
      "referenceLineWidthPx",
      "Reference line width must be greater than zero.",
    ));
  }
  if (!isGridIndex(definition.anchor.gridX) || !isGridIndex(definition.anchor.gridY)) {
    issues.push(issue(
      "invalid-anchor",
      "error",
      "anchor",
      "Axis anchor must be an integer intersection on the 20x20 grid.",
    ));
  }

  const rayIds = new Set<string>();
  const directions = new Set<number>();
  let activeCount = 0;
  definition.rays.forEach((ray, index) => {
    const path = `rays[${index}]`;
    if (rayIds.has(ray.id)) {
      issues.push(issue("duplicate-ray-id", "error", `${path}.id`, `Duplicate ray id: ${ray.id}.`));
    }
    rayIds.add(ray.id);

    if (!isAngleInFamily(ray.angleDeg, definition.family)) {
      issues.push(issue(
        "invalid-angle",
        "error",
        `${path}.angleDeg`,
        `${ray.angleDeg}° is not a canonical ${definition.family} direction.`,
      ));
    }
    const directionKey = normalizeDirection(ray.angleDeg);
    if (directions.has(directionKey)) {
      issues.push(issue(
        "duplicate-ray-direction",
        "error",
        `${path}.angleDeg`,
        `Multiple rays resolve to the ${directionKey}° direction.`,
      ));
    }
    directions.add(directionKey);
    if (ray.enabled) activeCount += 1;
  });

  if (activeCount < 2) {
    issues.push(issue(
      "too-few-active-rays",
      "error",
      "rays",
      "An Axis graph requires at least two active rays.",
    ));
  }

  const activeAngles = definition.rays.filter((ray) => ray.enabled).map((ray) => ray.angleDeg);
  const approved = isApprovedRayCombination(definition.family, activeAngles);
  if (!approved) {
    issues.push(issue(
      "unapproved-ray-combination",
      requireApproved ? "error" : "warning",
      "rays",
      "The active rays do not match a Basic/Variation combination approved on Guideline p.24 or p.26.",
    ));
  }

  return {
    valid: !issues.some((item) => item.severity === "error"),
    approved,
    issues,
  };
}

export function assertValidAxisDefinition(
  definition: AxisDefinition,
  options: AxisValidationOptions = {},
): void {
  const validation = validateAxisDefinition(definition, options);
  if (!validation.valid) {
    throw new Error(validation.issues
      .filter((item) => item.severity === "error")
      .map((item) => `${item.path}: ${item.message}`)
      .join("\n"));
  }
}

function normalizeDirection(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function issue(
  code: AxisValidationIssue["code"],
  severity: AxisValidationIssue["severity"],
  path: string,
  message: string,
): AxisValidationIssue {
  return { code, severity, path, message };
}
