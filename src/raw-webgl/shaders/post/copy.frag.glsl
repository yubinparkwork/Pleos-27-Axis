#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;
uniform sampler2D uSource;

void main() { outColor = texture(uSource, vUv); }
