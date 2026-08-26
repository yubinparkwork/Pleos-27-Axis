import { MeshAccumulator } from "./MeshAccumulator";
import { add3, clamp, mix3, normalize3, scale3, sub3, transformNormal, transformPoint } from "./math";
import { PLEOS_30_VARIATION_1, resolveAxisGeometryOptions } from "./preset";
import type { AxisGeometryOptions, AxisMeshData, AxisSurfaceSemantics, Vec3 } from "./types";

const AXES = [0, 1, 2] as const;
const MAIN_FACE_COUNT = 6;
const EDGE_FACE_START = 6;
const CORNER_FACE_START = 18;
const FACE_ID_STRIDE = 32;

interface SolidSemanticIds {
  front: number;
  back: number;
  sides: number[];
  bevels: number[];
}

/**
 * Build two watertight, genuinely volumetric optical solids. The cubes use the
 * exact approved XY directions and touch only at the shared center node.
 */
export function buildClosedOpticalSolidMesh(options: Partial<AxisGeometryOptions> = {}): AxisMeshData {
  const resolved = resolveAxisGeometryOptions(options);
  assertOptions(resolved);
  const accumulator = new MeshAccumulator();
  const semantics: SolidSemanticIds[] = [];
  const rayEndpointByAngle = new Map<number, Vec3>();

  PLEOS_30_VARIATION_1.cubes.forEach((definition, solidId) => {
    const basis = definition.directionsDeg.map((angleDeg, index): Vec3 => {
      const radians = angleDeg * Math.PI / 180;
      return [
        Math.cos(radians) * resolved.projectedEdge,
        Math.sin(radians) * resolved.projectedEdge,
        definition.depthSigns[index] * resolved.projectedEdge * resolved.depthRatio,
      ];
    });
    basis.forEach((direction, index) => {
      rayEndpointByAngle.set(definition.directionsDeg[index], add3(resolved.origin, direction));
    });
    accumulator.beginGroup(definition.id, solidId);
    semantics.push(buildCube(accumulator, solidId, basis, resolved));
  });

  const semanticFaces: AxisSurfaceSemantics = {
    frontFaceIds: semantics.map((entry) => entry.front),
    backFaceIds: semantics.map((entry) => entry.back),
    sideFaceIds: semantics.flatMap((entry) => entry.sides),
    bevelFaceIds: semantics.flatMap((entry) => entry.bevels),
  };
  return accumulator.finalize("closed-optical-solid", {
    presetId: PLEOS_30_VARIATION_1.id,
    rayAnglesDeg: PLEOS_30_VARIATION_1.rays.map((ray) => ray.angleDeg),
    rayEndpoints: PLEOS_30_VARIATION_1.rays.map((ray) => {
      const endpoint = rayEndpointByAngle.get(ray.angleDeg);
      if (endpoint === undefined) throw new Error(`Missing optical ray endpoint for ${ray.angleDeg} degrees`);
      return endpoint;
    }),
    sharedCenterNode: resolved.origin,
    gridAnchor: [10, 10],
    componentCount: 2,
    projectedEdge: resolved.projectedEdge,
    bevelWidth: resolved.bevel.enabled ? resolved.bevel.width : 0,
    semanticFaces,
  });
}

function buildCube(
  accumulator: MeshAccumulator,
  solidId: number,
  basis: readonly Vec3[],
  options: AxisGeometryOptions,
): SolidSemanticIds {
  const faceBase = solidId * FACE_ID_STRIDE;
  const mainNormals: Array<{ id: number; normal: Vec3 }> = [];
  const bevelIds: number[] = [];
  const bevel = options.bevel.enabled ? clamp(options.bevel.width, 0.0001, 0.24) : 0;
  if (bevel <= 0) {
    addPlainCube(accumulator, faceBase, basis, options.origin, mainNormals);
  } else {
    const segments = Math.round(clamp(options.bevel.segments, 1, 12));
    const curvature = clamp(options.bevel.curvature, 0, 1);
    addMainFaces(accumulator, faceBase, basis, options.origin, bevel, mainNormals);
    addEdgeBevels(accumulator, faceBase, basis, options.origin, bevel, segments, curvature, bevelIds);
    addCornerBevels(
      accumulator,
      faceBase,
      basis,
      options.origin,
      bevel,
      segments,
      curvature,
      options.bevel.preserveCenterNode,
      bevelIds,
    );
  }

  const sorted = [...mainNormals].sort((a, b) => a.normal[2] - b.normal[2]);
  return {
    back: sorted[0].id,
    front: sorted[sorted.length - 1].id,
    sides: sorted.slice(1, -1).map((entry) => entry.id),
    bevels: [...new Set(bevelIds)],
  };
}

