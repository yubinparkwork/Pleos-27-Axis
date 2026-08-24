import { buildClosedOpticalSolidMesh } from "./closedOpticalSolid";
import { buildFoldedSurfaceMesh } from "./foldedSurface";
import { dot3, length3, normalize3, triangleNormal } from "./math";
import {
  APPROVED_RAW_AXIS_PRESET_IDS,
  APPROVED_RAW_AXIS_RAYS,
  PLEOS_30_VARIATION_1,
  type ApprovedRawAxisPresetId,
} from "./preset";
import type { AxisMeshData, Vec3 } from "./types";

export interface AxisMeshValidationOptions {
  requireClosed?: boolean;
  expectedComponents?: number;
  expectedPresetId?: string;
  expectedRayAnglesDeg?: readonly number[];
  expectedSectorCount?: number;
  expectedCenterNodeGroupCount?: number;
  requirePositiveBounds?: boolean;
  requireSingleCenterNode?: boolean;
  requireExactSharedCenter?: boolean;
  weldTolerance?: number;
  normalTolerance?: number;
}

export interface AxisMeshValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  vertexCount: number;
  triangleCount: number;
  weldedVertexCount: number;
  componentCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  inconsistentWindingEdgeCount: number;
  degenerateTriangleCount: number;
  reversedNormalTriangleCount: number;
  nonUnitNormalCount: number;
  centerNodeVertexCount: number;
  centerNodeWeldedCount: number;
  centerNodeGroupCount: number;
  exactSharedCenter: boolean;
  finiteData: boolean;
  rayMetadataMatches: boolean;
  positiveBounds: boolean;
  positiveSectorCount: number;
  nonPositiveSectorCount: number;
}

interface WeldedEdgeUse {
  total: number;
  forward: number;
  reverse: number;
  triangles: number[];
}

