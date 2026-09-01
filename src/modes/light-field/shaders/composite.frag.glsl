#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uEmission;
uniform sampler2D uBloomTexture;
uniform vec2 uResolution;
uniform vec3 uBackground;
uniform float uBloom;
uniform float uDither;
uniform float uSeed;
uniform bool uTransparent;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec4 base=texture(uBase,uv);vec3 emission=texture(uEmission,uv).rgb;vec3 bloom=texture(uBloomTexture,uv).rgb;vec3 color=base.rgb+emission+bloom*uBloom*.78;color+=color*color*uBloom*.055;color=pow(max(color,0.0),vec3(.88));color+=(hash12(gl_FragCoord.xy+uSeed)-.5)*(uDither/255.0);if(uTransparent)outColor=vec4(max(color,0.0),base.a);else outColor=vec4(mix(uBackground,max(color,0.0),base.a),1.0);}
