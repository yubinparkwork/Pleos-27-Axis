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

uniform sampler2D uSceneColor;
uniform sampler2D uBackfacePosition;
uniform vec2 uResolution;
uniform float uIor;
uniform float uDispersion;
uniform float uSpectrumStrength;
uniform float uEdgeSpectrumStrength;
uniform float uInternalSpectrumStrength;
uniform float uSpectrumSaturation;
uniform float uSpectrumSoftness;
uniform float uRefractionStrength;
uniform float uReflectionStrength;
uniform float uFresnelStrength;
uniform vec3 uAbsorptionColor;
uniform float uAbsorptionDensity;
uniform float uAbsorptionDistance;
uniform float uThicknessInfluence;
uniform float uInternalDarkness;
uniform float uSurfaceRoughness;
uniform float uRefractionRoughness;
uniform float uRefractionBlur;
uniform float uEdgeRoughness;
uniform float uEdgeHighlightStrength;
uniform vec3 uLightPosition[3];
uniform vec3 uLightColor[3];
uniform vec3 uLightIntensity;
uniform int uIridescenceEnabled;
uniform float uIridescenceStrength;
uniform float uFilmIor;
uniform float uFilmThickness;
uniform float uFilmThicknessVariation;
uniform int uSpectralSamples;
uniform vec3 uBoundsCenter;
uniform vec3 uBoundsHalfExtent;
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

vec3 decodeBackPosition(vec3 encodedPosition) {
  return uBoundsCenter + (encodedPosition - 0.5) * (max(uBoundsHalfExtent, vec3(1e-5)) * 2.0);
}

vec2 projectedUv(vec3 worldPosition) {
  vec4 clipPosition = uViewProjection * vec4(worldPosition, 1.0);
  return clipPosition.xy / max(abs(clipPosition.w), 1e-6) * 0.5 + 0.5;
}

vec2 refractionOffset(vec3 incident, vec3 transmittedRay, float thickness) {
  vec2 unrefractedUv = projectedUv(vWorldPosition + incident * thickness);
  vec2 refractedUv = projectedUv(vWorldPosition + transmittedRay * thickness);
  return refractedUv - unrefractedUv;
}

float wavelengthIor(float wavelengthNm) {
  // Compact Cauchy-style dispersion around the green reference wavelength.
  float inverseLambdaSquared = pow(550.0 / wavelengthNm, 2.0);
  return max(1.0001, uIor + uDispersion * 0.035 * (inverseLambdaSquared - 1.0));
}

vec3 spectralResponse(float wavelengthNm) {
  // Broad linear-light sensor response curves. Per-channel normalization below
  // keeps a neutral source neutral, so color only appears through refraction.
  float red = gaussian(wavelengthNm, 610.0, 44.0) + gaussian(wavelengthNm, 680.0, 28.0) * 0.24;
  float green = gaussian(wavelengthNm, 545.0, 34.0);
  float blue = gaussian(wavelengthNm, 455.0, 29.0) + gaussian(wavelengthNm, 500.0, 24.0) * 0.12;
  return max(vec3(red, green, blue), vec3(1e-5));
}

vec3 resolveOpticalSource(vec4 sceneSample, vec3 environmentSample) {
  return mix(environmentSample, sceneSample.rgb, saturate(sceneSample.a));
}

vec3 sampleOpticalSource(vec2 uv, vec3 rayDirection, float roughRadius) {
  vec2 safeResolution = max(uResolution, vec2(1.0));
  vec2 radius = vec2(safeResolution.y / safeResolution.x, 1.0) * max(roughRadius, 0.0);
  // Refraction roughness is handled by the scene multi-tap below. A single
  // analytic environment evaluation keeps 5/7-wavelength preview practical.
  vec3 fallback = environmentColor(rayDirection);
  vec2 centerUv = clamp(uv, vec2(0.001), vec2(0.999));
  vec4 center = textureLod(uSceneColor, centerUv, 0.0);
  vec3 color = resolveOpticalSource(center, fallback) * 0.4;
  if (roughRadius <= 1e-6) return color / 0.4;

  vec2 diagonalA = radius * vec2(0.70710678, 0.70710678);
  vec2 diagonalB = radius * vec2(-0.70710678, 0.70710678);
  vec4 tapA = textureLod(uSceneColor, clamp(centerUv + diagonalA, vec2(0.001), vec2(0.999)), 0.0);
  vec4 tapB = textureLod(uSceneColor, clamp(centerUv - diagonalA, vec2(0.001), vec2(0.999)), 0.0);
  vec4 tapC = textureLod(uSceneColor, clamp(centerUv + diagonalB, vec2(0.001), vec2(0.999)), 0.0);
  vec4 tapD = textureLod(uSceneColor, clamp(centerUv - diagonalB, vec2(0.001), vec2(0.999)), 0.0);
  color += resolveOpticalSource(tapA, fallback) * 0.15;
  color += resolveOpticalSource(tapB, fallback) * 0.15;
  color += resolveOpticalSource(tapC, fallback) * 0.15;
  color += resolveOpticalSource(tapD, fallback) * 0.15;
  return color;
}

