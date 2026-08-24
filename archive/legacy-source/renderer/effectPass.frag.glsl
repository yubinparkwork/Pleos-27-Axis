precision highp float;
precision highp int;

varying vec2 vUv;
uniform sampler2D uInput;
uniform sampler2D uUploadedTexture;
uniform bool uHasUploadedTexture;
uniform vec2 uDesignSize;
uniform vec2 uOrigin;
uniform vec2 uTop;
uniform vec2 uMainLeft;
uniform vec2 uMainRight;
uniform vec2 uRightDown;
uniform vec2 uSoftDown;
uniform int uEffectType;
uniform int uMask;
uniform float uOpacity;
uniform float uGlobalIntensity;
uniform float uTime;
uniform float uSeed;
uniform vec4 uP0;
uniform vec4 uP1;
uniform vec4 uP2;
uniform vec3 uColorA;
uniform vec3 uColorB;

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float lineDistance(vec2 ray, vec2 q) { return cross2(ray, q) / max(length(ray), 0.0001); }
float rayProgress(vec2 ray, vec2 q) { return dot(q, ray) / max(dot(ray, ray), 0.0001); }
bool wedge(vec2 a, vec2 b, vec2 q) { return cross2(a, q) >= 0.0 && cross2(q, b) >= 0.0; }

int planeId(vec2 p) {
  vec2 q = p - uOrigin;
  vec2 a = uTop - uOrigin;
  vec2 b = uMainRight - uOrigin;
  vec2 c = uRightDown - uOrigin;
  vec2 d = uSoftDown - uOrigin;
  vec2 e = uMainLeft - uOrigin;
  if (wedge(a, b, q)) return 0;
  if (wedge(b, c, q)) return 1;
  if (wedge(c, d, q)) return 2;
  if (wedge(d, e, q)) return 3;
  return 4;
}

float rayDistance(vec2 p, vec2 endpoint) {
  vec2 ray = endpoint - uOrigin;
  vec2 q = p - uOrigin;
  float progress = rayProgress(ray, q);
  if (progress < 0.0) return 100000.0;
  return abs(lineDistance(ray, q));
}

float mainAxisDistance(vec2 p) { return min(rayDistance(p, uMainLeft), rayDistance(p, uMainRight)); }
float topAxisDistance(vec2 p) { return rayDistance(p, uTop); }
float rightAxisDistance(vec2 p) { return rayDistance(p, uRightDown); }
float softFoldDistance(vec2 p) { return rayDistance(p, uSoftDown); }
float allAxisDistance(vec2 p) { return min(min(mainAxisDistance(p), topAxisDistance(p)), min(rightAxisDistance(p), softFoldDistance(p))); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + uSeed * 0.017);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += noise2(p) * a; p = p * 2.03 + vec2(9.7, 13.1); a *= 0.5; }
  return v;
}

float maskWeight(vec2 p, int id) {
  int plane = planeId(p);
  if (uMask == 0) return 1.0;
  if (uMask == 1) return plane == 4 ? 1.0 : 0.0;
  if (uMask == 2) return plane == 0 ? 1.0 : 0.0;
  if (uMask == 3) return plane == 1 ? 1.0 : 0.0;
  if (uMask == 4) return plane == 2 ? 1.0 : 0.0;
  if (uMask == 5) return plane == 3 ? 1.0 : 0.0;
  float d = allAxisDistance(p);
  if (uMask == 7) d = mainAxisDistance(p);
  if (uMask == 8) d = topAxisDistance(p);
  if (uMask == 9) d = rightAxisDistance(p);
  if (uMask == 10) d = softFoldDistance(p);
  return 1.0 - smoothstep(5.0, 100.0, d);
}

vec3 blendValue(vec3 base, vec3 layer, float mode) {
  if (mode < 0.5) return mix(2.0 * base * layer, 1.0 - 2.0 * (1.0 - base) * (1.0 - layer), step(0.5, base));
  if (mode < 1.5) return base + layer;
  return base * layer;
}

float texturePattern(vec2 uv, float kind) {
  if (kind < 0.5) return noise2(uv * 620.0);
  if (kind < 1.5) return fbm(uv * 55.0);
  if (kind < 2.5) return 0.5 + (noise2(vec2(uv.x * 28.0, uv.y * 920.0)) - 0.5) * 0.75;
  if (kind < 3.5) return 0.5 + (fbm(vec2(uv.x * 110.0, uv.y * 18.0)) - 0.5) * 0.8;
  if (kind < 4.5) { float n = fbm(uv * 32.0); return smoothstep(0.38, 0.68, abs(n - 0.5) * 2.0); }
  if (kind < 5.5) return 0.5 + 0.5 * sin(uv.y * 900.0);
  if (kind < 6.5) return step(0.91, noise2(uv * 260.0));
  return fbm(vec2(uv.x * 16.0, uv.y * 180.0));
}

