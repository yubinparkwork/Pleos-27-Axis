import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { AxisStructureSettings, SpectralSettings } from "../state/studioState";
import type { AxisGraphLike, SectorGeometry } from "./FoldSurfaceBuilder";

interface BasisDefinition {
  id: "cube-left" | "cube-right";
  directions: [number, number, number];
  zSigns: [number, number, number];
}

// These screen directions are the isometric projection of three mutually
// perpendicular, equal-length cube edges. The left and right cubes meet only
// at their local (0,0,0) corner: the Axis origin.
const CUBES: BasisDefinition[] = [
  { id: "cube-left", directions: [90, 150, 210], zSigns: [1, -1, 1] },
  { id: "cube-right", directions: [-90, 30, -30], zSigns: [1, 1, -1] },
];

const FACE_CORNERS = [
  [0, 2, 6, 4], [1, 5, 7, 3],
  [0, 1, 3, 2], [4, 6, 7, 5],
  [0, 4, 5, 1], [2, 3, 7, 6],
] as const;
const FACE_SUBDIVISIONS = 22;

export function canBuildCornerCubes(graph: AxisGraphLike): boolean {
  const angles = new Set(graph.rays.map((ray) => normalizeAngle(ray.angleDeg)));
  return [30, 90, 150, 210, 270, 330].every((angle) => angles.has(angle));
}

export function buildCornerCubeAssembly(
  graph: AxisGraphLike,
  originZ: number,
  settings: AxisStructureSettings,
  spectral?: SpectralSettings,
): SectorGeometry[] {
  const frameWidth = graph.frame.maxX - graph.frame.minX;
  const projectedEdge = frameWidth * THREE.MathUtils.clamp(settings.cubeScale, 0.18, 0.72);
  const zMagnitude = projectedEdge / Math.sqrt(2);
  const origin = new THREE.Vector3(graph.origin.x, graph.origin.y, originZ);

  return CUBES.map((definition) => {
    const basis = definition.directions.map((angle, index) => {
      const radians = THREE.MathUtils.degToRad(angle);
      return new THREE.Vector3(
        Math.cos(radians) * projectedEdge,
        Math.sin(radians) * projectedEdge,
        definition.zSigns[index] * zMagnitude,
      );
    });
    const vertices = Array.from({ length: 8 }, (_, mask) => origin.clone()
      .addScaledVector(basis[0], mask & 1 ? 1 : 0)
      .addScaledVector(basis[1], mask & 2 ? 1 : 0)
      .addScaledVector(basis[2], mask & 4 ? 1 : 0));
    const geometry = spectral?.enabled && spectral.geometryMode === "optical-solid"
      ? makeOpticalCubeGeometry(vertices, basis, graph, origin, spectral)
      : makeCubeGeometry(vertices, graph, origin);
    const center = vertices.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 8);
    return { id: definition.id, rayA: definition.id, rayB: definition.id, geometry, center };
  });
}

const QUALITY_DIVISIONS: Record<SpectralSettings["quality"], number> = {
  draft: 2,
  balanced: 4,
  high: 7,
  ultra: 10,
  final: 14,
};

function makeOpticalCubeGeometry(
  analyticCorners: THREE.Vector3[],
  basis: THREE.Vector3[],
  graph: AxisGraphLike,
  origin: THREE.Vector3,
  settings: SpectralSettings,
): THREE.BufferGeometry {
  const bevel = THREE.MathUtils.clamp(settings.bevelWidth * settings.bevelCurvature, 0.002, 0.16);
  const divisions = THREE.MathUtils.clamp(Math.round(settings.bevelSegments), 1, QUALITY_DIVISIONS[settings.quality]);
  const geometry: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, divisions, bevel);
  geometry.translate(0.5, 0.5, 0.5);

  // RoundedBoxGeometry removes the mathematical corner. Translate its nearest
  // sample back to local zero so both solids still meet at one exact Axis node.
  const initialPosition = geometry.getAttribute("position") as THREE.BufferAttribute;
  const contact = new THREE.Vector3();
  let contactDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < initialPosition.count; index += 1) {
    const candidate = new THREE.Vector3(initialPosition.getX(index), initialPosition.getY(index), initialPosition.getZ(index));
    if (candidate.lengthSq() < contactDistance) { contactDistance = candidate.lengthSq(); contact.copy(candidate); }
  }
  geometry.translate(-contact.x, -contact.y, -contact.z);

  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    local.set(position.getX(index), position.getY(index), position.getZ(index));
    const boundary = [Math.min(local.x, 1 - local.x), Math.min(local.y, 1 - local.y), Math.min(local.z, 1 - local.z)].sort((a, b) => a - b);
    const edgeLock = THREE.MathUtils.smoothstep(boundary[1], 0.015, 0.16);
    const centerLock = THREE.MathUtils.smoothstep(local.length(), 0.08, 0.32);
    const mask = edgeLock * centerLock;
    const large = Math.sin(local.x * 2.7 + local.z * 1.3) * Math.cos(local.y * 2.1 - local.z * 0.8);
    const fracture = Math.pow(Math.abs(Math.sin(local.dot(new THREE.Vector3(7.1, 4.7, 5.9)) + 0.7)), 12) - 0.12;
    const micro = Math.sin(local.x * 31 + local.y * 23) * Math.cos(local.z * 29 - local.x * 17);
    const displacement = mask * (large * settings.surfaceWarp + fracture * settings.fractureStrength + micro * settings.microDetail);
    n.set(normal.getX(index), normal.getY(index), normal.getZ(index));
    local.addScaledVector(n, displacement);
    world.copy(origin)
      .addScaledVector(basis[0], local.x * settings.volumeScale)
      .addScaledVector(basis[1], local.y * settings.volumeScale)
      .addScaledVector(basis[2], local.z * settings.volumeScale);
    position.setXYZ(index, world.x, world.y, world.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  addOpticalAttributes(geometry, graph, origin, analyticCorners);
  geometry.userData.cubeCorners = analyticCorners.map((point) => point.toArray());
  geometry.userData.opticalSolid = true;
  geometry.userData.bevelWidth = bevel;
  geometry.userData.divisions = divisions;
  return geometry;
}

