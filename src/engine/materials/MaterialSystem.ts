import * as THREE from "three/webgpu";
import {
  cameraPosition,
  float,
  mix,
  mx_fractal_noise_float,
  normalWorld,
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

export class MaterialSystem {
  readonly matte = new THREE.MeshPhysicalNodeMaterial();
  readonly prism = new THREE.MeshPhysicalMaterial();
  readonly prismFacet = new THREE.MeshPhysicalMaterial();
  private elapsed = 0;

  private readonly baseColor = uniform(new THREE.Color());
  private readonly darkColor = uniform(new THREE.Color());
  private readonly hotColor = uniform(new THREE.Color());
  private readonly softColor = uniform(new THREE.Color());
  private readonly accentColor = uniform(new THREE.Color());
  private readonly gradientStrength = uniform(0.7);
  private readonly directionalStrength = uniform(0.7);
  private readonly noiseStrength = uniform(0.18);
  private readonly fresnelStrength = uniform(0.46);
  private readonly textureScale = uniform(1.7);
  private readonly flowTime = uniform(0);
  private readonly textureMix = uniform(0);
  private readonly emissiveStrength = uniform(0.1);
  private readonly matteRoughness = uniform(0.7);

  constructor(initialState: Readonly<RawStudioState>) {
    this.configureMatteNodes();
    this.update(initialState);
  }

  get active(): THREE.Material[] {
    return this.mode === "prism"
      ? [this.prism, this.prismFacet]
      : [this.matte, this.matte];
  }

  private mode: "matte" | "prism" = "matte";

  update(state: Readonly<RawStudioState>): void {
    this.mode = state.material.mode;
    const matte = state.material.matte;
    const texture = matte.texture;
    assignColor(this.baseColor, matte.baseColor);
    assignColor(this.darkColor, texture.darkColor);
    assignColor(this.hotColor, texture.hotColor);
    assignColor(this.softColor, texture.softColor);
    assignColor(this.accentColor, texture.accentColor);
    this.gradientStrength.value = state.engine.gradient.volumetricStrength;
    this.directionalStrength.value = state.engine.gradient.directionalStrength;
    this.noiseStrength.value = state.engine.gradient.noiseStrength * Math.max(0.2, texture.warpStrength);
    this.fresnelStrength.value = state.engine.gradient.fresnelStrength;
    this.textureScale.value = Math.max(0.05, texture.scale);
    this.textureMix.value = texture.enabled ? texture.strength : 0;
    this.emissiveStrength.value = texture.enabled ? texture.sheenStrength * 0.2 : 0;
    this.matteRoughness.value = matte.roughness;
    this.matte.metalness = 0;
    this.matte.clearcoat = 0.08;
    this.matte.clearcoatRoughness = Math.min(0.45, matte.roughness * 0.55);
    this.matte.side = THREE.FrontSide;

    this.configurePrismMaterials(state);
  }

  setEnvironment(texture: THREE.Texture | null, intensity = 1): void {
    [this.prism, this.prismFacet].forEach((material, index) => {
      const changed = material.envMap !== texture;
      material.envMap = texture;
      material.envMapIntensity = intensity * (index === 0 ? 0.48 : 1.35);
      if (changed) material.needsUpdate = true;
    });
  }

  updateAnimation(deltaSeconds: number, state: Readonly<RawStudioState>): void {
    const texture = state.material.matte.texture;
    if (texture.animationEnabled && !texture.animationPaused) {
      this.elapsed += deltaSeconds * texture.animationSpeed * Math.max(0.05, texture.animationTravel);
      this.flowTime.value = this.elapsed;
    }
  }

  dispose(): void {
    this.matte.dispose();
    this.prism.dispose();
    this.prismFacet.dispose();
  }

  private configurePrismMaterials(state: Readonly<RawStudioState>): void {
    const prism = state.material.prism;
    const body = this.prism;
    const facet = this.prismFacet;
    const ior = THREE.MathUtils.clamp(prism.baseIor, 1.01, 2.333);
    const bodyRoughness = THREE.MathUtils.clamp(prism.surfaceRoughness, 0.025, 0.18);
    const bodyThickness = THREE.MathUtils.clamp(
      state.geometry.solidThickness * prism.thicknessInfluence * 0.2,
      0.055,
      0.28,
    );
    const dispersion = THREE.MathUtils.clamp(
      prism.dispersion * (0.55 + prism.edgeSpectrumStrength) * prism.spectrumSaturation,
      0,
      0.22,
    );

    [body, facet].forEach((material) => {
      material.color.setRGB(1, 1, 1);
      material.transmission = THREE.MathUtils.clamp(prism.refractionStrength, 0, 1);
      material.ior = ior;
      material.attenuationDistance = Math.max(0.15, prism.absorptionDistance);
      material.attenuationColor.setRGB(...prism.absorptionColor);
      material.specularIntensity = 1;
      material.specularColor.setRGB(1, 1, 1);
      material.side = THREE.DoubleSide;
      material.opacity = 1;
      material.transparent = true;
      material.depthWrite = true;
      material.depthTest = true;
      material.iridescenceIOR = prism.filmIor;
      material.iridescenceThicknessRange = [
        Math.max(100, prism.filmThickness * (1 - prism.filmThicknessVariation)),
        Math.max(120, prism.filmThickness * (1 + prism.filmThicknessVariation)),
      ];
    });

    body.roughness = bodyRoughness;
    body.thickness = bodyThickness;
    body.clearcoat = 0.52;
    body.clearcoatRoughness = Math.max(0.018, bodyRoughness * 0.42);
    body.dispersion = THREE.MathUtils.clamp(dispersion * prism.internalSpectrumStrength * 1.8, 0, 0.035);
    body.iridescence = prism.iridescenceEnabled ? prism.iridescenceStrength * 0.28 : 0;

    facet.roughness = Math.max(0.018, bodyRoughness * 0.52);
    facet.thickness = Math.max(0.035, bodyThickness * 0.58);
    facet.clearcoat = 1;
    facet.clearcoatRoughness = Math.max(0.012, bodyRoughness * 0.24);
    facet.dispersion = dispersion;
    facet.iridescence = prism.iridescenceEnabled ? prism.iridescenceStrength : 0;

    body.needsUpdate = true;
    facet.needsUpdate = true;
  }

  private configureMatteNodes(): void {
    const scaledPosition = positionWorld.mul(this.textureScale);
    const animatedPosition = scaledPosition.add(vec3(
      this.flowTime.mul(0.37),
      this.flowTime.mul(-0.19),
      this.flowTime.mul(0.23),
    ));
    const broadNoise = mx_fractal_noise_float(animatedPosition, 4, 2.05, 0.5, 1);
    const fineNoise = mx_fractal_noise_float(animatedPosition.mul(3.7).add(11.3), 3, 2.1, 0.54, 1);
    const direction = positionWorld.x.mul(0.34)
      .add(positionWorld.y.mul(0.72))
      .add(positionWorld.z.mul(0.18))
      .mul(this.directionalStrength);
    const energy = smoothstep(
      -1.1,
      1.05,
      direction.add(broadNoise.sub(0.5).mul(this.noiseStrength.mul(2.4))),
    );
    const viewDirection = cameraPosition.sub(positionWorld).normalize();
    const fresnel = float(1).sub(normalWorld.dot(viewDirection).abs()).pow(3).mul(this.fresnelStrength);
    const hotBand = smoothstep(0.3, 0.72, energy.add(fresnel.mul(0.38)));
    const softBand = smoothstep(0.68, 0.98, energy.add(fineNoise.mul(0.12)));
    const accentBand = smoothstep(0.5, 0.86, broadNoise.add(fresnel.mul(0.2)));
    const textureColor = mix(
      mix(this.darkColor, this.hotColor, hotBand),
      mix(this.accentColor, this.softColor, softBand),
      accentBand.mul(0.48),
    );
    const spatialColor = mix(this.baseColor, textureColor, this.textureMix.mul(this.gradientStrength));
    this.matte.colorNode = spatialColor;
    this.matte.emissiveNode = textureColor.mul(
      this.emissiveStrength.mul(smoothstep(0.72, 1, energy.add(fresnel))),
    );
    this.matte.roughnessNode = this.matteRoughness.add(fineNoise.sub(0.5).mul(0.035)).clamp(0.04, 1);
  }

}
