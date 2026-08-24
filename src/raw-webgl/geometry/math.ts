import type { Vec3 } from "./types";

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length3(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

export function normalize3(value: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const length = length3(value);
  return length > 1e-12 ? scale3(value, 1 / length) : fallback;
}

export function mix3(a: Vec3, b: Vec3, amount: number): Vec3 {
  const inverse = 1 - amount;
  return [
    a[0] * inverse + b[0] * amount,
    a[1] * inverse + b[1] * amount,
    a[2] * inverse + b[2] * amount,
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function transformPoint(origin: Vec3, basis: readonly Vec3[], local: Vec3): Vec3 {
  return [
    origin[0] + basis[0][0] * local[0] + basis[1][0] * local[1] + basis[2][0] * local[2],
    origin[1] + basis[0][1] * local[0] + basis[1][1] * local[1] + basis[2][1] * local[2],
    origin[2] + basis[0][2] * local[0] + basis[1][2] * local[1] + basis[2][2] * local[2],
  ];
}

export function determinant3(basis: readonly Vec3[]): number {
  return dot3(basis[0], cross3(basis[1], basis[2]));
}

/** Inverse-transpose transform for a normal when `basis` stores matrix columns. */
export function transformNormal(basis: readonly Vec3[], localNormal: Vec3): Vec3 {
  const determinant = determinant3(basis);
  if (Math.abs(determinant) < 1e-12) throw new Error("Axis basis is singular");
  const cofactor0 = cross3(basis[1], basis[2]);
  const cofactor1 = cross3(basis[2], basis[0]);
  const cofactor2 = cross3(basis[0], basis[1]);
  return normalize3(scale3([
    cofactor0[0] * localNormal[0] + cofactor1[0] * localNormal[1] + cofactor2[0] * localNormal[2],
    cofactor0[1] * localNormal[0] + cofactor1[1] * localNormal[1] + cofactor2[1] * localNormal[2],
    cofactor0[2] * localNormal[0] + cofactor1[2] * localNormal[1] + cofactor2[2] * localNormal[2],
  ], 1 / determinant));
}

export function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return normalize3(cross3(sub3(b, a), sub3(c, a)));
}
