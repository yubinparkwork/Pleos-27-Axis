import {
  addVec3,
  copyVec3,
  createVec3,
  crossVec3,
  normalizeVec3,
  scaleVec3,
  subtractVec3,
  type Vec3,
  type Vec3Like,
} from "./vec3";

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface BoundingSphere {
  readonly center: Vec3;
  readonly radius: number;
}

export function createEmptyBounds3(): Bounds3 {
  return {
    min: createVec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    max: createVec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
  };
}

export function expandBounds3ByPoint(bounds: Bounds3, point: Vec3Like): Bounds3 {
  bounds.min[0] = Math.min(bounds.min[0], point[0] ?? 0);
  bounds.min[1] = Math.min(bounds.min[1], point[1] ?? 0);
  bounds.min[2] = Math.min(bounds.min[2], point[2] ?? 0);
  bounds.max[0] = Math.max(bounds.max[0], point[0] ?? 0);
  bounds.max[1] = Math.max(bounds.max[1], point[1] ?? 0);
  bounds.max[2] = Math.max(bounds.max[2], point[2] ?? 0);
  return bounds;
}

export function computeBounds3(
  positions: ArrayLike<number>,
  stride = 3,
  offset = 0,
): Bounds3 {
  if (!Number.isInteger(stride) || stride < 3 || !Number.isInteger(offset) || offset < 0) {
    throw new RangeError("Position stride must be at least 3 and offset must be non-negative.");
  }
  const bounds = createEmptyBounds3();
  for (let index = offset; index + 2 < positions.length; index += stride) {
    expandBounds3ByPoint(bounds, [
      positions[index] ?? 0,
      positions[index + 1] ?? 0,
      positions[index + 2] ?? 0,
    ]);
  }
  if (!Number.isFinite(bounds.min[0])) {
    copyVec3(bounds.min, [0, 0, 0]);
    copyVec3(bounds.max, [0, 0, 0]);
  }
  return bounds;
}

export function centerOfBounds3(out: Vec3, bounds: Bounds3): Vec3 {
  addVec3(out, bounds.min, bounds.max);
  return scaleVec3(out, out, 0.5);
}

export function sizeOfBounds3(out: Vec3, bounds: Bounds3): Vec3 {
  return subtractVec3(out, bounds.max, bounds.min);
}

export function boundingSphereFromBounds3(bounds: Bounds3): BoundingSphere {
  const center = centerOfBounds3(createVec3(), bounds);
  const halfExtents = scaleVec3(createVec3(), sizeOfBounds3(createVec3(), bounds), 0.5);
  return { center, radius: Math.hypot(halfExtents[0], halfExtents[1], halfExtents[2]) };
}

export function triangleNormal(
  out: Vec3,
  a: Vec3Like,
  b: Vec3Like,
  c: Vec3Like,
): Vec3 {
  const ab = subtractVec3(createVec3(), b, a);
  const ac = subtractVec3(createVec3(), c, a);
  return normalizeVec3(out, crossVec3(out, ab, ac));
}

export function radians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function degrees(radiansValue: number): number {
  return radiansValue * (180 / Math.PI);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
