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
uniform int uTexturePattern;
uniform int uTextureEnabled;
uniform float uTextureStrength;
uniform float uTextureScale;
uniform float uTextureRotation;
uniform float uTextureFlow;
uniform float uTextureContrast;
uniform float uTextureEdgeGlow;
uniform float uTextureEdgeWidth;
uniform float uTextureTime;
uniform float uTextureAnimationSpeed;
uniform float uTextureAnimationTravel;
uniform float uTextureWarpStrength;
uniform float uTextureDetailStrength;
uniform float uTextureSheenStrength;
uniform vec3 uTextureDarkColor;
uniform vec3 uTextureHotColor;
uniform vec3 uTextureSoftColor;
uniform vec3 uTextureAccentColor;
uniform vec3 uLightPosition[5];
uniform vec3 uLightTarget[5];
uniform vec3 uLightColor[5];
uniform float uLightIntensity[5];
uniform float uLightFalloff[5];
uniform float uLightInfluenceRadius[5];
uniform int uSoftAreaEnabled;
uniform float uSoftSourceSize;
uniform float uSoftFalloffExponent;
uniform float uSoftPenumbraWidth;
uniform float uSoftEdgeSoftness;
uniform float uSoftAmbientIntensity;
uniform float uSoftGrazingStrength;
uniform float uSoftContactDarkening;
uniform float uSoftContactRadius;
uniform vec3 uSoftLowerFaceBias;
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

float textureHash(float value) {
  return fract(sin(value * 127.1 + 311.7) * 43758.5453);
}

float textureHash21(vec2 point) {
  vec3 value = fract(vec3(point.xyx) * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

float textureNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = textureHash21(cell);
  float b = textureHash21(cell + vec2(1.0, 0.0));
  float c = textureHash21(cell + vec2(0.0, 1.0));
  float d = textureHash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float textureFbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 transform = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 5; octave += 1) {
    value += textureNoise(point) * amplitude;
    point = transform * point * 2.03 + vec2(7.17, 3.41);
    amplitude *= 0.5;
  }
  return value;
}

vec3 texturePalette(float value) {
  float t = clamp(value, 0.0, 1.0);
  if (t < 0.34) return mix(uTextureDarkColor, uTextureAccentColor, smoothstep(0.0, 0.34, t));
  if (t < 0.72) return mix(uTextureAccentColor, uTextureHotColor, smoothstep(0.34, 0.72, t));
  return mix(uTextureHotColor, uTextureSoftColor, smoothstep(0.72, 1.0, t));
}

float amberLens(vec2 point, vec2 center, vec2 radius) {
  float distanceToCenter = length((point - center) / max(radius, vec2(0.001)));
  float antialiasWidth = max(fwidth(distanceToCenter) * 1.5, 0.002);
  return 1.0 - smoothstep(0.72 - antialiasWidth, 1.0 + antialiasWidth, distanceToCenter);
}

