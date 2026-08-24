#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform float uExposure;
uniform float uContrast;
uniform float uWhitePoint;
uniform float uBlackLift;
uniform int uToneMapping;
uniform float uDitherStrength;

#include <color-space>
#include <tone-mapping>
#include <dithering>

void main() {
  vec4 source = texture(uSource, vUv);
  vec3 color = source.rgb * exp2(uExposure);
  color = uToneMapping == 1 ? acesFitted(color) : neutralToneMap(color, uWhitePoint);
  color = (color - 0.5) * uContrast + 0.5 + uBlackLift;
  color = linearToSrgb(max(color, vec3(0.0)));
  color = applyDither(color, gl_FragCoord.xy, uDitherStrength);
  outColor = vec4(color, source.a);
}
