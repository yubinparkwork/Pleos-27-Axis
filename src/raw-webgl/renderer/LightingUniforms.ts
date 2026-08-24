import type { ShaderProgram } from "../core";
import {
  uploadLightRigUniforms,
  uploadReflectionCardUniforms,
  type LightingState,
} from "../lighting";
import type { LightingUniformUploader } from "../passes/PassSurface";

/** One upload boundary for the direct-light and analytic-card uniform groups. */
export class LightingUniforms implements LightingUniformUploader {
  constructor(private readonly gl: WebGL2RenderingContext) {}

  upload(program: ShaderProgram, lighting: Readonly<LightingState>): void {
    uploadLightRigUniforms(this.gl, program, lighting);
    uploadReflectionCardUniforms(this.gl, program, lighting);
  }
}
