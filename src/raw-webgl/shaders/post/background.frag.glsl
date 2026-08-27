#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform vec3 uBackgroundColor;
uniform float uBackgroundExposure;
uniform float uBackgroundAlpha;
uniform float uAspect;

#include <math>
#include <environment>

void main() {
  vec2 centered = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec3 direction = safeNormalize(vec3(centered, 1.45));
  float vignette = 1.0 - smoothstep(0.15, 1.65, length(centered));
  vec3 environment = environmentColor(direction) * 0.16;
  vec3 color = uBackgroundColor * uBackgroundExposure + environment;
  color *= 0.62 + 0.38 * vignette;
  outColor = vec4(color, saturate(uBackgroundAlpha));
}
