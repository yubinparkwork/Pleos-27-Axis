import type { Vec3, Vec3Like } from "./vec3";
import { createVec3, crossVec3, dotVec3, normalizeVec3, subtractVec3 } from "./vec3";

export type Mat4 = Float32Array;
export type Mat4Like = ArrayLike<number>;

export function createMat4(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function identityMat4(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function copyMat4(out: Mat4, value: Mat4Like): Mat4 {
  for (let index = 0; index < 16; index += 1) out[index] = value[index] ?? 0;
  return out;
}

export function multiplyMat4(out: Mat4, a: Mat4Like, b: Mat4Like): Mat4 {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    const b0 = b[column * 4] ?? 0;
    const b1 = b[column * 4 + 1] ?? 0;
    const b2 = b[column * 4 + 2] ?? 0;
    const b3 = b[column * 4 + 3] ?? 0;
    result[column * 4] = (a[0] ?? 0) * b0 + (a[4] ?? 0) * b1 + (a[8] ?? 0) * b2 + (a[12] ?? 0) * b3;
    result[column * 4 + 1] = (a[1] ?? 0) * b0 + (a[5] ?? 0) * b1 + (a[9] ?? 0) * b2 + (a[13] ?? 0) * b3;
    result[column * 4 + 2] = (a[2] ?? 0) * b0 + (a[6] ?? 0) * b1 + (a[10] ?? 0) * b2 + (a[14] ?? 0) * b3;
    result[column * 4 + 3] = (a[3] ?? 0) * b0 + (a[7] ?? 0) * b1 + (a[11] ?? 0) * b2 + (a[15] ?? 0) * b3;
  }
  out.set(result);
  return out;
}

export function perspectiveMat4(
  out: Mat4,
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  if (!(aspect > 0) || !(near > 0) || !(far > near)) {
    throw new RangeError("Perspective projection requires aspect > 0 and far > near > 0.");
  }
  const scale = 1 / Math.tan(fovYRadians * 0.5);
  out.fill(0);
  out[0] = scale / aspect;
  out[5] = scale;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function orthographicMat4(
  out: Mat4,
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  const width = right - left;
  const height = top - bottom;
  const depth = far - near;
  if (Math.abs(width) <= Number.EPSILON || Math.abs(height) <= Number.EPSILON || depth <= 0) {
    throw new RangeError("Orthographic projection volume must have non-zero positive dimensions.");
  }
  out.fill(0);
  out[0] = 2 / width;
  out[5] = 2 / height;
  out[10] = -2 / depth;
  out[12] = -(right + left) / width;
  out[13] = -(top + bottom) / height;
  out[14] = -(far + near) / depth;
  out[15] = 1;
  return out;
}

export function lookAtMat4(
  out: Mat4,
  eye: Vec3Like,
  target: Vec3Like,
  up: Vec3Like,
): Mat4 {
  const backward = normalizeVec3(createVec3(), subtractVec3(createVec3(), eye, target));
  if (dotVec3(backward, backward) <= Number.EPSILON) {
    backward[2] = 1;
  }
  let right = crossVec3(createVec3(), up, backward);
  if (dotVec3(right, right) <= Number.EPSILON) {
    const fallbackUp = Math.abs(backward[1]) < 0.999 ? createVec3(0, 1, 0) : createVec3(1, 0, 0);
    right = crossVec3(right, fallbackUp, backward);
  }
  normalizeVec3(right, right);
  const cameraUp = normalizeVec3(createVec3(), crossVec3(createVec3(), backward, right));

  out[0] = right[0];
  out[1] = cameraUp[0];
  out[2] = backward[0];
  out[3] = 0;
  out[4] = right[1];
  out[5] = cameraUp[1];
  out[6] = backward[1];
  out[7] = 0;
  out[8] = right[2];
  out[9] = cameraUp[2];
  out[10] = backward[2];
  out[11] = 0;
  out[12] = -dotVec3(right, eye);
  out[13] = -dotVec3(cameraUp, eye);
  out[14] = -dotVec3(backward, eye);
  out[15] = 1;
  return out;
}

export function invertMat4(out: Mat4, matrix: Mat4Like): Mat4 | null {
  const m = Array.from({ length: 16 }, (_, index) => matrix[index] ?? 0);
  const b00 = m[0] * m[5] - m[1] * m[4];
  const b01 = m[0] * m[6] - m[2] * m[4];
  const b02 = m[0] * m[7] - m[3] * m[4];
  const b03 = m[1] * m[6] - m[2] * m[5];
  const b04 = m[1] * m[7] - m[3] * m[5];
  const b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12];
  const b07 = m[8] * m[14] - m[10] * m[12];
  const b08 = m[8] * m[15] - m[11] * m[12];
  const b09 = m[9] * m[14] - m[10] * m[13];
  const b10 = m[9] * m[15] - m[11] * m[13];
  const b11 = m[10] * m[15] - m[11] * m[14];
  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(determinant) <= Number.EPSILON) return null;
  const inverseDeterminant = 1 / determinant;

  out[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * inverseDeterminant;
  out[1] = (m[2] * b10 - m[1] * b11 - m[3] * b09) * inverseDeterminant;
  out[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * inverseDeterminant;
  out[3] = (m[10] * b04 - m[9] * b05 - m[11] * b03) * inverseDeterminant;
  out[4] = (m[6] * b08 - m[4] * b11 - m[7] * b07) * inverseDeterminant;
  out[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * inverseDeterminant;
  out[6] = (m[14] * b02 - m[12] * b05 - m[15] * b01) * inverseDeterminant;
  out[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * inverseDeterminant;
  out[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * inverseDeterminant;
  out[9] = (m[1] * b08 - m[0] * b10 - m[3] * b06) * inverseDeterminant;
  out[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * inverseDeterminant;
  out[11] = (m[9] * b02 - m[8] * b04 - m[11] * b00) * inverseDeterminant;
  out[12] = (m[5] * b07 - m[4] * b09 - m[6] * b06) * inverseDeterminant;
  out[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * inverseDeterminant;
  out[14] = (m[13] * b01 - m[12] * b03 - m[14] * b00) * inverseDeterminant;
  out[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * inverseDeterminant;
  return out;
}

export function transformPointMat4(out: Vec3, point: Vec3Like, matrix: Mat4Like): Vec3 {
  const x = point[0] ?? 0;
  const y = point[1] ?? 0;
  const z = point[2] ?? 0;
  const w = (matrix[3] ?? 0) * x + (matrix[7] ?? 0) * y + (matrix[11] ?? 0) * z + (matrix[15] ?? 1);
  const inverseW = Math.abs(w) > Number.EPSILON ? 1 / w : 1;
  out[0] = ((matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0)) * inverseW;
  out[1] = ((matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0)) * inverseW;
  out[2] = ((matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0)) * inverseW;
  return out;
}

export function transformDirectionMat4(out: Vec3, direction: Vec3Like, matrix: Mat4Like): Vec3 {
  const x = direction[0] ?? 0;
  const y = direction[1] ?? 0;
  const z = direction[2] ?? 0;
  out[0] = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z;
  out[1] = (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z;
  out[2] = (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z;
  return out;
}
