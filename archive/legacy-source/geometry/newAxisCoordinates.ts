import * as THREE from "three";

export const REFERENCE_WIDTH = 2800;
export const REFERENCE_HEIGHT = 2080;
export const REFERENCE_ASPECT = 35 / 26;

export const newAxisReference = {
  origin: [0.49944, 0.50021] as const,
  top: [0.50288, 0] as const,
  upperRight: [1, 0.16757] as const,
  lowerRight: [1, 0.84179] as const,
  softDown: [0.3517, 1] as const,
  lowerLeft: [0, 0.83210] as const,
};

export const RAY_ORDER = ["top", "upperRight", "lowerRight", "softDown", "lowerLeft"] as const;
export type RayId = typeof RAY_ORDER[number];

export function normalizedToWorld(u: number, v: number): THREE.Vector2 {
  return new THREE.Vector2((u - newAxisReference.origin[0]) * 2 * REFERENCE_ASPECT, (newAxisReference.origin[1] - v) * 2);
}

export const rayDirections: Record<RayId, THREE.Vector2> = Object.fromEntries(RAY_ORDER.map((id) => {
  const point = newAxisReference[id];
  return [id, normalizedToWorld(point[0], point[1]).normalize()];
})) as Record<RayId, THREE.Vector2>;
