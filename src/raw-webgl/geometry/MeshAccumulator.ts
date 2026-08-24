import { AXIS_VERTEX_LAYOUT, type AxisMeshBounds, type AxisMeshData, type AxisMeshGroup, type AxisMeshMetadata, type GeometryMode, type Vec2, type Vec3 } from "./types";
import { add3, dot3, scale3, triangleNormal } from "./math";

export interface VertexInput {
  position: Vec3;
  normal: Vec3;
  uv?: Vec2;
  faceId: number;
}

interface MutableGroup {
  id: string;
  indexOffset: number;
  indexCount: number;
  solidId?: number;
}

export class MeshAccumulator {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly faceIds: number[] = [];
  readonly indices: number[] = [];
  readonly groups: MutableGroup[] = [];
  private activeGroup: MutableGroup | undefined;

  beginGroup(id: string, solidId?: number): void {
    this.endGroup();
    this.activeGroup = { id, solidId, indexOffset: this.indices.length, indexCount: 0 };
  }

  endGroup(): void {
    if (this.activeGroup === undefined) return;
    this.activeGroup.indexCount = this.indices.length - this.activeGroup.indexOffset;
    if (this.activeGroup.indexCount > 0) this.groups.push(this.activeGroup);
    this.activeGroup = undefined;
  }

  addVertex(vertex: VertexInput): number {
    const index = this.positions.length / 3;
    this.positions.push(...vertex.position);
    this.normals.push(...vertex.normal);
    this.uvs.push(...(vertex.uv ?? [0, 0]));
    this.faceIds.push(vertex.faceId);
    return index;
  }

  addTriangle(a: number, b: number, c: number, expectedOutward?: Vec3): void {
    if (expectedOutward !== undefined) {
      const normal = triangleNormal(this.positionAt(a), this.positionAt(b), this.positionAt(c));
      if (dot3(normal, expectedOutward) < 0) {
        this.indices.push(a, c, b);
        return;
      }
    }
    this.indices.push(a, b, c);
  }

  addFlatTriangle(a: Vec3, b: Vec3, c: Vec3, faceId: number, expectedOutward: Vec3): void {
    let normal = triangleNormal(a, b, c);
    let second = b;
    let third = c;
    if (dot3(normal, expectedOutward) < 0) {
      second = c;
      third = b;
      normal = scale3(normal, -1);
    }
    const i0 = this.addVertex({ position: a, normal, faceId });
    const i1 = this.addVertex({ position: second, normal, faceId });
    const i2 = this.addVertex({ position: third, normal, faceId });
    this.indices.push(i0, i1, i2);
  }

  positionAt(index: number): Vec3 {
    const offset = index * 3;
    return [this.positions[offset], this.positions[offset + 1], this.positions[offset + 2]];
  }

  finalize(mode: GeometryMode, metadata: AxisMeshMetadata): AxisMeshData {
    this.endGroup();
    this.assignProjectionUvs();
    const positions = new Float32Array(this.positions);
    const normals = new Float32Array(this.normals);
    const uvs = new Float32Array(this.uvs);
    const faceIds = new Uint32Array(this.faceIds);
    const indices = new Uint32Array(this.indices);
    const vertexCount = positions.length / 3;
    const vertices = new Float32Array(vertexCount * AXIS_VERTEX_LAYOUT.strideFloats);
    for (let index = 0; index < vertexCount; index += 1) {
      const target = index * AXIS_VERTEX_LAYOUT.strideFloats;
      vertices[target] = positions[index * 3];
      vertices[target + 1] = positions[index * 3 + 1];
      vertices[target + 2] = positions[index * 3 + 2];
      vertices[target + 3] = normals[index * 3];
      vertices[target + 4] = normals[index * 3 + 1];
      vertices[target + 5] = normals[index * 3 + 2];
      vertices[target + 6] = uvs[index * 2];
      vertices[target + 7] = uvs[index * 2 + 1];
      vertices[target + 8] = faceIds[index];
    }
    return {
      mode,
      layout: AXIS_VERTEX_LAYOUT,
      vertices,
      positions,
      normals,
      uvs,
      faceIds,
      indices,
      groups: this.groups.map((group): AxisMeshGroup => ({ ...group })),
      bounds: computeBounds(positions),
      metadata,
    };
  }

  private assignProjectionUvs(): void {
    if (this.positions.length === 0) return;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let offset = 0; offset < this.positions.length; offset += 3) {
      minX = Math.min(minX, this.positions[offset]);
      maxX = Math.max(maxX, this.positions[offset]);
      minY = Math.min(minY, this.positions[offset + 1]);
      maxY = Math.max(maxY, this.positions[offset + 1]);
    }
    const width = Math.max(1e-9, maxX - minX);
    const height = Math.max(1e-9, maxY - minY);
    for (let index = 0; index < this.positions.length / 3; index += 1) {
      this.uvs[index * 2] = (this.positions[index * 3] - minX) / width;
      this.uvs[index * 2 + 1] = (this.positions[index * 3 + 1] - minY) / height;
    }
  }
}

function computeBounds(positions: Float32Array): AxisMeshBounds {
  let min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  let max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let offset = 0; offset < positions.length; offset += 3) {
    min = [
      Math.min(min[0], positions[offset]),
      Math.min(min[1], positions[offset + 1]),
      Math.min(min[2], positions[offset + 2]),
    ];
    max = [
      Math.max(max[0], positions[offset]),
      Math.max(max[1], positions[offset + 1]),
      Math.max(max[2], positions[offset + 2]),
    ];
  }
  if (positions.length === 0) min = max = [0, 0, 0];
  const center = scale3(add3(min, max), 0.5);
  let radius = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    radius = Math.max(radius, Math.hypot(
      positions[offset] - center[0],
      positions[offset + 1] - center[1],
      positions[offset + 2] - center[2],
    ));
  }
  return { min, max, center, radius };
}
