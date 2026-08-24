#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

layout(std140) uniform CameraBlock {
  mat4 uView;
  mat4 uProjection;
  mat4 uViewProjection;
  vec4 uCameraPosition;
};

uniform mat4 uModel;
uniform float uPointSize;

void main() {
  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}
