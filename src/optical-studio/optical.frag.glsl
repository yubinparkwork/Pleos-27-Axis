#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec2 uTileOrigin;
uniform vec2 uJitter;
uniform vec3 uCenters[3];
uniform float uHalf;
uniform float uBevel;
uniform float uIOR;
uniform float uDispersion;
uniform float uRoughness;
uniform float uSurfaceCurvature;
uniform float uReflection;
uniform float uAbsorption;
uniform float uLightIntensity;
uniform float uSpread;
uniform vec3 uLightColor;
uniform bool uLightCycle;
uniform vec3 uCycleColors[3];
uniform vec3 uCycleWeights;
uniform float uExposure;
uniform float uZoom;
uniform float uPhase;
uniform float uSpeed;
uniform vec3 uCamera;
uniform vec3 uRight;
uniform vec3 uUp;
uniform int uBounces;
uniform vec3 uDimensions;
uniform vec3 uLayerSpacing;
uniform float uLayerSoftness;
uniform float uLayerFalloff;
uniform bool uHDR;

uniform float uRayEpsilon;
#define EPS uRayEpsilon
const float FAR = 100.0;

float boxSDF(vec3 p) {
  vec3 q = abs(p) - vec3(uHalf - uBevel);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - uBevel;
}

vec3 boxNormal(vec3 p) {
  vec3 q = abs(p) - vec3(uHalf - uBevel);
  vec3 outside = max(q, 0.0);
  if (dot(outside, outside) > 1e-12) return normalize(outside) * sign(p);
  if (q.x > q.y && q.x > q.z) return vec3(sign(p.x), 0, 0);
  if (q.y > q.z) return vec3(0, sign(p.y), 0);
  return vec3(0, 0, sign(p.z));
}

// A smooth optical surface-figure normal, analogous to a gently polished lens
// face. It is an art-directable shading-normal approximation, not deformation
// of the Axis silhouette. Geometric normals still determine medium and offsets.
vec3 opticalNormal(vec3 p, vec3 geometricNormal) {
  vec3 tangent = p / uHalf;
  tangent -= geometricNormal * dot(tangent, geometricNormal);
  return normalize(geometricNormal + tangent * uSurfaceCurvature);
}

// Exact rounded-box patches: six planes, twelve quarter cylinders, eight
// sphere octants. Unlike a bounded sphere-march this cannot run out of steps
// on grazing internal rays and arbitrarily replace a reflection with black.
float intersectRoundedExact(vec3 ro, vec3 rd, int id) {
  vec3 p = ro - uCenters[id];
  vec3 inv = 1.0 / (sign(rd + vec3(1e-20)) * max(abs(rd), vec3(1e-8)));
  vec3 a = (-vec3(uHalf) - p) * inv;
  vec3 b = (vec3(uHalf) - p) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  float nearT = max(lo.x, max(lo.y, lo.z));
  float farT = min(hi.x, min(hi.y, hi.z));
  if (farT < max(nearT, EPS)) return FAR;
  if (uBevel < 0.000001) return nearT > EPS ? nearT : farT;
  float inner = uHalf - uBevel;
  float best = FAR;
  for (int axis = 0; axis < 3; ++axis) {
    int a = (axis + 1) % 3, b = (axis + 2) % 3;
    for (int side = 0; side < 2; ++side) {
      float s = side == 0 ? -1.0 : 1.0;
      if (abs(rd[axis]) > 1e-8) {
        float t = (s * uHalf - p[axis]) / rd[axis];
        vec3 h = p + t * rd;
        if (t > EPS && t < best && max(abs(h[a]), abs(h[b])) <= inner + 1e-6) best = t;
      }
    }
    for (int sa = 0; sa < 2; ++sa) for (int sb = 0; sb < 2; ++sb) {
      vec2 signs = vec2(sa == 0 ? -1.0 : 1.0, sb == 0 ? -1.0 : 1.0);
      vec2 q = vec2(p[a], p[b]) - signs * inner;
      vec2 d = vec2(rd[a], rd[b]);
      float aa = dot(d, d), bb = dot(q, d), cc = dot(q, q) - uBevel * uBevel;
      float disc = bb * bb - aa * cc;
      if (aa < 1e-10 || disc < 0.0) continue;
      float root = sqrt(max(0.0, disc));
      for (int k = 0; k < 2; ++k) {
        float t = (-bb + (k == 0 ? -root : root)) / aa;
        vec3 h = p + t * rd;
        vec2 quadrant = vec2(h[a], h[b]) * signs;
        if (t > EPS && t < best && abs(h[axis]) <= inner + 1e-6 && min(quadrant.x, quadrant.y) >= inner - 1e-6) best = t;
      }
    }
  }
  for (int corner = 0; corner < 8; ++corner) {
    vec3 signs = vec3((corner & 1) == 0 ? -1.0 : 1.0, (corner & 2) == 0 ? -1.0 : 1.0, (corner & 4) == 0 ? -1.0 : 1.0);
    vec3 q = p - signs * inner;
    float b = dot(q, rd), c = dot(q, q) - uBevel * uBevel;
    float disc = b * b - c;
    if (disc < 0.0) continue;
    float root = sqrt(max(0.0, disc));
    for (int k = 0; k < 2; ++k) {
      float t = -b + (k == 0 ? -root : root);
      vec3 h = (p + t * rd) * signs;
      if (t > EPS && t < best && min(h.x, min(h.y, h.z)) >= inner - 1e-6) best = t;
    }
  }
  return best;
}

