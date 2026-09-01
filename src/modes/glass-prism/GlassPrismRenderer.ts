import type { GlassPrismState } from "./GlassPrismState";
import vertexSource from "../light-field/shaders/fullscreen.vert.glsl?raw";
import fragmentSource from "./shaders/prism.frag.glsl?raw";

type UniformValue = number | [number, number] | [number, number, number] | boolean;
const hexColor = (hex: string): [number, number, number] => { const value = Number.parseInt(hex.replace("#", ""), 16); return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]; };

export class GlassPrismRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly backgroundCanvas = document.createElement("canvas");
  private readonly backgroundContext: CanvasRenderingContext2D;
  private readonly backgroundTexture: WebGLTexture;
  private readonly uniforms = new Map<string, WebGLUniformLocation>();
  private state: GlassPrismState;
  private backgroundDirty = true;
  private backgroundWidth = 0;
  private backgroundHeight = 0;

  constructor(state: GlassPrismState, onError: (message: string) => void) {
    this.state = state; this.canvas = document.createElement("canvas"); this.canvas.className = "light-field-canvas glass-prism-canvas"; this.canvas.setAttribute("aria-label", "PLEOS Glass Prism 렌더링");
    const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: true, depth: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("Glass Prism에는 WebGL2를 지원하는 브라우저가 필요합니다."); this.gl = gl;
    const context = this.backgroundCanvas.getContext("2d"); if (!context) throw new Error("Glass Prism 배경 텍스처를 생성하지 못했습니다."); this.backgroundContext = context;
    try { this.program = this.createProgram(vertexSource, fragmentSource); } catch (error) { const message = error instanceof Error ? error.message : String(error); onError(message); throw error; }
    const vao = gl.createVertexArray(); const texture = gl.createTexture(); if (!vao || !texture) throw new Error("Glass Prism GPU 리소스를 생성하지 못했습니다."); this.vao = vao; this.backgroundTexture = texture;
    gl.bindVertexArray(vao); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  }

  setState(state: GlassPrismState): void { this.state = state; }
  invalidateBackground(): void { this.backgroundDirty = true; }
  resize(width: number, height: number, pixelRatio = Math.min(devicePixelRatio, 2)): void {
    const w = Math.max(1, Math.round(width * pixelRatio)), h = Math.max(1, Math.round(height * pixelRatio)); if (this.canvas.width === w && this.canvas.height === h) return; this.canvas.width = w; this.canvas.height = h; this.invalidateBackground();
  }
  render(normalizedTime: number): void { this.renderAt(normalizedTime, this.canvas.width, this.canvas.height); }
  async exportPng(width: number, height: number, normalizedTime: number): Promise<string> {
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number; if (width > max || height > max) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${max}px를 초과합니다.`);
    const previous = [this.canvas.width, this.canvas.height] as const; this.canvas.width = width; this.canvas.height = height; this.invalidateBackground(); this.renderAt(normalizedTime, width, height); const data = this.canvas.toDataURL("image/png");
    this.canvas.width = previous[0]; this.canvas.height = previous[1]; this.invalidateBackground(); this.render(normalizedTime); return data;
  }
  dispose(): void { this.gl.deleteTexture(this.backgroundTexture); this.gl.deleteVertexArray(this.vao); this.gl.deleteProgram(this.program); this.uniforms.clear(); this.canvas.remove(); }

  private renderAt(normalizedTime: number, width: number, height: number): void {
    this.updateBackground(width, height); const gl = this.gl, s = this.state; gl.viewport(0, 0, width, height); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture); const sampler = this.location("uBackgroundTexture"); if (sampler) gl.uniform1i(sampler, 0);
    this.setUniforms({
      uResolution: [width, height], uAnchor: [s.artboard.axisAnchor.gridX, 1 - s.artboard.axisAnchor.gridY], uTime: normalizedTime, uScale: s.artboard.scale,
      uCubeScale: s.geometry.scale, uGap: s.geometry.gap, uBevel: s.geometry.bevel, uMotionStrength: s.motion.strength,
      uMotionKind: s.motion.kind === "shared-pulse" ? 1 : s.motion.kind === "explode-rejoin" ? 2 : 0,
      uIor: s.material.ior, uDispersion: s.material.dispersion, uRoughness: s.material.roughness, uReflection: s.material.reflection,
      uRefractionStrength: s.material.refractionStrength, uTransparency: s.material.transparency, uTint: hexColor(s.material.tint), uAbsorption: s.material.absorption,
      uSurfaceTextureStrength: s.material.surfaceTextureStrength, uSurfaceTextureScale: s.material.surfaceTextureScale,
      uInternalBounces: s.material.internalBounces, uEnvironment: s.environment.enabled, uEnvironmentIntensity: s.environment.intensity,
      uCameraYaw: s.camera.yaw, uCameraPitch: s.camera.pitch, uZoom: s.camera.zoom, uTransparent: s.artboard.transparent,
    }); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private updateBackground(width: number, height: number): void {
    const c = this.state.content; if (!this.backgroundDirty && width === this.backgroundWidth && height === this.backgroundHeight) return;
    this.backgroundDirty = false; this.backgroundWidth = width; this.backgroundHeight = height;
    this.backgroundCanvas.width = width; this.backgroundCanvas.height = height; const ctx = this.backgroundContext; ctx.fillStyle = c.background; ctx.fillRect(0, 0, width, height);
    const studioSweep = ctx.createRadialGradient(width * .46, height * .43, 0, width * .46, height * .43, Math.max(width, height) * .72);
    studioSweep.addColorStop(0, "rgba(255,255,255,0.11)"); studioSweep.addColorStop(.5, "rgba(255,255,255,0.025)"); studioSweep.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = studioSweep; ctx.fillRect(0, 0, width, height);
    const softboxes = ctx.createLinearGradient(0, 0, width, 0);
    softboxes.addColorStop(0, "rgba(0,0,0,0.08)"); softboxes.addColorStop(.18, "rgba(255,255,255,0.045)"); softboxes.addColorStop(.38, "rgba(255,255,255,0.005)"); softboxes.addColorStop(.68, "rgba(0,0,0,0.045)"); softboxes.addColorStop(.86, "rgba(255,255,255,0.035)"); softboxes.addColorStop(1, "rgba(0,0,0,0.06)");
    ctx.fillStyle = softboxes; ctx.fillRect(0, 0, width, height);
    if (c.mode === "text" && c.text.trim()) {
      const fontSize = Math.max(12, Math.min(width, height) * c.textScale), lines = c.text.split(/\r?\n/), lineStep = fontSize * c.lineHeight;
      ctx.save(); ctx.fillStyle = c.textColor; ctx.font = `800 ${fontSize}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; ctx.textBaseline = "middle";
      const centerX = width * c.x, firstY = height * c.y - lineStep * (lines.length - 1) * .5;
      lines.forEach((line, index) => this.drawTrackedText(ctx, line, centerX, firstY + index * lineStep, fontSize * c.letterSpacing)); ctx.restore();
    }
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.backgroundCanvas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  private drawTrackedText(ctx: CanvasRenderingContext2D, value: string, centerX: number, y: number, tracking: number): void {
    const glyphs = Array.from(value); if (!glyphs.length) return;
    const widths = glyphs.map((glyph) => ctx.measureText(glyph).width), total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, glyphs.length - 1); let x = centerX - total * .5;
    glyphs.forEach((glyph, index) => { ctx.fillText(glyph, x, y); x += widths[index] + tracking; });
  }
  private setUniforms(values: Record<string, UniformValue>): void { Object.entries(values).forEach(([name, value]) => { const location = this.location(name); if (!location) return; if (typeof value === "boolean") this.gl.uniform1i(location, value ? 1 : 0); else if (typeof value === "number") Number.isInteger(value) && (name === "uInternalBounces" || name === "uMotionKind") ? this.gl.uniform1i(location, value) : this.gl.uniform1f(location, value); else if (value.length === 2) this.gl.uniform2f(location, value[0], value[1]); else this.gl.uniform3f(location, value[0], value[1], value[2]); }); }
  private location(name: string): WebGLUniformLocation | null { const cached = this.uniforms.get(name); if (cached) return cached; const found = this.gl.getUniformLocation(this.program, name); if (found) this.uniforms.set(name, found); return found; }
  private createProgram(vertex: string, fragment: string): WebGLProgram {
    const compile = (type: number, source: string) => { const shader = this.gl.createShader(type); if (!shader) throw new Error("Glass Prism shader를 생성하지 못했습니다."); this.gl.shaderSource(shader, source); this.gl.compileShader(shader); if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) { const log = this.gl.getShaderInfoLog(shader) ?? "Unknown shader error"; this.gl.deleteShader(shader); throw new Error(`Glass Prism shader compile 실패:\n${log}`); } return shader; };
    const vs = compile(this.gl.VERTEX_SHADER, vertex), fs = compile(this.gl.FRAGMENT_SHADER, fragment), program = this.gl.createProgram(); if (!program) throw new Error("Glass Prism program을 생성하지 못했습니다."); this.gl.attachShader(program, vs); this.gl.attachShader(program, fs); this.gl.linkProgram(program); this.gl.deleteShader(vs); this.gl.deleteShader(fs); if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) throw new Error(`Glass Prism program link 실패:\n${this.gl.getProgramInfoLog(program) ?? "Unknown link error"}`); return program;
  }
}