vec3 amberFlowSurfaceTexture(
  vec2 uv,
  vec3 worldPosition,
  out float edgeMask,
  out float microDetail,
  out float sheenMask
) {
  float rotation = uTextureRotation;
  mat2 rotationMatrix = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  vec2 point = rotationMatrix * (uv - 0.5);
  float loopPhase = uTextureTime * uTextureAnimationSpeed * 2.0 * PI;
  vec2 loopOffset = vec2(cos(loopPhase), sin(loopPhase)) * max(uTextureAnimationTravel, 0.0);
  float scale = max(uTextureScale, 0.2);

  vec2 warpPoint = point * vec2(scale * 0.8, scale * 0.46) + loopOffset * 0.08;
  vec2 warp = vec2(
    textureFbm(warpPoint + vec2(2.4, 5.1)),
    textureFbm(warpPoint + vec2(7.8, 1.9))
  ) - 0.5;
  point += warp * max(uTextureWarpStrength, 0.0) * vec2(0.026, 0.06);

  float columnCount = max(7.0, floor(scale * 7.5 + 0.5));
  float columnCoordinate = (point.x + 0.5) * columnCount;
  float columnIndex = floor(columnCoordinate);
  float localColumn = fract(columnCoordinate);
  float columnRandom = textureHash(columnIndex + 19.0);
  float secondaryRandom = textureHash(columnIndex * 2.31 + 7.0);
  float columnCenter = (columnIndex + 0.5) / columnCount - 0.5;

  float slowDrift = sin(loopPhase) * 0.055 * max(uTextureAnimationTravel, 0.0);
  float waveCenter = 0.25 * sin(columnCenter * PI * 1.72 + slowDrift * 3.0);
  waveCenter += 0.085 * sin(columnCenter * PI * 4.3 - loopPhase * 0.42);
  waveCenter += (columnRandom - 0.5) * 0.1;
  waveCenter += sin((localColumn - 0.5) * PI) * (secondaryRandom - 0.5) * 0.055;
  float flowDistance = point.y - waveCenter;
  float distanceToRidge = abs(flowDistance);
  float ridgeDerivative = max(fwidth(distanceToRidge), 0.001);
  float ridgeWidth = mix(0.006, 0.018, secondaryRandom) + uTextureEdgeWidth * 0.18;
  float hotRidge = 1.0 - smoothstep(ridgeWidth - ridgeDerivative, ridgeWidth * 4.8 + ridgeDerivative, distanceToRidge);
  float haloRidge = 1.0 - smoothstep(ridgeWidth * 1.5, ridgeWidth * 12.0, distanceToRidge);

  float seamDistance = min(localColumn, 1.0 - localColumn);
  float seamDerivative = max(fwidth(seamDistance), 0.001);
  float ribSeam = 1.0 - smoothstep(0.006 - seamDerivative, 0.034 + seamDerivative, seamDistance);
  float side = smoothstep(-0.035, 0.035, flowDistance);
  float fillDirection = step(0.52, columnRandom);
  float illuminatedSide = mix(side, 1.0 - side, fillDirection);
  float longVariation = textureFbm(vec2(columnCenter * 2.2 + 4.0, point.y * 0.7 - loopOffset.y * 0.04));
  float bodyLight = illuminatedSide * (0.12 + 0.3 * longVariation);

  vec2 lensMotion = vec2(sin(loopPhase), cos(loopPhase)) * 0.012;
  float lensA = amberLens(point, vec2(-0.23, 0.29) + lensMotion, vec2(0.055, 0.18));
  float lensB = amberLens(point, vec2(0.17, -0.08) - lensMotion, vec2(0.07, 0.15));
  float lensC = amberLens(point, vec2(0.31, -0.3) + lensMotion.yx, vec2(0.045, 0.12));
  float lens = max(lensA, max(lensB * 0.9, lensC * 0.74));
  float lensRim = pow(clamp(lens, 0.0, 1.0), 2.6);

  microDetail = textureFbm(point * scale * vec2(8.0, 4.0) + vec2(11.0, 3.0));
  vec3 textureColor = mix(uTextureDarkColor, uTextureAccentColor, bodyLight);
  textureColor = mix(textureColor, uTextureHotColor, haloRidge * (0.34 + 0.24 * secondaryRandom));
  textureColor = mix(textureColor, uTextureSoftColor, hotRidge * 0.82);
  textureColor = mix(textureColor, uTextureSoftColor, lensRim * 0.9);
  textureColor += uTextureHotColor * ribSeam * (0.025 + 0.055 * haloRidge);
  textureColor = max((textureColor - 0.08) * max(uTextureContrast, 0.0) + 0.08, vec3(0.0));

  float centerAccent = 1.0 - smoothstep(0.0, 0.24, length(worldPosition.xy));
  edgeMask = clamp(hotRidge * 0.92 + lensRim * 0.88 + ribSeam * 0.08 + centerAccent * hotRidge * 0.2, 0.0, 1.0);
  sheenMask = clamp(haloRidge * 0.56 + lens * 0.72 + ribSeam * 0.06, 0.0, 1.0);
  return textureColor;
}

