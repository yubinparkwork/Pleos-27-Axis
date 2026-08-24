import type { GLStateCache, Texture2D } from "../core";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import fxaaFragmentSource from "../shaders/post/fxaa.frag.glsl?raw";
import { bindSampler2D, uniform2f } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState, type PassSurface } from "./PassSurface";

export class FxaaPass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "FXAA", fullscreenVertexSource, fxaaFragmentSource);
  }

  render(source: Texture2D, surface: PassSurface): void {
    prepareFullscreenState(this.state, surface);
    this.program.use(this.state);
    bindSampler2D(this.gl, this.state, this.program, "uSource", source.handle, 0);
    uniform2f(this.gl, this.program, "uInverseResolution", 1 / surface.width, 1 / surface.height);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void { this.program.dispose(); }
}
