import { OrbitController } from "../camera";
import {
  GLContext,
  GLStateCache,
  UniformBuffer,
  WebGL2UnavailableError,
} from "../core";
import { DebugRenderer } from "../debug/DebugRenderer";
import { PerformanceMonitor } from "../debug/PerformanceMonitor";
import {
  approvedRawAxisRays,
  assertValidAxisMesh,
  buildAxisGeometry,
  type AxisMeshData,
  type GeometryMode,
} from "../geometry";
import {
  createCameraMatrices,
  createCameraState,
  createMat4,
  createVec3,
  fitCameraToBounds,
  multiplyMat4,
  updateCameraMatrices,
  type CameraMatrices,
  type CameraState,
} from "../math";
import { BackgroundPass } from "../passes/BackgroundPass";
import { BloomPass } from "../passes/BloomPass";
import { CompositePass } from "../passes/CompositePass";
import { ExportPass } from "../passes/ExportPass";
import { FxaaPass } from "../passes/FxaaPass";
import { MattePass } from "../passes/MattePass";
import { PrismBackfacePass, type PrismBoundsEncoding } from "../passes/PrismBackfacePass";
import { PrismFrontfacePass } from "../passes/PrismFrontfacePass";
import { ToneMapPass } from "../passes/ToneMapPass";
import type { PassSurface } from "../passes/PassSurface";
import type {
  RawCameraState,
  RawDebugMode,
  RawStudioChange,
  RawStudioState,
} from "../../studio/state/RawStudioState";
import { ExportRenderer, type PNGExportOptions, type PNGExportResult } from "./ExportRenderer";
import { GpuAxisMesh } from "./GpuAxisMesh";
import { LightingUniforms } from "./LightingUniforms";
import { PipelineTargets } from "./PipelineTargets";
import { RenderLoop } from "./RenderLoop";
import { ResizeManager, type ResizeMeasurement } from "./ResizeManager";

const FRAME_WIDTH = 2.8;
const FRAME_HEIGHT = 2.08;
const CAMERA_BLOCK_FLOATS = 16 * 3 + 4;

const QUALITY_SCALE = Object.freeze({
  draft: 0.7,
  balanced: 1,
  high: 1.16,
  final: 1.32,
});

interface RendererPasses {
  readonly background: BackgroundPass;
  readonly bloom: BloomPass;
  readonly matte: MattePass;
  readonly prismBackface: PrismBackfacePass;
  readonly prismFrontface: PrismFrontfacePass;
  readonly composite: CompositePass;
  readonly toneMap: ToneMapPass;
  readonly fxaa: FxaaPass;
  readonly export: ExportPass;
}

export type RawRendererStatusLevel = "ok" | "warning" | "error";

export interface RawRendererStatus {
  readonly renderer: "Raw WebGL2";
  readonly gpuPreference: "High Performance Requested" | "Compatibility GPU Mode" | "Unavailable";
  readonly hdrEnabled: boolean;
  readonly floatColorBuffer: boolean;
  readonly maxTextureSize: number | null;
  readonly maxRenderbufferSize: number | null;
  readonly maxSamples: number | null;
  readonly drawingBuffer: readonly [number, number] | null;
  readonly frameTimeMs: number | null;
  readonly contextLost: boolean;
  readonly effectiveGeometryMode: GeometryMode | null;
  readonly message: string;
  readonly level: RawRendererStatusLevel;
}

export interface RawWebGLRendererOptions {
  readonly state: RawStudioState;
  readonly canvas?: HTMLCanvasElement;
  readonly onStatus?: (status: RawRendererStatus) => void;
  readonly onError?: (error: Error) => void;
  readonly onCameraChange?: (camera: RawCameraState) => void;
}

function debugModeNumber(mode: RawDebugMode, materialMode: "matte" | "prism"): number {
  if (mode === "face-id") return 1;
  if (mode === "face-normal") return 2;
  if (mode === "depth") return 3;
  if (mode === "thickness" && materialMode === "prism") return 4;
  return 0;
}

function isPrimitiveDebug(mode: RawDebugMode): boolean {
  return mode === "wireframe" || mode === "vertices" || mode === "axis-ray" || mode === "center-node";
}

