import { VertexArray, VertexBuffer, type GLStateCache } from "../core";
import type { AxisMeshData } from "../geometry";
import type { GpuAxisMesh } from "../renderer/GpuAxisMesh";
import { uniform1f, uniform1i, uniform3f, uniformMat4 } from "../renderer/Uniforms";
import debugFragmentSource from "../shaders/debug/debug.frag.glsl?raw";
import debugVertexSource from "../shaders/debug/debug.vert.glsl?raw";
import { createPassProgram } from "../passes/PassProgram";
import { bindPassSurface, type PassSurface } from "../passes/PassSurface";

interface GuideRanges {
  axisCount: number;
  boundsFirst: number;
  boundsCount: number;
  centerFirst: number;
}

function guidePositions(mesh: AxisMeshData): { values: Float32Array; ranges: GuideRanges } {
  const values: number[] = [];
  const center = mesh.metadata.sharedCenterNode;
  for (const endpoint of mesh.metadata.rayEndpoints) values.push(...center, ...endpoint);
  const axisCount = values.length / 3;
  const boundsFirst = axisCount;
  const { min, max } = mesh.bounds;
  const corners = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]],
    [max[0], max[1], min[2]], [min[0], max[1], min[2]],
    [min[0], min[1], max[2]], [max[0], min[1], max[2]],
    [max[0], max[1], max[2]], [min[0], max[1], max[2]],
  ] as const;
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const;
  for (const [a, b] of edges) values.push(...corners[a], ...corners[b]);
  const boundsCount = edges.length * 2;
  const centerFirst = values.length / 3;
  values.push(...center);
  return { values: new Float32Array(values), ranges: { axisCount, boundsFirst, boundsCount, centerFirst } };
}

export class DebugRenderer {
  private readonly program;
  private readonly guideBuffer: VertexBuffer;
  private readonly guideVao: VertexArray;
  private ranges: GuideRanges = { axisCount: 0, boundsFirst: 0, boundsCount: 0, centerFirst: 0 };

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "Axis Debug", debugVertexSource, debugFragmentSource);
    this.program.bindUniformBlock("CameraBlock", 0, true);
    this.guideBuffer = new VertexBuffer(gl, new Float32Array([0, 0, 0]), { label: "Axis Debug Guides" });
    this.guideVao = new VertexArray(gl, {
      attributes: [{ location: 0, buffer: this.guideBuffer, size: 3 }],
      label: "Axis Debug Guide VAO",
    });
  }

  updateMesh(mesh: AxisMeshData): void {
    const guides = guidePositions(mesh);
    this.guideBuffer.setData(guides.values);
    this.ranges = guides.ranges;
  }

  renderWireframe(mesh: GpuAxisMesh, surface: PassSurface, model: Float32Array): void {
    this.prepare(surface, model, [0.8, 0.92, 1], 1, 0);
    mesh.drawWireframe(this.state);
  }

  renderVertices(mesh: GpuAxisMesh, surface: PassSurface, model: Float32Array): void {
    this.prepare(surface, model, [1, 0.38, 0.08], 5, 1);
    mesh.drawVertices(this.state);
  }

  renderGuides(
    surface: PassSurface,
    model: Float32Array,
    options: { axis: boolean; center: boolean; bounds: boolean },
  ): void {
    this.prepare(surface, model, [0.25, 0.78, 1], 1, 0);
    this.state.bindVertexArray(this.guideVao.handle);
    if (options.axis && this.ranges.axisCount > 0) {
      uniform3f(this.gl, this.program, "uColor", [0.2, 0.78, 1]);
      this.gl.drawArrays(this.gl.LINES, 0, this.ranges.axisCount);
    }
    if (options.bounds && this.ranges.boundsCount > 0) {
      uniform3f(this.gl, this.program, "uColor", [1, 0.7, 0.18]);
      this.gl.drawArrays(this.gl.LINES, this.ranges.boundsFirst, this.ranges.boundsCount);
    }
    if (options.center) {
      uniform1f(this.gl, this.program, "uPointSize", 9);
      uniform1i(this.gl, this.program, "uPrimitiveMode", 1);
      uniform3f(this.gl, this.program, "uColor", [1, 0.12, 0.36]);
      this.gl.drawArrays(this.gl.POINTS, this.ranges.centerFirst, 1);
    }
  }

  dispose(): void {
    this.guideVao.dispose();
    this.guideBuffer.dispose();
    this.program.dispose();
  }

  private prepare(
    surface: PassSurface,
    model: Float32Array,
    color: readonly [number, number, number],
    pointSize: number,
    primitiveMode: number,
  ): void {
    bindPassSurface(this.state, surface);
    this.state.setDepthTest(false);
    this.state.setDepthWrite(false);
    this.state.setCullFace(false);
    this.state.setBlend(false);
    this.program.use(this.state);
    uniformMat4(this.gl, this.program, "uModel", model);
    uniform3f(this.gl, this.program, "uColor", color);
    uniform1f(this.gl, this.program, "uPointSize", pointSize);
    uniform1i(this.gl, this.program, "uPrimitiveMode", primitiveMode);
  }
}
