export type Vec3 = Float32Array;
export type Vec3Like = ArrayLike<number>;

export function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return new Float32Array([x, y, z]);
}

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copyVec3(out: Vec3, value: Vec3Like): Vec3 {
  out[0] = value[0] ?? 0;
  out[1] = value[1] ?? 0;
  out[2] = value[2] ?? 0;
  return out;
}

export function addVec3(out: Vec3, a: Vec3Like, b: Vec3Like): Vec3 {
  out[0] = (a[0] ?? 0) + (b[0] ?? 0);
  out[1] = (a[1] ?? 0) + (b[1] ?? 0);
  out[2] = (a[2] ?? 0) + (b[2] ?? 0);
  return out;
}

export function subtractVec3(out: Vec3, a: Vec3Like, b: Vec3Like): Vec3 {
  out[0] = (a[0] ?? 0) - (b[0] ?? 0);
  out[1] = (a[1] ?? 0) - (b[1] ?? 0);
  out[2] = (a[2] ?? 0) - (b[2] ?? 0);
  return out;
}

export function scaleVec3(out: Vec3, value: Vec3Like, scalar: number): Vec3 {
  out[0] = (value[0] ?? 0) * scalar;
  out[1] = (value[1] ?? 0) * scalar;
  out[2] = (value[2] ?? 0) * scalar;
  return out;
}

export function scaleAndAddVec3(
  out: Vec3,
  a: Vec3Like,
  b: Vec3Like,
  scalar: number,
): Vec3 {
  out[0] = (a[0] ?? 0) + (b[0] ?? 0) * scalar;
  out[1] = (a[1] ?? 0) + (b[1] ?? 0) * scalar;
  out[2] = (a[2] ?? 0) + (b[2] ?? 0) * scalar;
  return out;
}

export function dotVec3(a: Vec3Like, b: Vec3Like): number {
  return (a[0] ?? 0) * (b[0] ?? 0)
    + (a[1] ?? 0) * (b[1] ?? 0)
    + (a[2] ?? 0) * (b[2] ?? 0);
}

export function crossVec3(out: Vec3, a: Vec3Like, b: Vec3Like): Vec3 {
  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const az = a[2] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  const bz = b[2] ?? 0;
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function squaredLengthVec3(value: Vec3Like): number {
  return dotVec3(value, value);
}

export function lengthVec3(value: Vec3Like): number {
  return Math.sqrt(squaredLengthVec3(value));
}

export function normalizeVec3(out: Vec3, value: Vec3Like): Vec3 {
  const length = lengthVec3(value);
  if (length <= Number.EPSILON) return setVec3(out, 0, 0, 0);
  return scaleVec3(out, value, 1 / length);
}

export function distanceVec3(a: Vec3Like, b: Vec3Like): number {
  const x = (a[0] ?? 0) - (b[0] ?? 0);
  const y = (a[1] ?? 0) - (b[1] ?? 0);
  const z = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.hypot(x, y, z);
}

export function lerpVec3(out: Vec3, a: Vec3Like, b: Vec3Like, t: number): Vec3 {
  out[0] = (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t;
  out[1] = (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t;
  out[2] = (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t;
  return out;
}

export function rotateVec3AroundAxis(
  out: Vec3,
  value: Vec3Like,
  axis: Vec3Like,
  radians: number,
): Vec3 {
  const normalizedAxis = normalizeVec3(createVec3(), axis);
  if (squaredLengthVec3(normalizedAxis) <= Number.EPSILON) return copyVec3(out, value);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const projection = dotVec3(value, normalizedAxis) * (1 - cosine);
  const cross = crossVec3(createVec3(), normalizedAxis, value);
  out[0] = (value[0] ?? 0) * cosine + cross[0] * sine + normalizedAxis[0] * projection;
  out[1] = (value[1] ?? 0) * cosine + cross[1] * sine + normalizedAxis[1] * projection;
  out[2] = (value[2] ?? 0) * cosine + cross[2] * sine + normalizedAxis[2] * projection;
  return out;
}

export function equalsVec3(a: Vec3Like, b: Vec3Like, epsilon = 1e-6): boolean {
  return Math.abs((a[0] ?? 0) - (b[0] ?? 0)) <= epsilon
    && Math.abs((a[1] ?? 0) - (b[1] ?? 0)) <= epsilon
    && Math.abs((a[2] ?? 0) - (b[2] ?? 0)) <= epsilon;
}
