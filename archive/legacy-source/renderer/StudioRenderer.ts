import * as THREE from "three";
import vertexShader from "../shaders/newAxis.vert.glsl?raw";
import comparisonFragmentShader from "./comparison.frag.glsl?raw";
import { pleosOriginal } from "../presets/pleos-original";
import type { FaceId, TextureSlot } from "../textures/types";
import type { NewAxis3DStudioState, RendererMode } from "../state/threeDStudioState";
import { BaseRenderPass } from "./BaseRenderPass";
import { NewAxis3DRenderer } from "./NewAxis3DRenderer";
import { PostProcessingPass } from "./PostProcessingPass";

const MODE_IDS: Record<RendererMode, number> = { "baseline-2d": 0, "studio-3d": 1, "split-compare": 2, difference: 3 };

export class StudioRenderer {
  readonly canvas = document.createElement("canvas");
  readonly renderer: THREE.WebGLRenderer;
  readonly threeD: NewAxis3DRenderer;
  readonly maxTextureSize: number;
  private readonly base = new BaseRenderPass(pleosOriginal);
  private readonly baselineTarget: THREE.WebGLRenderTarget;
  private readonly threeDTarget: THREE.WebGLRenderTarget;
  private readonly postTarget: THREE.WebGLRenderTarget;
  private readonly post: PostProcessingPass;
  private readonly screenScene = new THREE.Scene(); private readonly screenCamera = new THREE.Camera(); private readonly screenMaterial: THREE.ShaderMaterial; private readonly screenQuad: THREE.Mesh;
  private state: NewAxis3DStudioState; private dirty = true; private start = performance.now(); private frameCount = 0; private fpsLast = performance.now(); private raf = 0; private resizeObserver: ResizeObserver;
  onFps: ((fps: number) => void) | null = null; onFaceSelected: ((face: FaceId | null) => void) | null = null;

