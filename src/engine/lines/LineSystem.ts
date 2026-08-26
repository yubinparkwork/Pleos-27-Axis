import * as THREE from "three/webgpu";
import { color, positionWorld, sin, smoothstep, uniform } from "three/tsl";
import type { RawStudioState } from "../../studio/state/RawStudioState";

export class LineSystem {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshBasicNodeMaterial();
  private readonly opacityUniform = uniform(0.2);
  private readonly flowSpeed = uniform(0.1);
  private readonly glowStrength = uniform(0.3);
  private readonly flowTime = uniform(0);
  private width = -1;

  constructor(initialState: Readonly<RawStudioState>) {
    this.group.name = "Spatial Data Lines";
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.depthTest = true;
    this.material.blending = THREE.AdditiveBlending;
    this.material.side = THREE.DoubleSide;
    const pulse = sin(positionWorld.length().mul(8).sub(this.flowTime.mul(this.flowSpeed).mul(6.28318)))
      .mul(0.5)
      .add(0.5);
    const energy = smoothstep(0.58, 1, pulse).mul(this.glowStrength).add(0.28);
    this.material.colorNode = color(0x6e9fff).mul(energy);
    this.material.opacityNode = this.opacityUniform.mul(energy);
    this.update(initialState);
  }

  update(state: Readonly<RawStudioState>): void {
    const lines = state.engine.lines;
    this.group.visible = lines.enabled;
    this.opacityUniform.value = lines.opacity;
    this.flowSpeed.value = lines.flowSpeed;
    this.glowStrength.value = lines.glowStrength;
    if (Math.abs(this.width - lines.width) > 1e-6) {
      this.width = lines.width;
      this.rebuild(lines.width);
    }
  }

  step(deltaSeconds: number): void {
    this.flowTime.value += deltaSeconds;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.material.dispose();
    this.group.clear();
  }

  private rebuild(width: number): void {
    this.group.children.forEach((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.group.clear();
    const rays = [-90, -30, 30, 90, 150, 210];
    rays.forEach((angle, index) => {
      const radian = THREE.MathUtils.degToRad(angle);
      const direction = new THREE.Vector3(Math.cos(radian), Math.sin(radian), index % 2 === 0 ? -0.22 : 0.16);
      const start = direction.clone().multiplyScalar(1.42);
      const end = direction.clone().multiplyScalar(2.65);
      const normal = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
      const middle = start.clone().lerp(end, 0.5).addScaledVector(normal, (index % 2 === 0 ? 1 : -1) * 0.08);
      const curve = new THREE.CatmullRomCurve3([start, middle, end]);
      const geometry = new THREE.TubeGeometry(curve, 36, Math.max(0.0006, width), 5, false);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.renderOrder = 6;
      this.group.add(mesh);
    });
  }
}
