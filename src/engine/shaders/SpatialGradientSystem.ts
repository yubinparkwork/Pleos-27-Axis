import * as THREE from "three/webgpu";
import {
  mix,
  mx_fractal_noise_float,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
} from "three/tsl";
import type { RawStudioState } from "../../studio/state/RawStudioState";

type ColorUniform = ReturnType<typeof uniform<"color", THREE.Color>>;

function assignColor(target: ColorUniform, source: readonly [number, number, number]): void {
  target.value.setRGB(source[0], source[1], source[2]);
}

export class SpatialGradientSystem {
  readonly mesh: THREE.Mesh;
  private readonly material = new THREE.MeshBasicNodeMaterial();
  private readonly lowColor = uniform(new THREE.Color());
  private readonly highColor = uniform(new THREE.Color());
  private readonly accentColor = uniform(new THREE.Color());
  private readonly noiseStrength = uniform(0.1);
  private readonly ditherStrength = uniform(0.01);
  private readonly temporalSpeed = uniform(0.08);
  private readonly flowTime = uniform(0);

  constructor(initialState: Readonly<RawStudioState>) {
    const geometry = new THREE.IcosahedronGeometry(24, 4);
    geometry.scale(-1, 1, 1);
    this.material.side = THREE.BackSide;
    this.material.depthWrite = false;
    this.material.depthTest = false;
    this.material.fog = false;
    const normalized = positionWorld.normalize();
    const vertical = smoothstep(-0.82, 0.92, normalized.y.add(normalized.x.mul(0.17)));
    const radial = smoothstep(0.12, 0.94, normalized.z.abs());
    const animatedPosition = positionWorld.mul(0.12).add(vec3(
      this.flowTime.mul(this.temporalSpeed).mul(0.31),
      this.flowTime.mul(this.temporalSpeed).mul(-0.17),
      this.flowTime.mul(this.temporalSpeed).mul(0.23),
    ));
    const broadNoise = mx_fractal_noise_float(animatedPosition, 4, 2, 0.52, 1);
    const dither = mx_fractal_noise_float(animatedPosition.mul(80.8).add(vec3(17.3, 3.1, 11.7)), 2, 2.2, 0.5, 1)
      .sub(0.5)
      .mul(this.ditherStrength);
    const base = mix(this.lowColor, this.highColor, vertical.add(broadNoise.sub(0.5).mul(this.noiseStrength)).clamp());
    this.material.colorNode = mix(base, this.accentColor, radial.mul(0.22)).add(dither).max(0);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "Spatial HDR Gradient";
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.update(initialState);
  }

  update(state: Readonly<RawStudioState>): void {
    const background = state.lighting.backgroundColor;
    assignColor(this.lowColor, [background[0] * 0.22, background[1] * 0.28, background[2] * 0.42]);
    assignColor(this.highColor, [
      Math.max(background[0] * 1.35, 0.002),
      Math.max(background[1] * 1.55, 0.003),
      Math.max(background[2] * 2.1, 0.008),
    ]);
    assignColor(this.accentColor, state.material.mode === "prism" ? [0.012, 0.03, 0.085] : state.material.matte.texture.accentColor);
    this.noiseStrength.value = state.engine.gradient.noiseStrength * 0.28;
    this.ditherStrength.value = state.engine.gradient.ditherStrength;
    this.temporalSpeed.value = state.engine.gradient.temporalSpeed;
  }

  step(deltaSeconds: number): void {
    this.flowTime.value += deltaSeconds;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
