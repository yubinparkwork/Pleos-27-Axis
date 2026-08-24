import * as THREE from "three";
import type { AxisStructureSettings } from "../state/studioState";

interface SolidPoint { x: number; y: number; z: number }
interface SolidFrame { minX: number; maxX: number; minY: number; maxY: number }

/**
 * Turns an Axis sector into a closed prism cell. Adjacent cells retain the
 * exact same origin-to-ray edge, so the Axis is read from a real hard crease
 * between two solids rather than a line primitive or an emissive overlay.
 */
export function buildSolidAxisCellGeometry(
  polygon: SolidPoint[],
  frame: SolidFrame,
  origin: SolidPoint,
  settings: AxisStructureSettings,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const axisDistances: number[] = [];
  const centerDistances: number[] = [];
  const faceEdgeDistances: number[] = [];
  const width = frame.maxX - frame.minX;
  const height = frame.maxY - frame.minY;
  const scale = Math.min(width, height);
  const depth = THREE.MathUtils.clamp(settings.depth, 0.04, 1.5) * scale;
  const firstRayEnd = polygon[1] ?? origin;
  const lastRayEnd = polygon[polygon.length - 1] ?? origin;

  const distanceToSegment = (point: SolidPoint, a: SolidPoint, b: SolidPoint): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-12) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  };

  const push = (point: SolidPoint): void => {
    positions.push(point.x, point.y, point.z);
    uvs.push((point.x - frame.minX) / width, (point.y - frame.minY) / height);
    axisDistances.push(Math.min(
      distanceToSegment(point, origin, firstRayEnd),
      distanceToSegment(point, origin, lastRayEnd),
    ) / scale);
    centerDistances.push(Math.hypot(point.x - origin.x, point.y - origin.y) / scale);
    faceEdgeDistances.push(1);
  };

  const pushTriangle = (a: SolidPoint, b: SolidPoint, c: SolidPoint): void => {
    push(a); push(b); push(c);
  };

  // Front cap. Every sector starts at the common node and shares its two ray
  // boundary vertices with its neighbours.
  for (let index = 1; index < polygon.length - 1; index += 1) {
    pushTriangle(polygon[0], polygon[index], polygon[index + 1]);
  }

  const back = polygon.map((point) => ({ x: point.x, y: point.y, z: point.z - depth }));
  // Back cap, reversed winding.
  for (let index = 1; index < back.length - 1; index += 1) {
    pushTriangle(back[0], back[index + 1], back[index]);
  }

  // Individual side quads keep flat normals. Internal side walls coincide
  // exactly where cells touch, while outer walls reveal real body thickness.
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    const frontA = polygon[index];
    const frontB = polygon[next];
    const backA = back[index];
    const backB = back[next];
    pushTriangle(frontA, backA, backB);
    pushTriangle(frontA, backB, frontB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aAxisDistance", new THREE.Float32BufferAttribute(axisDistances, 1));
  geometry.setAttribute("aCenterDistance", new THREE.Float32BufferAttribute(centerDistances, 1));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(faceEdgeDistances, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
