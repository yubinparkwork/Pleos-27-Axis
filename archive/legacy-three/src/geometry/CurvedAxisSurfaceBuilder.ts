import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { SpectralSettings } from "../state/studioState";

export interface SurfacePoint { x: number; y: number; z: number }
export interface SurfaceFrame { minX: number; maxX: number; minY: number; maxY: number }

const QUALITY_SUBDIVISIONS: Record<SpectralSettings["quality"], number> = {
  draft: 10,
  balanced: 22,
  high: 38,
  ultra: 48,
  final: 56,
};

function distanceToSegment(point: SurfacePoint, a: SurfacePoint, b: SurfacePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function nearestBoundary(point: SurfacePoint, polygon: SurfacePoint[]): number {
  let result = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    result = Math.min(result, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
  }
  return result;
}

function smoothstep(min: number, max: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - min) / Math.max(1e-7, max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixPoint(a: SurfacePoint, b: SurfacePoint, c: SurfacePoint, u: number, v: number): SurfacePoint {
  const w = 1 - u - v;
  return { x: a.x * w + b.x * u + c.x * v, y: a.y * w + b.y * u + c.y * v, z: a.z * w + b.z * u + c.z * v };
}

function deformPoint(point: SurfacePoint, polygon: SurfacePoint[], origin: SurfacePoint, settings: SpectralSettings, faceIndex: number, frameScale: number): { point: SurfacePoint; edge: number; center: number } {
  const boundaryDistance = nearestBoundary(point, polygon);
  const centerDistance = Math.hypot(point.x - origin.x, point.y - origin.y);
  const edgeWidth = settings.edgeLockWidth * frameScale;
  const edgeMask = polygon.reduce((mask, vertex, index) => {
    const distance = distanceToSegment(point, vertex, polygon[(index + 1) % polygon.length]);
    return mask * smoothstep(0, edgeWidth, distance);
  }, 1);
  const centerMask = smoothstep(0, settings.centerLockRadius * frameScale, centerDistance);
  const lockMask = edgeMask * centerMask;
  const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
  const modeGain = settings.surfaceMode === "flat" ? 0 : settings.surfaceMode === "soft-curved" ? 0.72 : settings.surfaceMode === "inflated" ? 1.12 : settings.surfaceMode === "pinched" ? 0.9 : 1;
  const tension = Math.pow(Math.max(0, edgeMask), THREE.MathUtils.lerp(1.8, 0.62, settings.tension));
  const asymmetry = 1 + settings.asymmetry * (0.54 * Math.sin(angle * 2.0 + faceIndex * 0.73) + 0.28 * Math.cos(angle * 3.0 - faceIndex));
  const broadBulge = settings.bulge * settings.curvature * modeGain * tension * lockMask * asymmetry;
  const valleyScale = Math.max(0.05, settings.valleyWidth) * frameScale;
  const centerFalloff = Math.exp(-(centerDistance * centerDistance) / (valleyScale * valleyScale));
  const cavity = -settings.centerDepth * settings.centerPinch * centerFalloff * centerMask * edgeMask;
  const saddle = settings.saddleStrength * Math.sin((angle + faceIndex * 0.13) * 2) * centerFalloff * centerMask * edgeMask;
  const lowFrequency = (Math.sin(point.x * 2.1 + faceIndex * 1.7) * Math.cos(point.y * 1.6 - faceIndex * 0.6)) * 0.018 * settings.asymmetry * lockMask;
  return {
    point: { x: point.x, y: point.y, z: point.z + broadBulge + cavity + saddle + lowFrequency },
    edge: boundaryDistance / frameScale,
    center: centerDistance / frameScale,
  };
}

export function buildCurvedSectorGeometry(polygon: SurfacePoint[], frame: SurfaceFrame, origin: SurfacePoint, settings: SpectralSettings, faceIndex: number): THREE.BufferGeometry {
  const subdivisions = QUALITY_SUBDIVISIONS[settings.quality];
  const frameWidth = frame.maxX - frame.minX;
  const frameHeight = frame.maxY - frame.minY;
  const frameScale = Math.min(frameWidth, frameHeight);
  const positions: number[] = [];
  const uvs: number[] = [];
  const axisDistances: number[] = [];
  const centerDistances: number[] = [];
  const faceEdgeDistances: number[] = [];

  const push = (raw: SurfacePoint): void => {
    const sample = deformPoint(raw, polygon, origin, settings, faceIndex, frameScale);
    positions.push(sample.point.x, sample.point.y, sample.point.z);
    uvs.push((sample.point.x - frame.minX) / frameWidth, (sample.point.y - frame.minY) / frameHeight);
    axisDistances.push(sample.edge);
    centerDistances.push(sample.center);
    faceEdgeDistances.push(1);
  };

  for (let fan = 1; fan < polygon.length - 1; fan += 1) {
    const a = polygon[0];
    const b = polygon[fan];
    const c = polygon[fan + 1];
    for (let row = 0; row < subdivisions; row += 1) {
      for (let column = 0; column < subdivisions - row; column += 1) {
        const u0 = column / subdivisions;
        const v0 = row / subdivisions;
        const u1 = (column + 1) / subdivisions;
        const v1 = (row + 1) / subdivisions;
        push(mixPoint(a, b, c, u0, v0));
        push(mixPoint(a, b, c, u1, v0));
        push(mixPoint(a, b, c, u0, v1));
        if (column + row < subdivisions - 1) {
          push(mixPoint(a, b, c, u1, v0));
          push(mixPoint(a, b, c, u1, v1));
          push(mixPoint(a, b, c, u0, v1));
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aAxisDistance", new THREE.Float32BufferAttribute(axisDistances, 1));
  geometry.setAttribute("aCenterDistance", new THREE.Float32BufferAttribute(centerDistances, 1));
  geometry.setAttribute("aFaceEdge", new THREE.Float32BufferAttribute(faceEdgeDistances, 1));
  const merged = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}
