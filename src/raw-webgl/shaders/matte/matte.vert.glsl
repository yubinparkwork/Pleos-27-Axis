#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in uint aFaceId;

layout(std140) uniform CameraBlock {
  mat4 uView;
  mat4 uProjection;
  mat4 uViewProjection;
  vec4 uCameraPosition;
};

uniform mat4 uModel;

out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec2 vUv;
flat out uint vFaceId;

void main() {
  vec4 worldPosition = uModel * vec4(aPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(transpose(inverse(uModel))) * aNormal);
  vUv = aUv;
  vFaceId = aFaceId;
  gl_Position = uViewProjection * worldPosition;
}
