import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  atan,
  deltaTime,
  float,
  hash,
  instanceIndex,
  mix,
  mx_fractal_noise_vec3,
  smoothstep,
  storage,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import type { RawStudioState } from "../../studio/state/RawStudioState";
import type { EngineQualityProfile } from "../config/EngineTypes";

interface FallbackParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  seed: number;
}

function isWebGPUBackend(renderer: THREE.WebGPURenderer): boolean {
  return Boolean((renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend);
}

export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly gpuCompute: boolean;
  private readonly material = new THREE.SpriteNodeMaterial();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly maxCount: number;
  private readonly sizeUniform = uniform(0.005);
  private readonly opacityUniform = uniform(0.14);
  private readonly speedUniform = uniform(0.2);
  private readonly turbulenceUniform = uniform(0.4);
  private readonly noiseScaleUniform = uniform(0.7);
  private readonly lifespanUniform = uniform(8);
  private readonly radiusUniform = uniform(2.4);
  private readonly flowUniform = uniform(new THREE.Vector3(0.34, 0.82, -0.16));
  private readonly attractionUniform = uniform(0.08);
  private readonly repulsionUniform = uniform(0.02);
  private readonly depthResponseUniform = uniform(0.72);
  private readonly cameraInteractionUniform = uniform(0);
  private readonly colorA = uniform(new THREE.Color(0.24, 0.5, 1));
  private readonly colorB = uniform(new THREE.Color(1, 0.24, 0.62));
  private readonly fallbackParticles: FallbackParticle[] = [];
  private readonly dummy = new THREE.Object3D();
  private updateCompute: THREE.ComputeNode | null = null;
  private initializeCompute: THREE.ComputeNode | null = null;
  private effectiveCount = 0;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    initialState: Readonly<RawStudioState>,
    quality: EngineQualityProfile,
  ) {
    this.gpuCompute = isWebGPUBackend(renderer);
    this.maxCount = 16384;
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.depthTest = true;
    this.material.blending = THREE.AdditiveBlending;
    this.material.toneMapped = true;
    const streakUv = uv().sub(0.5);
    const horizontalSoftness = float(1).sub(smoothstep(0.04, 0.5, streakUv.x.abs()));
    const verticalSoftness = float(1).sub(smoothstep(0.24, 0.5, streakUv.y.abs()));
    this.material.opacityNode = horizontalSoftness.mul(verticalSoftness).mul(this.opacityUniform);
    this.material.colorNode = mix(this.colorA, this.colorB, hash(instanceIndex).mul(0.72));
    this.material.scaleNode = vec2(this.sizeUniform, this.sizeUniform.mul(3.6));

    if (this.gpuCompute) this.configureGpuParticles();
    else this.configureFallbackParticles();

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxCount);
    this.mesh.name = this.gpuCompute ? "WebGPU Flow Particles" : "WebGL2 Instanced Flow Particles";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.update(initialState, quality);
  }

  async initialize(): Promise<void> {
    if (this.initializeCompute) await this.renderer.computeAsync(this.initializeCompute);
  }

  update(state: Readonly<RawStudioState>, quality: EngineQualityProfile, adaptiveScale = 1): void {
    const particles = state.engine.particles;
    const requested = Math.round(particles.count * quality.particleScale * adaptiveScale);
    this.effectiveCount = Math.max(0, Math.min(this.maxCount, requested));
    this.mesh.count = particles.enabled ? this.effectiveCount : 0;
    this.mesh.visible = particles.enabled;
    this.sizeUniform.value = particles.size;
    this.opacityUniform.value = particles.opacity;
    this.speedUniform.value = particles.speed;
    this.turbulenceUniform.value = particles.turbulence;
    this.noiseScaleUniform.value = particles.noiseScale;
    this.lifespanUniform.value = Math.max(0.2, particles.lifespan);
    this.radiusUniform.value = Math.max(0.2, particles.spawnRadius);
    this.flowUniform.value.set(...particles.flowDirection);
    this.attractionUniform.value = particles.attraction;
    this.repulsionUniform.value = particles.repulsion;
    this.depthResponseUniform.value = particles.depthResponse;
    this.cameraInteractionUniform.value = particles.cameraInteraction;

    const primary = state.material.mode === "prism" ? [0.16, 0.5, 1] : state.material.matte.texture.hotColor;
    const secondary = state.material.mode === "prism" ? [0.86, 0.2, 1] : state.material.matte.texture.softColor;
    this.colorA.value.setRGB(primary[0], primary[1], primary[2]);
    this.colorB.value.setRGB(secondary[0], secondary[1], secondary[2]);
  }

  step(deltaSeconds: number): void {
    if (!this.mesh.visible) return;
    if (this.gpuCompute && this.updateCompute) {
      this.renderer.compute(this.updateCompute);
      return;
    }
    const radius = this.radiusUniform.value;
    const speed = this.speedUniform.value;
    const turbulence = this.turbulenceUniform.value;
    for (let index = 0; index < this.effectiveCount; index += 1) {
      const particle = this.fallbackParticles[index];
      const phase = particle.seed * 12.9898 + performance.now() * 0.00008;
      particle.velocity.x += Math.sin(phase + particle.position.y * 1.7) * turbulence * deltaSeconds * 0.08;
      particle.velocity.y += Math.cos(phase * 0.71 + particle.position.z) * turbulence * deltaSeconds * 0.08;
      particle.velocity.z += Math.sin(phase * 0.47 + particle.position.x) * turbulence * deltaSeconds * 0.05;
      const distance = Math.max(0.08, particle.position.length());
      const radialForce = this.repulsionUniform.value / (distance * distance + 0.16)
        - this.attractionUniform.value * distance;
      particle.velocity.addScaledVector(particle.position, radialForce / distance * deltaSeconds * 0.12);
      particle.velocity.z += this.cameraInteractionUniform.value * deltaSeconds * 0.015;
      particle.position.addScaledVector(particle.velocity, deltaSeconds * speed);
      if (particle.position.length() > radius * 1.35) particle.position.multiplyScalar(-0.72);
      this.dummy.position.copy(particle.position);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private configureGpuParticles(): void {
    const positions = storage(new THREE.StorageInstancedBufferAttribute(this.maxCount, 4), "vec4", this.maxCount);
    const velocities = storage(new THREE.StorageInstancedBufferAttribute(this.maxCount, 4), "vec4", this.maxCount);
    this.material.positionNode = positions.toAttribute();
    this.material.rotationNode = atan(velocities.toAttribute().y, velocities.toAttribute().x);
    const depth = smoothstep(
      this.radiusUniform.negate(),
      this.radiusUniform,
      positions.toAttribute().z,
    ).mul(0.72).add(0.48);
    const depthScale = mix(float(1), depth, this.depthResponseUniform);
    this.material.scaleNode = vec2(
      this.sizeUniform.mul(depthScale),
      this.sizeUniform.mul(3.6).mul(depthScale),
    );
    const life = positions.toAttribute().w;
    const particleUv = uv().sub(0.5);
    const particleHorizontalSoftness = float(1).sub(smoothstep(0.04, 0.5, particleUv.x.abs()));
    const particleVerticalSoftness = float(1).sub(smoothstep(0.24, 0.5, particleUv.y.abs()));
    this.material.opacityNode = particleHorizontalSoftness.mul(particleVerticalSoftness)
      .mul(smoothstep(0, 0.18, life).mul(smoothstep(1, 0.72, life)))
      .mul(this.opacityUniform);

    this.initializeCompute = Fn(() => {
      const index = instanceIndex.toFloat();
      const direction = vec3(
        hash(index.add(1.17)).sub(0.5),
        hash(index.add(4.91)).sub(0.5),
        hash(index.add(8.73)).sub(0.5),
      ).normalize();
      const radius = hash(index.add(12.1)).pow(0.6).mul(this.radiusUniform);
      positions.element(instanceIndex).xyz.assign(direction.mul(radius));
      positions.element(instanceIndex).w.assign(hash(index.add(16.7)));
      velocities.element(instanceIndex).xyz.assign(this.flowUniform.mul(0.24).add(direction.mul(0.04)));
      velocities.element(instanceIndex).w.assign(0);
    })().compute(this.maxCount);

    this.updateCompute = Fn(() => {
      const particle = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex).xyz;
      const dt = deltaTime.min(0.033).mul(this.speedUniform);
      const flowNoise = mx_fractal_noise_vec3(
        particle.xyz.mul(this.noiseScaleUniform).add(vec3(time.mul(0.035))),
        3,
        2,
        0.52,
        this.turbulenceUniform,
      ).sub(0.5);
      velocity.addAssign(flowNoise.mul(dt.mul(0.42)));
      const distance = particle.xyz.length().max(0.08);
      const radial = particle.xyz.div(distance);
      const centerForce = this.repulsionUniform.div(distance.mul(distance).add(0.16))
        .sub(this.attractionUniform.mul(distance));
      velocity.addAssign(radial.mul(centerForce).mul(dt.mul(0.12)));
      // Compute passes do not own a render camera. Treat camera interaction as
      // a controlled drift toward the fixed front-view plane instead.
      const cameraPull = vec3(0, 0, 1)
        .mul(this.cameraInteractionUniform)
        .mul(dt.mul(0.006));
      velocity.addAssign(cameraPull);
      velocity.assign(mix(velocity, this.flowUniform.mul(0.16), dt.mul(0.08)));
      velocity.mulAssign(float(1).sub(dt.mul(0.025)));
      particle.xyz.addAssign(velocity.mul(dt));
      particle.w.subAssign(dt.div(this.lifespanUniform));
      If(particle.w.lessThanEqual(0).or(particle.xyz.length().greaterThan(this.radiusUniform.mul(1.45))), () => {
        const index = instanceIndex.toFloat().add(time.mul(17.3));
        const direction = vec3(
          hash(index.add(2.3)).sub(0.5),
          hash(index.add(5.7)).sub(0.5),
          hash(index.add(9.1)).sub(0.5),
        ).normalize();
        particle.xyz.assign(direction.mul(this.radiusUniform.mul(hash(index.add(13.4)).pow(0.7))));
        particle.w.assign(1);
        velocity.assign(this.flowUniform.mul(0.18).add(direction.mul(0.035)));
      });
    })().compute(this.maxCount);
  }

  private configureFallbackParticles(): void {
    for (let index = 0; index < this.maxCount; index += 1) {
      const position = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize().multiplyScalar(Math.pow(Math.random(), 0.6) * this.radiusUniform.value);
      const velocity = new THREE.Vector3(0.34, 0.82, -0.16).normalize()
        .multiplyScalar(0.12 + Math.random() * 0.08);
      this.fallbackParticles.push({ position, velocity, seed: Math.random() });
    }
  }
}
