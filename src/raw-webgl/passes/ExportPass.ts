import type { GLStateCache, RenderTarget, Texture2D } from "../core";
import copyFragmentSource from "../shaders/post/copy.frag.glsl?raw";
import fullscreenVertexSource from "../shaders/post/fullscreen.vert.glsl?raw";
import { bindSampler2D } from "../renderer/Uniforms";
import { createPassProgram } from "./PassProgram";
import { prepareFullscreenState } from "./PassSurface";

/** Final-size resolve plus deterministic framebuffer readback. */
export class ExportPass {
  private readonly program;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly state: GLStateCache) {
    this.program = createPassProgram(gl, "Export Resolve", fullscreenVertexSource, copyFragmentSource);
  }

  resolve(source: Texture2D, target: RenderTarget): void {
    prepareFullscreenState(this.state, { target, width: target.width, height: target.height });
    this.program.use(this.state);
    bindSampler2D(this.gl, this.state, this.program, "uSource", source.handle, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  readPixels(target: RenderTarget, destination?: Uint8Array): Uint8Array {
    const required = target.width * target.height * 4;
    const pixels = destination ?? new Uint8Array(required);
    if (pixels.byteLength !== required) {
      throw new RangeError(`Export readback buffer must be exactly ${required} bytes.`);
    }
    this.state.bindFramebuffer(target.framebuffer.handle);
    this.state.setViewport(0, 0, target.width, target.height);
    this.gl.finish();
    this.gl.readPixels(0, 0, target.width, target.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      throw new Error(`WebGL PNG readback failed with error 0x${error.toString(16)}.`);
    }
    return pixels;
  }

  dispose(): void { this.program.dispose(); }
}
