import * as THREE from "three";
import type { NewAxisGeometrySettings } from "../state/threeDStudioState";
import type { FaceId, ProjectionMode } from "../textures/types";
import { RAY_ORDER, rayDirections, REFERENCE_ASPECT, type RayId } from "./newAxisCoordinates";

export const FACE_ORDER: FaceId[] = ["top-right", "right-middle", "bottom-right", "bottom-left", "left-upper"];

export interface FaceGeometryRecord { id: FaceId; geometry: THREE.BufferGeometry; center: THREE.Vector3 }

function vertex(id: RayId, settings: NewAxisGeometrySettings): THREE.Vector3 {
  const direction = rayDirections[id];
  return new THREE.Vector3(direction.x * settings.outerRadius, direction.y * settings.outerRadius, settings.rayDepth[id] * settings.outerRadius * settings.depthScale * settings.depthExaggeration);
}

function uvsFor(face: number, positions: THREE.Vector3[], projection: ProjectionMode, rotation: [number, number, number]): number[] {
  if (projection === "face-local") return [0.5, 0, 0, 1, 1, 1];
  const euler = new THREE.Euler(THREE.MathUtils.degToRad(rotation[0]), THREE.MathUtils.degToRad(rotation[1]), THREE.MathUtils.degToRad(rotation[2]));
  return positions.flatMap((original, index) => {
    const p = original.clone();
    if (projection === "world-planar") p.applyEuler(euler);
    const u = p.x / (REFERENCE_ASPECT * 2) + .5;
    const v = .5 - p.y / 2;
    if (projection === "screen") return [u, v];
    return [u + face * .037 + index * .003, v];
  });
}

export function createRadialFoldFaces(settings: NewAxisGeometrySettings, projection: ProjectionMode): FaceGeometryRecord[] {
  const center = new THREE.Vector3(0, 0, settings.centerDepth * settings.depthScale * settings.depthExaggeration);
  const rays = Object.fromEntries(RAY_ORDER.map((id) => [id, vertex(id, settings)])) as Record<RayId, THREE.Vector3>;
  return FACE_ORDER.map((id, face) => {
    const a = rays[RAY_ORDER[face]];
    const b = rays[RAY_ORDER[(face + 1) % RAY_ORDER.length]];
    const positions = [center.clone(), a.clone(), b.clone()];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions.flatMap((point) => point.toArray()), 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvsFor(face, positions, projection, settings.rotation), 2));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const faceCenter = center.clone().add(a).add(b).multiplyScalar(1 / 3);
    return { id, geometry, center: faceCenter };
  });
}