// Fast distance steps for ordinary rays; exact patches are the fallback, never
// a black miss just because the iteration budget expired. Newton refinement
// stabilizes normals near the edge/corner transition before a secondary bounce.
float intersectCube(vec3 ro, vec3 rd, int id) {
  vec3 p = ro - uCenters[id];
  vec3 inv = 1.0 / (sign(rd + vec3(1e-20)) * max(abs(rd), vec3(1e-8)));
  vec3 a = (-vec3(uHalf) - p) * inv, b = (vec3(uHalf) - p) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  float nearT = max(lo.x, max(lo.y, lo.z)), farT = min(hi.x, min(hi.y, hi.z));
  if (farT < max(nearT, EPS)) return FAR;
  if (uBevel < .000001) return nearT > EPS ? nearT : farT;
  float t = max(nearT, 0.0);
  for (int stepIndex = 0; stepIndex < 32; ++stepIndex) {
    float signedDistance = boxSDF(p + t * rd);
    float distance = abs(signedDistance);
    if (distance < EPS * .4 && t > EPS) {
      float slope = dot(boxNormal(p + t * rd), rd);
      if (abs(slope) > .025) t = clamp(t - signedDistance / slope, max(nearT, EPS), farT);
      return t;
    }
    t += max(distance, EPS * .5);
    if (t > farT + EPS) return FAR;
  }
  return intersectRoundedExact(ro, rd, id);
}

float sceneHit(vec3 ro, vec3 rd, out int id) {
  float nearest = FAR; id = -1;
  for (int i = 0; i < 3; ++i) {
    float t = intersectCube(ro, rd, i);
    if (t < nearest) { nearest = t; id = i; }
  }
  return nearest;
}

vec3 srgbToLinear(vec3 x) { return mix(x / 12.92, pow((x + .055) / 1.055, vec3(2.4)), step(vec3(.04045), x)); }

