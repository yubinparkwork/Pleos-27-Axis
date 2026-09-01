#version 300 es
precision highp float;
layout(location=0) out vec4 outBase;
layout(location=1) out vec4 outEmission;

uniform vec2 uResolution;
uniform vec2 uAnchor;
uniform vec2 uAxis0;
uniform vec2 uAxis1;
uniform vec2 uAxis2;
uniform float uTime;
uniform float uSeed;
uniform float uScale;
uniform float uMassScale;
uniform float uCubeGap;
uniform float uBevel;
uniform float uMembraneScale;
uniform float uFoldFrequency;
uniform float uVoidSize;
uniform float uRimWidth;
uniform float uEchoStrength;
uniform float uMotionStrength;
uniform float uAsymmetry;
uniform float uDepth;
uniform float uCenterBias;
uniform float uWarp;
uniform float uContactShadow;
uniform float uDarkness;
uniform float uViolet;
uniform float uMagenta;
uniform float uCyan;
uniform float uGreen;
uniform float uWhiteCore;
uniform float uSaturation;

#define TAU 6.28318530718

struct CubeHit {
  float valid;
  float depth;
  vec3 local;
  vec3 normal;
  vec3 localNormal;
  float index;
};

float roundedBoxDistance(vec3 p, float radius) {
  vec3 q = abs(p - .5) - (vec3(.5) - radius);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - radius;
}

CubeHit intersectCube(vec2 p, mat3 basis, vec3 translation, float index) {
  mat3 ib = inverse(basis);
  vec3 ro = ib * (vec3(p, -4.0) - translation);
  vec3 rd = ib * vec3(0.0, 0.0, 1.0);
  vec3 invd = 1.0 / rd;
  vec3 n = min((vec3(0.0) - ro) * invd, (vec3(1.0) - ro) * invd);
  vec3 f = max((vec3(0.0) - ro) * invd, (vec3(1.0) - ro) * invd);
  float tn = max(max(n.x, n.y), n.z);
  float tf = min(min(f.x, f.y), f.z);
  float radius = clamp(uBevel, .0001, .24);
  float entry = max(tn, 0.0);
  float found = 0.0;
  for (int stepIndex = 0; stepIndex < 14; stepIndex++) {
    float distance = roundedBoxDistance(ro + rd * entry, radius);
    if (distance < .0006) { found = 1.0; break; }
    entry += max(distance, .0006);
  }
  CubeHit h;
  h.valid = step(max(tn, 0.0), tf) * found * step(entry, tf);
  h.depth = entry;
  h.local = ro + rd * entry;
  h.index = index;
  vec3 e = vec3(.001, 0, 0);
  vec3 ln = normalize(vec3(
    roundedBoxDistance(h.local + e.xyy, radius) - roundedBoxDistance(h.local - e.xyy, radius),
    roundedBoxDistance(h.local + e.yxy, radius) - roundedBoxDistance(h.local - e.yxy, radius),
    roundedBoxDistance(h.local + e.yyx, radius) - roundedBoxDistance(h.local - e.yyx, radius)
  ));
  h.localNormal = ln;
  h.normal = normalize(transpose(ib) * ln);
  return h;
}

