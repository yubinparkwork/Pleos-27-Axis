import * as THREE from "three";
import type { AxisStructureSettings, FoldState } from "../state/studioState";
import type { SpectralSettings } from "../state/studioState";
import { buildCurvedSectorGeometry } from "./CurvedAxisSurfaceBuilder";
import { buildSolidAxisCellGeometry } from "./SolidAxisCellBuilder";
import { buildCornerCubeAssembly, canBuildCornerCubes } from "./CornerCubeAssemblyBuilder";
import { buildCrystalAxisCluster } from "./CrystalAxisClusterBuilder";

export interface AxisRayLike {
  id: string;
  angleDeg: number;
  direction: { x: number; y: number };
  endpoint: { x: number; y: number };
}

export interface AxisGraphLike {
  origin: { x: number; y: number };
  rays: AxisRayLike[];
  frame: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface SectorGeometry {
  id: string;
  rayA: string;
  rayB: string;
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
}

interface Point2 { x: number; y: number }
interface Point3 extends Point2 { z: number }

const TAU = Math.PI * 2;

function angleOf(origin: Point2, point: Point2): number {
  const value = Math.atan2(point.y - origin.y, point.x - origin.x);
  return value < 0 ? value + TAU : value;
}

function deltaAngle(from: number, to: number): number {
  const value = (to - from) % TAU;
  return value < 0 ? value + TAU : value;
}

function planeZ(origin: Point3, a: Point3, b: Point3, point: Point2): number {
  const ab = new THREE.Vector3(a.x - origin.x, a.y - origin.y, a.z - origin.z);
  const ac = new THREE.Vector3(b.x - origin.x, b.y - origin.y, b.z - origin.z);
  const normal = ab.cross(ac);
  if (Math.abs(normal.z) < 1e-7) return origin.z;
  return origin.z - (normal.x * (point.x - origin.x) + normal.y * (point.y - origin.y)) / normal.z;
}

function frameCorners(frame: AxisGraphLike["frame"]): Point2[] {
  return [
    { x: frame.maxX, y: frame.minY },
    { x: frame.maxX, y: frame.maxY },
    { x: frame.minX, y: frame.maxY },
    { x: frame.minX, y: frame.minY },
  ];
}

function buildSectorPolygon(graph: AxisGraphLike, a: AxisRayLike, b: AxisRayLike, fold: FoldState): Point3[] {
  const origin: Point3 = { ...graph.origin, z: fold.centerZ };
  const a3: Point3 = { ...a.endpoint, z: fold.rayDepth[a.id] ?? 0 };
  const b3: Point3 = { ...b.endpoint, z: fold.rayDepth[b.id] ?? 0 };
  const start = angleOf(graph.origin, a.endpoint);
  const span = deltaAngle(start, angleOf(graph.origin, b.endpoint));
  const corners = frameCorners(graph.frame)
    .map((point) => ({ point, offset: deltaAngle(start, angleOf(graph.origin, point)) }))
    .filter(({ offset }) => offset > 1e-6 && offset < span - 1e-6)
    .sort((left, right) => left.offset - right.offset)
    .map(({ point }) => ({ ...point, z: planeZ(origin, a3, b3, point) }));
  return [origin, a3, ...corners, b3];
}

function makeGeometry(points: Point3[], frame: AxisGraphLike["frame"]): THREE.BufferGeometry {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const faceEdgeDistances: number[] = [];
  const width = frame.maxX - frame.minX;
  const height = frame.maxY - frame.minY;
  for (let index = 1; index < points.length - 1; index += 1) {
    const tri = [points[0], points[index], points[index + 1]];
    for (const point of tri) {
      vertices.push(point.x, point.y, point.z);
      uvs.push((point.x - frame.minX) / width, (point.y - frame.minY) / height);
      faceEdgeDistances.push(1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(faceEdgeDistances, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildFoldSectors(
  graph: AxisGraphLike,
  fold: FoldState,
  spectral?: SpectralSettings,
  structure: AxisStructureSettings = { mode: "folded-surface", depth: 0.42, cubeScale: 0.36 },
): SectorGeometry[] {
  const rays = [...graph.rays].sort((left, right) => {
    const a = angleOf(graph.origin, left.endpoint);
    const b = angleOf(graph.origin, right.endpoint);
    return a - b;
  });
  if (structure.mode === "crystal-cluster") {
    return buildCrystalAxisCluster(graph, fold.centerZ, structure, spectral);
  }
  if (structure.mode === "corner-cubes" && canBuildCornerCubes(graph)) {
    return buildCornerCubeAssembly(graph, fold.centerZ, structure, spectral);
  }
  return rays.map((ray, index) => {
    const next = rays[(index + 1) % rays.length];
    const points = buildSectorPolygon(graph, ray, next, fold);
    const center = points.reduce<THREE.Vector3>((sum, point) => sum.add(new THREE.Vector3(point.x, point.y, point.z)), new THREE.Vector3()).multiplyScalar(1 / points.length);
    return {
      id: `sector-${index + 1}`,
      rayA: ray.id,
      rayB: next.id,
      geometry: structure.mode === "joined-hexahedra" || structure.mode === "corner-cubes"
        ? buildSolidAxisCellGeometry(points, graph.frame, { ...graph.origin, z: fold.centerZ }, structure)
        : spectral?.enabled && spectral.surfaceMode !== "flat"
          ? buildCurvedSectorGeometry(points, graph.frame, { ...graph.origin, z: fold.centerZ }, spectral, index)
          : makeGeometry(points, graph.frame),
      center,
    };
  });
}

export function disposeSectors(sectors: SectorGeometry[]): void {
  sectors.forEach((sector) => sector.geometry.dispose());
}

export function evaluateMasterFold(base: FoldState, normalizedTime: number, intensity: number): FoldState {
  const t = normalizedTime * Math.PI * 2;
  const entries = Object.entries(base.rayDepth).map(([id, depth], index) => [
    id,
    depth + Math.sin(t + index * 1.17) * intensity * 0.16 + Math.cos(t * 0.5 - index * 0.61) * intensity * 0.035,
  ]);
  return {
    centerZ: base.centerZ + Math.sin(t * 0.5) * intensity * 0.025,
    rayDepth: Object.fromEntries(entries),
  };
}