function addPlainCube(
  accumulator: MeshAccumulator,
  faceBase: number,
  basis: readonly Vec3[],
  origin: Vec3,
  mainNormals: Array<{ id: number; normal: Vec3 }>,
): void {
  for (const axis of AXES) {
    for (const side of [-1, 1] as const) {
      const faceId = faceBase + axis * 2 + (side > 0 ? 1 : 0);
      addMainFace(accumulator, faceId, basis, origin, axis, side, 0);
      mainNormals.push({ id: faceId, normal: transformNormal(basis, axisVector(axis, side)) });
    }
  }
}

function addMainFaces(
  accumulator: MeshAccumulator,
  faceBase: number,
  basis: readonly Vec3[],
  origin: Vec3,
  bevel: number,
  mainNormals: Array<{ id: number; normal: Vec3 }>,
): void {
  for (const axis of AXES) {
    for (const side of [-1, 1] as const) {
      const faceId = faceBase + axis * 2 + (side > 0 ? 1 : 0);
      addMainFace(accumulator, faceId, basis, origin, axis, side, bevel);
      mainNormals.push({ id: faceId, normal: transformNormal(basis, axisVector(axis, side)) });
    }
  }
}

function addMainFace(
  accumulator: MeshAccumulator,
  faceId: number,
  basis: readonly Vec3[],
  origin: Vec3,
  fixedAxis: 0 | 1 | 2,
  side: -1 | 1,
  bevel: number,
): void {
  const free = AXES.filter((axis) => axis !== fixedAxis) as Array<0 | 1 | 2>;
  const fixed = side < 0 ? 0 : 1;
  const low = bevel;
  const high = 1 - bevel;
  const localPoints: Vec3[] = [
    localPoint(fixedAxis, fixed, free[0], low, free[1], low),
    localPoint(fixedAxis, fixed, free[0], high, free[1], low),
    localPoint(fixedAxis, fixed, free[0], high, free[1], high),
    localPoint(fixedAxis, fixed, free[0], low, free[1], high),
  ];
  const expected = transformNormal(basis, axisVector(fixedAxis, side));
  const vertices = localPoints.map((local) => accumulator.addVertex({
    position: transformPoint(origin, basis, local),
    normal: expected,
    faceId,
  }));
  accumulator.addTriangle(vertices[0], vertices[1], vertices[2], expected);
  accumulator.addTriangle(vertices[0], vertices[2], vertices[3], expected);
}

function addEdgeBevels(
  accumulator: MeshAccumulator,
  faceBase: number,
  basis: readonly Vec3[],
  origin: Vec3,
  bevel: number,
  segments: number,
  curvature: number,
  bevelIds: number[],
): void {
  let edgeIndex = 0;
  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    const axisA = AXES[pairIndex];
    const axisB = AXES[(pairIndex + 1) % 3];
    const freeAxis = AXES[(pairIndex + 2) % 3];
    for (const sideA of [-1, 1] as const) {
      for (const sideB of [-1, 1] as const) {
        const faceId = faceBase + EDGE_FACE_START + edgeIndex;
        bevelIds.push(faceId);
        edgeIndex += 1;
        for (let step = 0; step < segments; step += 1) {
          const startA = 1 - step / segments;
          const startB = step / segments;
          const endA = 1 - (step + 1) / segments;
          const endB = (step + 1) / segments;
          const expected = transformNormal(basis, edgeNormal(
            axisA,
            sideA,
            axisB,
            sideB,
            (startA + endA) * 0.5,
            (startB + endB) * 0.5,
          ));
          const point = (freeCoordinate: number, weightA: number, weightB: number): Vec3 => transformPoint(
            origin,
            basis,
            edgePoint(axisA, sideA, axisB, sideB, freeAxis, freeCoordinate, weightA, weightB, bevel, curvature),
          );
          const a = point(bevel, startA, startB);
          const b = point(bevel, endA, endB);
          const c = point(1 - bevel, endA, endB);
          const d = point(1 - bevel, startA, startB);
          // Deliberately duplicate vertices per strip. Flat normals keep every
          // micro bevel readable as a precision-cut facet instead of blending
          // into the inflated silhouette of a rounded box.
          accumulator.addFlatTriangle(a, b, c, faceId, expected);
          accumulator.addFlatTriangle(a, c, d, faceId, expected);
        }
      }
    }
  }
}

