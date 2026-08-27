import type { GLStateCache, Texture2D } from "../core";
import type { RawPostState } from "../../studio/state/RawStudioState";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import toneMapFragmentSource from "../shaders/post/tonemap.frag.glsl?raw";
import { bindSampler2D, uniform1f, uniform1i } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState, type PassSurface } from "./PassSurface";

export class ToneMapPass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "Tone Map", fullscreenVertexSource, toneMapFragmentSource);
  }

  render(source: Texture2D, surface: PassSurface, post: Readonly<RawPostState>): void {
    prepareFullscreenState(this.state, surface);
    this.program.use(this.state);
    bindSampler2D(this.gl, this.state, this.program, "uSource", source.handle, 0);
    uniform1f(this.gl, this.program, "uExposure", post.exposure);
    uniform1f(this.gl, this.program, "uContrast", post.contrast);
    uniform1f(this.gl, this.program, "uWhitePoint", post.whitePoint);
    uniform1f(this.gl, this.program, "uBlackLift", post.blackLift);
    uniform1i(this.gl, this.program, "uToneMapping", post.toneMapping === "aces-fitted" ? 1 : 0);
    uniform1f(this.gl, this.program, "uDitherStrength", post.dither ? 0.82 : 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void { this.program.dispose(); }
}
