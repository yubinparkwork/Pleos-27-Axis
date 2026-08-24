import { MeshAccumulator } from "./MeshAccumulator";
import { cross3, normalize3, sub3 } from "./math";
import { resolveAxisGeometryOptions } from "./preset";
import type { AxisGeometryOptions, AxisMeshData, Vec3 } from "./types";

interface RayPoint {
  angleDeg: number;
  angleRad: number;
  point: Vec3;
}

interface AngularPoint {
  angleRad: number;
  point: readonly [number, number];
}

const TAU = Math.PI * 2;

/** Build the sharp, nearly zero-thickness matte geometry as six planar folds. */
export function buildFoldedSurfaceMesh(options: Partial<AxisGeometryOptions> = {}): AxisMeshData {
  const resolved = resolveAxisGeometryOptions(options);
  assertFrame(resolved);
  const accumulator = new MeshAccumulator();
  const rays = stabilizeOpposedBoundaryRays(
    resolved.rayAnglesDeg
      .map((angleDeg): RayPoint => rayAtFrame(angleDeg, resolved))
      .sort((left, right) => left.angleRad - right.angleRad),
    resolved.origin,
  );
  const endpointByAngle = new Map(
    rays.map((ray) => [normalizeDegrees(ray.angleDeg), ray.point] as const),
  );
  const corners = frameCorners(resolved);
  const faceIds: number[] = [];

  for (let sector = 0; sector < rays.length; sector += 1) {
    const first = rays[sector];
    const nextRaw = rays[(sector + 1) % rays.length];
    const next: RayPoint = sector === rays.length - 1
      ? { ...nextRaw, angleRad: nextRaw.angleRad + TAU }
      : nextRaw;
    const planeSupport = sectorPlaneSupport(first, next, resolved);
    const between = corners
      .map((corner) => ({ ...corner, angleRad: unwrapAfter(corner.angleRad, first.angleRad) }))
      .filter((corner) => corner.angleRad > first.angleRad + 1e-8 && corner.angleRad < next.angleRad - 1e-8)
      .sort((a, b) => a.angleRad - b.angleRad)
      .map((corner): Vec3 => [
        corner.point[0],
        corner.point[1],
        planeDepth(resolved.origin, first.point, planeSupport, corner.point[0], corner.point[1]),
      ]);
    const polygon: Vec3[] = [resolved.origin, first.point, ...between, next.point];
    const normal = normalize3(cross3(
      sub3(first.point, resolved.origin),
      sub3(planeSupport, resolved.origin),
    ));
    const outward: Vec3 = normal[2] < 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
    const faceId = sector;
    faceIds.push(faceId);
    accumulator.beginGroup(`fold-sector-${sector + 1}`);
    const vertexIndices = polygon.map((position) => accumulator.addVertex({ position, normal: outward, faceId }));
    for (let index = 1; index < vertexIndices.length - 1; index += 1) {
      accumulator.addTriangle(vertexIndices[0], vertexIndices[index], vertexIndices[index + 1], outward);
    }
  }

  return accumulator.finalize("folded-surface", {
    presetId: resolved.presetId,
    rayAnglesDeg: resolved.rayAnglesDeg,
    rayEndpoints: resolved.rayAnglesDeg.map((angleDeg) => {
      const endpoint = endpointByAngle.get(normalizeDegrees(angleDeg));
      if (endpoint === undefined) throw new Error(`Missing folded ray endpoint for ${angleDeg} degrees`);
      return endpoint;
    }),
    sharedCenterNode: resolved.origin,
    gridAnchor: [10, 10],
    componentCount: 1,
    projectedEdge: resolved.projectedEdge,
    bevelWidth: 0,
    semanticFaces: {
      frontFaceIds: faceIds,
      backFaceIds: [],
      sideFaceIds: [],
      bevelFaceIds: [],
    },
  });
}

/**
 * A published variation may leave two antipodal rays adjacent (45° variation 2).
 * Their source depth hints are independent, but a single sector plane through the
 * center requires those two endpoints to share one 3D line. Reconcile only that
 * exceptional boundary pair; all approved screen-space angles remain exact.
 */
