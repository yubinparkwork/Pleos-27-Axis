#version 300 es
precision highp float;
precision highp int;

in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec2 vUv;
flat in uint vFaceId;

layout(location = 0) out vec4 outColor;

layout(std140) uniform CameraBlock {
  mat4 uView;
  mat4 uProjection;
  mat4 uViewProjection;
  vec4 uCameraPosition;
};

uniform vec3 uBaseColor;
uniform float uFaceVariation;
uniform float uRoughness;
uniform float uDiffuseStrength;
uniform float uSpecularStrength;
uniform vec3 uSpecularTint;
uniform float uMicroStrength;
uniform float uMicroScale;
uniform float uAmbientStrength;
uniform vec3 uLightPosition[3];
uniform vec3 uLightColor[3];
uniform vec3 uLightIntensity;
uniform vec2 uNearFar;
uniform int uDebugMode;

#include <math>
#include <fresnel>
#include <brdf>
#include <environment>

vec3 faceColor(uint faceId) {
  uint value = faceId * 1103515245u + 12345u;
  return vec3(float((value >> 0u) & 255u), float((value >> 8u) & 255u), float((value >> 16u) & 255u)) / 255.0;
}

float cameraDepth01(float deviceDepth) {
  float ndcDepth = deviceDepth * 2.0 - 1.0;
  vec4 viewPosition = inverse(uProjection) * vec4(0.0, 0.0, ndcDepth, 1.0);
  float viewDistance = abs(viewPosition.z / max(abs(viewPosition.w), 1e-6));
  return saturate((viewDistance - uNearFar.x) / max(uNearFar.y - uNearFar.x, 1e-5));
}

void main() {
  vec3 normal = safeNormalize(vWorldNormal);
  vec3 viewDirection = safeNormalize(uCameraPosition.xyz - vWorldPosition);
  if (uDebugMode == 1) { outColor = vec4(faceColor(vFaceId), 1.0); return; }
  if (uDebugMode == 2) { outColor = vec4(normal * 0.5 + 0.5, 1.0); return; }
  if (uDebugMode == 3) { outColor = vec4(vec3(cameraDepth01(gl_FragCoord.z)), 1.0); return; }

  // Micro controls widen the microfacet lobe without adding a visible grain texture.
  float microFootprint = saturate(log2(max(uMicroScale, 1.0)) / 12.0);
  float roughness = clamp(uRoughness + uMicroStrength * mix(0.12, 0.2, microFootprint), 0.04, 1.0);
  float faceShift = (float(vFaceId % 7u) / 6.0 - 0.5) * uFaceVariation;
  vec3 baseColor = max(uBaseColor * (1.0 + faceShift), vec3(0.0));
  vec3 color = vec3(0.0);
  for (int index = 0; index < 3; index += 1) {
    vec3 toLight = uLightPosition[index] - vWorldPosition;
    float lightDistance = max(length(toLight), 1e-4);
    vec3 lightDirection = toLight / lightDistance;
    float attenuation = 1.0 / (1.0 + 0.0125 * lightDistance * lightDistance);
    vec3 radiance = uLightColor[index] * max(uLightIntensity[index], 0.0) * attenuation;
    color += evaluatePbr(baseColor, normal, viewDirection, lightDirection, radiance, roughness, uDiffuseStrength, uSpecularStrength, uSpecularTint);
  }

  float nDotV = max(dot(normal, viewDirection), 0.0);
  vec3 reflected = reflect(-viewDirection, normal);
  vec3 diffuseEnvironment = environmentColor(normal);
  vec3 specularEnvironment = environmentColorRough(reflected, roughness);
  vec3 f0 = vec3(0.04) * mix(vec3(1.0), max(uSpecularTint, vec3(0.0)), 0.75);
  vec3 environmentFresnel = fresnelSchlick(nDotV, f0);
  color += diffuseEnvironment * baseColor * max(uAmbientStrength, 0.0);
  color += specularEnvironment * environmentFresnel * max(uSpecularStrength, 0.0);
  outColor = vec4(color, 1.0);
}
