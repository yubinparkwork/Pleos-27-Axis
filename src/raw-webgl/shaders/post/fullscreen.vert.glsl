#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = position;
  // Expand the three generated vertices beyond the clip-space corners so a
  // single triangle covers the complete viewport, not only its lower half.
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
