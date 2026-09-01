import { axisDirection, getApprovedAxisDefinition } from "../../axis";
import type { LightFieldState } from "./LightFieldState";
import vertexSource from "./shaders/fullscreen.vert.glsl?raw";
import fieldSource from "./shaders/field.frag.glsl?raw";
import blurSource from "./shaders/blur.frag.glsl?raw";
import compositeSource from "./shaders/composite.frag.glsl?raw";

type UniformValue = number | [number, number] | [number, number, number] | boolean;

function canonicalTriadRays() {
  const definition = getApprovedAxisDefinition("axis-30-basic");
  if (!definition) throw new Error("Canonical 30° Axis definition is unavailable.");
  const active = definition.rays.filter((ray) => ray.enabled);
  let winner: typeof active = [];
  let score = -1;
  for (let a = 0; a < active.length; a += 1) for (let b = a + 1; b < active.length; b += 1) for (let c = b + 1; c < active.length; c += 1) {
    const items = [active[a], active[b], active[c]];
    const angles = items.map((item) => (item.angleDeg + 360) % 360).sort((x, y) => x - y);
    const gaps = [angles[1] - angles[0], angles[2] - angles[1], 360 - angles[2] + angles[0]];
    const candidateScore = Math.min(...gaps);
    if (candidateScore > score) { winner = items; score = candidateScore; }
  }
  return winner;
}

const CANONICAL_TRIAD_RAYS = canonicalTriadRays();
const CANONICAL_TRIAD = CANONICAL_TRIAD_RAYS.map((ray): [number, number] => { const value = axisDirection(ray.angleDeg); return [value.x, value.y]; });
const CANONICAL_ANGLES = CANONICAL_TRIAD_RAYS.map((ray) => ray.angleDeg);

