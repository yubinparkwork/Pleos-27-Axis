import type { GLStateCache } from "../core";
import type { LightingState } from "../lighting/lightingPresets";
import type { MatteState, Vec3 } from "../materials/materialPresets";
import type { GpuAxisMesh } from "../renderer/GpuAxisMesh";
import { uniform1f, uniform1i, uniform2f, uniform3f, uniformMat4 } from "../renderer/Uniforms";
import matteFragmentSource from "../shaders/matte/matte.frag.glsl?raw";
import matteVertexSource from "../shaders/matte/matte.vert.glsl?raw";
import { createPassProgram } from "./PassProgram";
import { bindPassSurface, type LightingUniformUploader, type PassSurface } from "./PassSurface";

export interface MattePassParameters {
  readonly material: Readonly<MatteState>;
  readonly lighting: Readonly<LightingState>;
  readonly model: Float32Array;
  readonly cameraPosition: Vec3;
  readonly near: number;
  readonly far: number;
  readonly debugMode: number;
}

export class MattePass {
  private readonly program;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly state: GLStateCache,
    private readonly lightingUniforms: LightingUniformUploader,
  ) {
    this.program = createPassProgram(gl, "Matte BRDF", matteVertexSource, matteFragmentSource);
    this.program.bindUniformBlock("CameraBlock", 0, true);
  }

  render(mesh: GpuAxisMesh, surface: PassSurface, parameters: MattePassParameters): void {
    bindPassSurface(this.state, surface);
    this.state.setDepthTest(true);
    this.state.setDepthWrite(true);
    this.state.setCullFace(false);
    this.state.setBlend(false);
    this.program.use(this.state);
    uniformMat4(this.gl, this.program, "uModel", parameters.model);
    uniform2f(this.gl, this.program, "uNearFar", parameters.near, parameters.far);
    uniform3f(this.gl, this.program, "uBaseColor", parameters.material.baseColor);
    uniform1f(this.gl, this.program, "uFaceVariation", parameters.material.faceVariation);
    uniform1f(this.gl, this.program, "uRoughness", parameters.material.roughness);
    uniform1f(this.gl, this.program, "uDiffuseStrength", parameters.material.diffuseStrength);
    uniform1f(this.gl, this.program, "uSpecularStrength", parameters.material.specularStrength);
    uniform3f(this.gl, this.program, "uSpecularTint", parameters.material.specularTint);
    uniform1f(this.gl, this.program, "uMicroStrength", parameters.material.microStrength);
    uniform1f(this.gl, this.program, "uMicroScale", parameters.material.microScale);
    uniform1f(this.gl, this.program, "uAmbientStrength", parameters.material.ambientStrength);
    uniform1i(this.gl, this.program, "uDebugMode", parameters.debugMode);
    this.lightingUniforms.upload(this.program, parameters.lighting);
    mesh.drawTriangles(this.state);
  }

  dispose(): void { this.program.dispose(); }
}