function cameraPositionTuple(camera: CameraState): [number, number, number] {
  return [camera.position[0], camera.position[1], camera.position[2]];
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class RawWebGLRenderer {
  readonly canvas: HTMLCanvasElement;

  private studioState: RawStudioState;
  private readonly onStatus: (status: RawRendererStatus) => void;
  private readonly onError: (error: Error) => void;
  private readonly onCameraChange: (camera: RawCameraState) => void;
  private readonly camera: CameraState;
  private readonly cameraMatrices: CameraMatrices = createCameraMatrices();
  private readonly cameraBlockData = new Float32Array(CAMERA_BLOCK_FLOATS);
  private readonly model = createMat4();
  private readonly renderLoop = new RenderLoop(() => this.renderPreview());

  private host: HTMLElement | null = null;
  private context: GLContext | null = null;
  private stateCache: GLStateCache | null = null;
  private cameraBuffer: UniformBuffer | null = null;
  private mesh: GpuAxisMesh | null = null;
  private targets: PipelineTargets | null = null;
  private passes: RendererPasses | null = null;
  private debugRenderer: DebugRenderer | null = null;
  private performance: PerformanceMonitor | null = null;
  private exportRenderer: ExportRenderer | null = null;
  private resizeManager: ResizeManager | null = null;
  private orbitController: OrbitController | null = null;
  private detachContextLost: (() => void) | null = null;
  private detachContextRestored: (() => void) | null = null;
  private contextError: Error | null = null;
  private dirty = true;
  private disposed = false;
  private lastMeasurement: ResizeMeasurement | null = null;
  private effectiveGeometryMode: GeometryMode | null = null;
  private lastAnimatedStatusTime = 0;
  private animationTimeSeconds = performance.now() / 1000;
  private lastAnimationTickSeconds = performance.now() / 1000;

  constructor(options: RawWebGLRendererOptions) {
    this.studioState = structuredClone(options.state);
    this.canvas = options.canvas ?? document.createElement("canvas");
    this.canvas.classList.add("raw-webgl-canvas");
    this.canvas.setAttribute("aria-label", "PLEOS Axis WebGL2 렌더러");
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onError = options.onError ?? ((error) => console.error(error));
    this.onCameraChange = options.onCameraChange ?? (() => undefined);
    this.camera = createCameraState();
    this.syncCameraFromStudio();
  }

  mount(host: HTMLElement): void {
    if (this.disposed) throw new Error("Cannot mount a disposed RawWebGLRenderer.");
    if (this.host === host && this.context) return;
    this.host = host;
    host.replaceChildren(this.canvas);
    try {
      this.context = new GLContext(this.canvas);
      this.stateCache = new GLStateCache(this.context.gl);
      this.detachContextLost = this.context.onContextLost(() => {
        this.renderLoop.cancel();
        this.emitStatus("WebGL 연결이 끊어져 복구를 기다리고 있습니다.", "error");
      });
      this.detachContextRestored = this.context.onContextRestored(() => {
        try {
          this.rebuildGpuResources();
          this.applyLastResize();
          this.requestRender(true);
          this.emitStatus("WebGL 연결과 렌더링 자원이 복구되었습니다.", "ok");
        } catch (error) {
          this.reportError(error);
        }
      });
      this.rebuildGpuResources();
      this.orbitController = new OrbitController(this.canvas, this.camera, {
        onChange: () => {
          this.onCameraChange(this.getCameraState());
          this.requestRender();
        },
      });
      this.resizeManager = new ResizeManager(host, (measurement) => this.resize(measurement));
      this.resizeManager.start();
      this.emitStatus("WebGL2 렌더러가 준비되었습니다.", this.context.capabilities.hdrColorBuffer ? "ok" : "warning");
    } catch (error) {
      this.contextError = toError(error);
      if (error instanceof WebGL2UnavailableError) this.showUnsupportedMessage(error.message);
      this.reportError(error);
    }
  }

  updateState(state: Readonly<RawStudioState>, change: RawStudioChange = { path: "*", reason: "external" }): void {
    if (this.disposed) return;
    this.studioState = structuredClone(state);
    // Reset the wall-clock reference on every state transition so resuming
    // never includes the time spent paused or away from the render loop.
    this.lastAnimationTickSeconds = performance.now() / 1000;
    const cameraChanged = change.path === "*" || change.path.startsWith("camera") || change.reason === "initialize";
    const geometryChanged = change.path === "*"
      || change.path.startsWith("geometry")
      || change.path === "scenePreset"
      || change.path === "material.preset"
      || change.path === "material.mode"
      || change.path.startsWith("material.prismPreset")
      || change.path.startsWith("material.mattePreset");
    if (cameraChanged) this.syncCameraFromStudio();
    if (geometryChanged && this.context && !this.context.isContextLost) {
      try { this.rebuildGeometry(); } catch (error) { this.reportError(error); }
    }
    if (this.targets && this.context && this.targets.mode !== this.studioState.material.mode) {
      const previous = this.targets;
      this.targets = new PipelineTargets(
        this.context.gl,
        this.context.capabilities,
        previous.width,
        previous.height,
        this.studioState.material.mode,
      );
      previous.dispose();
      this.stateCache?.reset();
    }
    if (change.path.startsWith("output.quality") || change.path.startsWith("output.post.internalScale")) {
      this.applyLastResize();
    }
    if (!this.studioState.debug.freezeRender) this.requestRender();
  }

  requestRender(force = false): void {
    if (this.disposed || !this.context || this.context.isContextLost) return;
    this.dirty = true;
    if (force || !this.studioState.debug.freezeRender) this.renderLoop.request();
  }

  render(): void {
    this.dirty = true;
    this.renderPreview();
  }

  resize(measurement: ResizeMeasurement): void {
    this.lastMeasurement = measurement;
    this.applyLastResize();
  }

  resetCamera(): RawCameraState {
    this.syncCameraFromStudio();
    this.requestRender(true);
    return this.getCameraState();
  }

  fitCamera(): RawCameraState {
    if (!this.mesh || !this.targets) return this.getCameraState();
    const bounds = {
      min: createVec3(...this.mesh.data.bounds.min),
      max: createVec3(...this.mesh.data.bounds.max),
    };
    fitCameraToBounds(this.camera, bounds, this.targets.width / this.targets.height, 1.06);
    this.requestRender(true);
    return this.getCameraState();
  }

  getCameraState(): RawCameraState {
    return {
      mode: this.camera.mode,
      position: cameraPositionTuple(this.camera),
      target: [this.camera.target[0], this.camera.target[1], this.camera.target[2]],
      fov: this.camera.fovYRadians * 180 / Math.PI,
      orthoZoom: FRAME_HEIGHT / Math.max(this.camera.orthoHeight, 1e-5),
      near: this.camera.near,
      far: this.camera.far,
      roll: this.camera.rollRadians * 180 / Math.PI,
      locked: this.camera.locked,
    };
  }

  recompileShaders(): void {
    if (!this.context || this.context.isContextLost) throw new Error("Cannot compile shaders without an active WebGL2 context.");
    this.rebuildGpuResources();
    this.applyLastResize();
    this.requestRender(true);
  }

  async exportPNG(options: Partial<PNGExportOptions> = {}): Promise<PNGExportResult> {
    if (!this.exportRenderer || !this.context || this.context.isContextLost) {
      throw new Error("PNG export requires an active WebGL2 renderer.");
    }
    const output = this.studioState.output;
    const exportTargets: { current: PipelineTargets | null } = { current: null };
    try {
      return await this.exportRenderer.exportPNG({
        width: options.width ?? output.width,
        height: options.height ?? output.height,
        supersampling: options.supersampling ?? output.supersampling,
        accumulationSamples: options.accumulationSamples ?? output.accumulationSamples,
        transparent: options.transparent ?? output.transparent,
        filename: options.filename ?? output.filename,
        download: options.download ?? true,
        estimatedPipelineBytesPerPixel: this.studioState.material.mode === "prism"
          ? (this.context.capabilities.hdrColorBuffer ? 36 : 28)
          : (this.context.capabilities.hdrColorBuffer ? 20 : 16),
      }, (sample) => {
        if (!this.context || !this.stateCache) throw new Error("WebGL context disappeared during export.");
        exportTargets.current ??= new PipelineTargets(
          this.context.gl,
          this.context.capabilities,
          sample.renderWidth,
          sample.renderHeight,
          this.studioState.material.mode,
          "Export",
        );
        this.renderPipeline(exportTargets.current, sample.transparent, sample.jitterNdc);
        return exportTargets.current.final.colorTexture;
      });
    } finally {
      exportTargets.current?.dispose();
      this.stateCache?.reset();
      this.requestRender(true);
    }
  }

  inspectStatus(): RawRendererStatus {
    const context = this.context;
    const capabilities = context?.capabilities;
    const gpuPreference = !context
      ? "Unavailable"
      : context.gpuRequestMode === "compatibility"
        ? "Compatibility GPU Mode"
        : "High Performance Requested";
    const mismatch = this.studioState.material.mode === "prism"
      && (this.studioState.geometry.mode !== "closed-optical-solid" || this.studioState.geometry.variation !== "30-v1");
    const message = this.contextError?.message
      ?? (mismatch
        ? "Prism uses the canonical 30° Variation 1 closed optical solid."
        : capabilities && !capabilities.hdrColorBuffer
          ? "RGBA8 compatibility pipeline active; HDR highlight range is reduced."
          : "WebGL2 렌더러가 준비되었습니다.");
    const level: RawRendererStatusLevel = this.contextError
      ? "error"
      : mismatch || (capabilities !== undefined && !capabilities.hdrColorBuffer)
        ? "warning"
        : "ok";
    return {
      renderer: "Raw WebGL2",
      gpuPreference,
      hdrEnabled: this.targets?.hdr ?? false,
      floatColorBuffer: capabilities?.floatColorBuffer ?? false,
      maxTextureSize: capabilities?.maxTextureSize ?? null,
      maxRenderbufferSize: capabilities?.maxRenderbufferSize ?? null,
      maxSamples: capabilities?.maxSamples ?? null,
      drawingBuffer: context ? [context.gl.drawingBufferWidth, context.gl.drawingBufferHeight] : null,
      frameTimeMs: this.performance?.frameTimeMs ?? null,
      contextLost: context?.isContextLost ?? false,
      effectiveGeometryMode: this.effectiveGeometryMode,
      message,
      level,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderLoop.dispose();
    this.resizeManager?.dispose();
    this.orbitController?.dispose();
    this.detachContextLost?.();
    this.detachContextRestored?.();
    this.disposeGpuResources();
    this.context?.dispose();
    this.canvas.remove();
    this.host = null;
  }

  private renderPreview(): void {
    if (!this.dirty || this.disposed || !this.context || this.context.isContextLost || !this.targets || !this.passes) return;
    this.dirty = false;
    try {
      this.updateAnimationClock();
      this.performance?.begin();
      this.renderPipeline(this.targets, false, [0, 0]);
      this.passes.composite.render(this.targets.final.colorTexture, {
        target: null,
        width: this.context.gl.drawingBufferWidth,
        height: this.context.gl.drawingBufferHeight,
      }, false);
      this.performance?.end();
      const animated = this.textureAnimationActive();
      const now = performance.now();
      if (!animated || now - this.lastAnimatedStatusTime > 500) {
        this.emitStatus();
        this.lastAnimatedStatusTime = now;
      }
      if (animated) {
        this.dirty = true;
        this.renderLoop.request();
      }
    } catch (error) {
      this.performance?.end();
      this.reportError(error);
    }
  }

  private renderPipeline(
    targets: PipelineTargets,
    transparent: boolean,
    jitterNdc: readonly [number, number],
  ): void {
    if (!this.context || !this.stateCache || !this.mesh || !this.passes || !this.debugRenderer) {
      throw new Error("Raw WebGL2 pipeline is incomplete.");
    }
    this.updateCameraBlock(targets.width / targets.height, jitterNdc);
    const passes = this.passes;
    const sceneSurface: PassSurface = { target: targets.scene, width: targets.width, height: targets.height };
    passes.background.render(sceneSurface, this.studioState.lighting, transparent);
    const primitiveDebug = isPrimitiveDebug(this.studioState.debug.mode);
    let hdrTarget = targets.scene;

    if (!primitiveDebug) {
      const mode = debugModeNumber(this.studioState.debug.mode, this.studioState.material.mode);
      if (this.studioState.material.mode === "prism") {
        if (!targets.backface || !targets.composite) {
          throw new Error("Prism pipeline targets are unavailable; rebuild the material pipeline.");
        }
        const backfaceSurface: PassSurface = { target: targets.backface, width: targets.width, height: targets.height };
        const compositeSurface: PassSurface = { target: targets.composite, width: targets.width, height: targets.height };
        const bounds = this.prismBounds();
        passes.prismBackface.render(this.mesh, backfaceSurface, this.model, bounds);
        passes.composite.render(targets.scene.colorTexture, compositeSurface, true);
        passes.prismFrontface.render(
          this.mesh,
          compositeSurface,
          targets.scene.colorTexture,
          targets.backface.colorTexture,
          {
            material: this.effectivePrismMaterial(),
            lighting: this.studioState.lighting,
            model: this.model,
            cameraPosition: cameraPositionTuple(this.camera),
            near: this.camera.near,
            far: this.camera.far,
            debugMode: mode,
            edgeRoughness: this.studioState.geometry.edgeRoughness,
            edgeHighlightStrength: this.studioState.geometry.edgeHighlightStrength,
            bounds,
          },
        );
        hdrTarget = targets.composite;
      } else {
        passes.matte.render(this.mesh, sceneSurface, {
          material: this.studioState.material.matte,
          lighting: this.studioState.lighting,
          model: this.model,
          cameraPosition: cameraPositionTuple(this.camera),
          near: this.camera.near,
          far: this.camera.far,
          debugMode: mode,
          timeSeconds: this.animationTimeSeconds,
        });
      }
    }

    const hdrSurface: PassSurface = { target: hdrTarget, width: targets.width, height: targets.height };
    if (this.studioState.debug.mode === "wireframe") this.debugRenderer.renderWireframe(this.mesh, hdrSurface, this.model);
    if (this.studioState.debug.mode === "vertices") this.debugRenderer.renderVertices(this.mesh, hdrSurface, this.model);
    this.debugRenderer.renderGuides(hdrSurface, this.model, {
      axis: this.studioState.debug.mode === "axis-ray" || this.studioState.debug.showAxisGuides,
      center: this.studioState.debug.mode === "center-node" || this.studioState.debug.showCenterNode,
      bounds: this.studioState.debug.showBounds,
    });

    const post = this.studioState.debug.mode === "shaded"
      ? this.studioState.output.post
      : {
          ...this.studioState.output.post,
          exposure: 0,
          contrast: 1,
          whitePoint: 1,
          blackLift: 0,
          dither: false,
        };
    const bloomASurface: PassSurface = { target: targets.bloomA, width: targets.bloomA.width, height: targets.bloomA.height };
    const bloomBSurface: PassSurface = { target: targets.bloomB, width: targets.bloomB.width, height: targets.bloomB.height };
    if (post.bloomEnabled) {
      passes.bloom.prefilter(hdrTarget.colorTexture, bloomASurface, post.bloomThreshold);
      passes.bloom.blur(targets.bloomA.colorTexture, bloomBSurface, true, post.bloomRadius);
      passes.bloom.blur(targets.bloomB.colorTexture, bloomASurface, false, post.bloomRadius);
      passes.bloom.blur(targets.bloomA.colorTexture, bloomBSurface, true, post.bloomRadius * 1.45);
      passes.bloom.blur(targets.bloomB.colorTexture, bloomASurface, false, post.bloomRadius * 1.45);
    }
    passes.toneMap.render(hdrTarget.colorTexture, targets.bloomA.colorTexture, {
      target: targets.ldr,
      width: targets.width,
      height: targets.height,
    }, post);
    const finalSurface: PassSurface = { target: targets.final, width: targets.width, height: targets.height };
    if (this.studioState.output.post.fxaa) passes.fxaa.render(targets.ldr.colorTexture, finalSurface);
    else passes.composite.render(targets.ldr.colorTexture, finalSurface, false);
  }

  private textureAnimationActive(): boolean {
    const texture = this.studioState.material.matte.texture;
    return this.studioState.material.mode === "matte"
      && texture.enabled
      && texture.animationEnabled
      && !texture.animationPaused
      && Math.abs(texture.animationSpeed) > 1e-5
      && !this.studioState.debug.freezeRender;
  }

  private updateAnimationClock(): void {
    const now = performance.now() / 1000;
    const texture = this.studioState.material.matte.texture;
    if (texture.enabled && texture.animationEnabled && !texture.animationPaused) {
      this.animationTimeSeconds += Math.min(Math.max(now - this.lastAnimationTickSeconds, 0), 0.1);
    }
    this.lastAnimationTickSeconds = now;
  }

  private updateCameraBlock(aspect: number, jitterNdc: readonly [number, number]): void {
    if (!this.cameraBuffer) throw new Error("Camera UBO is unavailable.");
    updateCameraMatrices(this.camera, aspect, this.cameraMatrices);
    if (jitterNdc[0] !== 0 || jitterNdc[1] !== 0) {
      if (this.camera.mode === "perspective") {
        this.cameraMatrices.projection[8] += jitterNdc[0];
        this.cameraMatrices.projection[9] += jitterNdc[1];
      } else {
        this.cameraMatrices.projection[12] += jitterNdc[0];
        this.cameraMatrices.projection[13] += jitterNdc[1];
      }
      multiplyMat4(this.cameraMatrices.viewProjection, this.cameraMatrices.projection, this.cameraMatrices.view);
    }
    this.cameraBlockData.set(this.cameraMatrices.view, 0);
    this.cameraBlockData.set(this.cameraMatrices.projection, 16);
    this.cameraBlockData.set(this.cameraMatrices.viewProjection, 32);
    this.cameraBlockData.set([this.camera.position[0], this.camera.position[1], this.camera.position[2], 1], 48);
    this.cameraBuffer.upload(this.cameraBlockData);
    this.cameraBuffer.bindBase(0);
  }

  private rebuildGpuResources(): void {
    if (!this.context) return;
    this.disposeGpuResources();
    const gl = this.context.gl;
    this.stateCache = new GLStateCache(gl);
    const lightingUniforms = new LightingUniforms(gl);
    this.cameraBuffer = new UniformBuffer(gl, { byteLength: CAMERA_BLOCK_FLOATS * 4, bindingPoint: 0, label: "CameraBlock UBO" });
    this.mesh = new GpuAxisMesh(gl, this.buildGeometry());
    this.debugRenderer = new DebugRenderer(gl, this.stateCache);
    this.debugRenderer.updateMesh(this.mesh.data);
    this.passes = {
      background: new BackgroundPass(gl, this.stateCache, lightingUniforms),
      bloom: new BloomPass(gl, this.stateCache),
      matte: new MattePass(gl, this.stateCache, lightingUniforms),
      prismBackface: new PrismBackfacePass(gl, this.stateCache),
      prismFrontface: new PrismFrontfacePass(gl, this.stateCache, lightingUniforms),
      composite: new CompositePass(gl, this.stateCache),
      toneMap: new ToneMapPass(gl, this.stateCache),
      fxaa: new FxaaPass(gl, this.stateCache),
      export: new ExportPass(gl, this.stateCache),
    };
    this.performance = new PerformanceMonitor(gl, this.context.capabilities.extensions.disjointTimerQuery);
    this.exportRenderer = new ExportRenderer(gl, this.context.capabilities, this.passes.export);
    const width = Math.max(1, gl.drawingBufferWidth);
    const height = Math.max(1, gl.drawingBufferHeight);
    this.targets = new PipelineTargets(gl, this.context.capabilities, width, height, this.studioState.material.mode);
    this.contextError = null;
    this.dirty = true;
  }

  private rebuildGeometry(): void {
    if (!this.context || !this.debugRenderer) return;
    const data = this.buildGeometry();
    const replacement = new GpuAxisMesh(this.context.gl, data);
    this.mesh?.dispose();
    this.mesh = replacement;
    this.debugRenderer.updateMesh(data);
    this.stateCache?.reset();
    this.dirty = true;
  }

  private buildGeometry(): AxisMeshData {
    const geometry = this.studioState.geometry;
    const prism = this.studioState.material.mode === "prism";
    const mode: GeometryMode = prism ? "closed-optical-solid" : geometry.mode;
    this.effectiveGeometryMode = mode;
    const origin: [number, number, number] = [
      ((geometry.originGrid[0] - 10) / 20) * FRAME_WIDTH,
      ((geometry.originGrid[1] - 10) / 20) * FRAME_HEIGHT,
      0,
    ];
    const variation = geometry.variation;
    const mesh = buildAxisGeometry(mode, {
      presetId: prism ? "30-v1" : variation,
      rayAnglesDeg: approvedRawAxisRays(prism ? "30-v1" : variation),
      origin,
      frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      foldDepth: geometry.foldDepth,
      depthRatio: Math.max(0.02, geometry.solidThickness),
      bevel: {
        enabled: mode === "closed-optical-solid" && geometry.bevelEnabled,
        width: geometry.bevelWidth,
        segments: Math.max(1, Math.round(geometry.bevelSegments)),
        curvature: geometry.bevelCurvature,
        preserveCenterNode: true,
      },
    });
    assertValidAxisMesh(mesh, {
      requireClosed: mode === "closed-optical-solid",
      expectedComponents: mode === "closed-optical-solid" ? 2 : 1,
    });
    return mesh;
  }

  private disposeGpuResources(): void {
    this.performance?.dispose();
    this.performance = null;
    this.targets?.dispose();
    this.targets = null;
    this.debugRenderer?.dispose();
    this.debugRenderer = null;
    this.mesh?.dispose();
    this.mesh = null;
    if (this.passes) {
      this.passes.background.dispose();
      this.passes.bloom.dispose();
      this.passes.matte.dispose();
      this.passes.prismBackface.dispose();
      this.passes.prismFrontface.dispose();
      this.passes.composite.dispose();
      this.passes.toneMap.dispose();
      this.passes.fxaa.dispose();
      this.passes.export.dispose();
    }
    this.passes = null;
    this.exportRenderer = null;
    this.cameraBuffer?.dispose();
    this.cameraBuffer = null;
    this.stateCache?.reset();
  }

  private syncCameraFromStudio(): void {
    const source = this.studioState.camera;
    this.camera.mode = source.mode;
    this.camera.position.set(source.position);
    this.camera.target.set(source.target);
    this.camera.fovYRadians = Math.max(1, source.fov) * Math.PI / 180;
    this.camera.orthoHeight = FRAME_HEIGHT / Math.max(source.orthoZoom, 1e-4);
    this.camera.near = Math.max(1e-4, source.near);
    this.camera.far = Math.max(this.camera.near + 1e-3, source.far);
    this.camera.rollRadians = source.roll * Math.PI / 180;
    this.camera.locked = source.locked;
  }

  private applyLastResize(): void {
    if (!this.lastMeasurement || !this.context || this.context.isContextLost) return;
    const scale = this.studioState.output.post.internalScale * QUALITY_SCALE[this.studioState.output.quality];
    const changed = this.context.resizeDrawingBuffer(
      this.lastMeasurement.cssWidth,
      this.lastMeasurement.cssHeight,
      this.lastMeasurement.devicePixelRatio * scale,
      2.5,
    );
    if (changed && this.targets) {
      this.targets.resize(this.context.gl.drawingBufferWidth, this.context.gl.drawingBufferHeight);
      this.stateCache?.reset();
    }
    if (changed) this.requestRender(true);
    this.emitStatus();
  }

  private prismBounds(): PrismBoundsEncoding {
    if (!this.mesh) return { center: [0, 0, 0], halfExtent: [1, 1, 1] };
    const bounds = this.mesh.data.bounds;
    return {
      center: [bounds.center[0], bounds.center[1], bounds.center[2]],
      halfExtent: [
        Math.max((bounds.max[0] - bounds.min[0]) * 0.5, 1e-4),
        Math.max((bounds.max[1] - bounds.min[1]) * 0.5, 1e-4),
        Math.max((bounds.max[2] - bounds.min[2]) * 0.5, 1e-4),
      ],
    };
  }

  private showUnsupportedMessage(message: string): void {
    if (!this.host) return;
    const panel = document.createElement("section");
    panel.className = "raw-webgl-error";
    panel.setAttribute("role", "alert");
    panel.innerHTML = `<strong>WebGL2 unavailable</strong><span>${message}</span>`;
    this.host.replaceChildren(panel);
  }

  private emitStatus(message?: string, level?: RawRendererStatusLevel): void {
    const status = this.inspectStatus();
    this.onStatus(message || level ? { ...status, message: message ?? status.message, level: level ?? status.level } : status);
  }

  private reportError(error: unknown): void {
    const resolved = toError(error);
    this.contextError = resolved;
    this.onError(resolved);
    this.emitStatus(resolved.message, "error");
  }

  private effectivePrismMaterial(): RawStudioState["material"]["prism"] {
    const quality = this.studioState.output.quality;
    const requested = this.studioState.material.prism.spectralSamples;
    const spectralSamples: 3 | 5 | 7 = quality === "draft" || quality === "balanced"
      ? 3
      : quality === "high"
        ? (requested >= 5 ? 5 : 3)
        : requested;
    return { ...this.studioState.material.prism, spectralSamples };
  }
}