function color(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export class LightFieldRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly fieldProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation>>();
  private fieldFramebuffer: WebGLFramebuffer | null = null;
  private blurFramebufferA: WebGLFramebuffer | null = null;
  private blurFramebufferB: WebGLFramebuffer | null = null;
  private baseTexture: WebGLTexture | null = null;
  private emissionTexture: WebGLTexture | null = null;
  private blurTextureA: WebGLTexture | null = null;
  private blurTextureB: WebGLTexture | null = null;
  private targetWidth = 0;
  private targetHeight = 0;
  private state: LightFieldState;

  get axisAngles(): number[] { return [...CANONICAL_ANGLES]; }

  constructor(state: LightFieldState, onError: (message: string) => void) {
    this.state = state;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "light-field-canvas";
    this.canvas.setAttribute("aria-label", "PLEOS Axis Light Field 렌더링");
    const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("Light Field에는 WebGL2를 지원하는 브라우저가 필요합니다.");
    this.gl = gl;
    try {
      this.fieldProgram = this.createProgram(vertexSource, fieldSource);
      this.blurProgram = this.createProgram(vertexSource, blurSource);
      this.compositeProgram = this.createProgram(vertexSource, compositeSource);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onError(message);
      throw error;
    }
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Light Field fullscreen geometry를 생성하지 못했습니다.");
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  setState(state: LightFieldState): void { this.state = state; }

  resize(width: number, height: number, pixelRatio = Math.min(devicePixelRatio, 2)): void {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ensureTargets(w, h);
  }

  render(normalizedTime: number): void { this.renderAt(normalizedTime, this.canvas.width, this.canvas.height); }

  async exportPng(width: number, height: number, normalizedTime: number): Promise<string> {
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (width > max || height > max) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${max}px를 초과합니다.`);
    const previous = [this.canvas.width, this.canvas.height] as const;
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderAt(normalizedTime, width, height);
    const data = this.canvas.toDataURL("image/png");
    this.canvas.width = previous[0];
    this.canvas.height = previous[1];
    this.render(normalizedTime);
    return data;
  }

  dispose(): void {
    this.releaseTargets();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.fieldProgram);
    this.gl.deleteProgram(this.blurProgram);
    this.gl.deleteProgram(this.compositeProgram);
    this.uniforms.clear();
    this.canvas.remove();
  }

  private renderAt(normalizedTime: number, width: number, height: number): void {
    const gl = this.gl;
    const s = this.state;
    this.ensureTargets(width, height);
    gl.viewport(0, 0, width, height);
    gl.bindVertexArray(this.vao);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.useProgram(this.fieldProgram);
    const dirs = CANONICAL_TRIAD;
    this.setUniforms(this.fieldProgram, {
      uResolution: [width, height],
      uAnchor: [s.artboard.axisAnchor.gridX, 1 - s.artboard.axisAnchor.gridY],
      uAxis0: dirs[0], uAxis1: dirs[1], uAxis2: dirs[2],
      uTime: normalizedTime, uSeed: s.motion.seed, uScale: s.artboard.scale,
      uMassScale: s.field.massScale, uMembraneScale: s.field.membraneScale, uFoldFrequency: s.field.foldFrequency,
      uCubeGap: s.geometry.cubeGap, uBevel: s.geometry.bevel,
      uVoidSize: s.field.voidSize, uRimWidth: s.field.rimWidth, uEchoStrength: s.field.echoStrength,
      uMotionStrength: s.motion.strength, uAsymmetry: s.advanced.asymmetry, uDepth: s.advanced.depth,
      uCenterBias: s.advanced.centerBias, uWarp: s.advanced.warp, uContactShadow: s.advanced.contactShadow,
      uDarkness: s.color.darkness, uViolet: s.color.violet, uMagenta: s.color.magenta, uCyan: s.color.cyan,
      uGreen: s.color.green, uWhiteCore: s.color.whiteCore, uSaturation: s.color.saturation,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.blur(this.emissionTexture, this.blurFramebufferA, [1, 0], width, height);
    this.blur(this.blurTextureA, this.blurFramebufferB, [0, 1], width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawBuffers([gl.BACK]);
    gl.useProgram(this.compositeProgram);
    this.bindTexture(this.compositeProgram, "uBase", this.baseTexture, 0);
    this.bindTexture(this.compositeProgram, "uEmission", this.emissionTexture, 1);
    this.bindTexture(this.compositeProgram, "uBloomTexture", this.blurTextureB, 2);
    this.setUniforms(this.compositeProgram, {
      uResolution: [width, height], uBackground: color(s.artboard.background), uBloom: s.advanced.bloom,
      uDither: s.advanced.dither, uSeed: s.motion.seed, uTransparent: s.artboard.transparent,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private blur(texture: WebGLTexture | null, framebuffer: WebGLFramebuffer | null, direction: [number, number], width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.useProgram(this.blurProgram);
    this.bindTexture(this.blurProgram, "uTexture", texture, 0);
    this.setUniforms(this.blurProgram, { uResolution: [width, height], uDirection: direction, uRadius: this.state.field.diffusion });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private ensureTargets(width: number, height: number): void {
    if (this.targetWidth === width && this.targetHeight === height && this.fieldFramebuffer) return;
    this.releaseTargets();
    const gl = this.gl;
    this.baseTexture = this.createTexture(width, height);
    this.emissionTexture = this.createTexture(width, height);
    this.blurTextureA = this.createTexture(width, height);
    this.blurTextureB = this.createTexture(width, height);
    this.fieldFramebuffer = gl.createFramebuffer();
    this.blurFramebufferA = gl.createFramebuffer();
    this.blurFramebufferB = gl.createFramebuffer();
    if (!this.fieldFramebuffer || !this.blurFramebufferA || !this.blurFramebufferB) throw new Error("Light Field render target을 생성하지 못했습니다.");
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fieldFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.baseTexture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.emissionTexture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    this.assertFramebuffer("field");
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebufferA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTextureA, 0);
    this.assertFramebuffer("blur A");
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebufferB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTextureB, 0);
    this.assertFramebuffer("blur B");
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.targetWidth = width;
    this.targetHeight = height;
  }

  private createTexture(width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Light Field texture를 생성하지 못했습니다.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
  }

  private releaseTargets(): void {
    const gl = this.gl;
    [this.baseTexture, this.emissionTexture, this.blurTextureA, this.blurTextureB].forEach((texture) => { if (texture) gl.deleteTexture(texture); });
    [this.fieldFramebuffer, this.blurFramebufferA, this.blurFramebufferB].forEach((framebuffer) => { if (framebuffer) gl.deleteFramebuffer(framebuffer); });
    this.baseTexture = null; this.emissionTexture = null; this.blurTextureA = null; this.blurTextureB = null;
    this.fieldFramebuffer = null; this.blurFramebufferA = null; this.blurFramebufferB = null;
    this.targetWidth = 0; this.targetHeight = 0;
  }

  private assertFramebuffer(label: string): void {
    if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) throw new Error(`Light Field ${label} framebuffer가 완전하지 않습니다.`);
  }

  private bindTexture(program: WebGLProgram, name: string, texture: WebGLTexture | null, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const location = this.location(program, name);
    if (location) gl.uniform1i(location, unit);
  }

  private setUniforms(program: WebGLProgram, values: Record<string, UniformValue>): void {
    Object.entries(values).forEach(([name, value]) => {
      const location = this.location(program, name);
      if (!location) return;
      if (typeof value === "boolean") this.gl.uniform1i(location, value ? 1 : 0);
      else if (typeof value === "number") this.gl.uniform1f(location, value);
      else if (value.length === 2) this.gl.uniform2f(location, value[0], value[1]);
      else this.gl.uniform3f(location, value[0], value[1], value[2]);
    });
  }

  private location(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniforms.get(program);
    if (!cache) { cache = new Map(); this.uniforms.set(program, cache); }
    const cached = cache.get(name);
    if (cached) return cached;
    const found = this.gl.getUniformLocation(program, name);
    if (found) cache.set(name, found);
    return found;
  }

  private createProgram(vertex: string, fragment: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader를 생성하지 못했습니다.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(`Light Field shader compile 실패:\n${log}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    if (!program) throw new Error("WebGL program을 생성하지 못했습니다.");
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "Unknown link error";
      gl.deleteProgram(program);
      throw new Error(`Light Field program link 실패:\n${log}`);
    }
    return program;
  }
}
