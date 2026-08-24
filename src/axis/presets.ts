import { AXIS_DIRECTION_FAMILIES } from "./angles";
import type { AxisAngle, AxisDefinition, AxisFamily } from "./types";

export type AxisPresetVariant = "basic" | "variation-1" | "variation-2" | "variation-3";

/** Active rays transcribed from the approved diagrams on Guideline p.24 and p.26. */
export const APPROVED_ACTIVE_RAY_ANGLES = {
  "30deg": {
    basic: [-90, -30, 30, 90, 210],
    "variation-1": [-90, -30, 30, 90, 150, 210],
    "variation-2": [-30, 30, 90, 210],
    "variation-3": [-30, 30, 90],
  },
  "45deg": {
    basic: [-135, -45, 0, 45, 135, 180],
    "variation-1": [-135, -90, -45, 45, 90, 135, 180],
    "variation-2": [-135, 45, 180],
    "variation-3": [-135, -90, 0, 45, 90],
  },
} as const satisfies Record<AxisFamily, Record<AxisPresetVariant, readonly AxisAngle[]>>;

export const APPROVED_AXIS_DEFINITIONS: readonly AxisDefinition[] = [
  definition("axis-30-basic", "30° Basic Form", "30deg", "basic"),
  definition("axis-30-variation-1", "30° Variation 1", "30deg", "variation-1"),
  definition("axis-30-variation-2", "30° Variation 2", "30deg", "variation-2"),
  definition("axis-30-variation-3", "30° Variation 3", "30deg", "variation-3"),
  definition("axis-45-basic", "45° Basic Form", "45deg", "basic"),
  definition("axis-45-variation-1", "45° Variation 1", "45deg", "variation-1"),
  definition("axis-45-variation-2", "45° Variation 2", "45deg", "variation-2"),
  definition("axis-45-variation-3", "45° Variation 3", "45deg", "variation-3"),
];

export const APPROVED_AXIS_DEFINITION_BY_ID: Readonly<Record<string, AxisDefinition>> =
  Object.freeze(Object.fromEntries(APPROVED_AXIS_DEFINITIONS.map((item) => [item.id, item])));

export function getActiveRayAngles(definition: AxisDefinition): AxisAngle[] {
  return definition.rays
    .filter((ray) => ray.enabled)
    .map((ray) => ray.angleDeg as AxisAngle);
}

export function isApprovedRayCombination(
  family: AxisFamily,
  activeAngles: readonly number[],
): boolean {
  const actual = directionSet(activeAngles);
  return Object.values(APPROVED_ACTIVE_RAY_ANGLES[family]).some(
    (approved) => setEquals(actual, directionSet(approved)),
  );
}

export function getApprovedAxisDefinition(id: string): AxisDefinition | undefined {
  const found = APPROVED_AXIS_DEFINITION_BY_ID[id];
  return found === undefined ? undefined : cloneAxisDefinition(found);
}

export function listApprovedAxisDefinitions(family?: AxisFamily): AxisDefinition[] {
  return APPROVED_AXIS_DEFINITIONS
    .filter((item) => family === undefined || item.family === family)
    .map(cloneAxisDefinition);
}

export function cloneAxisDefinition(definitionToClone: AxisDefinition): AxisDefinition {
  return {
    ...definitionToClone,
    anchor: { ...definitionToClone.anchor },
    rays: definitionToClone.rays.map((ray) => ({ ...ray })),
  };
}

function definition(
  id: string,
  name: string,
  family: AxisFamily,
  variant: AxisPresetVariant,
): AxisDefinition {
  const active = new Set<number>(APPROVED_ACTIVE_RAY_ANGLES[family][variant]);
  const rays = AXIS_DIRECTION_FAMILIES[family].map((angleDeg) => Object.freeze({
    id: `${family}-${angleId(angleDeg)}`,
    angleDeg,
    enabled: active.has(angleDeg),
  }));
  return Object.freeze({
    id,
    name,
    family,
    rays: Object.freeze(rays),
    anchor: Object.freeze({ gridX: 10, gridY: 10 }),
    referenceLineWidthPx: 1,
  });
}

function angleId(angle: number): string {
  if (angle === 0) return "0";
  return angle < 0 ? `m${Math.abs(angle)}` : `p${angle}`;
}

function directionSet(angles: readonly number[]): Set<number> {
  return new Set(angles.map((angle) => ((angle % 360) + 360) % 360));
}

function setEquals(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}
