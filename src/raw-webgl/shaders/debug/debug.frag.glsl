#version 300 es
precision highp float;

layout(location = 0) out vec4 outColor;
uniform vec3 uColor;
uniform int uPrimitiveMode;

void main() {
  if (uPrimitiveMode == 1) {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    if (dot(point, point) > 1.0) discard;
  }
  outColor = vec4(uColor, 1.0);
}
