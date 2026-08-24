precision highp float;
varying vec2 vUv;
uniform sampler2D uInput;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform bool uBloom;
uniform float uBloomStrength;
uniform float uBloomThreshold;
uniform bool uVignette;
uniform float uVignetteAmount;
uniform bool uFilmGrain;
uniform float uGrainAmount;
uniform bool uDither;
uniform float uDitherAmount;
uniform bool uChromatic;
uniform float uChromaticAmount;
uniform float uContrast;
uniform float uExposure;
uniform bool uDof;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxBlur;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }

void main() {
  vec2 texel = 1.0 / uResolution;
  vec4 source = texture2D(uInput, vUv);
  vec3 color = source.rgb;
  if (uDof) {
    float depth = texture2D(uDepth, vUv).r;
    float radius = min(uMaxBlur, abs(depth - uFocus) * uAperture) * 70.0;
    vec3 blur = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * .785398; blur += texture2D(uInput, vUv + vec2(cos(a), sin(a)) * radius).rgb; }
    color = mix(color, blur / 8.0, smoothstep(0.0, .002, radius));
  }
  if (uBloom) {
    vec3 bloom = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * .785398; vec3 s = texture2D(uInput, vUv + vec2(cos(a), sin(a)) * texel * 8.0).rgb; bloom += s * smoothstep(uBloomThreshold, 1.0, luma(s)); }
    color += bloom / 8.0 * uBloomStrength;
  }
  if (uChromatic) color = vec3(texture2D(uInput, vUv + vec2(uChromaticAmount, 0.0)).r, color.g, texture2D(uInput, vUv - vec2(uChromaticAmount, 0.0)).b);
  color *= exp2(uExposure); color = (color - .5) * uContrast + .5;
  if (uVignette) { float d = length(vUv - .5) * 1.42; color *= 1.0 - smoothstep(.35, 1.0, d) * uVignetteAmount; }
  if (uFilmGrain) color += (hash(gl_FragCoord.xy + uTime) - .5) * uGrainAmount;
  if (uDither) color += (hash(floor(gl_FragCoord.xy)) - .5) * uDitherAmount / 255.0;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
