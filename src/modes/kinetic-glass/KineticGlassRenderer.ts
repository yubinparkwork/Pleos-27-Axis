import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import type { KineticGlassState } from "./KineticGlassState";

interface DynamicCube { body: RAPIER.RigidBody; group: THREE.Group; target: THREE.Vector3 }

export class KineticGlassRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly assembly = new THREE.Group();
  private readonly material: THREE.MeshPhysicalMaterial & { dispersion: number };
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly environment: THREE.Texture;
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointerWorld = new THREE.Vector3(100, 100, 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly cubes: DynamicCube[] = [];
  private world: RAPIER.World | null = null;
  private pointerBody: RAPIER.RigidBody | null = null;
  private state: KineticGlassState;
  private raf = 0;
  private lastTime = performance.now();
  private ready = false;
  private disposed = false;
  private pointerActive = false;
  private geometryKey = "";

  constructor(state: KineticGlassState, private readonly onReady: () => void, private readonly onError: (message: string) => void) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = "light-field-canvas kinetic-glass-canvas";
    this.canvas.setAttribute("aria-label", "PLEOS Kinetic Glass 물리 렌더링");
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.assembly);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const opticalStudio = new RoomEnvironment();
    this.environment = this.pmrem.fromScene(opticalStudio, .018).texture;
    opticalStudio.dispose();
    this.scene.environment = this.environment;

    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xf8f9ff, metalness: 0, roughness: .055,
      transparent: true, opacity: .92, transmission: 1, thickness: 1.85, ior: 1.48,
      attenuationColor: new THREE.Color(0xf8fbff), attenuationDistance: 18,
      clearcoat: 1, clearcoatRoughness: .018, iridescence: .055,
      iridescenceIOR: 1.3, iridescenceThicknessRange: [90, 240], envMapIntensity: 1.7,
      specularIntensity: 1, specularColor: new THREE.Color(0xffffff), side: THREE.FrontSide,
    }) as THREE.MeshPhysicalMaterial & { dispersion: number };
    RectAreaLightUniformsLib.init();
    this.scene.add(new THREE.HemisphereLight(0xc8d2e6, 0x000000, .22));
    const key = new THREE.RectAreaLight(0xffffff, 15.5, 1.7, 5.4); key.position.set(-3.2, 3.8, 4.6); key.lookAt(0, 0, 0); this.scene.add(key);
    const strip = new THREE.RectAreaLight(0xdde7ff, 10.5, .28, 5.2); strip.position.set(3.6, .4, 3.8); strip.lookAt(0, 0, 0); this.scene.add(strip);
    const floor = new THREE.RectAreaLight(0xffffff, 6.5, 4.5, .2); floor.position.set(-.8, -3.3, 2.2); floor.lookAt(0, 0, 0); this.scene.add(floor);
    const blue = new THREE.PointLight(0x4664ff, 2.4, 9); blue.position.set(3.2, -1.8, 2.4); this.scene.add(blue);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), state.lighting.bloom, .5, .74);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bindPointer();
    this.applyState(true);
    void this.initializePhysics();
    this.raf = requestAnimationFrame(this.render);
  }

  setState(state: KineticGlassState): void { this.state = state; this.applyState(false); }
  isReady(): boolean { return this.ready; }
  resetPhysics(): void { if (this.ready) this.buildPhysics(); }
  resize(width: number, height: number): void {
    const ratio = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.setSize(Math.max(1, width), Math.max(1, height));
  }
  renderPreview(): void { this.renderFrame(); }
  async exportPng(width: number, height: number): Promise<string> {
    const maximum = this.renderer.capabilities.maxTextureSize;
    if (width > maximum || height > maximum) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${maximum}px를 초과합니다.`);
    const oldWidth = this.canvas.width / this.renderer.getPixelRatio(), oldHeight = this.canvas.height / this.renderer.getPixelRatio(), oldRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1); this.setSize(width, height);
    if (this.state.artboard.transparent) this.renderer.render(this.scene, this.camera); else this.renderFrame();
    const data = this.canvas.toDataURL("image/png");
    this.renderer.setPixelRatio(oldRatio); this.setSize(oldWidth, oldHeight); this.renderFrame(); return data;
  }
  inspect(): object {
    return { ready: this.ready, renderer: "Three.js MeshPhysicalMaterial + Rapier 3D + HDR PMREM + UnrealBloom", physics: this.world ? "Rapier rigid bodies, zero gravity, spring attraction" : "initializing", solids: this.cubes.length, sharedOrigin: true, pointerInteraction: true, canvasCount: 1 };
  }
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.raf); this.canvas.removeEventListener("pointermove", this.onPointerMove); this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.world?.free(); this.world = null; this.assembly.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.material.dispose(); this.composer.dispose(); this.environment.dispose(); this.pmrem.dispose(); this.renderer.dispose(); this.canvas.remove();
  }

  private async initializePhysics(): Promise<void> {
    try { await RAPIER.init(); if (this.disposed) return; this.ready = true; this.buildPhysics(); this.onReady(); }
    catch (error) { this.onError(error instanceof Error ? error.message : String(error)); }
  }
  private buildPhysics(): void {
    this.world?.free(); this.world = new RAPIER.World({ x: 0, y: 0, z: 0 }); this.cubes.splice(0);
    while (this.assembly.children.length) { const child = this.assembly.children.pop(); if (child) { child.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); } }
    const scale = this.state.geometry.scale, half = .5 * scale, physicsHalf = .39 * scale, radius = Math.min(this.state.geometry.bevel * scale, half * .42), targets = this.layoutTargets();
    const geometry = radius > .001 ? new RoundedBoxGeometry(scale, scale, scale, 8, radius) : new THREE.BoxGeometry(scale, scale, scale);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.61548, -.785398, 0, "XYZ"));
    targets.forEach((target, index) => {
      const group = new THREE.Group(); const outer = new THREE.Mesh(geometry.clone(), this.material); group.add(outer); this.assembly.add(group);
      const body = this.world!.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(target.x, target.y, target.z).setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }).setLinearDamping(this.state.physics.damping).setAngularDamping(4).lockRotations());
      const colliderRadius = Math.min(radius, physicsHalf * .35); const collider = RAPIER.ColliderDesc.roundCuboid(Math.max(.01, physicsHalf - colliderRadius), Math.max(.01, physicsHalf - colliderRadius), Math.max(.01, physicsHalf - colliderRadius), Math.max(.001, colliderRadius)).setRestitution(this.state.physics.restitution).setFriction(.65).setDensity(1);
      this.world!.createCollider(collider, body); this.cubes.push({ body, group, target: target.clone() }); this.syncCube(this.cubes[index]);
    });
    this.pointerBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(100, 100, 0));
    this.world.createCollider(RAPIER.ColliderDesc.ball(this.state.physics.interactionRadius).setSensor(true), this.pointerBody);
    geometry.dispose();
    this.geometryKey = this.currentGeometryKey();
  }
  private applyState(forceRebuild: boolean): void {
    const s = this.state;
    this.material.roughness = s.material.roughness; this.material.transmission = s.material.transmission; this.material.thickness = s.material.thickness; this.material.ior = s.material.ior; this.material.dispersion = s.material.dispersion; this.material.opacity = s.material.opacity; this.material.envMapIntensity = s.material.environment; this.material.needsUpdate = true;
    this.renderer.toneMappingExposure = s.lighting.exposure; this.bloom.strength = s.lighting.bloom;
    this.scene.background = s.artboard.transparent ? null : new THREE.Color(s.artboard.background);
    if (this.ready && (forceRebuild || this.geometryKey !== this.currentGeometryKey())) this.buildPhysics();
    else if (this.ready) { const targets = this.layoutTargets(); this.cubes.forEach((cube, index) => { cube.target.copy(targets[index]); cube.body.setLinearDamping(s.physics.damping); }); }
  }
  private layoutTargets(): THREE.Vector3[] {
    const radius = this.state.geometry.scale * .82 + this.state.geometry.gap;
    return [90, 210, 330].map((degrees) => { const radians = THREE.MathUtils.degToRad(degrees); return new THREE.Vector3(Math.cos(radians) * radius, Math.sin(radians) * radius, 0); });
  }
  private currentGeometryKey(): string { return [this.state.geometry.scale, this.state.geometry.bevel, this.state.physics.interactionRadius, this.state.physics.restitution].join(":"); }
  private stepPhysics(delta: number): void {
    if (!this.world || !this.state.motion.enabled) return;
    const s = this.state.physics, interactionRange = s.interactionRadius + this.state.geometry.scale * .72;
    this.cubes.forEach((cube) => {
      const p = cube.body.translation(), v = cube.body.linvel();
      cube.body.addForce({ x: (cube.target.x - p.x) * s.attraction - v.x * s.damping, y: (cube.target.y - p.y) * s.attraction - v.y * s.damping, z: (cube.target.z - p.z) * s.attraction - v.z * s.damping }, true);
      if (this.pointerActive) { const dx = p.x - this.pointerWorld.x, dy = p.y - this.pointerWorld.y, dz = p.z - this.pointerWorld.z, distance = Math.hypot(dx, dy, dz); if (distance < interactionRange && distance > .001) { const gain = (1 - distance / interactionRange) * s.interactionStrength * 4.5; cube.body.addForce({ x: dx / distance * gain, y: dy / distance * gain, z: dz / distance * gain }, true); } }
      const speed = Math.hypot(v.x, v.y, v.z), maximumSpeed = 2.5;
      if (speed > maximumSpeed) cube.body.setLinvel({ x: v.x / speed * maximumSpeed, y: v.y / speed * maximumSpeed, z: v.z / speed * maximumSpeed }, true);
    });
    if (this.pointerBody) this.pointerBody.setTranslation(this.pointerActive ? { x: this.pointerWorld.x, y: this.pointerWorld.y, z: this.pointerWorld.z } : { x: 100, y: 100, z: 0 }, false);
    this.world.timestep = Math.min(1 / 30, Math.max(1 / 120, delta)); this.world.step(); this.cubes.forEach((cube) => this.syncCube(cube));
  }
  private syncCube(cube: DynamicCube): void { const p = cube.body.translation(), q = cube.body.rotation(); cube.group.position.set(p.x, p.y, p.z); cube.group.quaternion.set(q.x, q.y, q.z, q.w); }
  private setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height); const halfHeight = 1.9 / Math.max(.25, this.state.artboard.scale), halfWidth = halfHeight * width / Math.max(1, height); this.camera.left = -halfWidth; this.camera.right = halfWidth; this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
  }
  private renderFrame(): void { this.composer.render(); }
  private render = (now: number): void => {
    if (this.disposed) return; const delta = Math.min(.05, Math.max(0, (now - this.lastTime) / 1000)); this.lastTime = now;
    if (this.state.motion.enabled) this.state.motion.time = (this.state.motion.time + delta) % this.state.motion.duration;
    this.stepPhysics(delta); this.camera.position.x += ((this.pointerActive ? this.pointerNdc.x * .18 : 0) - this.camera.position.x) * .035; this.camera.position.y += ((this.pointerActive ? this.pointerNdc.y * .12 : 0) - this.camera.position.y) * .035; this.camera.lookAt(0, 0, 0); this.renderFrame(); this.raf = requestAnimationFrame(this.render);
  };
  private bindPointer(): void { this.canvas.addEventListener("pointermove", this.onPointerMove); this.canvas.addEventListener("pointerleave", this.onPointerLeave); }
  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect(); this.pointerNdc.set((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1)); this.raycaster.setFromCamera(this.pointerNdc, this.camera); this.pointerActive = Boolean(this.raycaster.ray.intersectPlane(this.interactionPlane, this.pointerWorld));
  };
  private onPointerLeave = (): void => { this.pointerActive = false; };
}