// Four shaped studio strips, not RGB stripes repeated on every environment face.
// Light colour belongs to the emitter; the three solids remain clear dielectrics.
vec3 environment(vec3 ro, vec3 rd, float coneWidth) {
  vec3 result = vec3(0.0);
  vec3 lightColour = srgbToLinear(uLightColor);
  for (int i = 0; i < 4; ++i) {
    float f = float(i);
    float phase = uPhase + f * 1.57079633;
    vec3 c;
    if (i == 0) c = vec3(7.0, -3.5, -6.0);
    else if (i == 1) c = vec3(-7.0, 6.0, -4.0);
    else if (i == 2) c = vec3(-5.0, -7.0, 6.0);
    else c = vec3(6.0, 6.5, 6.0);
    c += vec3(sin(phase), cos(phase + .4), sin(phase + 1.3)) * uSpeed * .65;
    vec3 normal = normalize(-c);
    vec3 right = normalize(cross(normal, abs(normal.y) > .9 ? vec3(0,0,1) : vec3(0,1,0)));
    vec3 up = cross(right, normal);
    float denom = dot(rd, normal);
    if (abs(denom) < .0001) continue;
    float t = dot(c - ro, normal) / denom;
    if (t < .001) continue;
    vec3 hit = ro + t * rd - c;
    float turn = .16 * sin(phase + .8) * uSpeed + (i == 2 ? 1.1 : -.2);
    vec2 p = vec2(dot(hit, right), dot(hit, up));
    p = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p;
    p /= vec2(4.5 * uSpread, 5.4);
    float x = p.x + .16 * p.y * p.y;
    float footprint = min(.8, coneWidth * t / (4.5 * uSpread));
    float width = sqrt(.55 * .55 + footprint * footprint + uRoughness * uRoughness);
    float ribbon = exp(-x*x/(width*width)) * .55/width;
    float shoulder = exp(-x*x/(width*width*3.5)) * .28;
    float lengthMask = exp(-pow(abs(p.y)*.72, 4.0));
    vec3 illumination = lightColour * (ribbon + shoulder);
    if (uLightCycle) {
      // Three spatially separate coloured ribbons per studio card. The green
      // ribbon retains the approved centre, red/blue flank it. Integrating each
      // translated profile gives the same power: weights sum to one. This is
      // incident radiance evaluated along real reflected/refracted rays, never
      // a screen-space fill or an animated material colour.
      vec3 distances = vec3(x + 1.65, x, x - 1.65);
      vec3 profiles = exp(-distances * distances / (width * width)) * (.55 / width)
        + exp(-distances * distances / (width * width * 3.5)) * .28;
      profiles *= uCycleWeights;
      illumination = uCycleColors[0] * profiles.r + uCycleColors[1] * profiles.g + uCycleColors[2] * profiles.b;
    }
    result += illumination * lengthMask * (i == 0 ? 2.8 : i == 3 ? .35 : 2.2);
  }
  // Fixed negative-fill apertures in the studio rig. These black flags face
  // the eight body diagonals, leaving off-axis strips around them. Their
  // visibility depends only on the world-space light direction, never on a
  // screen mask or a cube's surface colour. Broad faces see dark cards while
  // curved bevels can reflect the illuminated shoulders around those cards.
  float flagDistance = length(abs(normalize(rd)) - vec3(.577350269));
  float negativeFill = mix(.003, 1.0, smoothstep(.075, .32, flagDistance));
  return result * negativeFill * uLightIntensity;
}

float fresnel(float cosI, float etaI, float etaT) {
  cosI = clamp(cosI, 0.0, 1.0);
  float sinT2 = pow(etaI / etaT, 2.0) * max(0.0, 1.0 - cosI * cosI);
  if (sinT2 >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sinT2);
  float rs = (etaI * cosI - etaT * cosT) / max(etaI * cosI + etaT * cosT, 1e-6);
  float rp = (etaT * cosI - etaI * cosT) / max(etaT * cosI + etaI * cosT, 1e-6);
  return .5 * (rs * rs + rp * rp);
}

