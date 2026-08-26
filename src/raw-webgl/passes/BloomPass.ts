import type { GLStateCache, Texture2D } from "../core";
import bloomFragmentSource from "../shaders/post/bloom.frag.glsl?raw";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import { bindSampler2D, uniform1f, uniform1i, uniform2f } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState, type PassSurface } from "./PassSurface";

export class BloomPass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "HDR Bloom", fullscreenVertexSource, bloomFragmentSource);
  }

  prefilter(source: Texture2D, surface: PassSurface, threshold: number): void {
    this.render(source, surface, true, 0, 0, 1, threshold);
  }

  blur(source: Texture2D, surface: PassSurface, horizontal: boolean, radius: number): void {
    this.render(source, surface, false, horizontal ? 1 : 0, horizontal ? 0 : 1, radius, 0);
  }

  private render(source: Texture2D, surface: PassSurface, prefilter: boolean, x: number, y: number, radius: number, threshold: number): void {
    prepareFullscreenState(this.state, surface);
    this.program.use(this.state);
    bindSampler2D(this.gl, this.state, this.program, "uSource", source.handle, 0);
    uniform2f(this.gl, this.program, "uInverseResolution", 1 / source.width, 1 / source.height);
    uniform2f(this.gl, this.program, "uDirection", x, y);
    uniform1f(this.gl, this.program, "uRadius", radius);
    uniform1f(this.gl, this.program, "uThreshold", threshold);
    uniform1i(this.gl, this.program, "uPrefilter", prefilter ? 1 : 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void { this.program.dispose(); }
}
