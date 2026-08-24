import type { GLStateCache } from "../core";
import type { Vec3 } from "../materials/materialPresets";
import type { GpuAxisMesh } from "../renderer/GpuAxisMesh";
import { uniform3f, uniformMat4 } from "../renderer/Uniforms";
import prismBackfaceFragmentSource from "../shaders/prism/prism-backface.frag.glsl?raw";
import prismBackfaceVertexSource from "../shaders/prism/prism-backface.vert.glsl?raw";
import { createPassProgram } from "./PassProgram";
import { bindPassSurface, type PassSurface } from "./PassSurface";

export interface PrismBoundsEncoding {
  readonly center: Vec3;
  readonly halfExtent: Vec3;
}

export class PrismBackfacePass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "Prism Backface", prismBackfaceVertexSource, prismBackfaceFragmentSource);
    this.program.bindUniformBlock("CameraBlock", 0, true);
  }

  render(
    mesh: GpuAxisMesh,
    surface: PassSurface,
    model: Float32Array,
    bounds: PrismBoundsEncoding,
  ): void {
    bindPassSurface(this.state, surface);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.state.setDepthTest(true);
    this.state.setDepthWrite(true);
    this.state.setCullFace(true, this.gl.FRONT);
    this.state.setFrontFace(this.gl.CCW);
    this.state.setBlend(false);
    this.program.use(this.state);
    uniformMat4(this.gl, this.program, "uModel", model);
    uniform3f(this.gl, this.program, "uBoundsCenter", bounds.center);
    uniform3f(this.gl, this.program, "uBoundsHalfExtent", bounds.halfExtent);
    mesh.drawTriangles(this.state);
  }

  dispose(): void { this.program.dispose(); }
}