// A secondary transmitted branch can pass through neighbouring cubes. Its own
// reflection tree is bounded, while the primary internal-reflection family is explicit.
float throughScene(vec3 ro, vec3 rd, float ior, int channel, float coneWidth) {
  float energy = 1.0, radiance = 0.0;
  for (int i = 0; i < 8; ++i) {
    int id; float t = sceneHit(ro, rd, id);
    if (id < 0) return radiance + energy * environment(ro, rd, coneWidth)[channel];
    vec3 p = ro + t * rd;
    vec3 outward = boxNormal(p - uCenters[id]);
    bool entering = dot(rd, outward) < 0.0;
    vec3 shading = opticalNormal(p - uCenters[id], outward);
    vec3 n = entering ? shading : -shading;
    vec3 offsetNormal = entering ? outward : -outward;
    if (dot(rd, n) >= 0.0) n = offsetNormal;
    float etaI = entering ? 1.0 : ior, etaT = entering ? ior : 1.0;
    float f = fresnel(max(0.0, -dot(rd, n)), etaI, etaT);
    if (!entering) energy *= exp(-uAbsorption * t);
    vec3 refracted = refract(rd, n, etaI / etaT);
    if (f >= .9999) {
      vec3 reflected = normalize(reflect(rd, n));
      if (dot(reflected, offsetNormal) <= 0.0) reflected = normalize(reflect(rd, offsetNormal));
      rd = reflected; ro = p + offsetNormal * EPS * 4.0; continue;
    }
    // This branch follows transmission through neighbouring solids only.
    // Adding an unoccluded environment here painted bright ghost faces over
    // the internal volume; the primary reflected family is traced separately.
    if (dot(refracted, offsetNormal) >= 0.0) {
      refracted = refract(rd, offsetNormal, etaI / etaT);
      f = fresnel(max(0.0, -dot(rd, offsetNormal)), etaI, etaT);
      if (f >= .9999 || dot(refracted, refracted) < 1e-10) {
        rd = normalize(reflect(rd, offsetNormal)); ro = p + offsetNormal * EPS * 4.0; continue;
      }
    }
    coneWidth += uRoughness * .012;
    energy *= 1.0 - f;
    rd = normalize(refracted); ro = p - offsetNormal * EPS * 4.0;
  }
  return radiance; // Truncated rays never leak straight through a still-occupied solid.
}

float traceGlass(vec3 ro, vec3 rd, int channel, int firstId, float firstT) {
  float wavelengthShift = channel == 0 ? -.5 : channel == 1 ? 0.0 : .5;
  float ior = max(1.0001, uIOR + uDispersion * wavelengthShift);
  vec3 entry = ro + rd * firstT;
  vec3 outward = boxNormal(entry - uCenters[firstId]);
  vec3 entryNormal = opticalNormal(entry - uCenters[firstId], outward);
  if (dot(rd, entryNormal) >= 0.0) entryNormal = outward;
  float f = fresnel(max(0.0, -dot(rd, entryNormal)), 1.0, ior);
  float coneWidth = uRoughness * .05;
  vec3 reflectedEntry = reflect(rd, entryNormal);
  if (dot(reflectedEntry, outward) <= 0.0) reflectedEntry = reflect(rd, outward);
  float radiance = f * uReflection * throughScene(entry + outward * EPS * 5.0, reflectedEntry, ior, channel, coneWidth);
  vec3 internalRay = normalize(refract(rd, entryNormal, 1.0 / ior));
  vec3 origin = entry - outward * EPS * 4.0;
  float energy = 1.0 - f;
  for (int bounce = 0; bounce < 16; ++bounce) {
    // Physical split-ray depth is separate from the authored dimension layers.
    if (bounce >= uBounces || energy < .0004) break;
    float t = intersectCube(origin, internalRay, firstId);
    if (t >= FAR) break;
    vec3 p = origin + t * internalRay;
    vec3 normal = boxNormal(p - uCenters[firstId]);
    vec3 shading = opticalNormal(p - uCenters[firstId], normal);
    if (dot(internalRay, shading) <= 0.0) shading = normal;
    energy *= exp(-uAbsorption * t);
    coneWidth += uRoughness * (.025 + .008 * t);
    float reflectance = fresnel(max(0.0, dot(internalRay, shading)), ior, 1.0);
    vec3 exitRay = refract(internalRay, -shading, ior);
    if (reflectance < .9999 && dot(exitRay, normal) <= 0.0) {
      shading = normal;
      reflectance = fresnel(max(0.0, dot(internalRay, normal)), ior, 1.0);
      exitRay = refract(internalRay, -normal, ior);
    }
    if (reflectance < .9999) {
      radiance += energy * (1.0 - reflectance) * throughScene(p + normal * EPS * 4.0, normalize(exitRay), ior, channel, coneWidth);
    }
    energy *= reflectance;
    // Retain the coherent (sharp) component of each successive reflection.
    // Rough surfaces spread energy outside this finite specular ray family;
    // do not keep a full-energy razor-sharp copy at every deeper bounce.
    energy *= exp(-uRoughness * (4.0 + float(bounce) * 2.0));
    vec3 reflectedInternal = reflect(internalRay, shading);
    if (dot(reflectedInternal, normal) >= 0.0) reflectedInternal = reflect(internalRay, normal);
    internalRay = normalize(reflectedInternal);
    origin = p - normal * EPS * 4.0;
  }
  return radiance;
}