  constructor(private readonly host: HTMLElement, initial: NewAxis3DStudioState) {
    this.state = structuredClone(initial); this.canvas.className = "render-canvas"; this.host.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.setClearColor(0x000000, 1);
    this.maxTextureSize = this.renderer.capabilities.maxTextureSize;
    const baseOptions: THREE.RenderTargetOptions = { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType };
    this.baselineTarget = new THREE.WebGLRenderTarget(1, 1, baseOptions);
    this.threeDTarget = new THREE.WebGLRenderTarget(1, 1, { ...baseOptions, depthBuffer: true }); this.threeDTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.postTarget = new THREE.WebGLRenderTarget(1, 1, baseOptions);
    this.threeD = new NewAxis3DRenderer(this.renderer, this.canvas, initial); this.threeD.onFaceSelected = (face) => this.onFaceSelected?.(face);
    this.post = new PostProcessingPass(this.renderer);
    const v = (point: [number, number]) => new THREE.Vector2(point[0], point[1]);
    this.screenMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader: comparisonFragmentShader, depthTest: false, depthWrite: false, transparent: true, uniforms: {
      uBaseline: { value: this.baselineTarget.texture }, uVariant: { value: this.threeDTarget.texture }, uMode: { value: 0 }, uSplit: { value: .5 }, uOverlayOpacity: { value: 1 }, uTransparent: { value: false },
      uMasterContrast: { value: 1 }, uMasterBrightness: { value: 0 }, uGrayscale: { value: false }, uPlaneDebug: { value: false }, uAxisDebug: { value: false },
      uDesignSize: { value: v(pleosOriginal.referenceSize) }, uOrigin: { value: v(pleosOriginal.origin) }, uTop: { value: v(pleosOriginal.rays.top) },
      uMainLeft: { value: v(pleosOriginal.rays.mainLeft) }, uMainRight: { value: v(pleosOriginal.rays.mainRight) }, uRightDown: { value: v(pleosOriginal.rays.rightDown) }, uSoftDown: { value: v(pleosOriginal.rays.softDown) },
    }}); this.screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenMaterial); this.screenScene.add(this.screenQuad);
    this.resizeObserver = new ResizeObserver(() => this.resizeToHost()); this.resizeObserver.observe(this.host); this.resizeToHost(); this.loop();
  }

  setState(state: NewAxis3DStudioState, forceCamera = false): void { this.state = structuredClone(state); const size = new THREE.Vector2(); this.renderer.getDrawingBufferSize(size); this.threeD.update(this.state, size.x / Math.max(1, size.y), forceCamera); this.dirty = true; }
  async uploadTexture(file: File, slot: TextureSlot): Promise<void> { await this.threeD.uploadTexture(file, slot); this.dirty = true; }
  removeTexture(slot: TextureSlot): void { this.threeD.removeTexture(slot); this.dirty = true; }
  hasTexture(slot: TextureSlot): boolean { return this.threeD.hasTexture(slot); }
  inspect3D(): object { return { ...this.threeD.inspect(), depthTexture: this.threeDTarget.depthTexture?.type ?? null, renderTarget: this.threeDTarget.texture.type }; }
  get cameraStatus(): string { return this.threeD.cameraStatus; }

  captureDataURL(width: number, height: number, state = this.state): string {
    const scale = state.output.supersampling; const renderWidth = Math.round(width * scale); const renderHeight = Math.round(height * scale);
    if (renderWidth > this.maxTextureSize || renderHeight > this.maxTextureSize) throw new Error(`GPU limit ${this.maxTextureSize}px exceeded`);
    const previous = new THREE.Vector2(); this.renderer.getSize(previous); const previousRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1); this.threeDTarget.samples = state.output.antialiasing ? 4 : 0; this.setSize(renderWidth, renderHeight); this.threeD.setExporting(true);
    try {
      this.renderFrame(performance.now(), state); const output = document.createElement("canvas"); output.width = width; output.height = height; const context = output.getContext("2d"); if (!context) throw new Error("Export canvas unavailable");
      context.drawImage(this.canvas, 0, 0, width, height); return output.toDataURL(`image/${state.output.format}`, state.output.quality);
    } finally {
      this.threeD.setExporting(false); this.renderer.setPixelRatio(previousRatio); this.setSize(Math.max(1, previous.x), Math.max(1, previous.y)); this.threeDTarget.samples = 0; this.dirty = true;
    }
  }

  dispose(): void { cancelAnimationFrame(this.raf); this.resizeObserver.disconnect(); this.threeD.dispose(); this.base.dispose(); this.post.dispose(); this.screenQuad.geometry.dispose(); this.screenMaterial.dispose(); this.renderer.dispose(); this.baselineTarget.dispose(); this.threeDTarget.dispose(); this.postTarget.dispose(); }

  private resizeToHost(): void { const rect = this.host.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return; const quality = this.state.previewQuality === "draft" ? 1 : this.state.previewQuality === "balanced" ? 1.5 : 2; this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality)); this.setSize(Math.round(rect.width), Math.round(rect.height)); this.dirty = true; }
  private setSize(width: number, height: number): void { this.renderer.setSize(width, height, false); const drawing = new THREE.Vector2(); this.renderer.getDrawingBufferSize(drawing); this.baselineTarget.setSize(drawing.x, drawing.y); this.threeDTarget.setSize(drawing.x, drawing.y); this.postTarget.setSize(drawing.x, drawing.y); this.base.setResolution(drawing.x, drawing.y); }

  private loop = (): void => {
    const now = performance.now(); const animated = this.threeD.tick((now - this.start) / 1000) || this.state.texture.animated || this.state.post.filmGrain;
    if (this.dirty || animated) this.renderFrame(now, this.state);
    this.frameCount += 1; if (now - this.fpsLast >= 500) { this.onFps?.(Math.round(this.frameCount * 1000 / (now - this.fpsLast))); this.frameCount = 0; this.fpsLast = now; }
    this.raf = requestAnimationFrame(this.loop);
  };

  private renderFrame(now: number, state: NewAxis3DStudioState): void {
    const size = new THREE.Vector2(); this.renderer.getDrawingBufferSize(size); this.renderer.toneMapping = THREE.NoToneMapping; this.base.setTime(0); this.renderer.setRenderTarget(this.baselineTarget); this.renderer.render(this.base.scene, this.base.camera);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.threeD.render(this.threeDTarget, size.x, size.y);
    const variant = this.post.enabled(state.post) ? this.post.apply(this.threeDTarget, this.postTarget, state.post, (now - this.start) / 1000) : this.threeDTarget.texture;
    const u = this.screenMaterial.uniforms; u.uBaseline.value = this.baselineTarget.texture; u.uVariant.value = variant; u.uMode.value = MODE_IDS[state.rendererMode]; u.uSplit.value = state.splitPosition; u.uOverlayOpacity.value = state.overlayOpacity; u.uTransparent.value = state.output.transparent && state.rendererMode === "studio-3d";
    this.renderer.setRenderTarget(null); this.renderer.toneMapping = THREE.NoToneMapping; this.renderer.render(this.screenScene, this.screenCamera); this.dirty = false;
  }
}
