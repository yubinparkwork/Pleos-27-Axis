import fragmentSource from "./optical.frag.glsl?raw";
import { getRenderAxisCubes } from "./AxisGeometry";
import type { OpticalState } from "./OpticalState";
import { OpticalResolve } from "./OpticalResolve";
import { writeLightPalette, writeLightWeights } from './OpticalLighting';

const vertexSource = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** A three-solid optical ray integrator. No R3F, mesh feedback, or reference textures. */
export class OpticalRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly resolve: OpticalResolve;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly centers = new Float32Array(9);
  private readonly lightPalette = new Float32Array(9);
  private readonly lightWeights = new Float32Array(3);
  private readonly camera = new Float32Array(3);
  private readonly right = new Float32Array(3);
  private readonly up = new Float32Array(3);
  private lastGap = NaN;
  private lastBevel = NaN;
  private disposed = false;
  private lost = false;
  private frameBufferInfo = { sourceWidth: 0, sourceHeight: 0, guardPixels: 0 };
  private readonly onContextLost = (event: Event) => { event.preventDefault(); this.lost = true; };
  readonly maxTextureSize: number;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2를 사용할 수 없습니다. Chrome에서 하드웨어 가속을 켠 뒤 다시 열어 주세요.");
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("셰이더를 생성하지 못했습니다.");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`광학 셰이더 컴파일 실패: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("GPU 프로그램을 생성하지 못했습니다.");
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`광학 프로그램 연결 실패: ${gl.getProgramInfoLog(program)}`);
    } catch (error) { gl.deleteProgram(program); throw error; }
    finally { shaders.forEach(shader => gl.deleteShader(shader)); }
    this.program = program;
    this.vao = gl.createVertexArray()!;
    try { this.resolve = new OpticalResolve(gl); }
    catch (error) { gl.deleteVertexArray(this.vao); gl.deleteProgram(program); throw error; }
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.DITHER);
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name)!;
  }

  draw(state: Readonly<OpticalState>, width: number, height: number, fullWidth = width, fullHeight = height, tileX = 0, tileY = 0, sampleScale = 1): void {
    if (this.disposed || this.lost || this.gl.isContextLost()) throw new Error("GPU 연결이 중단됐습니다. 세팅은 저장되어 있으니 페이지를 새로고침해 주세요.");
    const gl = this.gl;
    if (width !== this.canvas.width || height !== this.canvas.height) { this.canvas.width = width; this.canvas.height = height; }
    // Compute outside the artboard before the finite glow/AA resolve, even for
    // the live preview. Cropping only after resolve makes its outer border
    // identical to a cropped high-resolution/tiled export.
    const guard = OpticalResolve.requiredGuardPixels(fullHeight / 1080, state.bloom);
    const resolvedWidth = width + guard * 2, resolvedHeight = height + guard * 2;
    const sourceWidth = resolvedWidth * sampleScale, sourceHeight = resolvedHeight * sampleScale;
    this.frameBufferInfo.sourceWidth = sourceWidth; this.frameBufferInfo.sourceHeight = sourceHeight; this.frameBufferInfo.guardPixels = guard;
    this.resolve.begin(sourceWidth, sourceHeight); gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    if (this.lastGap !== state.gap || this.lastBevel !== state.bevel) {
      const geometry = getRenderAxisCubes(state.gap, state.bevel);
      geometry.centers.forEach((center, index) => this.centers.set(center, index * 3));
      this.lastGap = state.gap;
      this.lastBevel = state.bevel;
      gl.uniform3fv(this.uniform("uCenters[0]"), this.centers);
      gl.uniform1f(this.uniform("uHalf"), geometry.halfSize);
    }
    const azimuth = state.azimuth * Math.PI / 180, elevation = state.elevation * Math.PI / 180;
    this.camera.set([Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)]);
    this.right.set([Math.cos(azimuth), 0, -Math.sin(azimuth)]);
    this.up.set([-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation)]);
    gl.uniform3fv(this.uniform("uCamera"), this.camera); gl.uniform3fv(this.uniform("uRight"), this.right); gl.uniform3fv(this.uniform("uUp"), this.up);
    gl.uniform2f(this.uniform("uResolution"), fullWidth * sampleScale, fullHeight * sampleScale);
    gl.uniform2f(this.uniform("uTileOrigin"), (tileX - guard) * sampleScale, (tileY - guard) * sampleScale); gl.uniform2f(this.uniform("uJitter"), 0, 0);
    // Macro pixels cover very small world distances. A fixed 0.00012 epsilon
    // becomes a visible offset after several refractions at high zoom.
    const worldPixel = 6 / state.zoom / Math.min(fullWidth, fullHeight) / sampleScale;
    gl.uniform1f(this.uniform("uRayEpsilon"), Math.max(0.000002, Math.min(0.00012, worldPixel * 0.025)));
    const color = Number.parseInt(state.lightColor.slice(1), 16);
    gl.uniform3f(this.uniform("uLightColor"), ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    gl.uniform1i(this.uniform('uLightCycle'), state.lightCycle ? 1 : 0);
    if (state.lightCycle) {
      writeLightPalette(state, this.lightPalette);
      writeLightWeights(state, this.lightWeights);
      gl.uniform3fv(this.uniform('uCycleColors[0]'), this.lightPalette);
      gl.uniform3fv(this.uniform('uCycleWeights'), this.lightWeights);
    }
    gl.uniform3f(this.uniform("uDimensions"), state.dimensionTop, state.dimensionLeft, state.dimensionRight);
    gl.uniform3f(this.uniform("uLayerSpacing"), state.dimensionSpacingTop ?? state.dimensionSpacing, state.dimensionSpacingLeft ?? state.dimensionSpacing, state.dimensionSpacingRight ?? state.dimensionSpacing);
    gl.uniform1i(this.uniform("uHDR"), this.resolve.supportsHDR ? 1 : 0);
    gl.uniform1i(this.uniform("uBounces"), state.bounces);
    gl.uniform1f(this.uniform("uPhase"), (state.time % state.duration) / state.duration * Math.PI * 2);
    const values: Record<string, number> = {
      uBevel: state.bevel, uIOR: state.ior, uDispersion: state.dispersion, uRoughness: state.roughness, uSurfaceCurvature: state.surfaceCurvature,
      uReflection: state.reflection, uAbsorption: state.absorption, uLightIntensity: state.lightIntensity,
      uSpread: state.lightSpread, uExposure: state.exposure, uZoom: state.zoom, uSpeed: state.speed,
      uLayerSoftness: state.dimensionSoftness, uLayerFalloff: state.dimensionFalloff,
    };
    for (const [name, value] of Object.entries(values)) gl.uniform1f(this.uniform(name), value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.resolve.finish(resolvedWidth, resolvedHeight, state.bloom, fullHeight / 1080, guard);
  }

  /** Supersampled tiles bound GPU work and memory; output is never upscaled. */
  async capture(state: Readonly<OpticalState>, width: number, height: number, samples = 4, onProgress?: (progress: number) => void): Promise<string> {
    if (!Number.isFinite(samples) || samples < 1 || samples > 16) throw new Error("서브픽셀 샘플은 1~16 범위로 지정해 주세요.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || Math.max(width, height) > 8192 || width * height > 34_000_000) throw new Error("출력은 한 변 8192px, 전체 3400만 픽셀 이내로 지정해 주세요.");
    const output = document.createElement("canvas"); output.width = width; output.height = height;
    const ctx = output.getContext("2d");
    if (!ctx) throw new Error("이미지 출력 버퍼를 생성하지 못했습니다.");
    const temporary = document.createElement("canvas"), tileCanvas = document.createElement("canvas");
    const tileContext = tileCanvas.getContext("2d")!;
    const renderer = new OpticalRenderer(temporary);
    const scale = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(samples))));
    const tile = 192;
    const total = Math.ceil(width / tile) * Math.ceil(height / tile);
    let done = 0;
    try {
      for (let y = 0; y < height; y += tile) for (let x = 0; x < width; x += tile) {
        const w = Math.min(tile, width - x), h = Math.min(tile, height - y);
        // Integrate subpixels in linear HDR before tone mapping, then read the
        // final-size tile. No display-RGB Canvas2D resampling or tile glow seams.
        renderer.draw(state, w, h, width, height, x, y, scale);
        const pixels = new Uint8Array(w * h * 4);
        renderer.gl.readPixels(0, 0, w, h, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
        if (renderer.gl.isContextLost()) throw new Error("고해상도 출력 중 GPU 연결이 끊겼습니다. 다른 GPU 작업을 닫고 다시 시도해 주세요.");
        tileCanvas.width = w; tileCanvas.height = h;
        const data = tileContext.createImageData(w, h);
        const stride = w * 4;
        for (let row = 0; row < h; row++) data.data.set(pixels.subarray(row * stride, (row + 1) * stride), (h - row - 1) * stride);
        tileContext.putImageData(data, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(tileCanvas, x, height - y - h, w, h);
        onProgress?.(++done / total);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      return output.toDataURL("image/png");
    } finally {
      renderer.dispose(); temporary.width = 1; temporary.height = 1; tileCanvas.width = 1; tileCanvas.height = 1;
    }
  }

  get hdrSupported(): boolean { return this.resolve.supportsHDR; }
  get bufferInfo() { return { ...this.frameBufferInfo }; }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.resolve.dispose(); this.gl.deleteVertexArray(this.vao); this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