vec3 pleosSurfaceTexture(
  vec2 uv,
  vec3 worldPosition,
  uint faceId,
  out float edgeMask,
  out float microDetail,
  out float sheenMask
) {
  float rotation = uTextureRotation;
  mat2 rotationMatrix = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  vec2 point = rotationMatrix * (uv - 0.5);
  float loopPhase = uTextureTime * uTextureAnimationSpeed * 2.0 * PI;
  vec2 loopOffset = vec2(cos(loopPhase), sin(loopPhase)) * max(uTextureAnimationTravel, 0.0);
  float scale = max(uTextureScale, 0.01);
  vec2 noisePoint = point * scale * 1.2 + loopOffset * 0.13;
  vec2 warp = vec2(
    textureFbm(noisePoint),
    textureFbm(noisePoint + vec2(5.2, 1.3))
  ) - 0.5;
  vec2 warpedPoint = point + warp * max(uTextureWarpStrength, 0.0) * 0.24;
  vec2 flowDirection = safeNormalize(vec3(1.0 - uTextureFlow, uTextureFlow, 0.0)).xy;
  float broadNoise = textureFbm(warpedPoint * scale * 0.92 + loopOffset * 0.07);
  float causticNoise = textureFbm(warpedPoint * scale * 1.65 - loopOffset * 0.09 + vec2(3.7, 8.1));
  float slowWave = 0.5 + 0.5 * sin(dot(warpedPoint, flowDirection) * PI * 1.35 - loopPhase);
  microDetail = textureFbm(warpedPoint * scale * 7.0 - loopOffset * 0.05);
  float detail = (microDetail - 0.5) * clamp(uTextureDetailStrength, 0.0, 1.0) * 0.05;
  float colorField = clamp(mix(broadNoise, slowWave, 0.22) + detail, 0.0, 1.0);

  float angle = atan(worldPosition.y, worldPosition.x) - PI / 6.0;
  float sector = fract(angle / (2.0 * PI) * 6.0);
  float angularEdge = min(sector, 1.0 - sector) * max(length(worldPosition.xy), 0.001);
  float edgeAntialias = max(fwidth(angularEdge) * 1.8, 0.001);
  float glowWidth = max(uTextureEdgeWidth, 0.002);
  edgeMask = 1.0 - smoothstep(
    max(0.0, glowWidth * 0.25 - edgeAntialias),
    glowWidth * 2.8 + edgeAntialias,
    angularEdge
  );
  float centerGlow = 1.0 - smoothstep(0.015, 0.3, length(worldPosition.xy));
  float causticLobe = smoothstep(0.42, 0.88, causticNoise);
  edgeMask = clamp(max(edgeMask * (0.42 + causticLobe * 0.58), centerGlow * 0.72), 0.0, 1.0);

  // Deep violet body color with broad blue/lavender diffusion. Pink and cyan
  // are reserved for seam caustics, matching the soft optical reference.
  vec3 textureColor = mix(uTextureDarkColor, uTextureAccentColor, smoothstep(0.04, 0.66, colorField));
  textureColor = mix(textureColor, uTextureSoftColor, smoothstep(0.54, 0.98, colorField) * 0.68);
  vec3 causticColor = mix(uTextureHotColor, uTextureSoftColor, smoothstep(0.38, 0.78, causticNoise));
  textureColor = mix(textureColor, causticColor, edgeMask * (0.14 + 0.2 * causticLobe));
  textureColor = max((textureColor - 0.12) * max(uTextureContrast, 0.0) + 0.12, vec3(0.0));
  sheenMask = clamp(edgeMask * (0.5 + 0.5 * causticLobe) + smoothstep(0.78, 1.0, colorField) * 0.16, 0.0, 1.0);
  return textureColor;
}

bool isLowerLeftFace(uint faceId) {
  // Matte uses six folded sectors (1, 2, 3 are lower-left); the prism mesh
  // uses a second solid whose face ids begin at 32.
  return faceId >= 32u || faceId == 1u || faceId == 2u || faceId == 3u;
}

