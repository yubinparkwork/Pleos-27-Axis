import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildFoldSectors, disposeSectors, type AxisGraphLike, type SectorGeometry } from "../geometry/FoldSurfaceBuilder";
import { LayerManager } from "../layers/LayerManager";
import { ElementSystem } from "../elements/ElementSystem";
import { MaterialRegistry, backgroundForFamily } from "../materials/MaterialRegistry";
import type { FoldState, StudioState } from "../state/studioState";
import { TextureUploader, type SurfaceTextureSlot, type UploadedTextureAsset } from "../textures/TextureUploader";

const CAMERA_PRESETS: Record<StudioState["camera"]["preset"], { position: [number, number, number]; target: [number, number, number] }> = {
  "reference-front": { position: [0, 0, 5], target: [0, 0, 0] },
  "front-perspective": { position: [0.08, 0.03, 4.5], target: [0, 0, 0] },
  "three-quarter-left": { position: [-2.5, 1.15, 4.2], target: [0.1, 0, 0] },
  "three-quarter-right": { position: [2.55, 1.08, 4.2], target: [-0.08, 0, 0] },
  "low-angle": { position: [0.25, -2.45, 3.65], target: [0, 0.18, 0] },
  "high-angle": { position: [-0.2, 2.55, 3.75], target: [0, -0.18, 0] },
  "macro-center": { position: [0.2, 0.15, 2.72], target: [0, 0, 0.08] },
  "venue-led-wide": { position: [2.9, 0.6, 5.5], target: [0.25, 0, 0] },
};

export interface RendererInspection {
  backend: string;
  outputBuffer: string;
  antialiasing: string;
  quality: string;
  canvas: { cssWidth: number; cssHeight: number; bufferWidth: number; bufferHeight: number; dpr: number };
  geometry: { sectors: number; triangles: number; hasDepth: boolean; hasNormals: boolean };
  camera: { type: string; position: number[]; target: number[] };
  material: { preset: string; texture: boolean; uploaded: SurfaceTextureSlot[] };
  gpu: { maxTextureSize: number };
}

