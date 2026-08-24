import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import type { AxisStructureSettings, SpectralSettings } from "../state/studioState";
import type { AxisGraphLike, SectorGeometry } from "./FoldSurfaceBuilder";

function seeded(index: number, salt: number): number {
  return THREE.MathUtils.seededRandom(index * 101 + salt * 977);
}

function makeRing(center: THREE.Vector3, perpendicular: THREE.Vector3, width: number, depth: number, sides: number, twist: number): THREE.Vector3[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = index / sides * Math.PI * 2 + twist;
    return center.clone()
      .addScaledVector(perpendicular, Math.cos(angle) * width)
      .add(new THREE.Vector3(0, 0, Math.sin(angle) * depth));
  });
}

function decorate(geometry: THREE.BufferGeometry, graph: AxisGraphLike, origin: THREE.Vector3): void {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const width = graph.frame.maxX - graph.frame.minX;
  const height = graph.frame.maxY - graph.frame.minY;
  const scale = Math.min(width, height);
  const uv: number[] = [];
  const axisDistance: number[] = [];
  const centerDistance: number[] = [];
  const faceEdge: number[] = [];
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.set(position.getX(index), position.getY(index), position.getZ(index));
    uv.push((point.x - graph.frame.minX) / width, (point.y - graph.frame.minY) / height);
    let nearest = Number.POSITIVE_INFINITY;
    for (const ray of graph.rays) {
      const direction = new THREE.Vector2(ray.direction.x, ray.direction.y).normalize();
      const relative = new THREE.Vector2(point.x - origin.x, point.y - origin.y);
      const projection = Math.max(0, relative.dot(direction));
      nearest = Math.min(nearest, relative.distanceTo(direction.multiplyScalar(projection)));
    }
    axisDistance.push(nearest / scale);
    centerDistance.push(Math.hypot(point.x - origin.x, point.y - origin.y) / scale);
    faceEdge.push(0.1);
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aAxisDistance", new THREE.Float32BufferAttribute(axisDistance, 1));
  geometry.setAttribute("aCenterDistance", new THREE.Float32BufferAttribute(centerDistance, 1));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(faceEdge, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function buildShard(graph: AxisGraphLike, rayIndex: number, origin: THREE.Vector3, scale: number, reach: number, spectral?: SpectralSettings): SectorGeometry {
  const ray = graph.rays[rayIndex];
  const seedIndex = rayIndex;
  const direction = new THREE.Vector3(ray.direction.x, ray.direction.y, 0).normalize();
  const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0);
  const endpointDistance = Math.hypot(ray.endpoint.x - origin.x, ray.endpoint.y - origin.y);
  const length = endpointDistance * THREE.MathUtils.lerp(0.82, 1.14, seeded(seedIndex, 1)) * reach;
  const width = scale * THREE.MathUtils.lerp(0.075, 0.145, seeded(seedIndex, 2));
  const depth = scale * THREE.MathUtils.lerp(0.12, 0.24, seeded(seedIndex, 3));
  const lift = scale * THREE.MathUtils.lerp(-0.18, 0.22, seeded(seedIndex, 4));
  const twist = seeded(seedIndex, 5) * Math.PI;
  const deformation = spectral?.enabled ? spectral.fractureStrength * 0.35 : 0;

  const lateral = (seeded(seedIndex, 8) - 0.5) * width * 1.25;
  const shoulder = origin.clone().addScaledVector(direction, length * 0.07).addScaledVector(perpendicular, lateral * 0.12).add(new THREE.Vector3(0, 0, lift * 0.22));
  const body = origin.clone().addScaledVector(direction, length * THREE.MathUtils.lerp(0.34, 0.64, seeded(seedIndex, 6))).addScaledVector(perpendicular, lateral).add(new THREE.Vector3(0, 0, lift));
  const neck = origin.clone().addScaledVector(direction, length * THREE.MathUtils.lerp(0.76, 0.91, seeded(seedIndex, 9))).addScaledVector(perpendicular, lateral * 0.5).add(new THREE.Vector3(0, 0, lift * 0.48));
  const tip = origin.clone().addScaledVector(direction, length).addScaledVector(perpendicular, lateral * 0.18 + (seeded(seedIndex, 7) - 0.5) * width * 0.5).add(new THREE.Vector3(0, 0, lift * 0.14));
  const points = [origin.clone()]
    .concat(makeRing(shoulder, perpendicular, width * 0.32, depth * 0.34, 4, twist))
    .concat(makeRing(body, perpendicular, width * (0.92 + deformation), depth, 4, twist + 0.1))
    .concat(makeRing(neck, perpendicular, width * 0.42, depth * 0.46, 4, twist - 0.06))
    .concat([tip]);
  const hull = new ConvexGeometry(points);
  const geometry = toCreasedNormals(hull, THREE.MathUtils.degToRad(24));
  hull.dispose();
  decorate(geometry, graph, origin);
  geometry.userData.crystalShard = true;
  geometry.userData.axisRay = ray.id;
  return { id: `crystal-${ray.id}`, rayA: ray.id, rayB: ray.id, geometry, center: body };
}

function buildCore(graph: AxisGraphLike, origin: THREE.Vector3, scale: number): SectorGeometry {
  const points: THREE.Vector3[] = [];
  const radius = scale * 0.09;
  for (let index = 0; index < 14; index += 1) {
    const theta = seeded(index, 21) * Math.PI * 2;
    const z = THREE.MathUtils.lerp(-0.85, 0.9, seeded(index, 22));
    const radial = Math.sqrt(Math.max(0, 1 - z * z)) * radius * THREE.MathUtils.lerp(0.72, 1.08, seeded(index, 23));
    points.push(origin.clone().add(new THREE.Vector3(Math.cos(theta) * radial, Math.sin(theta) * radial, z * radius * 1.35)));
  }
  const geometry = new ConvexGeometry(points);
  decorate(geometry, graph, origin);
  geometry.userData.crystalCore = true;
  return { id: "crystal-core", rayA: "core", rayB: "core", geometry, center: origin.clone() };
}

export function buildCrystalAxisCluster(
  graph: AxisGraphLike,
  originZ: number,
  structure: AxisStructureSettings,
  spectral?: SpectralSettings,
): SectorGeometry[] {
  const scale = Math.min(graph.frame.maxX - graph.frame.minX, graph.frame.maxY - graph.frame.minY);
  const origin = new THREE.Vector3(graph.origin.x, graph.origin.y, originZ);
  const reach = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(structure.cubeScale, 0.18, 0.72), 0.18, 0.72, 0.82, 1.22);
  const shards = graph.rays.map((_, index) => buildShard(graph, index, origin, scale, reach, spectral));
  return shards.concat(buildCore(graph, origin, scale));
}
