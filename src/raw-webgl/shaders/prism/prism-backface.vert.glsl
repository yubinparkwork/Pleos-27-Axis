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
out vec3 vWorldPosition;

void main() {
  vec4 worldPosition = uModel * vec4(aPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = uViewProjection * worldPosition;
}
