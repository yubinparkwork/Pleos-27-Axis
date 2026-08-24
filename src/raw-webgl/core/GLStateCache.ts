export class GLStateCache {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null | undefined;
  private vertexArray: WebGLVertexArrayObject | null | undefined;
  private framebuffer: WebGLFramebuffer | null | undefined;
  private activeTextureUnit = -1;
  private readonly texture2DBindings = new Map<number, WebGLTexture | null>();
  private viewport: readonly [number, number, number, number] | null = null;
  private depthTest: boolean | null = null;
  private depthWrite: boolean | null = null;
  private blend: boolean | null = null;
  private cullFace: boolean | null = null;
  private cullMode = -1;
  private frontFace = -1;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  public reset(): void {
    this.program = undefined;
    this.vertexArray = undefined;
    this.framebuffer = undefined;
    this.activeTextureUnit = -1;
    this.texture2DBindings.clear();
    this.viewport = null;
    this.depthTest = null;
    this.depthWrite = null;
    this.blend = null;
    this.cullFace = null;
    this.cullMode = -1;
    this.frontFace = -1;
  }

  public useProgram(program: WebGLProgram | null): void {
    if (this.program === program) return;
    this.gl.useProgram(program);
    this.program = program;
  }

  public bindVertexArray(vertexArray: WebGLVertexArrayObject | null): void {
    if (this.vertexArray === vertexArray) return;
    this.gl.bindVertexArray(vertexArray);
    this.vertexArray = vertexArray;
  }

  public bindFramebuffer(framebuffer: WebGLFramebuffer | null): void {
    if (this.framebuffer === framebuffer) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.framebuffer = framebuffer;
  }

  public setViewport(x: number, y: number, width: number, height: number): void {
    const current = this.viewport;
    if (
      current &&
      current[0] === x &&
      current[1] === y &&
      current[2] === width &&
      current[3] === height
    ) {
      return;
    }
    this.gl.viewport(x, y, width, height);
    this.viewport = [x, y, width, height];
  }

  public setDepthTest(enabled: boolean): void {
    if (this.depthTest === enabled) return;
    if (enabled) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
    this.depthTest = enabled;
  }

  public setDepthWrite(enabled: boolean): void {
    if (this.depthWrite === enabled) return;
    this.gl.depthMask(enabled);
    this.depthWrite = enabled;
  }

  public setBlend(enabled: boolean): void {
    if (this.blend === enabled) return;
    if (enabled) this.gl.enable(this.gl.BLEND);
    else this.gl.disable(this.gl.BLEND);
    this.blend = enabled;
  }

  public setCullFace(enabled: boolean, mode: number = this.gl.BACK): void {
    if (this.cullFace !== enabled) {
      if (enabled) this.gl.enable(this.gl.CULL_FACE);
      else this.gl.disable(this.gl.CULL_FACE);
      this.cullFace = enabled;
    }
    if (enabled && this.cullMode !== mode) {
      this.gl.cullFace(mode);
      this.cullMode = mode;
    }
  }

  public setFrontFace(mode: number): void {
    if (this.frontFace === mode) return;
    this.gl.frontFace(mode);
    this.frontFace = mode;
  }

  public bindTexture2D(unit: number, texture: WebGLTexture | null): void {
    if (unit < 0) throw new RangeError("Texture unit must be non-negative.");
    if (this.activeTextureUnit !== unit) {
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.activeTextureUnit = unit;
    }
    if (this.texture2DBindings.get(unit) === texture) return;
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.texture2DBindings.set(unit, texture);
  }
}
