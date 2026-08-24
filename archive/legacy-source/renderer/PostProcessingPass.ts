import * as THREE from "three";
import vertexShader from "../shaders/newAxis.vert.glsl?raw";
import fragmentShader from "./post3D.frag.glsl?raw";
import type { PostSettings } from "../state/threeDStudioState";

export class PostProcessingPass {
  private readonly scene = new THREE.Scene(); private readonly camera = new THREE.Camera(); private readonly material: THREE.ShaderMaterial; private readonly quad: THREE.Mesh;
  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false, transparent: true, uniforms: {
      uInput: { value: null }, uDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uBloom: { value: false }, uBloomStrength: { value: .25 }, uBloomThreshold: { value: .72 }, uVignette: { value: false }, uVignetteAmount: { value: .25 },
      uFilmGrain: { value: false }, uGrainAmount: { value: .04 }, uDither: { value: false }, uDitherAmount: { value: .08 },
      uChromatic: { value: false }, uChromaticAmount: { value: .0015 }, uContrast: { value: 1 }, uExposure: { value: 0 },
      uDof: { value: false }, uFocus: { value: .975 }, uAperture: { value: .015 }, uMaxBlur: { value: .008 },
    }}); this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.scene.add(this.quad);
  }
  enabled(settings: PostSettings): boolean { return settings.bloom || settings.vignette || settings.filmGrain || settings.dither || settings.chromaticAberration || settings.depthOfField || settings.contrast !== 1 || settings.exposure !== 0; }
  apply(input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget, settings: PostSettings, time: number): THREE.Texture {
    const u = this.material.uniforms; u.uInput.value = input.texture; u.uDepth.value = input.depthTexture; u.uResolution.value.set(input.width, input.height); u.uTime.value = time;
    u.uBloom.value = settings.bloom; u.uBloomStrength.value = settings.bloomStrength; u.uBloomThreshold.value = settings.bloomThreshold; u.uVignette.value = settings.vignette; u.uVignetteAmount.value = settings.vignetteAmount;
    u.uFilmGrain.value = settings.filmGrain; u.uGrainAmount.value = settings.grainAmount; u.uDither.value = settings.dither; u.uDitherAmount.value = settings.ditherAmount; u.uChromatic.value = settings.chromaticAberration; u.uChromaticAmount.value = settings.chromaticAmount;
    u.uContrast.value = settings.contrast; u.uExposure.value = settings.exposure; u.uDof.value = settings.depthOfField; u.uFocus.value = settings.focus; u.uAperture.value = settings.aperture; u.uMaxBlur.value = settings.maxBlur;
    this.renderer.setRenderTarget(output); this.renderer.render(this.scene, this.camera); return output.texture;
  }
  dispose(): void { this.quad.geometry.dispose(); this.material.dispose(); }
}
