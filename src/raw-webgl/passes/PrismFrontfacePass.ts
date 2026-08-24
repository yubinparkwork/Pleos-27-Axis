import type { GLStateCache, Texture2D } from "../core";
import type { LightingState } from "../lighting/lightingPresets";
import type { PrismState, Vec3 } from "../materials/materialPresets";
import type { GpuAxisMesh } from "../renderer/GpuAxisMesh";
import {
  bindSampler2D,
  uniform1f,
  uniform1i,
  uniform2f,
  uniform3f,
  uniformMat4,
} from "../renderer/Uniforms";
import prismFrontFragmentSource from "../shaders/prism/prism-front.frag.glsl?raw";
import prismFrontVertexSource from "../shaders/prism/prism-front.vert.glsl?raw";
import { createPassProgram } from "./PassProgram";
import type { PrismBoundsEncoding } from "./PrismBackfacePass";
import { bindPassSurface, type LightingUniformUploader, type PassSurface } from "./PassSurface";

export interface PrismPassParameters {
  readonly material: Readonly<PrismState>;
  readonly lighting: Readonly<LightingState>;
  readonly model: Float32Array;
  readonly cameraPosition: Vec3;
  readonly near: number;
  readonly far: number;
  readonly debugMode: number;
  readonly edgeRoughness: number;
  readonly edgeHighlightStrength: number;
  readonly bounds: PrismBoundsEncoding;
}

export class PrismFrontfacePass {
  private readonly program;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly state: GLStateCache,
    private readonly lightingUniforms: LightingUniformUploader,
  ) {
    this.program = createPassProgram(gl, "Prism Frontface", prismFrontVertexSource, prismFrontFragmentSource);
    this.program.bindUniformBlock("CameraBlock", 0, true);
  }

  render(
    mesh: GpuAxisMesh,
    surface: PassSurface,
    sceneColor: Texture2D,
    backfacePosition: Texture2D,
    parameters: PrismPassParameters,
  ): void {
    bindPassSurface(this.state, surface);
    this.state.setDepthTest(true);
    this.state.setDepthWrite(true);
    this.state.setCullFace(true, this.gl.BACK);
    this.state.setFrontFace(this.gl.CCW);
    this.state.setBlend(false);
    this.program.use(this.state);
    uniformMat4(this.gl, this.program, "uModel", parameters.model);
    uniform2f(this.gl, this.program, "uResolution", surface.width, surface.height);
    uniform2f(this.gl, this.program, "uNearFar", parameters.near, parameters.far);
    uniform3f(this.gl, this.program, "uBoundsCenter", parameters.bounds.center);
    uniform3f(this.gl, this.program, "uBoundsHalfExtent", parameters.bounds.halfExtent);
    bindSampler2D(this.gl, this.state, this.program, "uSceneColor", sceneColor.handle, 0);
    bindSampler2D(this.gl, this.state, this.program, "uBackfacePosition", backfacePosition.handle, 1);

    const prism = parameters.material;
    uniform1f(this.gl, this.program, "uIor", prism.baseIor);
    uniform1f(this.gl, this.program, "uDispersion", prism.dispersion);
    uniform1i(this.gl, this.program, "uSpectralSamples", prism.spectralSamples);
    uniform1f(this.gl, this.program, "uSpectrumStrength", prism.spectrumStrength);
    uniform1f(this.gl, this.program, "uEdgeSpectrumStrength", prism.edgeSpectrumStrength);
    uniform1f(this.gl, this.program, "uInternalSpectrumStrength", prism.internalSpectrumStrength);
    uniform1f(this.gl, this.program, "uSpectrumSaturation", prism.spectrumSaturation);
    uniform1f(this.gl, this.program, "uSpectrumSoftness", prism.spectrumSoftness);
    uniform1f(this.gl, this.program, "uFresnelStrength", prism.fresnelStrength);
    uniform1f(this.gl, this.program, "uReflectionStrength", prism.reflectionStrength);
    uniform1f(this.gl, this.program, "uRefractionStrength", prism.refractionStrength);
    uniform3f(this.gl, this.program, "uAbsorptionColor", prism.absorptionColor);
    uniform1f(this.gl, this.program, "uAbsorptionDensity", prism.absorptionDensity);
    uniform1f(this.gl, this.program, "uAbsorptionDistance", prism.absorptionDistance);
    uniform1f(this.gl, this.program, "uInternalDarkness", prism.internalDarkness);
    uniform1f(this.gl, this.program, "uThicknessInfluence", prism.thicknessInfluence);
    uniform1f(this.gl, this.program, "uSurfaceRoughness", prism.surfaceRoughness);
    uniform1f(this.gl, this.program, "uRefractionRoughness", prism.refractionRoughness);
    uniform1f(this.gl, this.program, "uRefractionBlur", prism.refractionBlur);
    uniform1i(this.gl, this.program, "uIridescenceEnabled", prism.iridescenceEnabled ? 1 : 0);
    uniform1f(this.gl, this.program, "uIridescenceStrength", prism.iridescenceStrength);
    uniform1f(this.gl, this.program, "uFilmIor", prism.filmIor);
    uniform1f(this.gl, this.program, "uFilmThickness", prism.filmThickness);
    uniform1f(this.gl, this.program, "uFilmThicknessVariation", prism.filmThicknessVariation);
    uniform1f(this.gl, this.program, "uEdgeRoughness", parameters.edgeRoughness);
    uniform1f(this.gl, this.program, "uEdgeHighlightStrength", parameters.edgeHighlightStrength);
    uniform1i(this.gl, this.program, "uDebugMode", parameters.debugMode);
    this.lightingUniforms.upload(this.program, parameters.lighting);
    mesh.drawTriangles(this.state);
  }

  dispose(): void { this.program.dispose(); }
}
