#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uInverseResolution;

float edgeLuma(vec4 color) {
  return dot(color.rgb * color.a, vec3(0.299, 0.587, 0.114));
}

vec4 premultiply(vec4 color) {
  return vec4(color.rgb * color.a, color.a);
}

vec4 unpremultiply(vec4 color, vec3 transparentFallback) {
  return vec4(color.a > 1e-5 ? color.rgb / color.a : transparentFallback, color.a);
}

void main() {
  vec4 center = texture(uSource, vUv);
  vec4 north = texture(uSource, vUv + vec2(0.0, uInverseResolution.y));
  vec4 south = texture(uSource, vUv - vec2(0.0, uInverseResolution.y));
  vec4 east = texture(uSource, vUv + vec2(uInverseResolution.x, 0.0));
  vec4 west = texture(uSource, vUv - vec2(uInverseResolution.x, 0.0));
  float lumaCenter = edgeLuma(center);
  float lumaNorth = edgeLuma(north);
  float lumaSouth = edgeLuma(south);
  float lumaEast = edgeLuma(east);
  float lumaWest = edgeLuma(west);
  float rangeMin = min(lumaCenter, min(min(lumaNorth, lumaSouth), min(lumaEast, lumaWest)));
  float rangeMax = max(lumaCenter, max(max(lumaNorth, lumaSouth), max(lumaEast, lumaWest)));
  float range = rangeMax - rangeMin;
  if (range < max(0.0312, rangeMax * 0.125)) {
    outColor = center;
    return;
  }

  vec2 direction = vec2(-(lumaNorth - lumaSouth), lumaEast - lumaWest);
  direction = clamp(
    direction / max(abs(direction.x) + abs(direction.y), 1e-4),
    vec2(-1.0),
    vec2(1.0)
  );
  vec4 sampleA = texture(uSource, vUv + direction * uInverseResolution * 0.5);
  vec4 sampleB = texture(uSource, vUv - direction * uInverseResolution * 0.5);
  vec4 filtered = premultiply(center) * 0.5
    + premultiply(sampleA) * 0.25
    + premultiply(sampleB) * 0.25;
  outColor = unpremultiply(filtered, center.rgb);
}