function addCornerBevels(
  accumulator: MeshAccumulator,
  faceBase: number,
  basis: readonly Vec3[],
  origin: Vec3,
  bevel: number,
  segments: number,
  curvature: number,
  preserveCenterNode: boolean,
  bevelIds: number[],
): void {
  let cornerIndex = 0;
  for (const sideX of [-1, 1] as const) {
    for (const sideY of [-1, 1] as const) {
      for (const sideZ of [-1, 1] as const) {
        const faceId = faceBase + CORNER_FACE_START + cornerIndex;
        bevelIds.push(faceId);
        cornerIndex += 1;
        const sides = [sideX, sideY, sideZ] as const;
        if (preserveCenterNode && sideX < 0 && sideY < 0 && sideZ < 0) {
          addPointContactCap(accumulator, faceId, basis, origin, bevel, segments, curvature);
        } else {
          addRoundedCorner(accumulator, faceId, basis, origin, bevel, segments, curvature, sides);
        }
      }
    }
  }
}

function addRoundedCorner(
  accumulator: MeshAccumulator,
  faceId: number,
  basis: readonly Vec3[],
  origin: Vec3,
  bevel: number,
  segments: number,
  curvature: number,
  sides: readonly [-1 | 1, -1 | 1, -1 | 1],
): void {
  const rows: Vec3[][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const row: Vec3[] = [];
    for (let j = 0; j <= segments - i; j += 1) {
      const k = segments - i - j;
      const weights: Vec3 = [i / segments, j / segments, k / segments];
      const local = cornerPoint(sides, weights, bevel, curvature);
      row.push(transformPoint(origin, basis, local));
    }
    rows.push(row);
  }
  const expected = transformNormal(basis, normalize3(sides));
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < segments - i; j += 1) {
      accumulator.addFlatTriangle(rows[i][j], rows[i + 1][j], rows[i][j + 1], faceId, expected);
      if (j < segments - i - 1) {
        accumulator.addFlatTriangle(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1], faceId, expected);
      }
    }
  }
}

function addPointContactCap(
  accumulator: MeshAccumulator,
  faceId: number,
  basis: readonly Vec3[],
  origin: Vec3,
  bevel: number,
  segments: number,
  curvature: number,
): void {
  const sides = [-1, -1, -1] as const;
  const boundary: Vec3[] = [];
  const edgePairs = [[0, 1], [1, 2], [2, 0]] as const;
  for (const [firstAxis, secondAxis] of edgePairs) {
    for (let step = 0; step < segments; step += 1) {
      const weights: [number, number, number] = [0, 0, 0];
      weights[firstAxis] = 1 - step / segments;
      weights[secondAxis] = step / segments;
      boundary.push(transformPoint(origin, basis, cornerPoint(sides, weights, bevel, curvature)));
    }
  }
  const cubeCenter = transformPoint(origin, basis, [0.5, 0.5, 0.5]);
  for (let index = 0; index < boundary.length; index += 1) {
    const current = boundary[index];
    const next = boundary[(index + 1) % boundary.length];
    const centroid = scale3(add3(add3(origin, current), next), 1 / 3);
    accumulator.addFlatTriangle(origin, current, next, faceId, sub3(centroid, cubeCenter));
  }
}

