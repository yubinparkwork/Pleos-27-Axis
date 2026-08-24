import * as THREE from "three";
import effectFragmentShader from "./effectPass.frag.glsl?raw";
import vertexShader from "../shaders/newAxis.vert.glsl?raw";
import { EFFECT_REGISTRY } from "../effects/registry";
import type { EffectInstance, EffectMask, ParamValue } from "../effects/types";
import type { NewAxisPreset, Point } from "../presets/types";

const MASK_IDS: Record<EffectMask, number> = {
  global: 0, "top-left": 1, "top-right": 2, "right-middle": 3, "bottom-right": 4,
  "bottom-left": 5, "all-axes": 6, "main-axis": 7, "top-axis": 8,
  "right-down-axis": 9, "soft-fold": 10,
};

const number = (value: ParamValue | undefined, fallback = 0): number => typeof value === "number" ? value : fallback;
const bool = (value: ParamValue | undefined): number => value === true ? 1 : 0;
const choice = (value: ParamValue | undefined, values: string[]): number => Math.max(0, values.indexOf(String(value)));

function color(value: ParamValue | undefined, fallback: string): THREE.Color {
  try { return new THREE.Color(typeof value === "string" ? value : fallback); }
  catch { return new THREE.Color(fallback); }
}

export class EffectPipeline {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  private readonly fallbackTexture: THREE.DataTexture;
  private uploadedTexture: THREE.Texture;

  constructor(private readonly renderer: THREE.WebGLRenderer, preset: NewAxisPreset) {
    const v = (point: Point) => new THREE.Vector2(point[0], point[1]);
    this.fallbackTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.fallbackTexture.needsUpdate = true;
    this.uploadedTexture = this.fallbackTexture;
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader: effectFragmentShader, depthTest: false, depthWrite: false,
      uniforms: {
        uInput: { value: null }, uUploadedTexture: { value: this.uploadedTexture }, uHasUploadedTexture: { value: false },
        uDesignSize: { value: v(preset.referenceSize) }, uOrigin: { value: v(preset.origin) }, uTop: { value: v(preset.rays.top) },
        uMainLeft: { value: v(preset.rays.mainLeft) }, uMainRight: { value: v(preset.rays.mainRight) },
        uRightDown: { value: v(preset.rays.rightDown) }, uSoftDown: { value: v(preset.rays.softDown) },
        uEffectType: { value: 0 }, uMask: { value: 0 }, uOpacity: { value: 1 }, uGlobalIntensity: { value: 1 },
        uTime: { value: 0 }, uSeed: { value: 17 }, uP0: { value: new THREE.Vector4() }, uP1: { value: new THREE.Vector4() },
        uP2: { value: new THREE.Vector4() }, uColorA: { value: new THREE.Color("#000000") }, uColorB: { value: new THREE.Color("#ffffff") },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setUploadedTexture(texture: THREE.Texture | null): void {
    if (this.uploadedTexture !== this.fallbackTexture) this.uploadedTexture.dispose();
    this.uploadedTexture = texture ?? this.fallbackTexture;
    this.material.uniforms.uUploadedTexture.value = this.uploadedTexture;
    this.material.uniforms.uHasUploadedTexture.value = texture !== null;
  }

  apply(input: THREE.Texture, effects: EffectInstance[], ping: THREE.WebGLRenderTarget, pong: THREE.WebGLRenderTarget, time: number, intensity: number, seed: number): THREE.Texture {
    let current = input;
    let target = ping;
    let pass = 0;
    for (const effect of effects) {
      if (!effect.enabled || effect.opacity <= 0) continue;
      this.configure(effect, current, time, intensity, seed);
      target = pass % 2 === 0 ? ping : pong;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      current = target.texture;
      pass += 1;
    }
    return current;
  }

  private configure(effect: EffectInstance, input: THREE.Texture, time: number, intensity: number, seed: number): void {
    const definition = EFFECT_REGISTRY.get(effect.type);
    if (!definition) return;
    const p = effect.params;
    const p0 = this.material.uniforms.uP0.value as THREE.Vector4;
    const p1 = this.material.uniforms.uP1.value as THREE.Vector4;
    const p2 = this.material.uniforms.uP2.value as THREE.Vector4;
    p0.set(0, 0, 0, 0); p1.set(0, 0, 0, 0); p2.set(0, 0, 0, 0);
    this.material.uniforms.uInput.value = input;
    this.material.uniforms.uEffectType.value = definition.shaderId;
    this.material.uniforms.uMask.value = MASK_IDS[effect.mask];
    this.material.uniforms.uOpacity.value = effect.opacity;
    this.material.uniforms.uGlobalIntensity.value = intensity;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uSeed.value = seed + number(p.seed);

    if (effect.type === "surface-grain") {
      p0.set(number(p.scale, 3), number(p.intensity, .12), number(p.contrast, 1.4), 0);
      p1.set(bool(p.monochrome), choice(p.blendMode, ["overlay", "add", "multiply"]), bool(p.animated), 0);
    } else if (effect.type === "material-texture") {
      p0.set(number(p.scaleX, 1), number(p.scaleY, 7), number(p.rotation, -26), 0);
      p1.set(number(p.offsetX), number(p.offsetY), number(p.intensity, .22), number(p.contrast, 1.5));
      p2.set(choice(p.textureType, ["fine", "coarse", "brushed", "paper", "cellular", "scanline", "speckle", "directional"]), bool(p.useUpload), bool(p.inversion), choice(p.blendMode, ["overlay", "add", "multiply"]));
    } else if (effect.type === "axis-light-sweep") {
      p0.set(number(p.width, .12), number(p.softness, .55), number(p.intensity, .28), 0);
      p1.set(bool(p.animated) ? number(p.speed, .08) : 0, number(p.direction, 1), number(p.repeat, 1), number(p.falloff, .72));
      p2.x = choice(p.axis, ["main", "top", "rightDown", "soft", "all"]);
    } else if (effect.type === "plane-illumination") {
      p0.set(number(p.brightness, .08), number(p.contrast, 1.05), number(p.angle, -26), number(p.softness, .7));
      p1.x = number(p.originFalloff, .45);
    } else if (effect.type === "refraction") {
      p0.set(number(p.amount, .004), number(p.scale, 3), number(p.direction, 20), number(p.frequency, 2.5));
      p1.set(number(p.speed, .06), number(p.axisAttraction, .35), bool(p.animated), 0);
    } else if (effect.type === "topographic") {
      p0.set(number(p.spacing, 58), number(p.width, 1.2), number(p.softness, 1.6), 0);
      p1.set(number(p.intensity, .38), number(p.speed, .04), 0, 0);
      p2.set(choice(p.source, ["origin", "axes"]), bool(p.animated), 0, 0);
    } else if (effect.type === "dither") {
      p0.set(number(p.dotScale, 2), number(p.intensity, .42), number(p.threshold, .5), 0);
      p1.set(choice(p.method, ["bayer", "ordered", "noise"]), bool(p.preserveLuminance), 0, 0);
    } else if (effect.type === "chromatic-mapping") {
      p0.set(choice(p.mode, ["monochrome", "duotone", "gradient", "rgb"]), number(p.hue), number(p.saturation, 1), number(p.intensity));
      p1.x = number(p.separation, .0015);
      this.material.uniforms.uColorA.value.copy(color(p.colorA, "#080000"));
      this.material.uniforms.uColorB.value.copy(color(p.colorB, "#ff341f"));
    }
  }
}