vec3 integrateSpectralRefraction(
  vec3 incident,
  vec3 normal,
  vec2 screenUv,
  float thickness,
  float dispersionEnvelope,
  float roughRadius
) {
  int sampleCount = uSpectralSamples >= 7 ? 7 : (uSpectralSamples >= 5 ? 5 : 3);
  vec3 accumulatedColor = vec3(0.0);
  vec3 accumulatedWeight = vec3(0.0);

  for (int sampleIndex = 0; sampleIndex < 7; sampleIndex += 1) {
    if (sampleIndex >= sampleCount) break;
    float unit = float(sampleIndex) / float(max(sampleCount - 1, 1));
    float wavelengthNm = mix(430.0, 670.0, unit);
    vec3 response = spectralResponse(wavelengthNm);
    float dispersedIor = mix(uIor, wavelengthIor(wavelengthNm), clamp(dispersionEnvelope, 0.0, 2.0));
    vec3 transmittedRay = refract(incident, normal, 1.0 / dispersedIor);
    if (dot(transmittedRay, transmittedRay) < 1e-8) transmittedRay = reflect(incident, normal);
    transmittedRay = safeNormalize(transmittedRay);
    vec2 offset = refractionOffset(incident, transmittedRay, thickness) * max(uRefractionStrength, 0.0);
    float wavelengthDistance = abs(wavelengthNm - 550.0) / 120.0;
    float spectralBlur = roughRadius * (1.0 + max(uSpectrumSoftness, 0.0) * wavelengthDistance);
    vec3 source = sampleOpticalSource(screenUv + offset, transmittedRay, spectralBlur);
    float energy = dot(source, response) / max(response.r + response.g + response.b, 1e-5);
    accumulatedColor += response * energy;
    accumulatedWeight += response;
  }

  return accumulatedColor / max(accumulatedWeight, vec3(1e-5));
}

vec3 thinFilmReflectance(float cosTheta, float thicknessNm, float filmIor) {
  float safeFilmIor = max(filmIor, 1.0001);
  float sinThetaFilm = sqrt(max(1.0 - cosTheta * cosTheta, 0.0)) / safeFilmIor;
  float cosThetaFilm = sqrt(max(1.0 - sinThetaFilm * sinThetaFilm, 0.0));
  vec3 wavelengthNm = vec3(650.0, 535.0, 460.0);
  vec3 phase = (4.0 * PI * safeFilmIor * max(thicknessNm, 0.0) * cosThetaFilm) / wavelengthNm;
  return 0.5 + 0.5 * cos(phase);
}