float axisSweep(vec2 p, vec2 endpoint, float phase, float width, float softness, float falloff) {
  vec2 ray = endpoint - uOrigin; vec2 q = p - uOrigin;
  float progress = rayProgress(ray, q);
  float pulse = 1.0 - smoothstep(width, width + softness * width, abs(fract(progress * uP1.z - phase) - 0.5));
  float proximity = exp(-abs(lineDistance(ray, q)) / max(8.0, falloff * 90.0));
  return pulse * proximity * step(0.0, progress);
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2(uv.x, 1.0 - uv.y) * uDesignSize;
  vec4 source = texture2D(uInput, uv);
  vec3 base = source.rgb;
  vec3 affected = base;

  if (uEffectType == 1) {
    float animateOffset = uP1.z > 0.5 ? uTime * 0.3 : 0.0;
    float grain = noise2((p / max(uP0.x, 0.1)) + uSeed + animateOffset);
    grain = clamp((grain - 0.5) * uP0.z + 0.5, 0.0, 1.0);
    vec3 layer = uP1.x > 0.5 ? vec3(grain) : vec3(grain, noise2(p * 0.37 + uSeed), noise2(p * 0.71 - uSeed));
    vec3 blended = blendValue(base, layer, uP1.y);
    affected = mix(base, blended, uP0.y);
  } else if (uEffectType == 2) {
    float angle = radians(uP0.z); mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 tuv = rot * (uv - 0.5) + 0.5 + uP0.zw * 0.0;
    tuv = tuv * vec2(uP0.x, uP0.y) + uP1.xy;
    float pattern = texturePattern(tuv, uP2.x);
    if (uHasUploadedTexture && uP2.y > 0.5) pattern = dot(texture2D(uUploadedTexture, fract(tuv)).rgb, vec3(0.299, 0.587, 0.114));
    if (uP2.z > 0.5) pattern = 1.0 - pattern;
    pattern = clamp((pattern - 0.5) * uP1.w + 0.5, 0.0, 1.0);
    affected = mix(base, blendValue(base, vec3(pattern), uP2.w), uP1.z);
  } else if (uEffectType == 3) {
    float phase = fract(0.5 + uTime * uP1.x * uP1.y);
    float light = 0.0;
    if (uP2.x < 0.5 || uP2.x > 3.5) light += axisSweep(p, uMainRight, phase, uP0.x, uP0.y, uP1.w) + axisSweep(p, uMainLeft, phase, uP0.x, uP0.y, uP1.w);
    if (uP2.x > 0.5 && uP2.x < 1.5 || uP2.x > 3.5) light += axisSweep(p, uTop, phase, uP0.x, uP0.y, uP1.w);
    if (uP2.x > 1.5 && uP2.x < 2.5 || uP2.x > 3.5) light += axisSweep(p, uRightDown, phase, uP0.x, uP0.y, uP1.w);
    if (uP2.x > 2.5 && uP2.x < 3.5 || uP2.x > 3.5) light += axisSweep(p, uSoftDown, phase, uP0.x, uP0.y, uP1.w);
    float lumaRespect = smoothstep(0.005, 0.16, dot(base, vec3(0.299, 0.587, 0.114)));
    affected = base + vec3(light * uP0.z * lumaRespect);
  } else if (uEffectType == 4) {
    float a = radians(uP0.z); vec2 dir = vec2(cos(a), sin(a));
    float directional = dot(normalize((p - uOrigin) / uDesignSize), dir) * 0.5 + 0.5;
    float radial = exp(-length((p - uOrigin) / uDesignSize) * uP1.x);
    affected = (base - 0.5) * uP0.y + 0.5 + vec3(uP0.x * mix(directional, radial, uP0.w));
  } else if (uEffectType == 5) {
    float a = radians(uP0.z); vec2 dir = vec2(cos(a), sin(a));
    float motion = uP1.z > 0.5 ? uTime * uP1.x : 0.0;
    float n = fbm(p / uDesignSize * uP0.y * uP0.w + motion);
    float attract = exp(-mainAxisDistance(p) / 180.0) * uP1.y;
    vec2 displaced = uv + dir * (n - 0.5) * uP0.x * (1.0 + attract);
    affected = texture2D(uInput, clamp(displaced, 0.0, 1.0)).rgb;
  } else if (uEffectType == 6) {
    float metric = uP2.x < 0.5 ? length(p - uOrigin) : allAxisDistance(p);
    float motion = uP2.y > 0.5 ? uTime * uP1.y * uP0.x : 0.0;
    float cell = abs(mod(metric + motion, uP0.x) - uP0.x * 0.5);
    float contour = 1.0 - smoothstep(uP0.y, uP0.y + uP0.z, cell);
    affected = base + vec3(contour * uP1.x);
  } else if (uEffectType == 7) {
    vec2 cell = floor(gl_FragCoord.xy / max(uP0.x, 1.0));
    float threshold = hash21(cell);
    if (uP1.x < 0.5) threshold = mod(cell.x + cell.y * 2.0, 4.0) / 4.0;
    if (uP1.x > 0.5 && uP1.x < 1.5) threshold = mod(cell.x * 3.0 + cell.y * 5.0, 8.0) / 8.0;
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    float bit = step(threshold * uP0.z, luma);
    vec3 quantized = uP1.y > 0.5 ? base * mix(0.72, 1.22, bit) : vec3(bit);
    affected = mix(base, quantized, uP0.y);
  } else if (uEffectType == 8) {
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    vec3 mapped = mix(uColorA, uColorB, luma);
    if (uP0.x < 0.5) mapped = vec3(luma);
    if (uP0.x > 2.5) mapped = vec3(texture2D(uInput, uv + vec2(uP1.x, 0.0)).r, base.g, texture2D(uInput, uv - vec2(uP1.x, 0.0)).b);
    affected = mix(base, mapped, uP0.w);
  }

  float weight = clamp(maskWeight(p, planeId(p)) * uOpacity * uGlobalIntensity, 0.0, 1.0);
  gl_FragColor = vec4(mix(base, clamp(affected, 0.0, 1.0), weight), source.a);
}