// Virtual reflection-image family inside the first visible dielectric. These
// are light-only contour integrals, not opaque/emissive nested mesh cubes.
// It is an art-directed optical approximation, not extra physical interfaces:
// rays are refracted by the real shell first, then sampled on progressively
// inset cubical image planes. Count controls activation, never their positions.
float dimensionLayers(vec3 entry, vec3 rd, int id, int channel, float footprint) {
  float count = uDimensions[id];
  if (count <= 0.0 || uLightIntensity <= 0.0) return 0.0;
  vec3 local = entry - uCenters[id];
  vec3 outward = boxNormal(local);
  vec3 shading = opticalNormal(local, outward);
  float ior = max(1.0001, uIOR + uDispersion * (float(channel) - 1.0) * .5);
  vec3 ray = refract(rd, shading, 1.0 / ior);
  if (dot(ray, outward) >= 0.0) ray = refract(rd, outward, 1.0 / ior);
  ray = normalize(ray);
  vec3 inv = 1.0 / (sign(ray + vec3(1e-20)) * max(abs(ray), vec3(1e-8)));
  float radiance = 0.0;
  for (int layer = 0; layer < 12; ++layer) {
    float order = float(layer);
    float activation = smoothstep(0.0, 1.0, count - order);
    if (activation <= 0.0) break;
    float extent = (uHalf - uBevel * .16) * exp(-uLayerSpacing[id] * (order + .7));
    vec3 ta = (-vec3(extent) - local) * inv;
    vec3 tb = (vec3(extent) - local) * inv;
    vec3 nearV = min(ta, tb), farV = max(ta, tb);
    float nearT = max(nearV.x, max(nearV.y, nearV.z));
    float farT = min(farV.x, min(farV.y, farV.z));
    if (farT < max(nearT, 0.0)) continue;
    vec3 p = local + max(nearT, 0.0) * ray;
    vec3 a = abs(p);
    int faceAxis = a.x > a.y && a.x > a.z ? 0 : a.y > a.z ? 1 : 2;
    vec2 signedUV = faceAxis == 0 ? p.yz : faceAxis == 1 ? p.xz : p.xy;
    vec2 uv = abs(signedUV);
    float radius = min(extent * .3, uBevel * extent / uHalf + extent * .025);
    vec2 q = uv - vec2(extent - radius);
    float contour = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float edgeDistance = max(0.0, -contour);
    float spacing = extent * (1.0 - exp(-uLayerSpacing[id]));
    float width = max(footprint * 1.25, spacing * mix(.16, .8, uLayerSoftness) * (1.0 + order * uLayerSoftness * .25));
    // Wavelength separation is along the optical contour, not a hue-painted
    // face. A coloured incident source filters the result in linear light.
    float separation = uDispersion * extent * 4.0;
    float offset = separation * (float(channel) * .8 + .12) + width * .32;
    // Spread in the face tangent direction away from the shared Axis origin,
    // not from the screen centre or each cube's centre. The signed contour
    // derivative distinguishes the Axis-facing edge from its outward tail.
    // Smoothly blend the two edge directions across the face medial axis;
    // selecting only the nearest edge produces a triangular blur seam.
    vec2 edgeWeights = exp((q - max(q.x, q.y)) / max(width * 1.5, extent * .12));
    vec2 smoothSign = signedUV / sqrt(signedUV * signedUV + vec2(width * width * .15));
    vec2 contourNormal = normalize(edgeWeights) * smoothSign;
    vec3 inwardTangent = faceAxis == 0 ? vec3(0, -contourNormal.x, -contourNormal.y)
      : faceAxis == 1 ? vec3(-contourNormal.x, 0, -contourNormal.y) : vec3(-contourNormal.x, -contourNormal.y, 0);
    vec3 worldPoint = p + uCenters[id];
    float axisDistance = length(worldPoint);
    float alignment = dot(inwardTangent, worldPoint / max(axisDistance, .00001));
    float farFromAxis = smoothstep(0.0, uHalf * 3.0, axisDistance);
    float spreadAmount = smoothstep(.06, .3, uLayerSpacing[id]);
    float signedBandDistance = edgeDistance - offset;
    float outwardTail = smoothstep(0.0, .8, signedBandDistance * alignment / width);
    float spreadWidth = width * (1.0 + spreadAmount * (.2 * farFromAxis + outwardTail * (.65 + 2.0 * farFromAxis)));
    // Bound the tail so a wide spacing does not turn the whole face into a
    // flat luminous fill. Lower peak radiance as the lobe spreads its energy.
    spreadWidth = min(spreadWidth, max(width, extent * .32));
    float band = exp(-pow(signedBandDistance / spreadWidth, 2.0)) * (width / spreadWidth);
    float core = exp(-pow(edgeDistance / max(width * .27, footprint), 2.0)) * .14;
    vec3 n = normalize(sign(p) * pow(max(a / extent, vec3(.00001)), vec3(18.0)));
    vec3 reflectDirection = reflect(ray, n);
    float incident = environment(entry, reflectDirection, .035 + uRoughness * .14 + order * .007)[channel];
    float attenuation = exp(-order * mix(.08, .6, uLayerFalloff) - uAbsorption * (uHalf - extent) * 2.0);
    float edgeFresnel = mix(.32, 1.0, pow(1.0 - abs(dot(-ray, n)), 3.0));
    float boundaryFade = smoothstep(0.0, max(footprint * 1.5, width * .45), -contour);
    radiance += activation * attenuation * (band + core) * incident * edgeFresnel * boundaryFade;
  }
  return radiance * uReflection * 1.2 * clamp((ior - 1.0) * 2.0, 0.0, 1.0);
}

