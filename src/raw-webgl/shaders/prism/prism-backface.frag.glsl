#version 300 es
precision highp float;

in vec3 vWorldPosition;
layout(location = 0) out vec4 outPosition;

uniform vec3 uBoundsCenter;
uniform vec3 uBoundsHalfExtent;

void main() {
  vec3 safeExtent = max(uBoundsHalfExtent, vec3(1e-5));
  vec3 encodedPosition = (vWorldPosition - uBoundsCenter) / (safeExtent * 2.0) + 0.5;
  outPosition = vec4(clamp(encodedPosition, vec3(0.0), vec3(1.0)), 1.0);
}
