import type { GLStateCache, Texture2D } from "../core";
import copyFragmentSource from "../shaders/post/copy.frag.glsl?raw";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import { bindSampler2D } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState, type PassSurface } from "./PassSurface";

/** Texture copy/composite used to seed the optical target and resolve supersampling. */
export class CompositePass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "Composite", fullscreenVertexSource, copyFragmentSource);
  }

  render(source: Texture2D, surface: PassSurface, clearDepth = true): void {
    prepareFullscreenState(this.state, surface);
    if (clearDepth && surface.target?.depthBuffer) {
      this.gl.clearDepth(1);
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
    }
    this.program.use(this.state);
    bindSampler2D(this.gl, this.state, this.program, "uSource", source.handle, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void { this.program.dispose(); }
}