float lowerFaceBias(uint faceId) {
  if (faceId < 32u) {
    if (faceId == 2u) return uSoftLowerFaceBias.x;
    if (faceId == 3u) return uSoftLowerFaceBias.y;
    return uSoftLowerFaceBias.z;
  }
  uint axis = min((faceId % 32u) / 2u, 2u);
  if (axis == 0u) return uSoftLowerFaceBias.x;
  if (axis == 1u) return uSoftLowerFaceBias.y;
  return uSoftLowerFaceBias.z;
}

float pleosSoftIllumination(vec3 worldPosition, uint faceId) {
  if (uSoftAreaEnabled == 0) return 1.0;

  // The upper form stays legible, but receives a slight continuous tonal drift.
  if (!isLowerLeftFace(faceId)) {
    float upperRadius = max(uLightInfluenceRadius[0] * 1.65, 0.3);
    float upperDistance = length(worldPosition - uLightTarget[0]);
    return 1.0 - 0.12 * smoothstep(0.12, upperRadius, upperDistance);
  }

  // The lower-left form fades from the convergence point into a broad penumbra.
  float radius = max(uLightInfluenceRadius[0], 0.001);
  float normalizedDistance = clamp(length(worldPosition) / radius, 0.0, 1.0);
  float curvedDistance = pow(normalizedDistance, max(uSoftFalloffExponent, 0.05));
  float feather = mix(0.08, clamp(uSoftPenumbraWidth, 0.05, 1.0), clamp(uSoftEdgeSoftness, 0.0, 1.0));
  float distanceMask = 1.0 - smoothstep(max(0.0, 1.0 - feather), 1.0, curvedDistance);
  return distanceMask * max(lowerFaceBias(faceId), 0.0);
}

