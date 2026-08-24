import * as THREE from "three";
import fragmentShader from "../shaders/newAxis.frag.glsl?raw";
import vertexShader from "../shaders/newAxis.vert.glsl?raw";
import type { NewAxisPreset, Point } from "../presets/types";

export class BaseRenderPass {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  constructor(readonly preset: NewAxisPreset) {
    const v = (point: Point) => new THREE.Vector2(point[0], point[1]);
    const p = preset;
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false, uniforms: {
      uResolution: { value: v(p.referenceSize) }, uDesignSize: { value: v(p.referenceSize) }, uOrigin: { value: v(p.origin) },
      uTop: { value: v(p.rays.top) }, uMainLeft: { value: v(p.rays.mainLeft) }, uMainRight: { value: v(p.rays.mainRight) },
      uRightDown: { value: v(p.rays.rightDown) }, uSoftDown: { value: v(p.rays.softDown) }, uLeftBoundary: { value: v(p.lighting.leftBoundary) },
      uLeftShadowWidth: { value: p.lighting.leftShadowWidth }, uSoftDownWidthStart: { value: p.lighting.softDownWidthStart }, uSoftDownWidthEnd: { value: p.lighting.softDownWidthEnd },
      uLumTopRight: { value: p.luminance.topRight }, uLumRightMiddle: { value: p.luminance.rightMiddle }, uLumBottomLeft: { value: p.luminance.bottomLeft },
      uLumLeftMiddle: { value: p.luminance.leftMiddle }, uLumBlack: { value: p.luminance.black }, uTextureEnabled: { value: p.texture.enabled },
      uTextureAmount: { value: p.texture.amount }, uTextureScale: { value: p.texture.scale }, uTextureSeamIntensity: { value: p.texture.seamIntensity },
      uTime: { value: 0 }, uFitMode: { value: 0 }, uDebugMode: { value: 0 }, uShowGuides: { value: false },
    }});
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.scene.add(this.quad);
  }

  setResolution(width: number, height: number): void { this.material.uniforms.uResolution.value.set(width, height); }
  setTime(time: number): void { this.material.uniforms.uTime.value = time; }
  dispose(): void { this.quad.geometry.dispose(); this.material.dispose(); }
}
