import fragmentSource from "./optical.frag.glsl?raw";
import cube0914Source from './cube0914.frag.glsl?raw';
import hybridOpticsSource from './hybridOptics.glsl?raw';
import hybridInternalSource from './hybridInternalReflection.glsl?raw';
import { CUBE0914, writeCube0914Weights } from './Cube0914';
import { HYBRID_AB, writeHybridWeights } from './HybridAB';
import identitySource from './identity25.glsl?raw';
import { identityLayerTiming } from './IdentityLayerTiming';
import { Identity25 } from './Identity25';
import { identityAxisAccent } from './IdentityAxisAccent';
import { opticalCameraPose } from './OpticalCameraMotion';
import { opticalCameraFloat } from './OpticalCameraFloat';
import { writeWorldToAxis, transformAxisVector } from './OpticalAxisMotion';
import { OPTICAL_DEFAULTS } from './OpticalState';
import { getRenderAxisCubes } from "./AxisGeometry";
import type { OpticalState } from "./OpticalState";
import { OpticalResolve } from "./OpticalResolve";
import { writeLightPalette, writeLightWeights } from './OpticalLighting';

const vertexSource = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Analytic optical Axis contours, with HDR resolve and tiled output. */
export class OpticalRenderer {
  private readonly worldToAxis = new Float32Array(9);
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly resolve: OpticalResolve;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly centers = new Float32Array(9);
  private readonly lightPalette = new Float32Array(9);
  private readonly lightWeights = new Float32Array(3);
  private readonly identity = new Identity25();
  private readonly viewState = { ...OPTICAL_DEFAULTS };
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
      const source = CUBE0914 ? cube0914Source : fragmentSource.replace('// IDENTITY25_SOURCE', identitySource)
        .replace('// HYBRID_OPTICS_SOURCE', HYBRID_AB ? hybridInternalSource + hybridOpticsSource : '');
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HYBRID_AB
        ? source.replace('#version 300 es', '#version 300 es\n#define HYBRID_AB') : source));
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
    if (state.cameraMotion) {
      const pose = opticalCameraPose(state);
      Object.assign(this.viewState,state,{ azimuth: pose.azimuth, elevation: pose.elevation });
      state = this.viewState;
    }
    if (this.disposed || this.lost || this.gl.isContextLost()) throw new Error("GPU 연결이 중단됐습니다. 세팅은 저장되어 있으니 페이지를 새로고침해 주세요.");
    const gl = this.gl;
    const floating=opticalCameraFloat(state);
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
    gl.uniform2f(this.uniform('uFrameOffset'),floating.x*.02,floating.y*.02);
    gl.uniform2f(this.uniform("uResolution"), fullWidth * sampleScale, fullHeight * sampleScale);
    gl.uniform2f(this.uniform("uTileOrigin"), (tileX - guard) * sampleScale, (tileY - guard) * sampleScale); gl.uniform2f(this.uniform("uJitter"), 0, 0);
    // Macro pixels cover very small world distances. A fixed 0.00012 epsilon
    // becomes a visible offset after several refractions at high zoom.
    const worldPixel = 6 / state.zoom / Math.min(fullWidth, fullHeight) / sampleScale;
    gl.uniform1f(this.uniform("uRayEpsilon"), Math.max(0.000002, Math.min(0.00012, worldPixel * 0.025)));
    const color = Number.parseInt(state.lightColor.slice(1), 16);
    gl.uniform3f(this.uniform("uLightColor"), ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    gl.uniform1i(this.uniform('uLightCycle'), HYBRID_AB || state.lightCycle ? 1 : 0);
    if (HYBRID_AB || state.lightCycle) {
      writeLightPalette(state, this.lightPalette);
      (HYBRID_AB ? writeHybridWeights : CUBE0914 ? writeCube0914Weights : writeLightWeights)(state, this.lightWeights);
      gl.uniform3fv(this.uniform('uCycleColors[0]'), this.lightPalette);
      gl.uniform3fv(this.uniform('uCycleWeights'), this.lightWeights);
    }
    gl.uniform3f(this.uniform("uDimensions"), state.dimensionTop, state.dimensionLeft, state.dimensionRight);
    const delayToPhase = Math.PI * 2 / state.duration;
    gl.uniform3f(this.uniform('uDimensionDelay'), (state.dimensionDelayTop ?? 0) * delayToPhase,
      (state.dimensionDelayLeft ?? 0) * delayToPhase, (state.dimensionDelayRight ?? 0) * delayToPhase);
    gl.uniform3f(this.uniform("uLayerSpacing"), state.dimensionSpacingTop ?? state.dimensionSpacing, state.dimensionSpacingLeft ?? state.dimensionSpacing, state.dimensionSpacingRight ?? state.dimensionSpacing);
    gl.uniform1i(this.uniform("uHDR"), this.resolve.supportsHDR ? 1 : 0);
    gl.uniform1i(this.uniform("uBounces"), state.bounces);
    gl.uniform1f(this.uniform("uPhase"), (state.time % state.duration) / state.duration * Math.PI * 2);
    writeWorldToAxis(state, this.worldToAxis);
    // Inverse model transform of the fixed world-camera ray basis. Evaluating
    // this on CPU leaves the legacy shader bit-for-bit unchanged when off.
    // The world camera/state never moves; every analytic solid and its local
    // light field share this one rigid model transform about the Axis origin.
    if (state.axisMotion) {
      gl.uniform3fv(this.uniform('uCamera'), transformAxisVector(this.worldToAxis,this.camera));
      gl.uniform3fv(this.uniform('uRight'), transformAxisVector(this.worldToAxis,this.right));
      gl.uniform3fv(this.uniform('uUp'), transformAxisVector(this.worldToAxis,this.up));
    }
    this.identity.update(state, state.axisMotion ? {
      right: transformAxisVector(this.worldToAxis,this.right),
      up: transformAxisVector(this.worldToAxis,this.up),
    } : undefined);
    gl.uniform1f(this.uniform('uIdentityMix'), this.identity.mix);
    const axisAccent = identityAxisAccent(state);
    gl.uniform2f(this.uniform('uIdentityAxisAccent'), axisAccent.progress, axisAccent.amount);
    const layerTiming=identityLayerTiming(state);
    gl.uniform1f(this.uniform('uIdentityEngraving'), state.identityEngraving ?? 1);
    gl.uniform4f(this.uniform('uIdentityLayerTiming'),state.time-layerTiming.firstStart,
      layerTiming.staggerSeconds,layerTiming.fadeSeconds,layerTiming.enabled?1:0);
    if (this.identity.mix < 1) {
      gl.uniform1fv(this.uniform('uIdentityAngles[0]'), this.identity.angles);
      gl.uniform1fv(this.uniform('uIdentityTargets[0]'), this.identity.targets);
      gl.uniform4fv(this.uniform('uIdentityAngular[0]'), this.identity.angular);
      gl.uniform2fv(this.uniform('uIdentityRadial[0]'), this.identity.radial);
      gl.uniform3fv(this.uniform('uIdentityStrokes[0]'), this.identity.strokes);
    }
    const values: Record<string, number> = {
      uHybridDistortion: state.hybridDistortion, uHybridDensity: state.hybridDensity,
      uHybridColorMix: state.hybridColorMix, uHybridDepthFlow: state.hybridDepthFlow,
      uHybridDepthCycles: state.hybridDepthCycles,
      uHybridOpening: state.hybridOpening,
      uHybridFaceReflection: state.hybridFaceReflection,
      uHybridFaceWidth: state.hybridFaceWidth,
      uHybridRefractionOverlap: state.hybridRefractionOverlap,
      uLightMotionCycles: state.lightMotionCycles ?? 1, uLayerFadeAmount: state.layerFadeAmount ?? 1,
      uLayerFadeCycles: state.layerFadeCycles ?? 1, uLayerStagger: state.layerStagger ?? .32,
      uBevel: state.bevel, uIOR: state.ior, uDispersion: state.dispersion, uRoughness: state.roughness, uSurfaceCurvature: state.surfaceCurvature,
      uReflection: state.reflection, uAbsorption: state.absorption, uLightIntensity: state.lightIntensity,
      uSpread: state.lightSpread, uExposure: state.exposure, uZoom: state.zoom, uSpeed: state.speed,
      uPanX: state.panX ?? 0,
      uLayerSoftness: state.dimensionSoftness, uLayerFalloff: state.dimensionFalloff,
    };
    for (const [name, value] of Object.entries(values)) gl.uniform1f(this.uniform(name), value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.resolve.finish(resolvedWidth, resolvedHeight, state.bloom, fullHeight / 1080, guard);
  }

  /** Supersampled tiles bound GPU work and memory; output is never upscaled. */
  async capture(state: Readonly<OpticalState>, width: number, height: number, samples = 4, onProgress?: (progress: number) => void): Promise<string> {
    const capture = new OpticalFrameCapture(width, height, samples);
    try { return (await capture.render(state, undefined, onProgress)).toDataURL('image/png'); }
    finally { capture.dispose(); }
  }

  /** Read the resolved display pixels, not the FP16 lighting target. */
  readPixels(width: number, height: number, destination: Uint8Array): void {
    const gl=this.gl;
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,destination);
    if (this.lost || gl.isContextLost()) throw new Error('고해상도 출력 중 GPU 연결이 끊겼습니다. 다른 GPU 작업을 닫고 다시 시도해 주세요.');
    if (gl.getError()!==gl.NO_ERROR) throw new Error('고해상도 프레임을 읽지 못했습니다. 다시 시도하거나 출력 품질을 낮춰 주세요.');
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

/** One reusable GPU context and one CPU frame for an entire export job.
 * Tiles use the same finite HDR/bloom guard and sample grid as PNG capture.
 * No video frames, PNG strings, or historical images accumulate in memory.
 */
export class OpticalFrameCapture {
  private readonly canvas=document.createElement('canvas');
  private readonly tileCanvas=document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly frame: ImageData;
  private readonly renderer: OpticalRenderer;
  private readonly tile=192;
  private readonly pixels=new Uint8Array(192*192*4);
  private readonly scale: number;
  private busy=false;
  private disposed=false;

  constructor(readonly width:number, readonly height:number, samples=4) {
    if (!Number.isFinite(samples)||samples<1||samples>16) throw new Error('서브픽셀 샘플은 1~16 범위로 지정해 주세요.');
    if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||Math.max(width,height)>8192||width*height>34_000_000) throw new Error('출력은 한 변 8192px, 전체 3400만 픽셀 이내로 지정해 주세요.');
    this.scale=Math.min(4,Math.max(1,Math.ceil(Math.sqrt(samples))));
    this.canvas.width=width; this.canvas.height=height;
    const context=this.canvas.getContext('2d',{alpha:false});
    if (!context) throw new Error('프레임 출력 버퍼를 만들지 못했습니다.');
    this.context=context;
    this.frame=context.createImageData(width,height);
    this.renderer=new OpticalRenderer(this.tileCanvas);
  }

  async render(state:Readonly<OpticalState>, signal?:AbortSignal, onProgress?:(fraction:number)=>void):Promise<HTMLCanvasElement> {
    if (this.disposed||this.busy) throw new Error('프레임 출력기가 사용 중이거나 종료되었습니다.');
    const check=()=>{if(this.disposed||signal?.aborted)throw new DOMException('영상 내보내기를 취소했습니다.','AbortError');};
    this.busy=true;
    const {width,height,tile}=this;
    const total=Math.ceil(width/tile)*Math.ceil(height/tile);
    let done=0,lastYield=performance.now();
    try {
      for(let y=0;y<height;y+=tile) for(let x=0;x<width;x+=tile){
        check();
        const w=Math.min(tile,width-x),h=Math.min(tile,height-y);
        this.renderer.draw(state,w,h,width,height,x,y,this.scale);
        this.renderer.readPixels(w,h,this.pixels);
        const stride=w*4;
        for(let row=0;row<h;row++) this.frame.data.set(this.pixels.subarray(row*stride,(row+1)*stride),((height-y-row-1)*width+x)*4);
        done++;
        // Yield for cancellation and progress without imposing a browser
        // timer clamp for every single tile of every 4K frame.
        if(performance.now()-lastYield>12||done===total){
          onProgress?.(done/total);
          await new Promise<void>(resolve=>setTimeout(resolve,0));
          check(); lastYield=performance.now();
        }
      }
      this.context.putImageData(this.frame,0,0);
      return this.canvas;
    } finally {this.busy=false;}
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true; this.renderer.dispose();
    this.canvas.width=this.canvas.height=this.tileCanvas.width=this.tileCanvas.height=1;
  }
}