float pleosContactMask(vec3 worldPosition) {
  if (uSoftAreaEnabled == 0) return 1.0;
  float radius = max(uSoftContactRadius, 0.001);
  float centerBlend = smoothstep(0.0, radius, length(worldPosition));
  return 1.0 - clamp(uSoftContactDarkening, 0.0, 1.0) * (1.0 - centerBlend);
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
  vec3 textureColor = baseColor;
  float textureEdge = 0.0;
  float textureDetail = 0.5;
  float textureSheen = 0.0;
  if (uTextureEnabled != 0) {
    textureColor = uTexturePattern == 1
      ? amberFlowSurfaceTexture(vUv, vWorldPosition, textureEdge, textureDetail, textureSheen)
      : pleosSurfaceTexture(vUv, vWorldPosition, vFaceId, textureEdge, textureDetail, textureSheen);
    float textureStrength = clamp(uTextureStrength, 0.0, 1.0);
    baseColor = mix(baseColor, textureColor, textureStrength);
    roughness = mix(roughness, max(0.08, roughness * 0.52), textureStrength * 0.72);
    roughness = clamp(roughness + (0.5 - textureDetail) * uTextureDetailStrength * 0.16, 0.04, 1.0);
  }
  vec3 color = vec3(0.0);
  for (int index = 0; index < 5; index += 1) {
    vec3 toLight = uLightPosition[index] - vWorldPosition;
    float lightDistance = max(length(toLight), 1e-4);
    vec3 lightDirection = toLight / lightDistance;
    float attenuation = 1.0 / (1.0 + max(uLightFalloff[index], 0.0) * lightDistance * lightDistance);
    float influenceRadius = uLightInfluenceRadius[index];
    if (influenceRadius > 0.0 && !(uSoftAreaEnabled != 0 && index == 0)) {
      float influenceDistance = length(vWorldPosition - uLightTarget[index]);
      attenuation *= 1.0 - smoothstep(influenceRadius * 0.68, influenceRadius, influenceDistance);
    }
    vec3 radiance = uLightColor[index] * max(uLightIntensity[index], 0.0) * attenuation;
    vec3 pbr = evaluatePbr(baseColor, normal, viewDirection, lightDirection, radiance, roughness, uDiffuseStrength, uSpecularStrength, uSpecularTint);
    if (uSoftAreaEnabled != 0 && index == 0) {
      // A broad emitter has a stable grazing direction across the form. This
      // prevents a point-light hotspot from drifting away from the center axis.
      vec3 areaLightDirection = safeNormalize(uLightPosition[0] - uLightTarget[0]);
      float rawNdotL = dot(normal, areaLightDirection);
      float angularRadius = clamp(uSoftSourceSize / lightDistance, 0.0, 0.7);
      float wrappedLight = smoothstep(-angularRadius, max(angularRadius, 0.001), rawNdotL);
      float broadDiffuse = wrappedLight * saturate((rawNdotL + angularRadius) / (1.0 + angularRadius));
      if (isLowerLeftFace(vFaceId)) broadDiffuse = max(broadDiffuse, 0.2);
      float grazing = pow(1.0 - abs(clamp(rawNdotL, -1.0, 1.0)), 2.0);
      vec3 areaDiffuse = baseColor * radiance * broadDiffuse * max(uDiffuseStrength, 0.0) / PI;
      areaDiffuse *= 1.0 + grazing * max(uSoftGrazingStrength, 0.0);
      float softMask = pleosSoftIllumination(vWorldPosition, vFaceId) * pleosContactMask(vWorldPosition);
      float areaBlend = isLowerLeftFace(vFaceId) ? 1.0 : 0.88;
      color += mix(pbr, areaDiffuse, areaBlend) * softMask;
    } else {
      float secondaryMask = isLowerLeftFace(vFaceId)
        ? pleosSoftIllumination(vWorldPosition, vFaceId) * pleosContactMask(vWorldPosition)
        : 1.0;
      color += pbr * secondaryMask;
    }
  }

  float nDotV = max(dot(normal, viewDirection), 0.0);
  vec3 reflected = reflect(-viewDirection, normal);
  vec3 diffuseEnvironment = environmentColor(normal);
  vec3 specularEnvironment = environmentColorRough(reflected, roughness);
  vec3 f0 = vec3(0.04) * mix(vec3(1.0), max(uSpecularTint, vec3(0.0)), 0.75);
  vec3 environmentFresnel = fresnelSchlick(nDotV, f0);
  color += diffuseEnvironment * baseColor * max(uAmbientStrength, 0.0);
  color += specularEnvironment * environmentFresnel * max(uSpecularStrength, 0.0);
  if (uSoftAreaEnabled != 0) {
    float ambientMask = isLowerLeftFace(vFaceId) ? max(pleosSoftIllumination(vWorldPosition, vFaceId), 0.025) : 1.0;
    color += baseColor * max(uSoftAmbientIntensity, 0.0) * ambientMask * pleosContactMask(vWorldPosition);
    if (isLowerLeftFace(vFaceId)) {
      // Wide, low-energy grazing fill keeps the convergence-side portion
      // readable even when the direct-light lobe is nearly tangent to a face.
      float grazingFill = pleosSoftIllumination(vWorldPosition, vFaceId) * pleosContactMask(vWorldPosition);
      color += baseColor * max(uSoftGrazingStrength, 0.0) * 0.55 * grazingFill;
    } else {
      float upperShapeFill = pleosSoftIllumination(vWorldPosition, vFaceId);
      color += baseColor * max(uSoftGrazingStrength, 0.0) * 0.13 * upperShapeFill;
    }
  }
  if (uTextureEnabled != 0) {
    float textureStrength = clamp(uTextureStrength, 0.0, 1.0);
    color += textureColor * textureStrength * (0.016 + textureDetail * uTextureDetailStrength * 0.018);
    vec3 causticColor = mix(uTextureHotColor, uTextureSoftColor, smoothstep(0.35, 0.78, textureDetail));
    color += causticColor * textureEdge * max(uTextureEdgeGlow, 0.0) * textureStrength * 0.2;
    float velvetFresnel = pow(1.0 - clamp(nDotV, 0.0, 1.0), 3.0);
    vec3 sheenColor = mix(uTextureAccentColor, uTextureSoftColor, textureSheen);
    color += sheenColor * textureSheen * velvetFresnel
      * max(uTextureSheenStrength, 0.0) * textureStrength * 0.22;
  }
  outColor = vec4(color, 1.0);
}