function addOpticalAttributes(geometry: THREE.BufferGeometry, graph: AxisGraphLike, origin: THREE.Vector3, analyticCorners: THREE.Vector3[]): void {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const width = graph.frame.maxX - graph.frame.minX;
  const height = graph.frame.maxY - graph.frame.minY;
  const scale = Math.min(width, height);
  const uvs: number[] = [];
  const axis: number[] = [];
  const center: number[] = [];
  const edge: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    const point = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index));
    uvs.push((point.x - graph.frame.minX) / width, (point.y - graph.frame.minY) / height);
    axis.push(distanceToNearestRay(point, graph) / scale);
    center.push(Math.hypot(point.x - origin.x, point.y - origin.y) / scale);
    let nearestEdge = Number.POSITIVE_INFINITY;
    for (let a = 0; a < analyticCorners.length; a += 1) for (let b = a + 1; b < analyticCorners.length; b += 1) {
      const bitDistance = (a ^ b).toString(2).replace(/0/g, "").length;
      if (bitDistance === 1) nearestEdge = Math.min(nearestEdge, distanceToSegment3(point, analyticCorners[a], analyticCorners[b]));
    }
    edge.push(nearestEdge / scale);
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aAxisDistance", new THREE.Float32BufferAttribute(axis, 1));
  geometry.setAttribute("aCenterDistance", new THREE.Float32BufferAttribute(center, 1));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(edge, 1));
  geometry.computeBoundingSphere();
}

function distanceToSegment3(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return point.distanceTo(a.clone().addScaledVector(ab, t));
}

function makeCubeGeometry(vertices: THREE.Vector3[], graph: AxisGraphLike, origin: THREE.Vector3): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const axisDistances: number[] = [];
  const centerDistances: number[] = [];
  const faceEdgeDistances: number[] = [];
  const width = graph.frame.maxX - graph.frame.minX;
  const height = graph.frame.maxY - graph.frame.minY;
  const scale = Math.min(width, height);
  const push = (point: THREE.Vector3, faceEdge: number): void => {
    positions.push(point.x, point.y, point.z);
    uvs.push((point.x - graph.frame.minX) / width, (point.y - graph.frame.minY) / height);
    axisDistances.push(distanceToNearestRay(point, graph) / scale);
    centerDistances.push(Math.hypot(point.x - origin.x, point.y - origin.y) / scale);
    faceEdgeDistances.push(faceEdge);
  };
  const sampleFace = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u: number, v: number): THREE.Vector3 => {
    const top = a.clone().lerp(b, u);
    const bottom = d.clone().lerp(c, u);
    return top.lerp(bottom, v);
  };
  FACE_CORNERS.forEach(([a, b, c, d]) => {
    for (let y = 0; y < FACE_SUBDIVISIONS; y += 1) {
      for (let x = 0; x < FACE_SUBDIVISIONS; x += 1) {
        const u0 = x / FACE_SUBDIVISIONS;
        const v0 = y / FACE_SUBDIVISIONS;
        const u1 = (x + 1) / FACE_SUBDIVISIONS;
        const v1 = (y + 1) / FACE_SUBDIVISIONS;
        const p00 = sampleFace(vertices[a], vertices[b], vertices[c], vertices[d], u0, v0);
        const p10 = sampleFace(vertices[a], vertices[b], vertices[c], vertices[d], u1, v0);
        const p11 = sampleFace(vertices[a], vertices[b], vertices[c], vertices[d], u1, v1);
        const p01 = sampleFace(vertices[a], vertices[b], vertices[c], vertices[d], u0, v1);
        const e00 = Math.min(u0, v0, 1 - u0, 1 - v0);
        const e10 = Math.min(u1, v0, 1 - u1, 1 - v0);
        const e11 = Math.min(u1, v1, 1 - u1, 1 - v1);
        const e01 = Math.min(u0, v1, 1 - u0, 1 - v1);
        push(p00, e00); push(p10, e10); push(p11, e11);
        push(p00, e00); push(p11, e11); push(p01, e01);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aAxisDistance", new THREE.Float32BufferAttribute(axisDistances, 1));
  geometry.setAttribute("aCenterDistance", new THREE.Float32BufferAttribute(centerDistances, 1));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(faceEdgeDistances, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.cubeCorners = vertices.map((point) => point.toArray());
  return geometry;
}

function distanceToNearestRay(point: THREE.Vector3, graph: AxisGraphLike): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ray of graph.rays) {
    const dx = ray.endpoint.x - graph.origin.x;
    const dy = ray.endpoint.y - graph.origin.y;
    const t = THREE.MathUtils.clamp(((point.x - graph.origin.x) * dx + (point.y - graph.origin.y) * dy) / Math.max(1e-9, dx * dx + dy * dy), 0, 1);
    nearest = Math.min(nearest, Math.hypot(point.x - (graph.origin.x + dx * t), point.y - (graph.origin.y + dy * t)));
  }
  return nearest;
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}