function edgePoint(
  axisA: 0 | 1 | 2,
  sideA: -1 | 1,
  axisB: 0 | 1 | 2,
  sideB: -1 | 1,
  freeAxis: 0 | 1 | 2,
  freeCoordinate: number,
  weightA: number,
  weightB: number,
  bevel: number,
  curvature: number,
): Vec3 {
  const result: [number, number, number] = [0, 0, 0];
  result[axisA] = sideA < 0 ? bevel : 1 - bevel;
  result[axisB] = sideB < 0 ? bevel : 1 - bevel;
  result[freeAxis] = freeCoordinate;
  const flatLength = Math.max(1e-9, weightA + weightB);
  const roundLength = Math.max(1e-9, Math.hypot(weightA, weightB));
  const offsetA = (1 - curvature) * weightA / flatLength + curvature * weightA / roundLength;
  const offsetB = (1 - curvature) * weightB / flatLength + curvature * weightB / roundLength;
  result[axisA] += sideA * bevel * offsetA;
  result[axisB] += sideB * bevel * offsetB;
  return result;
}

function cornerPoint(
  sides: readonly [-1 | 1, -1 | 1, -1 | 1],
  weights: Vec3,
  bevel: number,
  curvature: number,
): Vec3 {
  const center: Vec3 = sides.map((side) => side < 0 ? bevel : 1 - bevel) as unknown as Vec3;
  const flatLength = Math.max(1e-9, weights[0] + weights[1] + weights[2]);
  const sphericalLength = Math.max(1e-9, Math.hypot(weights[0], weights[1], weights[2]));
  const flat: Vec3 = [weights[0] / flatLength, weights[1] / flatLength, weights[2] / flatLength];
  const spherical: Vec3 = [weights[0] / sphericalLength, weights[1] / sphericalLength, weights[2] / sphericalLength];
  const direction = mix3(flat, spherical, curvature);
  return [
    center[0] + sides[0] * bevel * direction[0],
    center[1] + sides[1] * bevel * direction[1],
    center[2] + sides[2] * bevel * direction[2],
  ];
}

function edgeNormal(
  axisA: 0 | 1 | 2,
  sideA: -1 | 1,
  axisB: 0 | 1 | 2,
  sideB: -1 | 1,
  weightA: number,
  weightB: number,
): Vec3 {
  const result: [number, number, number] = [0, 0, 0];
  result[axisA] = sideA * weightA;
  result[axisB] = sideB * weightB;
  return normalize3(result);
}

function localPoint(
  fixedAxis: 0 | 1 | 2,
  fixedValue: number,
  firstAxis: 0 | 1 | 2,
  firstValue: number,
  secondAxis: 0 | 1 | 2,
  secondValue: number,
): Vec3 {
  const result: [number, number, number] = [0, 0, 0];
  result[fixedAxis] = fixedValue;
  result[firstAxis] = firstValue;
  result[secondAxis] = secondValue;
  return result;
}

function axisVector(axis: 0 | 1 | 2, side: -1 | 1): Vec3 {
  const result: [number, number, number] = [0, 0, 0];
  result[axis] = side;
  return result;
}

function assertOptions(options: AxisGeometryOptions): void {
  if (!(options.projectedEdge > 0) || !Number.isFinite(options.projectedEdge)) {
    throw new Error("projectedEdge must be a positive finite number");
  }
  if (!(options.depthRatio > 0) || !Number.isFinite(options.depthRatio)) {
    throw new Error("depthRatio must be a positive finite number");
  }
  if (!Number.isFinite(options.bevel.width) || !Number.isFinite(options.bevel.curvature)) {
    throw new Error("Bevel parameters must be finite");
  }
  if (options.bevel.segments < 1) throw new Error("bevel.segments must be at least 1");
}

export const CLOSED_OPTICAL_FACE_LAYOUT = Object.freeze({
  mainFaceCount: MAIN_FACE_COUNT,
  edgeFaceStart: EDGE_FACE_START,
  cornerFaceStart: CORNER_FACE_START,
  faceIdStride: FACE_ID_STRIDE,
});
