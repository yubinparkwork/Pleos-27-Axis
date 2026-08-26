#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform vec2 uInverseResolution;
uniform vec2 uDirection;
uniform float uRadius;
uniform float uThreshold;
uniform int uPrefilter;

vec3 softThreshold(vec3 color) {
  float brightness = max(color.r, max(color.g, color.b));
  float knee = max(uThreshold * 0.55, 0.03);
  return color * smoothstep(uThreshold - knee, uThreshold + knee, brightness);
}

void main() {
  if (uPrefilter == 1) {
    vec2 stepSize = uInverseResolution * 1.5;
    vec3 color = texture(uSource, vUv).rgb * 0.4;
    color += texture(uSource, vUv + vec2( stepSize.x,  stepSize.y)).rgb * 0.15;
    color += texture(uSource, vUv + vec2(-stepSize.x,  stepSize.y)).rgb * 0.15;
    color += texture(uSource, vUv + vec2( stepSize.x, -stepSize.y)).rgb * 0.15;
    color += texture(uSource, vUv + vec2(-stepSize.x, -stepSize.y)).rgb * 0.15;
    outColor = vec4(softThreshold(color), 1.0);
    return;
  }

  vec2 offset = uDirection * uInverseResolution * max(uRadius, 0.0);
  vec3 color = texture(uSource, vUv).rgb * 0.2270270270;
  color += texture(uSource, vUv + offset * 1.3846153846).rgb * 0.3162162162;
  color += texture(uSource, vUv - offset * 1.3846153846).rgb * 0.3162162162;
  color += texture(uSource, vUv + offset * 3.2307692308).rgb * 0.0702702703;
  color += texture(uSource, vUv - offset * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(color, 1.0);
}
