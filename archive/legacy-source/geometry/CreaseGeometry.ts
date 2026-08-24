import * as THREE from "three";
import type { NewAxisGeometrySettings } from "../state/threeDStudioState";
import { RAY_ORDER, rayDirections } from "./newAxisCoordinates";

export function createCreaseGeometry(settings: NewAxisGeometrySettings): THREE.BufferGeometry {
  const positions: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const centerZ = settings.centerDepth * settings.depthScale * settings.depthExaggeration;
  const segments = Math.max(1, Math.round(settings.crease.segments));
  RAY_ORDER.forEach((id) => {
    const d = rayDirections[id]; const perpendicular = new THREE.Vector2(-d.y, d.x);
    const outerZ = settings.rayDepth[id] * settings.outerRadius * settings.depthScale * settings.depthExaggeration;
    const start = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const eased = THREE.MathUtils.smoothstep(t, 0, 1);
      const crown = Math.sin(Math.PI * t) * settings.crease.smoothness;
      const halfWidth = settings.crease.width * (1 + crown);
      const center = d.clone().multiplyScalar(settings.outerRadius * t);
      const z = THREE.MathUtils.lerp(centerZ, outerZ, eased) + crown * settings.crease.width;
      const offset = perpendicular.clone().multiplyScalar(halfWidth);
      positions.push(center.x + offset.x, center.y + offset.y, z, center.x - offset.x, center.y - offset.y, z);
      uvs.push(0, t, 1, t);
      if (segment < segments) {
        const a = start + segment * 2; const b = a + 1; const c = a + 2; const dIndex = a + 3;
        indices.push(a, b, dIndex, a, dIndex, c);
      }
    }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