void main() {
  vec2 xy = ((gl_FragCoord.xy + uTileOrigin + uJitter) / uResolution * 2.0 - 1.0);
  float aspect = uResolution.x / uResolution.y;
  float scale = 3.0 / uZoom / min(aspect, 1.0);
  vec3 ro = uCamera * 12.0 + uRight * xy.x * aspect * scale + uUp * xy.y * scale;
  vec3 rd = -uCamera;
  int id; float distance = sceneHit(ro, rd, id);
  if (id < 0) { fragColor = vec4(0,0,0,1); return; }
  vec3 colour = vec3(traceGlass(ro, rd, 0, id, distance), traceGlass(ro, rd, 1, id, distance), traceGlass(ro, rd, 2, id, distance));
  vec3 entry = ro + distance * rd;
  float footprint = 6.0 / uZoom / min(uResolution.x, uResolution.y);
  // Balance the fine coherent branch against the broader reflection-image
  // family. This is an authored exposure ratio, not a change to glass albedo.
  colour = colour * .52 + vec3(dimensionLayers(entry, rd, id, 0, footprint), dimensionLayers(entry, rd, id, 1, footprint), dimensionLayers(entry, rd, id, 2, footprint));
  colour *= uExposure;
  // Preserve highlight radiance for the HDR optical resolve. On devices with
  // no floating render target, use a reversible range-compressed fallback.
  colour = max(colour, vec3(0));
  if (!uHDR) colour = colour / (vec3(1) + colour);
  fragColor = vec4(colour, 1);
}