/** Pure CPU validation; safe to call in tests without DOM or WebGL. */
export function validateAxisMesh(
  mesh: AxisMeshData,
  options: AxisMeshValidationOptions = {},
): AxisMeshValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const weldTolerance = options.weldTolerance ?? 1e-5;
  const normalTolerance = options.normalTolerance ?? 2e-3;
  let finiteData = true;
  let rayMetadataMatches = true;

  const finiteArrays: ReadonlyArray<ArrayLike<number>> = [
    mesh.positions,
    mesh.normals,
    mesh.uvs,
    mesh.vertices,
    mesh.metadata.rayAnglesDeg,
    mesh.metadata.sharedCenterNode,
    ...mesh.metadata.rayEndpoints,
  ];
  if (!finiteArrays.every((values) => allFinite(values))
    || !allFinite([
      ...mesh.bounds.min,
      ...mesh.bounds.max,
      ...mesh.bounds.center,
      mesh.bounds.radius,
      mesh.metadata.projectedEdge,
      mesh.metadata.bevelWidth,
    ])) {
    finiteData = false;
    errors.push("Mesh buffers, metadata, or bounds contain non-finite values");
  }

  if (!Number.isInteger(vertexCount)) errors.push("Position buffer length is not divisible by 3");
  if (mesh.normals.length !== mesh.positions.length) errors.push("Normal and position buffer lengths differ");
  if (mesh.uvs.length !== vertexCount * 2) errors.push("UV buffer length does not match vertex count");
  if (mesh.faceIds.length !== vertexCount) errors.push("Face ID buffer length does not match vertex count");
  if (mesh.vertices.length !== vertexCount * mesh.layout.strideFloats) errors.push("Interleaved vertex buffer length is invalid");
  if (mesh.indices.length % 3 !== 0) errors.push("Index buffer length is not divisible by 3");
  if (options.expectedPresetId !== undefined && mesh.metadata.presetId !== options.expectedPresetId) {
    rayMetadataMatches = false;
    errors.push(`Expected preset metadata ${options.expectedPresetId}, found ${mesh.metadata.presetId}`);
  }
  if (options.expectedComponents !== undefined && mesh.metadata.componentCount !== options.expectedComponents) {
    errors.push(
      `Expected component metadata ${options.expectedComponents}, found ${mesh.metadata.componentCount}`,
    );
  }
  if (options.expectedRayAnglesDeg !== undefined
    && !sameAngleSequence(mesh.metadata.rayAnglesDeg, options.expectedRayAnglesDeg)) {
    rayMetadataMatches = false;
    errors.push("Ray angle metadata does not match the approved preset sequence");
  }
  const normalizedRayAngles = mesh.metadata.rayAnglesDeg.map(normalizeDegrees);
  if (new Set(normalizedRayAngles).size !== normalizedRayAngles.length) {
    rayMetadataMatches = false;
    errors.push("Ray angle metadata contains duplicate directions");
  }
  if (mesh.metadata.rayEndpoints.length !== mesh.metadata.rayAnglesDeg.length) {
    rayMetadataMatches = false;
    errors.push("Ray endpoint metadata does not match the approved ray count");
  } else {
    mesh.metadata.rayEndpoints.forEach((endpoint, index) => {
      const dx = endpoint[0] - mesh.metadata.sharedCenterNode[0];
      const dy = endpoint[1] - mesh.metadata.sharedCenterNode[1];
      if (Math.hypot(dx, dy) <= weldTolerance) {
        rayMetadataMatches = false;
        errors.push(`Ray ${index} has no positive projected length`);
        return;
      }
      const actual = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angleDistanceDeg(actual, mesh.metadata.rayAnglesDeg[index]) > 1e-5) {
        rayMetadataMatches = false;
        errors.push(`Ray ${index} projects to ${actual.toFixed(5)} degrees instead of ${mesh.metadata.rayAnglesDeg[index]}`);
      }
    });
  }

  const boundExtent: Vec3 = [
    mesh.bounds.max[0] - mesh.bounds.min[0],
    mesh.bounds.max[1] - mesh.bounds.min[1],
    mesh.bounds.max[2] - mesh.bounds.min[2],
  ];
  const orderedBounds = boundExtent.every((value) => value >= 0);
  if (!orderedBounds) errors.push("Mesh bounds have an inverted minimum/maximum pair");
  const positiveBounds = finiteData
    && orderedBounds
    && boundExtent.every((value) => value > weldTolerance)
    && mesh.bounds.radius > weldTolerance;
  if (options.requirePositiveBounds && !positiveBounds) {
    errors.push("Mesh bounds must have positive X, Y, Z extents and radius");
  }

  for (const group of mesh.groups) {
    if (!Number.isInteger(group.indexOffset)
      || !Number.isInteger(group.indexCount)
      || group.indexOffset < 0
      || group.indexCount <= 0
      || group.indexOffset + group.indexCount > mesh.indices.length
      || group.indexOffset % 3 !== 0
      || group.indexCount % 3 !== 0) {
      errors.push(`Mesh group ${group.id} has an invalid index range`);
    }
  }
  if (options.expectedSectorCount !== undefined && mesh.groups.length !== options.expectedSectorCount) {
    errors.push(`Expected ${options.expectedSectorCount} positive sectors, found ${mesh.groups.length} groups`);
  }

  let nonUnitNormalCount = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const normal = normalAt(mesh, index);
    if (Math.abs(length3(normal) - 1) > normalTolerance) nonUnitNormalCount += 1;
  }
  if (nonUnitNormalCount > 0) errors.push(`${nonUnitNormalCount} vertex normals are not unit length`);

  const weldedKeys: string[] = [];
  const weldedIdByKey = new Map<string, number>();
  const weldedIds = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const key = weldKey(positionAt(mesh, index), weldTolerance);
    let weldedId = weldedIdByKey.get(key);
    if (weldedId === undefined) {
      weldedId = weldedKeys.length;
      weldedKeys.push(key);
      weldedIdByKey.set(key, weldedId);
    }
    weldedIds[index] = weldedId;
  }

  const edgeUses = new Map<string, WeldedEdgeUse>();
  const triangleAdjacency: Array<Set<number>> = Array.from({ length: triangleCount }, () => new Set<number>());
  let degenerateTriangleCount = 0;
  let reversedNormalTriangleCount = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = mesh.indices[triangle * 3];
    const ib = mesh.indices[triangle * 3 + 1];
    const ic = mesh.indices[triangle * 3 + 2];
    if (ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) {
      errors.push(`Triangle ${triangle} references a vertex outside the buffer`);
      continue;
    }
    const a = positionAt(mesh, ia);
    const b = positionAt(mesh, ib);
    const c = positionAt(mesh, ic);
    const geometricNormal = triangleNormal(a, b, c);
    const doubleArea = triangleDoubleArea(a, b, c);
    if (doubleArea < weldTolerance * weldTolerance) {
      degenerateTriangleCount += 1;
      continue;
    }
    const averageNormal = normalize3([
      normalAt(mesh, ia)[0] + normalAt(mesh, ib)[0] + normalAt(mesh, ic)[0],
      normalAt(mesh, ia)[1] + normalAt(mesh, ib)[1] + normalAt(mesh, ic)[1],
      normalAt(mesh, ia)[2] + normalAt(mesh, ib)[2] + normalAt(mesh, ic)[2],
    ]);
    if (dot3(geometricNormal, averageNormal) <= 1e-5) reversedNormalTriangleCount += 1;
    addEdgeUse(edgeUses, weldedIds[ia], weldedIds[ib], triangle);
    addEdgeUse(edgeUses, weldedIds[ib], weldedIds[ic], triangle);
    addEdgeUse(edgeUses, weldedIds[ic], weldedIds[ia], triangle);
  }
  if (degenerateTriangleCount > 0) errors.push(`${degenerateTriangleCount} degenerate triangles found`);
  if (reversedNormalTriangleCount > 0) errors.push(`${reversedNormalTriangleCount} triangles disagree with their vertex normals`);

  let positiveSectorCount = 0;
  let nonPositiveSectorCount = 0;
  if (options.expectedSectorCount !== undefined) {
    for (const group of mesh.groups) {
      const end = Math.min(group.indexOffset + group.indexCount, mesh.indices.length);
      let signedArea = 0;
      let allTrianglesPositive = group.indexCount > 0;
      for (let offset = group.indexOffset; offset + 2 < end; offset += 3) {
        const ia = mesh.indices[offset];
        const ib = mesh.indices[offset + 1];
        const ic = mesh.indices[offset + 2];
        if (ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) {
          allTrianglesPositive = false;
          continue;
        }
        const area = projectedTriangleDoubleArea(positionAt(mesh, ia), positionAt(mesh, ib), positionAt(mesh, ic));
        signedArea += area;
        if (!(area > weldTolerance * weldTolerance)) allTrianglesPositive = false;
      }
      if (allTrianglesPositive && signedArea > weldTolerance * weldTolerance) positiveSectorCount += 1;
      else nonPositiveSectorCount += 1;
    }
    if (positiveSectorCount !== options.expectedSectorCount || nonPositiveSectorCount > 0) {
      errors.push(
        `Expected ${options.expectedSectorCount} positive projected sectors, found ${positiveSectorCount} positive and ${nonPositiveSectorCount} non-positive`,
      );
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let inconsistentWindingEdgeCount = 0;
  for (const use of edgeUses.values()) {
    if (use.total === 1) boundaryEdgeCount += 1;
    if (use.total > 2) nonManifoldEdgeCount += 1;
    if (use.total === 2 && (use.forward !== 1 || use.reverse !== 1)) inconsistentWindingEdgeCount += 1;
    if (use.total === 2) {
      triangleAdjacency[use.triangles[0]].add(use.triangles[1]);
      triangleAdjacency[use.triangles[1]].add(use.triangles[0]);
    }
  }
  if (options.requireClosed && boundaryEdgeCount > 0) errors.push(`${boundaryEdgeCount} open geometric edges found`);
  else if (boundaryEdgeCount > 0) warnings.push(`${boundaryEdgeCount} intentional boundary edges found`);
  if (nonManifoldEdgeCount > 0) errors.push(`${nonManifoldEdgeCount} non-manifold edges found`);
  if (inconsistentWindingEdgeCount > 0) errors.push(`${inconsistentWindingEdgeCount} shared edges have inconsistent winding`);

  const componentCount = countTriangleComponents(triangleAdjacency);
  if (options.expectedComponents !== undefined && componentCount !== options.expectedComponents) {
    errors.push(`Expected ${options.expectedComponents} edge-connected components, found ${componentCount}`);
  }
  const centerKey = weldKey(mesh.metadata.sharedCenterNode, weldTolerance);
  let centerNodeVertexCount = 0;
  let exactSharedCenter = true;
  for (let index = 0; index < vertexCount; index += 1) {
    const position = positionAt(mesh, index);
    if (weldKey(position, weldTolerance) === centerKey) {
      centerNodeVertexCount += 1;
      exactSharedCenter = exactSharedCenter
        && position[0] === mesh.metadata.sharedCenterNode[0]
        && position[1] === mesh.metadata.sharedCenterNode[1]
        && position[2] === mesh.metadata.sharedCenterNode[2];
    }
  }
  const centerNodeWeldedCount = weldedIdByKey.has(centerKey) ? 1 : 0;
  if (centerNodeVertexCount === 0) {
    exactSharedCenter = false;
    errors.push("Shared center node is absent from the vertex data");
  }
  if (options.requireSingleCenterNode && centerNodeWeldedCount !== 1) {
    errors.push(`Expected one welded center node, found ${centerNodeWeldedCount}`);
  }
  if (options.requireExactSharedCenter && !exactSharedCenter) {
    errors.push("Solid groups do not meet at the exact shared center coordinate");
  }
  const centerNodeGroupCount = mesh.groups.reduce((count, group) => {
    const end = group.indexOffset + group.indexCount;
    for (let offset = group.indexOffset; offset < end; offset += 1) {
      if (weldKey(positionAt(mesh, mesh.indices[offset]), weldTolerance) === centerKey) return count + 1;
    }
    return count;
  }, 0);
  if (options.expectedComponents !== undefined && options.expectedComponents > 1 && centerNodeGroupCount < options.expectedComponents) {
    errors.push(`Shared center node reaches only ${centerNodeGroupCount} of ${options.expectedComponents} solid groups`);
  }
  if (options.expectedCenterNodeGroupCount !== undefined
    && centerNodeGroupCount !== options.expectedCenterNodeGroupCount) {
    errors.push(
      `Expected the center node in ${options.expectedCenterNodeGroupCount} groups, found ${centerNodeGroupCount}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    vertexCount,
    triangleCount,
    weldedVertexCount: weldedKeys.length,
    componentCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    inconsistentWindingEdgeCount,
    degenerateTriangleCount,
    reversedNormalTriangleCount,
    nonUnitNormalCount,
    centerNodeVertexCount,
    centerNodeWeldedCount,
    centerNodeGroupCount,
    exactSharedCenter,
    finiteData,
    rayMetadataMatches,
    positiveBounds,
    positiveSectorCount,
    nonPositiveSectorCount,
  };
}

export interface AxisGeometrySelfTestResult {
  valid: boolean;
  foldedVariants: Readonly<Record<ApprovedRawAxisPresetId, AxisMeshValidationReport>>;
  /** Canonical 30° variation 1 folded report retained for callers of the phase-1 API. */
  folded: AxisMeshValidationReport;
  optical: AxisMeshValidationReport;
}

/** Build and validate every approved 30°/45° folded ray combination. */
export function validateApprovedFoldedVariants(): Readonly<Record<ApprovedRawAxisPresetId, AxisMeshValidationReport>> {
  const reports = {} as Record<ApprovedRawAxisPresetId, AxisMeshValidationReport>;
  for (const presetId of APPROVED_RAW_AXIS_PRESET_IDS) {
    const rayAnglesDeg = APPROVED_RAW_AXIS_RAYS[presetId];
    reports[presetId] = validateAxisMesh(buildFoldedSurfaceMesh({ presetId, rayAnglesDeg }), {
      requireClosed: false,
      expectedComponents: 1,
      expectedPresetId: presetId,
      expectedRayAnglesDeg: rayAnglesDeg,
      expectedSectorCount: rayAnglesDeg.length,
      expectedCenterNodeGroupCount: rayAnglesDeg.length,
      requirePositiveBounds: true,
      requireSingleCenterNode: true,
    });
  }
  return Object.freeze(reports);
}

/** Build all folded variants plus the canonical two-solid optical mesh. */
export function runAxisGeometrySelfTest(): AxisGeometrySelfTestResult {
  const foldedVariants = validateApprovedFoldedVariants();
  const folded = foldedVariants["30-v1"];
  const optical = validateAxisMesh(buildClosedOpticalSolidMesh(), {
    requireClosed: true,
    expectedComponents: 2,
    expectedPresetId: PLEOS_30_VARIATION_1.id,
    expectedRayAnglesDeg: APPROVED_RAW_AXIS_RAYS["30-v1"],
    expectedCenterNodeGroupCount: 2,
    requirePositiveBounds: true,
    requireSingleCenterNode: true,
    requireExactSharedCenter: true,
  });
  return {
    valid: APPROVED_RAW_AXIS_PRESET_IDS.every((presetId) => foldedVariants[presetId].valid) && optical.valid,
    foldedVariants,
    folded,
    optical,
  };
}

export function assertValidAxisMesh(mesh: AxisMeshData, options: AxisMeshValidationOptions = {}): void {
  const report = validateAxisMesh(mesh, options);
  if (!report.valid) throw new Error(`Invalid ${mesh.mode} mesh: ${report.errors.join("; ")}`);
}

function positionAt(mesh: AxisMeshData, index: number): Vec3 {
  return [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]];
}

function normalAt(mesh: AxisMeshData, index: number): Vec3 {
  return [mesh.normals[index * 3], mesh.normals[index * 3 + 1], mesh.normals[index * 3 + 2]];
}

function weldKey(point: Vec3, tolerance: number): string {
  return `${Math.round(point[0] / tolerance)},${Math.round(point[1] / tolerance)},${Math.round(point[2] / tolerance)}`;
}

function triangleDoubleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return Math.hypot(
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
  );
}

function projectedTriangleDoubleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function addEdgeUse(map: Map<string, WeldedEdgeUse>, from: number, to: number, triangle: number): void {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const key = `${low}:${high}`;
  const use = map.get(key) ?? { total: 0, forward: 0, reverse: 0, triangles: [] };
  use.total += 1;
  if (from === low) use.forward += 1;
  else use.reverse += 1;
  use.triangles.push(triangle);
  map.set(key, use);
}

function countTriangleComponents(adjacency: readonly Set<number>[]): number {
  let count = 0;
  const visited = new Uint8Array(adjacency.length);
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited[start]) continue;
    count += 1;
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      for (const next of adjacency[current]) {
        if (!visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
  }
  return count;
}

function angleDistanceDeg(a: number, b: number): number {
  const delta = ((a - b + 180) % 360 + 360) % 360 - 180;
  return Math.abs(delta);
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function sameAngleSequence(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length
    && actual.every((angle, index) => angleDistanceDeg(angle, expected[index]) <= 1e-8);
}

function allFinite(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) return false;
  }
  return true;
}
