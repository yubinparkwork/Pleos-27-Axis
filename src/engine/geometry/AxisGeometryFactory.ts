import * as THREE from "three/webgpu";
import {
  approvedRawAxisRays,
  buildAxisGeometry,
  type AxisMeshData,
} from "../../raw-webgl/geometry";
import type { RawStudioState } from "../../studio/state/RawStudioState";

const FRAME_WIDTH = 2.8;
const FRAME_HEIGHT = 2.08;

export interface AxisGeometryResult {
  geometry: THREE.BufferGeometry;
  source: AxisMeshData;
}

export function createAxisGeometry(state: Readonly<RawStudioState>): AxisGeometryResult {
  const geometryState = state.geometry;
  const prism = state.material.mode === "prism";
  const variation = prism ? "30-v1" : geometryState.variation;
  const origin: [number, number, number] = [
    ((geometryState.originGrid[0] - 10) / 20) * FRAME_WIDTH,
    ((geometryState.originGrid[1] - 10) / 20) * FRAME_HEIGHT,
    0,
  ];
  const source = buildAxisGeometry("closed-optical-solid", {
    presetId: variation,
    rayAnglesDeg: approvedRawAxisRays(variation),
    origin,
    frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    foldDepth: geometryState.foldDepth,
    depthRatio: Math.max(0.02, geometryState.solidThickness),
    bevel: {
      enabled: geometryState.bevelEnabled,
      width: geometryState.bevelWidth,
      segments: Math.max(1, Math.round(geometryState.bevelSegments)),
      curvature: geometryState.bevelCurvature,
      preserveCenterNode: true,
    },
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(source.positions.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals.slice(), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(source.uvs.slice(), 2));
  geometry.setAttribute("faceId", new THREE.Uint32BufferAttribute(source.faceIds.slice(), 1));
  // Keep the watertight source geometry intact while separating its broad
  // planes from the precision-cut bevel facets. Material slot 0 is the body;
  // slot 1 is reserved for bevel/corner optics.
  const bevelFaces = new Set(source.metadata.semanticFaces.bevelFaceIds);
  const orderedIndices: number[] = [];
  source.groups.forEach((solid) => {
    const body: number[] = [];
    const facets: number[] = [];
    const end = solid.indexOffset + solid.indexCount;
    for (let offset = solid.indexOffset; offset < end; offset += 3) {
      const firstIndex = source.indices[offset];
      const target = bevelFaces.has(source.faceIds[firstIndex]) ? facets : body;
      target.push(source.indices[offset], source.indices[offset + 1], source.indices[offset + 2]);
    }
    if (body.length > 0) {
      geometry.addGroup(orderedIndices.length, body.length, 0);
      orderedIndices.push(...body);
    }
    if (facets.length > 0) {
      geometry.addGroup(orderedIndices.length, facets.length, 1);
      orderedIndices.push(...facets);
    }
  });
  geometry.setIndex(new THREE.Uint32BufferAttribute(orderedIndices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, source };
}
