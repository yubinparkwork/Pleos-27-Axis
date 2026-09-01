#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uDirection;
uniform float uRadius;
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec2 s=uDirection/uResolution*mix(1.0,3.4,uRadius);vec3 c=texture(uTexture,uv).rgb*.227027;c+=texture(uTexture,uv+s*1.384615).rgb*.316216;c+=texture(uTexture,uv-s*1.384615).rgb*.316216;c+=texture(uTexture,uv+s*3.230769).rgb*.070270;c+=texture(uTexture,uv-s*3.230769).rgb*.070270;outColor=vec4(c,1.0);}
