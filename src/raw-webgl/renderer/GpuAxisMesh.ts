import { GLBuffer, IndexBuffer, VertexArray, VertexBuffer, type GLStateCache } from "../core";
import type { AxisMeshData } from "../geometry";

function buildWireIndices(indices: Uint32Array): Uint32Array {
  const seen = new Set<string>();
  const edges: number[] = [];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const key = `${low}:${high}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(low, high);
    }
  }
  return new Uint32Array(edges);
}

/** GPU ownership for one immutable CPU Axis mesh. */
export class GpuAxisMesh {
  readonly positions: VertexBuffer;
  readonly normals: VertexBuffer;
  readonly uvs: VertexBuffer;
  readonly faceIds: GLBuffer;
  readonly triangles: IndexBuffer;
  readonly wireIndices: IndexBuffer;
  readonly triangleVao: VertexArray;
  readonly wireVao: VertexArray;

  constructor(private readonly gl: WebGL2RenderingContext, readonly data: AxisMeshData) {
    this.positions = new VertexBuffer(gl, data.positions, { label: "Axis Positions" });
    this.normals = new VertexBuffer(gl, data.normals, { label: "Axis Normals" });
    this.uvs = new VertexBuffer(gl, data.uvs, { label: "Axis UVs" });
    this.faceIds = new GLBuffer(gl, { target: gl.ARRAY_BUFFER, data: data.faceIds, label: "Axis Face IDs" });
    this.triangles = new IndexBuffer(gl, data.indices, { label: "Axis Triangle Indices" });
    this.wireIndices = new IndexBuffer(gl, buildWireIndices(data.indices), { label: "Axis Wire Indices" });
    const attributes = [
      { location: 0, buffer: this.positions, size: 3 as const },
      { location: 1, buffer: this.normals, size: 3 as const },
      { location: 2, buffer: this.uvs, size: 2 as const },
      { location: 3, buffer: this.faceIds, size: 1 as const, type: gl.UNSIGNED_INT, integer: true },
    ];
    this.triangleVao = new VertexArray(gl, { attributes, indexBuffer: this.triangles, label: "Axis Triangle VAO" });
    this.wireVao = new VertexArray(gl, { attributes, indexBuffer: this.wireIndices, label: "Axis Wire VAO" });
  }

  drawTriangles(state: GLStateCache): void {
    state.bindVertexArray(this.triangleVao.handle);
    this.gl.drawElements(this.gl.TRIANGLES, this.triangles.count, this.triangles.indexType, 0);
  }

  drawWireframe(state: GLStateCache): void {
    state.bindVertexArray(this.wireVao.handle);
    this.gl.drawElements(this.gl.LINES, this.wireIndices.count, this.wireIndices.indexType, 0);
  }

  drawVertices(state: GLStateCache): void {
    state.bindVertexArray(this.triangleVao.handle);
    this.gl.drawElements(this.gl.POINTS, this.triangles.count, this.triangles.indexType, 0);
  }

  dispose(): void {
    this.triangleVao.dispose();
    this.wireVao.dispose();
    this.triangles.dispose();
    this.wireIndices.dispose();
    this.positions.dispose();
    this.normals.dispose();
    this.uvs.dispose();
    this.faceIds.dispose();
  }
}
