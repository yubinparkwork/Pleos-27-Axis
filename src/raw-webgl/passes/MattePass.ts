import type { GLStateCache } from "../core";
import type { LightingState } from "../lighting/lightingPresets";
import type { MatteState, Vec3 } from "../materials/materialPresets";
import type { GpuAxisMesh } from "../renderer/GpuAxisMesh";
import { uniform1f, uniform1i, uniform2f, uniform3f, uniformMat4 } from "../renderer/Uniforms";
import matteFragmentSource from "../shaders/matte/matte.frag.glsl?raw";
import matteVertexSource from "../shaders/matte/matte.vert.glsl?raw";
import { createPassProgram } from "./PassProgram";
import { bindPassSurface, type LightingUniformUploader, type PassSurface } from "./PassSurface";

export interface MattePassParameters {
  readonly material: Readonly<MatteState>;
  readonly lighting: Readonly<LightingState>;
  readonly model: Float32Array;
  readonly cameraPosition: Vec3;
  readonly near: number;
  readonly far: number;
  readonly debugMode: number;
  readonly timeSeconds: number;
}

export class MattePass {
  private readonly program;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly state: GLStateCache,
    private readonly lightingUniforms: LightingUniformUploader,
  ) {
    this.program = createPassProgram(gl, "Matte BRDF", matteVertexSource, matteFragmentSource);
    this.program.bindUniformBlock("CameraBlock", 0, true);
  }

  render(mesh: GpuAxisMesh, surface: PassSurface, parameters: MattePassParameters): void {
    bindPassSurface(this.state, surface);
    this.state.setDepthTest(true);
    this.state.setDepthWrite(true);
    this.state.setCullFace(false);
    this.state.setBlend(false);
    this.program.use(this.state);
    uniformMat4(this.gl, this.program, "uModel", parameters.model);
    uniform2f(this.gl, this.program, "uNearFar", parameters.near, parameters.far);
    uniform3f(this.gl, this.program, "uBaseColor", parameters.material.baseColor);
    uniform1f(this.gl, this.program, "uFaceVariation", parameters.material.faceVariation);
    uniform1f(this.gl, this.program, "uRoughness", parameters.material.roughness);
    uniform1f(this.gl, this.program, "uDiffuseStrength", parameters.material.diffuseStrength);
    uniform1f(this.gl, this.program, "uSpecularStrength", parameters.material.specularStrength);
    uniform3f(this.gl, this.program, "uSpecularTint", parameters.material.specularTint);
    uniform1f(this.gl, this.program, "uMicroStrength", parameters.material.microStrength);
    uniform1f(this.gl, this.program, "uMicroScale", parameters.material.microScale);
    uniform1f(this.gl, this.program, "uAmbientStrength", parameters.material.ambientStrength);
    const texture = parameters.material.texture;
    uniform1i(this.gl, this.program, "uTexturePattern", texture.pattern === "amber-flow" ? 1 : 0);
    uniform1i(this.gl, this.program, "uTextureEnabled", texture.enabled ? 1 : 0);
    uniform1f(this.gl, this.program, "uTextureStrength", texture.strength);
    uniform1f(this.gl, this.program, "uTextureScale", texture.scale);
    uniform1f(this.gl, this.program, "uTextureRotation", texture.rotation * Math.PI / 180);
    uniform1f(this.gl, this.program, "uTextureFlow", texture.flow);
    uniform1f(this.gl, this.program, "uTextureContrast", texture.contrast);
    uniform1f(this.gl, this.program, "uTextureEdgeGlow", texture.edgeGlow);
    uniform1f(this.gl, this.program, "uTextureEdgeWidth", texture.edgeWidth);
    uniform1f(this.gl, this.program, "uTextureTime", texture.animationEnabled ? parameters.timeSeconds : 0);
    uniform1f(this.gl, this.program, "uTextureAnimationSpeed", texture.animationSpeed);
    uniform1f(this.gl, this.program, "uTextureAnimationTravel", texture.animationTravel);
    uniform1f(this.gl, this.program, "uTextureWarpStrength", texture.warpStrength);
    uniform1f(this.gl, this.program, "uTextureDetailStrength", texture.detailStrength);
    uniform1f(this.gl, this.program, "uTextureSheenStrength", texture.sheenStrength);
    uniform3f(this.gl, this.program, "uTextureDarkColor", texture.darkColor);
    uniform3f(this.gl, this.program, "uTextureHotColor", texture.hotColor);
    uniform3f(this.gl, this.program, "uTextureSoftColor", texture.softColor);
    uniform3f(this.gl, this.program, "uTextureAccentColor", texture.accentColor);
    uniform1i(this.gl, this.program, "uSoftAreaEnabled", parameters.lighting.softArea.enabled ? 1 : 0);
    uniform1f(this.gl, this.program, "uSoftSourceSize", parameters.lighting.softArea.sourceSize);
    uniform1f(this.gl, this.program, "uSoftFalloffExponent", parameters.lighting.softArea.falloffExponent);
    uniform1f(this.gl, this.program, "uSoftPenumbraWidth", parameters.lighting.softArea.penumbraWidth);
    uniform1f(this.gl, this.program, "uSoftEdgeSoftness", parameters.lighting.softArea.edgeSoftness);
    uniform1f(this.gl, this.program, "uSoftAmbientIntensity", parameters.lighting.softArea.ambientIntensity);
    uniform1f(this.gl, this.program, "uSoftGrazingStrength", parameters.lighting.softArea.grazingStrength);
    uniform1f(this.gl, this.program, "uSoftContactDarkening", parameters.lighting.softArea.contactDarkening);
    uniform1f(this.gl, this.program, "uSoftContactRadius", parameters.lighting.softArea.contactRadius);
    uniform3f(this.gl, this.program, "uSoftLowerFaceBias", parameters.lighting.softArea.lowerFaceBias);
    uniform1i(this.gl, this.program, "uDebugMode", parameters.debugMode);
    this.lightingUniforms.upload(this.program, parameters.lighting);
    mesh.drawTriangles(this.state);
  }

  dispose(): void { this.program.dispose(); }
}
