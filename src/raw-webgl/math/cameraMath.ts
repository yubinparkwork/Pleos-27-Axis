import {
  createMat4,
  invertMat4,
  lookAtMat4,
  multiplyMat4,
  orthographicMat4,
  perspectiveMat4,
  transformPointMat4,
  type Mat4,
} from "./mat4";
import {
  addVec3,
  copyVec3,
  createVec3,
  crossVec3,
  distanceVec3,
  dotVec3,
  normalizeVec3,
  rotateVec3AroundAxis,
  scaleAndAddVec3,
  scaleVec3,
  subtractVec3,
  type Vec3,
  type Vec3Like,
} from "./vec3";
import { boundingSphereFromBounds3, sizeOfBounds3, type Bounds3 } from "./geometryMath";

export type CameraMode = "orthographic" | "perspective";

export interface CameraState {
  mode: CameraMode;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly worldUp: Vec3;
  fovYRadians: number;
  orthoHeight: number;
  near: number;
  far: number;
  rollRadians: number;
  locked: boolean;
}

export interface CameraStateOptions {
  readonly mode?: CameraMode;
  readonly position?: Vec3Like;
  readonly target?: Vec3Like;
  readonly worldUp?: Vec3Like;
  readonly fovYRadians?: number;
  readonly orthoHeight?: number;
  readonly near?: number;
  readonly far?: number;
  readonly rollRadians?: number;
  readonly locked?: boolean;
}

export interface CameraMatrices {
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  readonly inverseViewProjection: Mat4;
}

export interface CameraRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export function createCameraState(options: CameraStateOptions = {}): CameraState {
  const worldUp = normalizeVec3(createVec3(), options.worldUp ?? [0, 1, 0]);
  if (dotVec3(worldUp, worldUp) <= Number.EPSILON) copyVec3(worldUp, [0, 1, 0]);
  return {
    mode: options.mode ?? "orthographic",
    position: copyVec3(createVec3(), options.position ?? [0, 0, 5]),
    target: copyVec3(createVec3(), options.target ?? [0, 0, 0]),
    worldUp,
    fovYRadians: options.fovYRadians ?? Math.PI / 4,
    orthoHeight: options.orthoHeight ?? 4,
    near: options.near ?? 0.01,
    far: options.far ?? 100,
    rollRadians: options.rollRadians ?? 0,
    locked: options.locked ?? false,
  };
}

export function createCameraMatrices(): CameraMatrices {
  return {
    view: createMat4(),
    projection: createMat4(),
    viewProjection: createMat4(),
    inverseViewProjection: createMat4(),
  };
}

export function updateCameraMatrices(
  camera: CameraState,
  aspect: number,
  matrices = createCameraMatrices(),
): CameraMatrices {
  if (!(aspect > 0)) throw new RangeError("Camera aspect ratio must be positive.");
  if (!(camera.near > 0) || !(camera.far > camera.near)) {
    throw new RangeError("Camera clipping planes must satisfy far > near > 0.");
  }

  const forward = normalizeVec3(
    createVec3(),
    subtractVec3(createVec3(), camera.target, camera.position),
  );
  const rolledUp = rotateVec3AroundAxis(
    createVec3(),
    camera.worldUp,
    forward,
    camera.rollRadians,
  );
  lookAtMat4(matrices.view, camera.position, camera.target, rolledUp);

  if (camera.mode === "perspective") {
    perspectiveMat4(
      matrices.projection,
      camera.fovYRadians,
      aspect,
      camera.near,
      camera.far,
    );
  } else {
    const halfHeight = camera.orthoHeight * 0.5;
    const halfWidth = halfHeight * aspect;
    orthographicMat4(
      matrices.projection,
      -halfWidth,
      halfWidth,
      -halfHeight,
      halfHeight,
      camera.near,
      camera.far,
    );
  }

  multiplyMat4(matrices.viewProjection, matrices.projection, matrices.view);
  if (!invertMat4(matrices.inverseViewProjection, matrices.viewProjection)) {
    throw new Error("Camera view-projection matrix is singular.");
  }
  return matrices;
}

export function orbitCamera(
  camera: CameraState,
  azimuthDelta: number,
  elevationDelta: number,
  minimumPolarAngle = 0.01,
): void {
  if (camera.locked) return;
  const offset = subtractVec3(createVec3(), camera.position, camera.target);
  const radius = Math.max(1e-5, distanceVec3(camera.position, camera.target));
  const up = normalizeVec3(createVec3(), camera.worldUp);
  rotateVec3AroundAxis(offset, offset, up, azimuthDelta);
  const right = normalizeVec3(createVec3(), crossVec3(createVec3(), up, offset));
  if (dotVec3(right, right) <= Number.EPSILON) {
    crossVec3(right, Math.abs(up[1]) < 0.999 ? [0, 1, 0] : [1, 0, 0], up);
    normalizeVec3(right, right);
  }
  rotateVec3AroundAxis(offset, offset, right, elevationDelta);

  const unitOffset = normalizeVec3(createVec3(), offset);
  const maximumUpProjection = Math.cos(Math.max(1e-5, minimumPolarAngle));
  const upProjection = dotVec3(unitOffset, up);
  if (Math.abs(upProjection) > maximumUpProjection) {
    const clampedProjection = Math.sign(upProjection) * maximumUpProjection;
    const horizontal = scaleAndAddVec3(
      createVec3(),
      unitOffset,
      up,
      -upProjection,
    );
    normalizeVec3(horizontal, horizontal);
    scaleVec3(unitOffset, horizontal, Math.sqrt(1 - clampedProjection * clampedProjection));
    scaleAndAddVec3(unitOffset, unitOffset, up, clampedProjection);
  }
  scaleVec3(offset, unitOffset, radius);
  addVec3(camera.position, camera.target, offset);
}

