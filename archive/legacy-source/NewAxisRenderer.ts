import * as THREE from "three";
import fragmentShader from "./shaders/newAxis.frag.glsl?raw";
import vertexShader from "./shaders/newAxis.vert.glsl?raw";
import type { NewAxisPreset, Point } from "./presets/types";

export type FitMode = "cover" | "contain";

export class NewAxisRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly preset: NewAxisPreset;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private startedAt = performance.now();
  private fitMode: FitMode = "cover";

  constructor(container: HTMLElement, preset: NewAxisPreset) {
    this.preset = preset;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "new-axis-canvas";
    this.canvas.setAttribute("aria-label", "Procedurally rendered New Axis key visual");
    container.append(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: this.createUniforms(),
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.scene.add(new THREE.Mesh(geometry, this.material));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.start();
  }

  private point(value: Point): THREE.Vector2 {
    return new THREE.Vector2(value[0], value[1]);
  }

  private createUniforms(): Record<string, THREE.IUniform> {
    const p = this.preset;
    return {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uDesignSize: { value: this.point(p.referenceSize) },
      uOrigin: { value: this.point(p.origin) },
      uTop: { value: this.point(p.rays.top) },
      uMainLeft: { value: this.point(p.rays.mainLeft) },
      uMainRight: { value: this.point(p.rays.mainRight) },
      uRightDown: { value: this.point(p.rays.rightDown) },
      uSoftDown: { value: this.point(p.rays.softDown) },
      uLeftBoundary: { value: this.point(p.lighting.leftBoundary) },
      uLeftShadowWidth: { value: p.lighting.leftShadowWidth },
      uSoftDownWidthStart: { value: p.lighting.softDownWidthStart },
      uSoftDownWidthEnd: { value: p.lighting.softDownWidthEnd },
      uLumTopRight: { value: p.luminance.topRight },
      uLumRightMiddle: { value: p.luminance.rightMiddle },
      uLumBottomLeft: { value: p.luminance.bottomLeft },
      uLumLeftMiddle: { value: p.luminance.leftMiddle },
      uLumBlack: { value: p.luminance.black },
      uTextureEnabled: { value: p.texture.enabled },
      uTextureAmount: { value: p.texture.amount },
      uTextureScale: { value: p.texture.scale },
      uTextureSeamIntensity: { value: p.texture.seamIntensity },
      uTime: { value: 0 },
      uFitMode: { value: 0 },
      uDebugMode: { value: 0 },
      uShowGuides: { value: false },
    };
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.parentElement?.clientWidth ?? innerWidth);
    const height = Math.max(1, this.canvas.parentElement?.clientHeight ?? innerHeight);
    const pixelRatio = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.updateResolution();
    this.render();
  }

  private updateResolution(): void {
    this.material.uniforms.uResolution.value.set(this.canvas.width, this.canvas.height);
  }

  private start(): void {
    const tick = (): void => {
      this.frame = requestAnimationFrame(tick);
      this.material.uniforms.uTime.value = (performance.now() - this.startedAt) / 1000;
      this.render();
    };
    tick();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  updatePreset(): void {
    const p = this.preset;
    const setPoint = (name: string, point: Point): void => {
      this.material.uniforms[name].value.set(point[0], point[1]);
    };
    setPoint("uOrigin", p.origin);
    setPoint("uTop", p.rays.top);
    setPoint("uMainLeft", p.rays.mainLeft);
    setPoint("uMainRight", p.rays.mainRight);
    setPoint("uRightDown", p.rays.rightDown);
    setPoint("uSoftDown", p.rays.softDown);
    setPoint("uLeftBoundary", p.lighting.leftBoundary);
    this.material.uniforms.uLeftShadowWidth.value = p.lighting.leftShadowWidth;
    this.material.uniforms.uSoftDownWidthStart.value = p.lighting.softDownWidthStart;
    this.material.uniforms.uSoftDownWidthEnd.value = p.lighting.softDownWidthEnd;
    this.material.uniforms.uLumTopRight.value = p.luminance.topRight;
    this.material.uniforms.uLumRightMiddle.value = p.luminance.rightMiddle;
    this.material.uniforms.uLumBottomLeft.value = p.luminance.bottomLeft;
    this.material.uniforms.uLumLeftMiddle.value = p.luminance.leftMiddle;
    this.material.uniforms.uLumBlack.value = p.luminance.black;
    this.material.uniforms.uTextureEnabled.value = p.texture.enabled;
    this.material.uniforms.uTextureAmount.value = p.texture.amount;
    this.material.uniforms.uTextureScale.value = p.texture.scale;
    this.material.uniforms.uTextureSeamIntensity.value = p.texture.seamIntensity;
    this.render();
  }

  setFitMode(mode: FitMode): void {
    this.fitMode = mode;
    this.material.uniforms.uFitMode.value = mode === "contain" ? 1 : 0;
  }

  getFitMode(): FitMode {
    return this.fitMode;
  }

  setPlaneDebug(enabled: boolean): void {
    this.material.uniforms.uDebugMode.value = enabled ? 1 : 0;
  }

  setGuides(enabled: boolean): void {
    this.material.uniforms.uShowGuides.value = enabled;
  }

  setTextureEnabled(enabled: boolean): void {
    this.preset.texture.enabled = enabled;
    this.material.uniforms.uTextureEnabled.value = enabled;
    this.render();
  }

  isTextureEnabled(): boolean {
    return this.preset.texture.enabled;
  }

  captureDataURL(width = 2800, height = 2080): string {
    const previousWidth = this.canvas.clientWidth;
    const previousHeight = this.canvas.clientHeight;
    const previousPixelRatio = this.renderer.getPixelRatio();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.updateResolution();
    this.render();
    const dataUrl = this.canvas.toDataURL("image/png");

    this.renderer.setPixelRatio(previousPixelRatio);
    this.renderer.setSize(previousWidth, previousHeight, false);
    this.updateResolution();
    this.render();
    return dataUrl;
  }

  downloadPNG(filename?: string): void {
    const link = document.createElement("a");
    link.download = filename ?? (this.isTextureEnabled()
      ? "new-axis-heatmap-texture-2800x2080.png"
      : "new-axis-2800x2080.png");
    link.href = this.captureDataURL();
    link.click();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.material.dispose();
    this.renderer.dispose();
  }
}