void main() {
  vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec3 normal = safeNormalize(vWorldNormal);
  vec3 viewDirection = safeNormalize(uCameraPosition.xyz - vWorldPosition);
  vec3 incident = -viewDirection;
  vec4 encodedBack = texture(uBackfacePosition, screenUv);
  vec3 backPosition = decodeBackPosition(encodedBack.rgb);
  float fallbackThickness = max(length(uBoundsHalfExtent) * 0.06, 0.015);
  float thickness = encodedBack.a > 0.5 ? length(backPosition - vWorldPosition) : fallbackThickness;
  thickness = max(thickness, 0.002) * max(uThicknessInfluence, 0.0);

  if (uDebugMode == 1) { outColor = vec4(faceColor(vFaceId), 1.0); return; }
  if (uDebugMode == 2) { outColor = vec4(normal * 0.5 + 0.5, 1.0); return; }
  if (uDebugMode == 3) { outColor = vec4(vec3(cameraDepth01(gl_FragCoord.z)), 1.0); return; }
  if (uDebugMode == 4) {
    float sceneDiameter = max(length(uBoundsHalfExtent) * 2.0, 1e-5);
    outColor = vec4(vec3(saturate(thickness / sceneDiameter)), 1.0);
    return;
  }

  float cosTheta = max(dot(normal, viewDirection), 0.0);
  float edge = pow(1.0 - cosTheta, 2.2);
  float internalPath = 1.0 - exp(-thickness * 0.7);
  float dispersionEnvelope = max(uSpectrumStrength, 0.0)
    * (0.35 + max(uInternalSpectrumStrength, 0.0) * internalPath + max(uEdgeSpectrumStrength, 0.0) * edge);
  float spectralBlend = saturate(dispersionEnvelope * max(uSpectrumSaturation, 0.0));

  vec3 baseRay = refract(incident, normal, 1.0 / max(uIor, 1.0001));
  if (dot(baseRay, baseRay) < 1e-8) baseRay = reflect(incident, normal);
  baseRay = safeNormalize(baseRay);
  vec2 baseOffset = refractionOffset(incident, baseRay, thickness) * max(uRefractionStrength, 0.0);
  float roughRadius = max(uRefractionRoughness, 0.0) * 0.012
    + max(uRefractionBlur, 0.0) * 0.006;
  float grazingRoughRadius = max(uEdgeRoughness, 0.0) * 0.014
    + max(uRefractionBlur, 0.0) * 0.006;
  roughRadius = mix(roughRadius, max(roughRadius, grazingRoughRadius), edge);
  roughRadius *= 0.55 + 0.45 * saturate(thickness / max(length(uBoundsHalfExtent), 1e-5));
  vec3 neutralRefraction = sampleOpticalSource(screenUv + baseOffset, baseRay, roughRadius);
  vec3 transmitted = neutralRefraction;
  if (spectralBlend > 0.001) {
    vec3 spectralRefraction = integrateSpectralRefraction(
      incident,
      normal,
      screenUv,
      thickness,
      dispersionEnvelope,
      roughRadius
    );
    transmitted = mix(neutralRefraction, spectralRefraction, spectralBlend);
  }

  // absorptionColor is a transmitted tint. Beer-Lambert converts that tint to
  // a coefficient, preserving same-hue Pleos Blue attenuation through depth.
  vec3 transmittedTint = clamp(uAbsorptionColor, vec3(0.001), vec3(1.0));
  vec3 absorptionCoefficient = -log(transmittedTint)
    * max(uAbsorptionDensity, 0.0) / max(uAbsorptionDistance, 1e-4);
  vec3 transmittance = exp(-absorptionCoefficient * thickness);
  float internalAttenuation = exp(-max(uInternalDarkness, 0.0) * thickness / max(uAbsorptionDistance, 1e-4));
  transmitted *= transmittance * internalAttenuation;

  vec3 reflectedDirection = reflect(incident, normal);
  float reflectionRoughness = mix(
    clamp(uSurfaceRoughness, 0.0, 1.0),
    clamp(uEdgeRoughness, 0.0, 1.0),
    edge
  );
  vec3 reflected = environmentColorRough(reflectedDirection, reflectionRoughness);
  if (uIridescenceEnabled != 0 && uIridescenceStrength > 0.0) {
    float faceVariation = float(vFaceId % 11u) / 10.0 - 0.5;
    float filmThickness = uFilmThickness * (1.0 + faceVariation * uFilmThicknessVariation);
    vec3 film = thinFilmReflectance(cosTheta, filmThickness, uFilmIor);
    float filmBlend = saturate(uIridescenceStrength) * (0.3 + edge * 0.7);
    reflected *= mix(vec3(1.0), vec3(0.62) + film * 0.76, filmBlend);
  }

  float f0Scalar = dielectricF0(max(uIor, 1.0001));
  vec3 fresnel = clamp(
    fresnelSchlick(cosTheta, vec3(f0Scalar)) * max(uFresnelStrength, 0.0),
    vec3(0.0),
    vec3(1.0)
  );
  vec3 directSpecular = vec3(0.0);
  for (int lightIndex = 0; lightIndex < 3; lightIndex += 1) {
    vec3 toLight = uLightPosition[lightIndex] - vWorldPosition;
    float lightDistance = max(length(toLight), 1e-4);
    vec3 lightDirection = toLight / lightDistance;
    vec3 halfway = safeNormalize(viewDirection + lightDirection);
    float nDotL = max(dot(normal, lightDirection), 0.0);
    float nDotV = max(dot(normal, viewDirection), 0.0);
    float distribution = distributionGGX(normal, halfway, max(reflectionRoughness, 0.025));
    float geometry = geometrySmith(normal, viewDirection, lightDirection, max(reflectionRoughness, 0.025));
    vec3 lightFresnel = fresnelSchlick(max(dot(halfway, viewDirection), 0.0), vec3(f0Scalar));
    lightFresnel = clamp(lightFresnel * max(uFresnelStrength, 0.0), vec3(0.0), vec3(1.0));
    vec3 specularBrdf = distribution * geometry * lightFresnel
      / max(4.0 * nDotV * nDotL, 1e-4);
    float attenuation = 1.0 / (1.0 + 0.0125 * lightDistance * lightDistance);
    vec3 lightRadiance = uLightColor[lightIndex] * max(uLightIntensity[lightIndex], 0.0) * attenuation;
    directSpecular += specularBrdf * lightRadiance * nDotL;
  }
  vec3 transmissionContribution = transmitted * (vec3(1.0) - fresnel) * max(uRefractionStrength, 0.0);
  float edgeHighlight = mix(1.0, max(uEdgeHighlightStrength, 0.0), edge);
  vec3 reflectionContribution = (reflected * fresnel + directSpecular)
    * max(uReflectionStrength, 0.0) * edgeHighlight;
  outColor = vec4(transmissionContribution + reflectionContribution, 1.0);
}
