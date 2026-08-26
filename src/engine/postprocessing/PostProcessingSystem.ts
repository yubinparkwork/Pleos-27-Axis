import * as THREE from "three/webgpu";
import { float, pass, renderOutput, screenUV, smoothstep, uniform, vec3 } from "three/tsl";
import BloomNode, { bloom } from "three/addons/tsl/display/BloomNode.js";
import { film } from "three/addons/tsl/display/FilmNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import type { RawStudioState } from "../../studio/state/RawStudioState";
import type { EngineQualityProfile } from "../config/EngineTypes";

export class PostProcessingSystem {
  readonly pipeline: THREE.RenderPipeline;
  private readonly bloomNode: BloomNode;
  private readonly ditherIntensity = uniform(0.006);
  private readonly contrast = uniform(1);
  private readonly blackLift = uniform(0);
  private readonly whitePoint = uniform(1);

  constructor(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    state: Readonly<RawStudioState>,
    quality: EngineQualityProfile,
  ) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    const normalized = sceneColor.sub(vec3(this.blackLift)).div(
      this.whitePoint.sub(this.blackLift).max(0.01),
    ).max(0);
    const graded = normalized.sub(0.5).mul(this.contrast).add(0.5).max(0);
    this.bloomNode = bloom(graded, 0.25, 0.22, 0.92);
    this.bloomNode.setResolutionScale(quality.bloomScale);
    const bloomComposite = graded.add(this.bloomNode);
    const radial = screenUV.sub(0.5).length();
    const vignette = float(1).sub(smoothstep(0.36, 0.79, radial).mul(0.24));
    const cinematic = bloomComposite.mul(vignette);
    const dithered = film(cinematic, this.ditherIntensity);
    const output = renderOutput(dithered);
    this.pipeline.outputNode = fxaa(output);
    this.pipeline.needsUpdate = true;
    this.update(state, quality);
  }

  update(state: Readonly<RawStudioState>, quality: EngineQualityProfile): void {
    this.bloomNode.strength.value = state.output.post.bloomEnabled ? state.output.post.bloomStrength * 0.46 : 0;
    this.bloomNode.radius.value = THREE.MathUtils.clamp(state.output.post.bloomRadius / 6, 0, 1);
    this.bloomNode.threshold.value = Math.max(0.55, state.output.post.bloomThreshold);
    this.bloomNode.setResolutionScale(quality.bloomScale);
    this.ditherIntensity.value = state.output.post.dither ? state.engine.gradient.ditherStrength * 0.6 : 0;
    this.contrast.value = state.output.post.contrast;
    this.blackLift.value = state.output.post.blackLift;
    this.whitePoint.value = Math.max(state.output.post.blackLift + 0.01, state.output.post.whitePoint);
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}