vec3 iridescentPalette(float phase) {
  vec3 violet = vec3(.32, .03, 1.0) * uViolet;
  vec3 magenta = vec3(1.0, .035, .48) * uMagenta;
  vec3 cyan = vec3(.02, .68, 1.0) * uCyan;
  vec3 green = vec3(.05, 1.0, .46) * uGreen;
  float p = fract(phase);
  vec3 color = mix(violet, magenta, smoothstep(0.0, .34, p));
  color = mix(color, cyan, smoothstep(.28, .65, p));
  color = mix(color, green, smoothstep(.62, 1.0, p));
  float luminance = dot(color, vec3(.2126, .7152, .0722));
  return mix(vec3(luminance), color, uSaturation);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - uAnchor) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0 / max(uScale, .001);
  float span = .58 * uMassScale;
  float depth = span * .70710678;
  vec3 a = vec3(cos(.5235987756) * span, sin(.5235987756) * span, depth);
  vec3 b = vec3(0.0, span, -depth);
  vec3 c = vec3(-cos(.5235987756) * span, sin(.5235987756) * span, depth);
  mat3 basis = mat3(a, b, c);
  vec2 gapDirections[3] = vec2[3](vec2(0.0, 1.0), vec2(-.8660254, -.5), vec2(.8660254, -.5));
  vec3 translations[3] = vec3[3](
    vec3(gapDirections[0] * uCubeGap, 0.0),
    -a - b + vec3(gapDirections[1] * uCubeGap, 0.0),
    -b - c + vec3(gapDirections[2] * uCubeGap, 0.0)
  );

  CubeHit h0 = intersectCube(p, basis, translations[0], 0.0);
  CubeHit h1 = intersectCube(p, basis, translations[1], 1.0);
  CubeHit h2 = intersectCube(p, basis, translations[2], 2.0);
  CubeHit h = h0;
  if (h1.valid > .5 && (h.valid < .5 || h1.depth < h.depth)) h = h1;
  if (h2.valid > .5 && (h.valid < .5 || h2.depth < h.depth)) h = h2;
  if (h.valid < .5) { outBase = vec4(0.0); outEmission = vec4(0.0); return; }

  int cubeIndex = int(h.index);
  vec3 world = translations[cubeIndex] + basis * h.local;
  vec2 axes[3] = vec2[3](uAxis1, uAxis2, uAxis0);
  vec2 axis = normalize(axes[cubeIndex]);
  vec2 side = vec2(-axis.y, axis.x);
  float phase = TAU * uTime;
  float seedPhase = fract(uSeed * .00137) * TAU;
  vec3 surface = (world + h.normal * span * .04) / max(span, .001);
  float axisCoord = dot(surface.xy, axis);
  float sideCoord = dot(surface.xy, side);

  // A loopable, low-frequency membrane field replaces the former linear
  // gradient. World-space coordinates keep the color flow continuous when a
  // band crosses a rounded edge or moves from one visible face to another.
  float frequency = uFoldFrequency * uMembraneScale;
  float flow = axisCoord * frequency * 1.12 - phase * (.52 + .24 * uMotionStrength);
  float crossWave = sin(sideCoord * frequency * 1.34 + phase * .73 + seedPhase);
  float depthWave = cos((surface.z * 1.17 + sideCoord * .34) * frequency - phase * .61);
  float diagonalWave = sin((surface.x - surface.y + surface.z * .72) * frequency * .78 + phase * .43 + h.index * .37);
  float junctionPull = dot(world.xy, -axis) / max(span, .001);
  float warped = flow
    + crossWave * uWarp * 1.34
    + depthWave * uWarp * .86
    + diagonalWave * uAsymmetry * .72
    + junctionPull * uCenterBias * .46;

  float pulse = .5 + .5 * cos(phase);
  float breathingThreshold = mix(-.42, .16, pulse * uMotionStrength);
  float membraneSdf = sin(warped) * .66 + cos(warped * .53 + sideCoord * 1.9 - phase * .27) * .34 - breathingThreshold;
  float bodySoftness = mix(.18, .07, uDepth);
  float body = smoothstep(-bodySoftness, bodySoftness, membraneSdf + (1.0 - uVoidSize) * .34);
  float voidCut = smoothstep(uVoidSize + .18, uVoidSize - .08, abs(membraneSdf + .14 * crossWave));
  body *= mix(.38, 1.0, voidCut);

  float rimWidth = max(.018, uRimWidth);
  float whiteRim = exp(-pow(membraneSdf / rimWidth, 2.0));
  float echoDistance = abs(abs(membraneSdf) - (.24 + .12 * sin(phase * .5)));
  float contourEcho = exp(-pow(echoDistance / (rimWidth * .58 + .012), 2.0)) * uEchoStrength;
  float colorPhase = warped / TAU + .12 * sin(sideCoord * 2.7 - phase * .38);
  vec3 spectral = iridescentPalette(colorPhase);
  vec3 secondary = iridescentPalette(colorPhase + .28);

  float edgeDistance = min(min(h.local.x, 1.0 - h.local.x), min(min(h.local.y, 1.0 - h.local.y), min(h.local.z, 1.0 - h.local.z)));
  float bevelHighlight = exp(-edgeDistance * mix(28.0, 8.0, clamp(uBevel * 4.0, 0.0, 1.0)));
  vec3 lightDirection = normalize(vec3(-.46, .73, -.5));
  float lambert = .14 + .86 * max(dot(h.normal, lightDirection), 0.0);
  float fresnel = pow(1.0 - abs(h.normal.z), 2.4);
  float junctionDistance = length(world.xy);
  float contact = exp(-junctionDistance * junctionDistance / (span * span * .075)) * uContactShadow;

  vec3 glass = mix(vec3(.006, .008, .018), vec3(.025, .018, .055), h.index * .18 + .18);
  glass *= mix(.42, 1.28, lambert) * mix(.58, 1.38, uDepth);
  glass += vec3(.055, .07, .15) * (bevelHighlight * .22 + fresnel * .16);
  glass *= 1.18 * (1.0 - uDarkness * .68);
  glass *= 1.0 - contact * .58;

  vec3 colorLayer = mix(secondary * .34, spectral, body);
  vec3 base = glass + colorLayer * body * (.12 + .24 * lambert);
  base *= mix(.5, 1.0, body + whiteRim * .45);

  vec3 emission = spectral * body * (.24 + .48 * uMotionStrength);
  emission += secondary * contourEcho * .48;
  emission += vec3(1.0) * whiteRim * uWhiteCore * (1.18 + fresnel * .9);
  emission += spectral * bevelHighlight * (.08 + .22 * fresnel);
  emission *= mix(.54, 1.22, pulse * uMotionStrength + (1.0 - uMotionStrength) * .5);

  outBase = vec4(max(base, 0.0), 1.0);
  outEmission = vec4(max(emission, 0.0), 1.0);
}