export function dollyCamera(
  camera: CameraState,
  logarithmicDelta: number,
  minimumDistance = 0.05,
  maximumDistance = 1_000,
): void {
  if (camera.locked) return;
  const factor = Math.exp(logarithmicDelta);
  if (camera.mode === "orthographic") {
    camera.orthoHeight = Math.min(maximumDistance, Math.max(minimumDistance, camera.orthoHeight * factor));
    return;
  }
  const offset = subtractVec3(createVec3(), camera.position, camera.target);
  const distance = Math.min(
    maximumDistance,
    Math.max(minimumDistance, distanceVec3(camera.position, camera.target) * factor),
  );
  normalizeVec3(offset, offset);
  scaleAndAddVec3(camera.position, camera.target, offset, distance);
}

export function panCamera(
  camera: CameraState,
  horizontal: number,
  vertical: number,
  aspect: number,
): void {
  if (camera.locked) return;
  const backward = normalizeVec3(
    createVec3(),
    subtractVec3(createVec3(), camera.position, camera.target),
  );
  const right = normalizeVec3(createVec3(), crossVec3(createVec3(), camera.worldUp, backward));
  const up = normalizeVec3(createVec3(), crossVec3(createVec3(), backward, right));
  const viewHeight = camera.mode === "orthographic"
    ? camera.orthoHeight
    : 2 * distanceVec3(camera.position, camera.target) * Math.tan(camera.fovYRadians * 0.5);
  const translation = createVec3();
  scaleVec3(translation, right, horizontal * viewHeight * aspect);
  scaleAndAddVec3(translation, translation, up, vertical * viewHeight);
  addVec3(camera.position, camera.position, translation);
  addVec3(camera.target, camera.target, translation);
}

export function fitCameraToBounds(
  camera: CameraState,
  bounds: Bounds3,
  aspect: number,
  padding = 1.15,
): void {
  if (!(aspect > 0) || !(padding > 0)) {
    throw new RangeError("Camera fit requires positive aspect and padding.");
  }
  const sphere = boundingSphereFromBounds3(bounds);
  copyVec3(camera.target, sphere.center);
  const backward = normalizeVec3(
    createVec3(),
    subtractVec3(createVec3(), camera.position, camera.target),
  );
  if (dotVec3(backward, backward) <= Number.EPSILON) copyVec3(backward, [0, 0, 1]);

  if (camera.mode === "orthographic") {
    const size = sizeOfBounds3(createVec3(), bounds);
    camera.orthoHeight = Math.max(size[1], size[0] / aspect, 1e-4) * padding;
    const distance = Math.max(sphere.radius * 2, camera.near * 2);
    scaleAndAddVec3(camera.position, camera.target, backward, distance);
  } else {
    const horizontalFov = 2 * Math.atan(Math.tan(camera.fovYRadians * 0.5) * aspect);
    const limitingFov = Math.min(camera.fovYRadians, horizontalFov);
    const distance = Math.max(
      camera.near * 2,
      (sphere.radius * padding) / Math.max(1e-4, Math.sin(limitingFov * 0.5)),
    );
    scaleAndAddVec3(camera.position, camera.target, backward, distance);
  }
}

export function projectWorldToNdc(
  out: Vec3,
  worldPosition: Vec3Like,
  matrices: CameraMatrices,
): Vec3 {
  return transformPointMat4(out, worldPosition, matrices.viewProjection);
}

export function unprojectNdcToWorld(
  out: Vec3,
  ndcPosition: Vec3Like,
  matrices: CameraMatrices,
): Vec3 {
  return transformPointMat4(out, ndcPosition, matrices.inverseViewProjection);
}

export function cameraRayFromNdc(
  camera: CameraState,
  matrices: CameraMatrices,
  ndcX: number,
  ndcY: number,
): CameraRay {
  const nearPoint = unprojectNdcToWorld(createVec3(), [ndcX, ndcY, -1], matrices);
  const farPoint = unprojectNdcToWorld(createVec3(), [ndcX, ndcY, 1], matrices);
  const direction = normalizeVec3(createVec3(), subtractVec3(createVec3(), farPoint, nearPoint));
  return {
    origin: camera.mode === "perspective" ? copyVec3(createVec3(), camera.position) : nearPoint,
    direction,
  };
}
