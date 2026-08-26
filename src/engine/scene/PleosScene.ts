import * as THREE from "three/webgpu";
import type { RawStudioChange, RawStudioState } from "../../studio/state/RawStudioState";
import { FixedAxisCamera } from "../camera/FixedAxisCamera";
import type { EngineQualityProfile } from "../config/EngineTypes";
import { createAxisGeometry } from "../geometry/AxisGeometryFactory";
import { EnvironmentSystem } from "../environment/EnvironmentSystem";
import { LightingSystem } from "../lighting/LightingSystem";
import { LineSystem } from "../lines/LineSystem";
import { MaterialSystem } from "../materials/MaterialSystem";
import { ParticleSystem } from "../particles/ParticleSystem";
import { PostProcessingSystem } from "../postprocessing/PostProcessingSystem";
import { SpatialGradientSystem } from "../shaders/SpatialGradientSystem";

export class PleosScene {
  readonly scene = new THREE.Scene();
  readonly cameraSystem: FixedAxisCamera;
  readonly post: PostProcessingSystem;
  readonly particles: ParticleSystem;
  private readonly materials: MaterialSystem;
  private readonly lighting: LightingSystem;
  private readonly environment = new EnvironmentSystem();
  private readonly background: SpatialGradientSystem;
  private readonly lines: LineSystem;
  private axisMesh: THREE.Mesh;
  private state: RawStudioState;
  private quality: EngineQualityProfile;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    initialState: Readonly<RawStudioState>,
    quality: EngineQualityProfile,
    onCameraChange?: (camera: RawStudioState["camera"]) => void,
  ) {
    this.state = structuredClone(initialState);
    this.quality = quality;
    this.scene.name = "Pleos 27 Premium Scene";
    this.scene.background = null;
    this.materials = new MaterialSystem(initialState);
    const axis = createAxisGeometry(initialState);
    this.axisMesh = new THREE.Mesh(axis.geometry, this.materials.active);
    this.axisMesh.name = "Pleos Axis Optical Solids";
    this.axisMesh.castShadow = false;
    this.axisMesh.receiveShadow = false;
    this.axisMesh.renderOrder = 2;
    this.cameraSystem = new FixedAxisCamera(initialState.camera, onCameraChange);
    this.lighting = new LightingSystem(initialState.lighting);
    this.background = new SpatialGradientSystem(initialState);
    this.lines = new LineSystem(initialState);
    this.particles = new ParticleSystem(renderer, initialState, quality);
    this.scene.add(
      this.background.mesh,
      this.lighting.group,
      this.lines.group,
      this.particles.mesh,
      this.axisMesh,
    );
    this.post = new PostProcessingSystem(renderer, this.scene, this.cameraSystem.camera, initialState, quality);
    this.update(initialState, { path: "*", reason: "initialize" });
  }

  async initialize(): Promise<void> {
    await this.environment.initialize(this.renderer, this.scene, this.quality.environmentResolution);
    this.materials.setEnvironment(this.environment.texture, this.state.lighting.environmentIntensity);
    await this.particles.initialize();
  }

  mount(host: HTMLElement): void {
    this.cameraSystem.mount(host);
  }

  update(next: Readonly<RawStudioState>, change: RawStudioChange): void {
    const previous = this.state;
    this.state = structuredClone(next);
    if (
      change.path === "*"
      || change.path.startsWith("geometry")
      || change.path === "material.mode"
      || previous.geometry.bevelEnabled !== next.geometry.bevelEnabled
    ) {
      this.rebuildAxis();
    }
    this.materials.update(next);
    if (this.axisMesh.material !== this.materials.active) this.axisMesh.material = this.materials.active;
    this.lighting.update(next.lighting, next.material.mode === "prism");
    this.environment.update(this.scene, next.lighting);
    this.materials.setEnvironment(this.environment.texture, next.lighting.environmentIntensity);
    this.background.update(next);
    this.lines.update(next);
    this.particles.update(next, this.quality);
    this.post.update(next, this.quality);
    this.cameraSystem.apply(next.camera);
  }

  updateQuality(quality: EngineQualityProfile, adaptiveParticleScale = 1): void {
    this.quality = quality;
    this.particles.update(this.state, quality, adaptiveParticleScale);
    this.post.update(this.state, quality);
  }

  step(deltaSeconds: number): void {
    this.materials.updateAnimation(deltaSeconds, this.state);
    this.particles.step(deltaSeconds);
    this.lines.step(deltaSeconds);
    this.background.step(deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.cameraSystem.resize(width, height);
  }

  render(): void {
    this.post.render();
  }

  fitCamera(): RawStudioState["camera"] {
    return this.cameraSystem.fit();
  }

  resetCamera(): RawStudioState["camera"] {
    return this.cameraSystem.reset();
  }

  recompile(): void {
    this.materials.matte.needsUpdate = true;
    this.materials.prism.needsUpdate = true;
    this.materials.prismFacet.needsUpdate = true;
    if (Array.isArray(this.axisMesh.material)) this.axisMesh.material.forEach((material) => { material.needsUpdate = true; });
    else this.axisMesh.material.needsUpdate = true;
  }

  dispose(): void {
    this.cameraSystem.dispose();
    this.environment.dispose(this.scene);
    this.particles.dispose();
    this.lines.dispose();
    this.background.dispose();
    this.lighting.dispose();
    this.materials.dispose();
    this.post.dispose();
    this.axisMesh.geometry.dispose();
    this.scene.clear();
  }

  private rebuildAxis(): void {
    const nextGeometry = createAxisGeometry(this.state).geometry;
    this.axisMesh.geometry.dispose();
    this.axisMesh.geometry = nextGeometry;
  }
}
