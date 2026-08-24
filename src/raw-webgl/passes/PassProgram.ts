import { ShaderProgram } from "../core";
import brdfSource from "../shaders/common/brdf.glsl?raw";
import colorSpaceSource from "../shaders/common/color-space.glsl?raw";
import ditheringSource from "../shaders/common/dithering.glsl?raw";
import environmentSource from "../shaders/common/environment.glsl?raw";
import fresnelSource from "../shaders/common/fresnel.glsl?raw";
import mathSource from "../shaders/common/math.glsl?raw";
import toneMappingSource from "../shaders/common/tone-mapping.glsl?raw";
import { preprocessShaderSource } from "../renderer/ShaderSource";

export const GLSL_INCLUDES = Object.freeze({
  brdf: brdfSource,
  "color-space": colorSpaceSource,
  dithering: ditheringSource,
  environment: environmentSource,
  fresnel: fresnelSource,
  math: mathSource,
  "tone-mapping": toneMappingSource,
});

export function createPassProgram(
  gl: WebGL2RenderingContext,
  label: string,
  vertexSource: string,
  fragmentSource: string,
): ShaderProgram {
  return new ShaderProgram(gl, {
    label,
    vertexSource: preprocessShaderSource(vertexSource, GLSL_INCLUDES),
    fragmentSource: preprocessShaderSource(fragmentSource, GLSL_INCLUDES),
    attributeLocations: { aPosition: 0, aNormal: 1, aUv: 2, aFaceId: 3 },
  });
}
