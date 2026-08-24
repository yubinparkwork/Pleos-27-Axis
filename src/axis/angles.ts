import type { AxisAngle, AxisFamily } from "./types";

/** Positive angles are counter-clockwise in a Cartesian coordinate system (+Y is up). */
export const AXIS_DIRECTION_FAMILIES = {
  "30deg": [-90, -30, 30, 90, 150, 210],
  "45deg": [-135, -90, -45, 0, 45, 90, 135, 180],
} as const satisfies Record<AxisFamily, readonly AxisAngle[]>;

export function normalizeAngle360(angleDeg: number): number {
  const normalized = angleDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function circularAngleDistance(aDeg: number, bDeg: number): number {
  const difference = Math.abs(normalizeAngle360(aDeg) - normalizeAngle360(bDeg));
  return Math.min(difference, 360 - difference);
}

export function isAngleInFamily(angleDeg: number, family: AxisFamily): angleDeg is AxisAngle {
  return AXIS_DIRECTION_FAMILIES[family].some((allowed) => allowed === angleDeg);
}

/** Returns the exact canonical token from the selected family. Ties follow the published family order. */
export function quantizeAxisAngle(angleDeg: number, family: AxisFamily): AxisAngle {
  if (!Number.isFinite(angleDeg)) {
    throw new TypeError("Axis angle must be a finite number.");
  }

  const allowed = AXIS_DIRECTION_FAMILIES[family];
  let nearest: AxisAngle = allowed[0];
  let nearestDistance = circularAngleDistance(angleDeg, nearest);
  for (let index = 1; index < allowed.length; index += 1) {
    const candidate = allowed[index];
    const distance = circularAngleDistance(angleDeg, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function axisDirection(angleDeg: number): { x: number; y: number } {
  const radians = angleDeg * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
