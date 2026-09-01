import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { AXIS_DIRECTION_FAMILIES, quantizeAxisAngle } from "../../axis";
import { PLEOS_COLORS } from "../../brand/colors";
import type { AxisTrailsState } from "./AxisTrailsState";

interface Trail {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  points: THREE.Vector2[];
  velocity: THREE.Vector2[];
  phase: number;
}

const PALETTES: Record<AxisTrailsState["preset"], string[]> = {
  "pleos-blue": [PLEOS_COLORS.blue1, PLEOS_COLORS.blue2, PLEOS_COLORS.blue3, PLEOS_COLORS.white, PLEOS_COLORS.lightGray2],
  "spectral-signal": [PLEOS_COLORS.blue2, PLEOS_COLORS.green2, PLEOS_COLORS.red2, PLEOS_COLORS.blue1, PLEOS_COLORS.white],
  "white-axis": [PLEOS_COLORS.white, PLEOS_COLORS.lightGray1, PLEOS_COLORS.lightGray2, PLEOS_COLORS.darkGray3],
};

export class AxisTrailsRenderer {
  readonly canvas: HTMLCanvasElement;
  private state: AxisTrailsState;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, -10, 10);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly trailGroup = new THREE.Group();
  private readonly guideGroup = new THREE.Group();
  private readonly originMaterial = new THREE.MeshBasicMaterial({ color: PLEOS_COLORS.blue2, transparent: true });
  private readonly origin = new THREE.Mesh(new THREE.CircleGeometry(.025, 24), this.originMaterial);
  private readonly pointer = new THREE.Vector2();
  private readonly pointerTarget = new THREE.Vector2();
  private trails: Trail[] = [];
  private width = 1;
  private height = 1;
  private pointerActive = false;
  private buildKey = "";

  constructor(state: AxisTrailsState) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "axis-trails-canvas";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera.position.z = 2;
    this.scene.add(this.guideGroup, this.trailGroup, this.origin);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1, .55, .03);
    this.composer.addPass(this.bloom);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.rebuild();
    this.applyState();
  }

  setState(state: AxisTrailsState): void {
    this.state = state;
    const key = `${Math.round(state.trails.count)}:${Math.round(state.trails.points)}:${state.preset}`;
    if (key !== this.buildKey) this.rebuild();
    this.applyState();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    const ratio = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(this.width, this.height, false); this.composer.setSize(this.width, this.height);
    const halfHeight = 1.75 / Math.max(.25, this.state.artboard.scale); const halfWidth = halfHeight * this.width / this.height;
    this.camera.left = -halfWidth; this.camera.right = halfWidth; this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
    this.trails.forEach(({ material }) => material.resolution.set(this.canvas.width, this.canvas.height));
  }

  render(time: number, delta: number): void {
    const autonomous = this.autonomousTarget(time);
    const influence = this.pointerActive ? this.state.motion.cursorInfluence : 0;
    this.pointerTarget.copy(autonomous).lerp(this.pointer, Math.min(1, influence));
    this.origin.position.set(this.pointerTarget.x, this.pointerTarget.y, 0);
    this.guideGroup.position.copy(this.origin.position);
    if (this.state.motion.enabled) this.step(time, Math.min(.035, Math.max(1 / 240, delta)));
    this.composer.render();
  }

  async exportPng(width: number, height: number, time: number): Promise<string> {
    const max = this.renderer.capabilities.maxTextureSize;
    if (width > max || height > max) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${max}px를 초과합니다.`);
    const previous = [this.width, this.height] as const;
    this.resize(width, height); this.render(time, 1 / 60); const data = this.canvas.toDataURL("image/png"); this.resize(previous[0], previous[1]); return data;
  }

  inspect(): object {
    return { renderer: "Three.js Line2 + spring-chain dynamics + UnrealBloom", trails: this.trails.length, pointsPerTrail: this.state.trails.points, axisFamily: "30deg", approvedDirections: [...AXIS_DIRECTION_FAMILIES["30deg"]], sharedOrigin: true, cursorInteraction: true };
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove); this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.trails.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
    this.origin.geometry.dispose(); this.originMaterial.dispose(); this.guideGroup.traverse((object) => { if (object instanceof THREE.Line) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
    this.composer.dispose(); this.renderer.dispose(); this.canvas.remove();
  }

  private rebuild(): void {
    this.trails.forEach(({ line, geometry, material }) => { this.trailGroup.remove(line); geometry.dispose(); material.dispose(); });
    this.trails = [];
    const count = Math.max(3, Math.round(this.state.trails.count)); const length = Math.max(12, Math.round(this.state.trails.points)); const palette = PALETTES[this.state.preset];
    for (let index = 0; index < count; index += 1) {
      const phase = index / count * Math.PI * 2; const points: THREE.Vector2[] = []; const velocity: THREE.Vector2[] = [];
      const angle = THREE.MathUtils.degToRad(AXIS_DIRECTION_FAMILIES["30deg"][index % 6]);
      for (let point = 0; point < length; point += 1) { points.push(new THREE.Vector2(-Math.cos(angle) * point * this.state.trails.spacing, -Math.sin(angle) * point * this.state.trails.spacing)); velocity.push(new THREE.Vector2()); }
      const geometry = new LineGeometry(); geometry.setPositions(new Array(length * 3).fill(0));
      const color = new THREE.Color(palette[index % palette.length]); const material = new LineMaterial({ color, linewidth: this.state.trails.width, transparent: true, opacity: this.state.trails.opacity, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: true });
      material.resolution.set(this.canvas.width || 1, this.canvas.height || 1);
      const line = new Line2(geometry, material); line.frustumCulled = false; this.trailGroup.add(line); this.trails.push({ line, geometry, material, points, velocity, phase });
    }
    this.buildKey = `${count}:${length}:${this.state.preset}`;
    this.buildGuides();
  }

  private buildGuides(): void {
    this.guideGroup.clear();
    AXIS_DIRECTION_FAMILIES["30deg"].forEach((degrees) => {
      const radians = THREE.MathUtils.degToRad(degrees); const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -.1), new THREE.Vector3(Math.cos(radians) * 3.5, Math.sin(radians) * 3.5, -.1)]);
      const material = new THREE.LineBasicMaterial({ color: PLEOS_COLORS.blue2, transparent: true, opacity: this.state.look.guideOpacity, blending: THREE.AdditiveBlending, depthWrite: false });
      this.guideGroup.add(new THREE.Line(geometry, material));
    });
  }

  private applyState(): void {
    this.renderer.toneMappingExposure = this.state.look.exposure; this.bloom.strength = this.state.look.bloom;
    this.scene.background = this.state.artboard.transparent ? null : new THREE.Color(this.state.artboard.background);
    this.originMaterial.opacity = this.state.look.originGlow; this.origin.scale.setScalar(.65 + this.state.look.originGlow);
    this.trails.forEach(({ material }) => { material.linewidth = this.state.trails.width; material.opacity = this.state.trails.opacity; material.needsUpdate = true; });
    this.guideGroup.traverse((object) => { if (object instanceof THREE.Line) (object.material as THREE.LineBasicMaterial).opacity = this.state.look.guideOpacity; });
  }

  private autonomousTarget(time: number): THREE.Vector2 {
    const amount = this.state.motion.autonomous; const speed = this.state.motion.speed;
    return new THREE.Vector2(Math.sin(time * .71 * speed) * .78 + Math.sin(time * 1.47 * speed) * .18, Math.cos(time * .57 * speed) * .56 + Math.sin(time * 1.11 * speed) * .16).multiplyScalar(amount);
  }

  private step(time: number, delta: number): void {
    const stiffness = this.state.motion.stiffness; const damping = Math.pow(this.state.motion.damping, delta * 60); const lock = this.state.motion.axisLock; const spacing = this.state.trails.spacing;
    this.trails.forEach((trail, trailIndex) => {
      const offsetAngle = THREE.MathUtils.degToRad(AXIS_DIRECTION_FAMILIES["30deg"][trailIndex % 6]);
      const axis = new THREE.Vector2(Math.cos(offsetAngle), Math.sin(offsetAngle)); const normal = new THREE.Vector2(-axis.y, axis.x);
      const tier = Math.floor(trailIndex / 6); const offset = axis.clone().multiplyScalar(.055 + tier * .042).addScaledVector(normal, Math.sin(time * (.74 + tier * .07) + trail.phase) * (.04 + tier * .018));
      const headTarget = this.pointerTarget.clone().add(offset); const trailStiffness = stiffness * (.62 + (trailIndex % 7) * .075);
      trail.velocity[0].addScaledVector(headTarget.clone().sub(trail.points[0]), trailStiffness * delta).multiplyScalar(Math.pow(damping, .8 + (trailIndex % 5) * .08));
      trail.points[0].addScaledVector(trail.velocity[0], delta * 4.5);
      for (let index = 1; index < trail.points.length; index += 1) {
        const parent = trail.points[index - 1], current = trail.points[index];
        const raw = current.clone().sub(parent); const fallback = AXIS_DIRECTION_FAMILIES["30deg"][(trailIndex + index) % 6];
        const rawDegrees = raw.lengthSq() > 1e-6 ? THREE.MathUtils.radToDeg(Math.atan2(raw.y, raw.x)) : fallback;
        const snapped = THREE.MathUtils.degToRad(quantizeAxisAngle(rawDegrees, "30deg"));
        const axis = new THREE.Vector2(Math.cos(snapped), Math.sin(snapped));
        const free = raw.lengthSq() > 1e-6 ? raw.normalize() : axis.clone(); const direction = free.lerp(axis, lock).normalize();
        const desired = parent.clone().addScaledVector(direction, spacing); const localStiffness = stiffness * (1 - index / trail.points.length * .58);
        trail.velocity[index].addScaledVector(desired.sub(current), localStiffness * delta).multiplyScalar(damping);
        current.addScaledVector(trail.velocity[index], delta * 4.2);
      }
      const positions: number[] = []; trail.points.forEach((point, index) => positions.push(point.x, point.y, -.002 * index)); trail.geometry.setPositions(positions);
    });
  }

  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect(); const ndcX = (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1; const ndcY = -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1);
    this.pointer.set(THREE.MathUtils.lerp(this.camera.left, this.camera.right, (ndcX + 1) * .5), THREE.MathUtils.lerp(this.camera.bottom, this.camera.top, (ndcY + 1) * .5)); this.pointerActive = true;
  };
  private onPointerLeave = (): void => { this.pointerActive = false; };
}