function stabilizeOpposedBoundaryRays(rays: readonly RayPoint[], origin: Vec3): RayPoint[] {
  const stabilized = rays.map((ray): RayPoint => ({ ...ray, point: [...ray.point] as Vec3 }));
  for (let index = 0; index < stabilized.length; index += 1) {
    const first = stabilized[index];
    const nextIndex = (index + 1) % stabilized.length;
    const next = stabilized[nextIndex];
    const nextAngle = nextIndex === 0 ? next.angleRad + TAU : next.angleRad;
    if (Math.abs(nextAngle - first.angleRad - Math.PI) > 1e-8) continue;

    const firstRadius = Math.hypot(first.point[0] - origin[0], first.point[1] - origin[1]);
    const nextRadius = Math.hypot(next.point[0] - origin[0], next.point[1] - origin[1]);
    const firstSlope = (first.point[2] - origin[2]) / firstRadius;
    const nextSlope = -(next.point[2] - origin[2]) / nextRadius;
    const sharedSlope = (firstSlope + nextSlope) * 0.5;
    stabilized[index] = {
      ...first,
      point: [first.point[0], first.point[1], origin[2] + sharedSlope * firstRadius],
    };
    stabilized[nextIndex] = {
      ...next,
      point: [next.point[0], next.point[1], origin[2] - sharedSlope * nextRadius],
    };
  }
  return stabilized;
}

function sectorPlaneSupport(first: RayPoint, next: RayPoint, options: AxisGeometryOptions): Vec3 {
  const firstDirection = sub3(first.point, options.origin);
  const nextDirection = sub3(next.point, options.origin);
  const projectedCross = firstDirection[0] * nextDirection[1] - firstDirection[1] * nextDirection[0];
  if (Math.abs(projectedCross) > 1e-10) return next.point;

  const midpointRadians = (first.angleRad + next.angleRad) * 0.5;
  return rayAtFrame(midpointRadians * 180 / Math.PI, options).point;
}

function rayAtFrame(angleDeg: number, options: AxisGeometryOptions): RayPoint {
  const angleRad = normalizeRadians(angleDeg * Math.PI / 180);
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const halfWidth = options.frame.width * 0.5;
  const halfHeight = options.frame.height * 0.5;
  const tx = Math.abs(dx) < 1e-10 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-10 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const distance = Math.min(tx, ty);
  const normalizedDepth = options.rayDepths[angleDeg]
    ?? options.rayDepths[signedDegrees(angleDeg)]
    ?? 0;
  return {
    angleDeg,
    angleRad,
    point: [
      options.origin[0] + dx * distance,
      options.origin[1] + dy * distance,
      options.origin[2] + normalizedDepth * options.foldDepth,
    ],
  };
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function signedDegrees(value: number): number {
  const normalized = normalizeDegrees(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function frameCorners(options: AxisGeometryOptions): AngularPoint[] {
  const halfWidth = options.frame.width * 0.5;
  const halfHeight = options.frame.height * 0.5;
  const points: Array<readonly [number, number]> = [
    [options.origin[0] + halfWidth, options.origin[1] + halfHeight],
    [options.origin[0] - halfWidth, options.origin[1] + halfHeight],
    [options.origin[0] - halfWidth, options.origin[1] - halfHeight],
    [options.origin[0] + halfWidth, options.origin[1] - halfHeight],
  ];
  return points.map((point) => ({
    point,
    angleRad: normalizeRadians(Math.atan2(point[1] - options.origin[1], point[0] - options.origin[0])),
  }));
}

function planeDepth(origin: Vec3, a: Vec3, b: Vec3, x: number, y: number): number {
  const normal = cross3(sub3(a, origin), sub3(b, origin));
  if (Math.abs(normal[2]) < 1e-10) return origin[2];
  return origin[2] - (
    normal[0] * (x - origin[0]) + normal[1] * (y - origin[1])
  ) / normal[2];
}

function normalizeRadians(value: number): number {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function unwrapAfter(value: number, start: number): number {
  return value < start ? value + TAU : value;
}

function assertFrame(options: AxisGeometryOptions): void {
  if (!(options.frame.width > 0) || !(options.frame.height > 0)) {
    throw new Error("Axis frame dimensions must be positive");
  }
  if (!Number.isFinite(options.foldDepth)) throw new Error("foldDepth must be finite");
  if (options.rayAnglesDeg.length < 3 || !options.rayAnglesDeg.every(Number.isFinite)) {
    throw new Error("Folded Axis requires at least three finite approved ray angles");
  }
}
