import type { GLStateCache } from "../core";
import type { LightingState } from "../lighting/lightingPresets";
import backgroundFragmentSource from "../shaders/post/background.frag.glsl?raw";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import { uniform1f, uniform3f } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState, type LightingUniformUploader, type PassSurface } from "./PassSurface";

export class BackgroundPass {
  private readonly program;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly state: GLStateCache,
    private readonly environment: LightingUniformUploader,
  ) {
    this.program = createPassProgram(gl, "Background", fullscreenVertexSource, backgroundFragmentSource);
  }

  render(surface: PassSurface, lighting: Readonly<LightingState>, transparent: boolean): void {
    prepareFullscreenState(this.state, surface);
    this.gl.clearColor(0, 0, 0, transparent ? 0 : 1);
    this.gl.clearDepth(1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | (surface.target?.depthBuffer ? this.gl.DEPTH_BUFFER_BIT : 0));
    this.program.use(this.state);
    uniform3f(this.gl, this.program, "uBackgroundColor", lighting.backgroundColor);
    uniform1f(this.gl, this.program, "uBackgroundExposure", lighting.backgroundExposure);
    uniform1f(this.gl, this.program, "uBackgroundAlpha", transparent ? 0 : 1);
    uniform1f(this.gl, this.program, "uAspect", surface.width / Math.max(1, surface.height));
    this.environment.upload(this.program, lighting);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void { this.program.dispose(); }
}