export class PleosRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  readonly perspectiveCamera = new THREE.PerspectiveCamera(34, 1, 0.01, 40);
  readonly controls: OrbitControls;
  readonly studioGroup = new THREE.Group();
  readonly referenceGroup = new THREE.Group();
  readonly guideGroup = new THREE.Group();
  readonly layerManager = new LayerManager();
  readonly elementSystem = new ElementSystem();

  private graph: AxisGraphLike | null = null;
  private sectors: SectorGeometry[] = [];
  private studioMeshes: THREE.Mesh[] = [];
  private referenceMeshes: THREE.Mesh[] = [];
  private referenceMaterials: THREE.MeshPhysicalMaterial[] = [];
  private materialRegistry = new MaterialRegistry();
  private readonly textureUploader = new TextureUploader();
  private environment: THREE.Texture;
  private activeState: StudioState | null = null;
  private target = new THREE.Vector3();
  private split = 0.5;
  private pointer = new THREE.Vector2();
  private parallaxTarget = new THREE.Vector2();
  private parallaxCurrent = new THREE.Vector2();
  private resizeObserver: ResizeObserver;
  private selectedFace: number | null = null;
  private raycaster = new THREE.Raycaster();
  private geometryFold: FoldState | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 1);
    this.scene.add(this.studioGroup, this.referenceGroup, this.guideGroup, this.layerManager.group, this.elementSystem.group);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.setupLighting();
    this.orthographicCamera.position.set(0, 0, 5);
    this.orthographicCamera.lookAt(0, 0, 0);
    this.perspectiveCamera.position.set(0, 0, 4.5);
    this.controls = new OrbitControls(this.perspectiveCamera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enabled = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 12;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.resize();
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);
  }

  private setupLighting(): void {
    const ambient = new THREE.HemisphereLight(0xffffff, 0x050505, 0.65);
    ambient.name = "Neutral ambient";
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.name = "Neutral key";
    key.position.set(-2.6, 3.6, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    const fill = new THREE.DirectionalLight(0xffffff, 0.52);
    fill.name = "Neutral fill";
    fill.position.set(3.2, -1.4, 3.4);
    const rim = new THREE.DirectionalLight(0xffffff, 1.15);
    rim.name = "Neutral rim";
    rim.position.set(0.4, 3.8, -1.8);
    const spectralWarm = new THREE.PointLight(0xff7a32, 0, 12, 1.4);
    spectralWarm.name = "Spectral warm card";
    spectralWarm.position.set(-2.1, 2.3, 3.1);
    const spectralCool = new THREE.PointLight(0x536dff, 0, 12, 1.5);
    spectralCool.name = "Spectral cool card";
    spectralCool.position.set(2.4, -1.3, 2.8);
    const spectralCenter = new THREE.PointLight(0xffe4c0, 0, 4, 2);
    spectralCenter.name = "Spectral center accent";
    spectralCenter.position.set(0, 0, 1.25);
    this.scene.add(ambient, key, fill, rim, spectralWarm, spectralCool, spectralCenter);
  }

  setGraph(graph: AxisGraphLike, state: StudioState, fold: FoldState = state.fold): void {
    this.graph = graph;
    this.activeState = state;
    this.rebuildSurface(fold);
    this.rebuildGuides();
    this.applyCamera(state);
    this.applyLighting(state);
    this.scene.background = state.output.transparent ? null : state.spectral.enabled ? new THREE.Color(0x020202) : backgroundForFamily(state.colorFamily);
    this.renderer.setClearAlpha(state.output.transparent ? 0 : 1);
    this.scene.environmentIntensity = state.lighting.environmentIntensity;
    this.renderer.toneMapping = state.spectral.enabled ? THREE.AgXToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = state.spectral.enabled ? state.spectral.exposure : state.lighting.exposure;
    this.controls.enabled = state.camera.mode === "perspective-exploration";
    this.materialRegistry.updateSpectral(state.spectral, state.motion.duration > 0 ? state.motion.time / state.motion.duration : 0);
  }

  updateFrame(state: StudioState, fold: FoldState, layerReveal: number, sweep: number, elementTime: number): void {
    this.activeState = state;
    if (this.graph) {
      if (!this.isCurrentGeometryFold(fold)) this.rebuildGeometryOnly(fold);
      this.elementSystem.update(elementTime, state.motion.speed, fold);
      this.layerManager.updateReveal(elementTime, layerReveal);
    }
    if (sweep > 0) this.materialRegistry.setSweep(elementTime, sweep);
    else this.materialRegistry.setSelectedFace(this.selectedFace);
    this.materialRegistry.updateSpectral(state.spectral, elementTime);
  }

  applyState(state: StudioState, rebuild = true): void {
    this.activeState = state;
    if (rebuild && this.graph) this.rebuildSurface(state.fold);
    this.rebuildGuides();
    this.applyCamera(state);
    this.applyLighting(state);
    this.scene.background = state.output.transparent ? null : state.spectral.enabled ? new THREE.Color(0x020202) : backgroundForFamily(state.colorFamily);
    this.renderer.setClearAlpha(state.output.transparent ? 0 : 1);
    this.scene.environmentIntensity = state.lighting.environmentIntensity;
    this.renderer.toneMapping = state.spectral.enabled ? THREE.AgXToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = state.spectral.enabled ? state.spectral.exposure : state.lighting.exposure;
    this.controls.enabled = state.camera.mode === "perspective-exploration";
    this.materialRegistry.updateSpectral(state.spectral, state.motion.duration > 0 ? state.motion.time / state.motion.duration : 0);
  }

  private rebuildSurface(fold: FoldState): void {
    if (!this.graph || !this.activeState) return;
    this.clearSurface();
    this.sectors = buildFoldSectors(this.graph, fold, this.activeState.spectral, this.activeState.structure);
    this.geometryFold = { centerZ: fold.centerZ, rayDepth: { ...fold.rayDepth } };
    const materials = this.materialRegistry.createMaterials(this.activeState.materialPreset, this.activeState.colorFamily, this.sectors.length, this.activeState.seed, this.activeState.spectral);
    this.sectors.forEach((sector, index) => {
      const mesh = new THREE.Mesh(sector.geometry, materials[index]);
      mesh.userData.faceIndex = index;
      mesh.userData.faceId = sector.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.studioGroup.add(mesh);
      this.studioMeshes.push(mesh);
      const referenceMaterial = new THREE.MeshPhysicalMaterial({
        color: ["#888888", "#5f5f5f", "#050505", "#727272", "#292929", "#b2b2b2"][index % 6],
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      this.referenceMaterials.push(referenceMaterial);
      const reference = new THREE.Mesh(sector.geometry, referenceMaterial);
      this.referenceGroup.add(reference);
      this.referenceMeshes.push(reference);
    });
    this.referenceGroup.visible = false;
    this.layerManager.rebuild(this.studioMeshes, this.activeState.layers);
    this.elementSystem.rebuild(this.graph, fold, this.activeState.elements, this.activeState.colorFamily);
    this.materialRegistry.setSelectedFace(this.activeState.selectedFace);
    this.selectedFace = this.activeState.selectedFace;
    this.applyWireframe();
  }

  private rebuildGeometryOnly(fold: FoldState): void {
    if (!this.graph || this.studioMeshes.length === 0) return;
    const next = buildFoldSectors(this.graph, fold, this.activeState?.spectral, this.activeState?.structure);
    if (next.length !== this.studioMeshes.length) {
      disposeSectors(next);
      this.rebuildSurface(fold);
      return;
    }
    this.sectors.forEach((sector) => sector.geometry.dispose());
    this.sectors = next;
    this.geometryFold = { centerZ: fold.centerZ, rayDepth: { ...fold.rayDepth } };
    next.forEach((sector, index) => {
      this.studioMeshes[index].geometry = sector.geometry;
      this.referenceMeshes[index].geometry = sector.geometry;
    });
    this.layerManager.updateGeometries(this.studioMeshes);
  }

  private isCurrentGeometryFold(fold: FoldState): boolean {
    if (!this.geometryFold || !this.graph || this.geometryFold.centerZ !== fold.centerZ) return false;
    return this.graph.rays.every((ray) => (this.geometryFold?.rayDepth[ray.id] ?? 0) === (fold.rayDepth[ray.id] ?? 0));
  }

  private rebuildGuides(): void {
    this.guideGroup.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.guideGroup.clear();
    if (!this.graph || !this.activeState || (!this.activeState.showGrid && !this.activeState.showAxisGuide)) return;
    const points: THREE.Vector3[] = [];
    const { minX, maxX, minY, maxY } = this.graph.frame;
    if (this.activeState.showGrid) {
      for (let index = 0; index <= 20; index += 1) {
        const x = THREE.MathUtils.lerp(minX, maxX, index / 20);
        const y = THREE.MathUtils.lerp(minY, maxY, index / 20);
        points.push(new THREE.Vector3(x, minY, 0.5), new THREE.Vector3(x, maxY, 0.5));
        points.push(new THREE.Vector3(minX, y, 0.5), new THREE.Vector3(maxX, y, 0.5));
      }
    }
    if (this.activeState.showAxisGuide) {
      this.graph.rays.forEach((ray) => points.push(
        new THREE.Vector3(this.graph?.origin.x ?? 0, this.graph?.origin.y ?? 0, 0.52),
        new THREE.Vector3(ray.endpoint.x, ray.endpoint.y, 0.52),
      ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: this.activeState.showAxisGuide ? 0.5 : 0.12, depthTest: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 100;
    this.guideGroup.add(lines);
    if (this.activeState.showAxisGuide) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      dot.position.set(this.graph.origin.x, this.graph.origin.y, 0.54);
      dot.renderOrder = 101;
      this.guideGroup.add(dot);
    }
  }

  private applyWireframe(): void {
    const wireframe = this.activeState?.showWireframe ?? false;
    this.studioMeshes.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.ShaderMaterial) material.wireframe = wireframe;
    });
  }

  private applyCamera(state: StudioState): void {
    const selected = CAMERA_PRESETS[state.camera.preset];
    this.target.fromArray(selected.target);
    this.perspectiveCamera.position.fromArray(selected.position);
    this.perspectiveCamera.fov = state.camera.fov;
    this.perspectiveCamera.updateProjectionMatrix();
    this.controls.target.copy(this.target);
    this.controls.update();
    this.orthographicCamera.position.set(0, 0, 5);
    this.orthographicCamera.lookAt(this.target);
  }

  private applyLighting(state: StudioState): void {
    const key = this.scene.getObjectByName("Neutral key") as THREE.DirectionalLight | undefined;
    const fill = this.scene.getObjectByName("Neutral fill") as THREE.DirectionalLight | undefined;
    const spectralWarm = this.scene.getObjectByName("Spectral warm card") as THREE.PointLight | undefined;
    const spectralCool = this.scene.getObjectByName("Spectral cool card") as THREE.PointLight | undefined;
    const spectralCenter = this.scene.getObjectByName("Spectral center accent") as THREE.PointLight | undefined;
    if (key) {
      const angle = THREE.MathUtils.degToRad(state.lighting.keyAngle);
      key.position.set(Math.cos(angle) * 4.2, state.lighting.keyHeight, Math.sin(angle) * 4.2 + 3.8);
      key.intensity = state.lighting.keyIntensity;
    }
    if (fill) fill.intensity = state.lighting.fillIntensity;
    if (spectralWarm) spectralWarm.intensity = state.spectral.enabled ? state.spectral.warmCard * 5 : 0;
    if (spectralCool) spectralCool.intensity = state.spectral.enabled ? state.spectral.coolCard * 4 : 0;
    if (spectralCenter) spectralCenter.intensity = state.spectral.enabled ? state.spectral.centerAccent * 3.2 : 0;
  }

  setSplit(value: number): void { this.split = THREE.MathUtils.clamp(value, 0.05, 0.95); }

  async uploadSurfaceTexture(slot: SurfaceTextureSlot, file: File): Promise<UploadedTextureAsset> {
    const gl = this.renderer.getContext();
    const maxDimension = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 8192);
    const asset = await this.textureUploader.load(file, slot, {
      maxDimension,
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
    });
    this.materialRegistry.setUploadedTexture(slot, asset.texture);
    if (this.activeState) this.layerManager.rebuild(this.studioMeshes, this.activeState.layers);
    return asset;
  }

  removeSurfaceTexture(slot: SurfaceTextureSlot): void {
    this.materialRegistry.setUploadedTexture(slot, null);
    if (this.activeState) this.layerManager.rebuild(this.studioMeshes, this.activeState.layers);
    this.textureUploader.remove(slot);
  }

  resize(): void {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.updateCameraAspect(width / height);
  }

  private updateCameraAspect(aspect: number): void {
    const frameWidth = this.graph ? this.graph.frame.maxX - this.graph.frame.minX : 3.5;
    const frameHeight = this.graph ? this.graph.frame.maxY - this.graph.frame.minY : 2.6;
    const frameAspect = frameWidth / frameHeight;
    let halfWidth = frameWidth * 0.5;
    let halfHeight = frameHeight * 0.5;
    if (this.activeState?.spectral.enabled) {
      // Spectral masters use a uniform-scale cover projection: no independent
      // x/y stretch and no square-output letterbox. Rays remain mathematically
      // extended beyond the cropped frame edge.
      if (aspect > frameAspect) halfHeight = halfWidth / aspect;
      else halfWidth = halfHeight * aspect;
    } else if (aspect > frameAspect) halfWidth = halfHeight * aspect;
    else halfHeight = halfWidth / aspect;
    this.orthographicCamera.left = -halfWidth;
    this.orthographicCamera.right = halfWidth;
    this.orthographicCamera.top = halfHeight;
    this.orthographicCamera.bottom = -halfHeight;
    this.orthographicCamera.updateProjectionMatrix();
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();
  }

  render(): void {
    if (!this.activeState) return;
    this.controls.update();
    this.parallaxCurrent.lerp(this.parallaxTarget, 0.055);
    const camera = this.activeCamera;
    if (camera === this.perspectiveCamera && this.activeState.camera.parallax && !this.controls.enabled) {
      const base = CAMERA_PRESETS[this.activeState.camera.preset].position;
      camera.position.set(base[0] + this.parallaxCurrent.x * 0.28, base[1] + this.parallaxCurrent.y * 0.22, base[2]);
      camera.lookAt(this.target);
    }
    // WebGLRenderer viewport/scissor values are logical pixels and are multiplied
    // by DPR internally. Supplying drawing-buffer pixels here would crop the
    // render to the lower-left DPR fraction of the canvas.
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    this.renderer.setScissorTest(false);
    if (this.activeState.rendererMode === "split-compare") {
      const divider = Math.round(width * this.split);
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.setScissor(0, 0, divider, height);
      this.referenceGroup.visible = true;
      this.studioGroup.visible = false;
      this.layerManager.group.visible = false;
      this.elementSystem.group.visible = false;
      this.renderer.render(this.scene, this.orthographicCamera);
      this.renderer.setScissor(divider, 0, width - divider, height);
      this.referenceGroup.visible = false;
      this.studioGroup.visible = true;
      this.layerManager.group.visible = true;
      this.elementSystem.group.visible = true;
      this.renderer.render(this.scene, camera);
      this.renderer.setScissorTest(false);
    } else {
      const reference = this.activeState.rendererMode === "reference-3d";
      this.referenceGroup.visible = reference;
      this.studioGroup.visible = !reference;
      this.layerManager.group.visible = !reference;
      this.elementSystem.group.visible = !reference;
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.render(this.scene, reference ? this.orthographicCamera : camera);
    }
  }

  renderToTarget(target: THREE.WebGLRenderTarget, camera: THREE.Camera = this.activeCamera): void {
    const previous = this.renderer.getRenderTarget();
    const previousGuideVisibility = this.guideGroup.visible;
    const previousLayerVisibility = this.layerManager.group.visible;
    const previousElementVisibility = this.elementSystem.group.visible;
    const previousReferenceVisibility = this.referenceGroup.visible;
    const previousStudioVisibility = this.studioGroup.visible;
    const previousScissorTest = this.renderer.getScissorTest();
    const previousAspect = target.width / target.height;
    this.updateCameraAspect(previousAspect);
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.setScissorTest(false);
      this.renderer.clear();
      this.referenceGroup.visible = this.activeState?.rendererMode === "reference-3d";
      this.studioGroup.visible = !this.referenceGroup.visible;
      // Diagnostic guides are editor-only. Axis-bound production layers and
      // elements follow studio/reference visibility explicitly for deterministic
      // exports, independent of the most recent interactive render mode.
      this.guideGroup.visible = false;
      this.layerManager.group.visible = !this.referenceGroup.visible;
      this.elementSystem.group.visible = !this.referenceGroup.visible;
      this.renderer.render(this.scene, this.referenceGroup.visible ? this.orthographicCamera : camera);
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.setScissorTest(previousScissorTest);
      this.guideGroup.visible = previousGuideVisibility;
      this.layerManager.group.visible = previousLayerVisibility;
      this.elementSystem.group.visible = previousElementVisibility;
      this.referenceGroup.visible = previousReferenceVisibility;
      this.studioGroup.visible = previousStudioVisibility;
      this.updateCameraAspect(Math.max(1, this.stage.clientWidth) / Math.max(1, this.stage.clientHeight));
    }
  }

  get activeCamera(): THREE.Camera {
    return this.activeState?.camera.mode === "perspective-exploration" ? this.perspectiveCamera : this.orthographicCamera;
  }

  inspect(): RendererInspection {
    const gl = this.renderer.getContext();
    const position = this.activeCamera.position.toArray();
    const triangleCount = this.sectors.reduce((sum, sector) => sum + (sector.geometry.index?.count ?? sector.geometry.getAttribute("position")?.count ?? 0) / 3, 0);
    return {
      backend: this.renderer.capabilities.isWebGL2 ? "WebGL 2" : "WebGL 1",
      outputBuffer: this.activeState?.output.format === "exr" ? "RGBA16F / Half Float" : "RGBA8 / sRGB",
      antialiasing: `MSAA ${Math.max(1, this.renderer.capabilities.maxSamples)}× max`,
      quality: this.activeState?.spectral.enabled ? this.activeState.spectral.quality : this.activeState?.output.quality ?? "balanced",
      canvas: { cssWidth: this.stage.clientWidth, cssHeight: this.stage.clientHeight, bufferWidth: this.canvas.width, bufferHeight: this.canvas.height, dpr: this.renderer.getPixelRatio() },
      geometry: { sectors: this.sectors.length, triangles: triangleCount, hasDepth: this.sectors.some((sector) => {
        const positions = sector.geometry.getAttribute("position") as THREE.BufferAttribute;
        return Array.from({ length: positions.count }, (_, index) => positions.getZ(index)).some((z) => Math.abs(z) > 1e-5);
      }), hasNormals: this.sectors.every((sector) => Boolean(sector.geometry.getAttribute("normal"))) },
      camera: { type: this.activeCamera.type, position, target: this.target.toArray() },
      material: {
        preset: this.activeState?.spectral.enabled
          ? this.activeState.spectral.preset
          : this.activeState?.materialPreset ?? "none",
        texture: Boolean((this.studioMeshes[0]?.material as THREE.MeshPhysicalMaterial | undefined)?.normalMap),
        uploaded: this.materialRegistry.getUploadedSlots(),
      },
      gpu: { maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number },
    };
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    this.parallaxTarget.copy(this.pointer);
  };

  private handlePointerLeave = (): void => { this.parallaxTarget.set(0, 0); };

  private handleClick = (): void => {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    const hit = this.raycaster.intersectObjects(this.studioMeshes, false)[0];
    this.selectedFace = hit ? Number(hit.object.userData.faceIndex) : null;
    this.materialRegistry.setSelectedFace(this.selectedFace);
    this.canvas.dispatchEvent(new CustomEvent("axis-face-select", { detail: this.selectedFace }));
  };

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.canvas.dispatchEvent(new CustomEvent("axis-renderer-status", { detail: "GPU context paused" }));
  };

  private handleContextRestored = (): void => {
    this.canvas.dispatchEvent(new CustomEvent("axis-renderer-status", { detail: "GPU context restored" }));
  };

  private clearSurface(): void {
    this.studioGroup.clear();
    this.referenceGroup.clear();
    disposeSectors(this.sectors);
    this.sectors = [];
    this.geometryFold = null;
    this.referenceMaterials.forEach((material) => material.dispose());
    this.referenceMaterials = [];
    this.studioMeshes = [];
    this.referenceMeshes = [];
    this.layerManager.dispose();
    this.elementSystem.dispose();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("click", this.handleClick);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.controls.dispose();
    this.clearSurface();
    this.materialRegistry.dispose();
    this.textureUploader.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
