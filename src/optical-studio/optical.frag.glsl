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
uniform float uPanX;
uniform vec2 uFrameOffset;
uniform float uPhase;
uniform float uSpeed;
uniform float uLightMotionCycles;
uniform float uLayerFadeAmount;
uniform float uLayerFadeCycles;
uniform float uLayerStagger;
uniform vec3 uDimensionDelay;
uniform vec3 uCamera;
uniform vec3 uRight;
uniform vec3 uUp;
uniform int uBounces;
uniform vec3 uDimensions;
uniform vec3 uLayerSpacing;
uniform float uLayerSoftness;
uniform float uLayerFalloff;
uniform bool uHDR;
#ifdef HYBRID_AB
uniform float uHybridDistortion;
uniform float uHybridDensity;
uniform float uHybridColorMix;
uniform float uHybridDepthFlow;
uniform float uHybridDepthCycles;
uniform float uHybridOpening;
uniform float uHybridFaceReflection;
uniform float uHybridFaceWidth;
uniform float uHybridRefractionOverlap;
#endif

// IDENTITY25_SOURCE

uniform float uRayEpsilon;
#define EPS uRayEpsilon
const float FAR = 100.0;

float boxSDF(vec3 p) {
  vec3 q = abs(p) - vec3(uHalf - uBevel);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - uBevel;
}

vec3 roundedNormal(vec3 p, float halfSize) {
  vec3 q = abs(p) - vec3(halfSize - uBevel);
  vec3 outside = max(q, 0.0);
  if (dot(outside, outside) > 1e-12) return normalize(outside) * sign(p);
  if (q.x > q.y && q.x > q.z) return vec3(sign(p.x), 0, 0);
  if (q.y > q.z) return vec3(0, sign(p.y), 0);
  return vec3(0, 0, sign(p.z));
}

vec3 boxNormal(vec3 p) { return roundedNormal(p, uHalf); }

// Extend only AWAY from each cube's shared-origin corner. Its three near
// planes (and hence Axis gap/bevel) do not move. The far closing planes lie
// beyond the smooth radiance falloff: this is a 3D light-image carrier, not
// a deformation of the canonical brand geometry or a screen-space overlay.
float openExtension() { return uHalf * 8.0; }
vec3 openCenter(int id) { return uCenters[id] + sign(uCenters[id]) * openExtension(); }

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
float intersectRoundedAt(vec3 ro, vec3 rd, vec3 center, float halfSize) {
  vec3 p = ro - center;
  vec3 inv = 1.0 / (sign(rd + vec3(1e-20)) * max(abs(rd), vec3(1e-8)));
  vec3 a = (-vec3(halfSize) - p) * inv;
  vec3 b = (vec3(halfSize) - p) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  float nearT = max(lo.x, max(lo.y, lo.z));
  float farT = min(hi.x, min(hi.y, hi.z));
  if (farT < max(nearT, EPS)) return FAR;
  if (uBevel < 0.000001) return nearT > EPS ? nearT : farT;
  float inner = halfSize - uBevel;
  float best = FAR;
  for (int axis = 0; axis < 3; ++axis) {
    int a = (axis + 1) % 3, b = (axis + 2) % 3;
    for (int side = 0; side < 2; ++side) {
      float s = side == 0 ? -1.0 : 1.0;
      if (abs(rd[axis]) > 1e-8) {
        float t = (s * halfSize - p[axis]) / rd[axis];
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

float intersectRoundedExact(vec3 ro, vec3 rd, int id) {
  return intersectRoundedAt(ro, rd, uCenters[id], uHalf);
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
vec3 environmentProfile(vec3 ro, vec3 rd, float coneWidth, float internalImage) {
  vec3 result = vec3(0.0);
  vec3 lightColour = srgbToLinear(uLightColor);
  for (int i = 0; i < 4; ++i) {
    float f = float(i);
    float phase = uPhase * uLightMotionCycles + f * 1.57079633;
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
    // Moving curved studio strip: illumination is sampled along real 3D rays,
    // so the highlight travels over the surface instead of colouring a face.
    // Straight emitter profile: rigid rig movement is retained, not bending.
    float x = p.x;
    float shoulderPower = .07;
#ifdef HYBRID_AB
    // A-inspired optical figure is restricted to inner virtual images. The
    // actual contour / first image and the geometry of the Axis stay sharp.
    x += .16 * uHybridDistortion * internalImage * p.y*p.y/(1.0+.2*p.y*p.y);
    shoulderPower += .18 * uHybridDensity * internalImage;
#endif
    float footprint = min(.8, coneWidth * t / (4.5 * uSpread));
    float width = sqrt(.55 * .55 + footprint * footprint + uRoughness * uRoughness);
    float ribbon = exp(-x*x/(width*width)) * .55/width;
    float shoulder = exp(-x*x/(width*width*3.5)) * shoulderPower;
    float lengthMask = exp(-pow(abs(p.y)*.72, 4.0));
    vec3 illumination = lightColour * (ribbon + shoulder);
    if (uLightCycle) {
      // Distinct RGB ribbons remain visible together. Temporal weights choose
      // the lead; camera continuity belongs to the optical projection, not
      // to mixing the three sources into a single uniform colour.
      float ribbonSeparation = 1.65;
#ifdef HYBRID_AB
      ribbonSeparation = mix(1.65,1.08,uHybridColorMix*internalImage);
#endif
      vec3 distances = vec3(x + ribbonSeparation, x, x - ribbonSeparation);
      vec3 profiles = exp(-distances * distances / (width * width)) * (.55 / width)
        + exp(-distances * distances / (width * width * 3.5)) * shoulderPower;
#ifdef HYBRID_AB
      // Broad overlapping source shoulders keep a secondary source visible
      // when its narrow core lies outside this reflected ray. Still multiplied
      // by the optical contour: never add uniform RGB illumination to faces.
      profiles = mix(profiles,vec3(ribbon+shoulder),uHybridColorMix*internalImage*.50);
#endif
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

vec3 environment(vec3 ro, vec3 rd, float coneWidth) {
  return environmentProfile(ro,rd,coneWidth,0.0);
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

#ifdef HYBRID_AB
// One-sided optical domain dilation. All three Axis-facing planes retain
// their original positions. The reflected image family uses this SAME domain.
float hybridExtension() { return uHalf*8.0*uHybridOpening; }
vec3 hybridCenter(int id) { return uCenters[id]+sign(uCenters[id])*hybridExtension(); }
vec3 hybridNormal(vec3 world, int id) {
  return roundedNormal(world-hybridCenter(id),uHalf+hybridExtension());
}
float hybridHit(vec3 ro, vec3 rd, int id) {
  if(uHybridOpening<=0.0) return intersectCube(ro,rd,id);
  float t=intersectRoundedAt(ro,rd,hybridCenter(id),uHalf+hybridExtension());
  // At full opening, remote end caps are not reflective optical interfaces.
  // Rays escaping along an open arm must never bounce off an invisible lid.
  if(t<FAR && uHybridOpening>=.999 && dot(hybridNormal(ro+t*rd,id),sign(uCenters[id]))>0.0) return FAR;
  return t;
}
float hybridSceneHit(vec3 ro, vec3 rd, out int id) {
  float nearest=FAR;id=-1;
  for(int i=0;i<3;++i) { float t=hybridHit(ro,rd,i);if(t<nearest){nearest=t;id=i;} }
  return nearest;
}
#endif

// A secondary transmitted branch can pass through neighbouring cubes. Its own
// reflection tree is bounded, while the primary internal-reflection family is explicit.
float throughScene(vec3 ro, vec3 rd, float ior, int channel, float coneWidth) {
  float energy = 1.0, radiance = 0.0;
  for (int i = 0; i < 8; ++i) {
    int id;
#ifdef HYBRID_AB
    float t = hybridSceneHit(ro,rd,id);
#else
    float t = sceneHit(ro, rd, id);
#endif
    if (id < 0) return radiance + energy * environment(ro, rd, coneWidth)[channel];
    vec3 p = ro + t * rd;
    vec3 outward = boxNormal(p - uCenters[id]);
#ifdef HYBRID_AB
    outward=hybridNormal(p,id);
#endif
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
#ifdef HYBRID_AB
  outward=hybridNormal(entry,firstId);
#endif
  vec3 entryNormal = opticalNormal(entry - uCenters[firstId], outward);
  if (dot(rd, entryNormal) >= 0.0) entryNormal = outward;
  float f = fresnel(max(0.0, -dot(rd, entryNormal)), 1.0, ior);
  float coneWidth = uRoughness * .05;
  vec3 reflectedEntry = reflect(rd, entryNormal);
  if (dot(reflectedEntry, outward) <= 0.0) reflectedEntry = reflect(rd, outward);
  float radiance = f * uReflection * throughScene(entry + outward * EPS * 5.0, reflectedEntry, ior, channel, coneWidth);
#ifdef HYBRID_AB
  // Suppress ONLY the exterior mirror image. Keep A's interior ray family.
  radiance *= .035;
#endif
  vec3 internalRay = normalize(refract(rd, entryNormal, 1.0 / ior));
  vec3 origin = entry - outward * EPS * 4.0;
  float energy = 1.0 - f;
  for (int bounce = 0; bounce < 16; ++bounce) {
    // Physical split-ray depth is separate from the authored dimension layers.
    if (bounce >= uBounces || energy < .0004) break;
#ifdef HYBRID_AB
    float t = hybridHit(origin, internalRay, firstId);
#else
    float t = intersectCube(origin, internalRay, firstId);
#endif
    if (t >= FAR) break;
    vec3 p = origin + t * internalRay;
    vec3 normal = boxNormal(p - uCenters[firstId]);
#ifdef HYBRID_AB
    normal=hybridNormal(p,firstId);
#endif
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
      float exitContribution = energy * (1.0 - reflectance) * throughScene(p + normal * EPS * 4.0, normalize(exitRay), ior, channel, coneWidth);
#ifdef HYBRID_AB
      // Direct, unreflected background transmission is the broad cube-face
      // fill. Deeper internally reflected exits retain their optical energy.
      exitContribution *= bounce == 0 ? .12 : 1.0;
#endif
      radiance += exitContribution;
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
float dimensionLayers(vec3 entry, vec3 rd, int id, int channel, float footprint, out vec3 engraving) {
  // xy: engraved relief / face release; z: original light-formation coverage.
  engraving = vec3(0.0);
  float count = uDimensions[id];
  if (count <= 0.0 || uLightIntensity <= 0.0) return 0.0;
  vec3 local = entry - openCenter(id);
  vec3 outward = roundedNormal(local, uHalf + openExtension());
  // A constant planar normal per face prevents the bevel and radial blending
  // from acting as a lens that bends otherwise straight image contours.
  // One stable optical projection for each Axis arm also avoids a numerical
  // face switch exactly at a bevel midpoint during tiled high-res export.
  int entryAxis = id == 0 ? 1 : id == 1 ? 2 : 0;
  vec3 shading = vec3(0.0); shading[entryAxis] = rd[entryAxis] < 0.0 ? 1.0 : -1.0;
  float spectralDispersion = uDispersion;
  float ior = max(1.0001, uIOR + spectralDispersion * (float(channel) - 1.0) * .5);
  vec3 ray = refract(rd, shading, 1.0 / ior);
  if (dot(ray, ray) < 1e-10) ray = rd;
  ray = normalize(ray);
  // Art-directed virtual image projection, not a change to solid geometry.
  // A near-parallel image ray keeps the nested folds aligned with the Axis.
  // The signed planar normal flips at a grazing view. Its refracted ray has
  // a finite normal component even at zero incidence, so a constant blend
  // used to teleport the image there. Fade only this virtual projection's
  // deflection to zero before crossing. The weight is uniform over each cube,
  // preserving straight contours and the established non-grazing appearance.
  float projectionWeight = .18 * smoothstep(0.0, .18, abs(rd[entryAxis]));
  ray = normalize(mix(rd, ray, projectionWeight));
  vec3 inv = 1.0 / (sign(ray + vec3(1e-20)) * max(abs(ray), vec3(1e-8)));
  float radiance = 0.0;
  for (int layer = 0; layer < 50; ++layer) {
#ifdef HYBRID_AB
    // B supplies the single sharp Axis-facing anchor; A supplies inner images.
    if (layer > 0) break;
#endif
    float order = float(layer);
    float internalImage = 0.0;
    float imageOrder = order;
#ifdef HYBRID_AB
    // The hybrid's refracted interior is integrated in hybridOptics.glsl.
    // This branch retains only B's original layer-zero anchor.
#endif
    float activation = smoothstep(0.0, 1.0, count - order);
    if (activation <= 0.0) break;
    // Layer zero touches the shared Axis; increasing inset orders recede from
    // it. Absolute-second gates also remain active after the gray has gone.
    float appearance = identityLayerVisibility(order);
    if (appearance <= 0.0) break;
    // A spatially uniform envelope per layer: fade whole light images,
    // never displace their contours or animate their surface normals.
    float dimensionPhase = uPhase - uDimensionDelay[id];
    float visibility = smoothstep(.12, .82, .5 + .5 * cos(dimensionPhase * uLayerFadeCycles - order * uLayerStagger - float(id) * .45));
    // Keep a subtle outer anchor so the black Axis gap never disappears.
    float layerVisibility = mix(1.0, layer == 0 ? mix(.25, 1.0, visibility) : visibility, uLayerFadeAmount);
    // The first image belongs to the actual solid boundary. Previously the
    // .7-layer inset left an unlit margin between the Axis gap and the light.
    // Subsequent images keep their exponential spacing relative to that edge.
    float imageExtent = uHalf * exp(-uLayerSpacing[id] * imageOrder);
    float extent = imageExtent + openExtension();
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
    // Image layers fold at sharp corners; the actual outer bevel is unchanged.
    float radius = 0.0;
    vec2 q = uv - vec2(extent - radius);
    float contour = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float edgeDistance = max(0.0, -contour);
    if (layer == 0) {
      // Carry the SAME outer image across the bevel to the real silhouette.
      // The second-largest coordinate measures distance to a cubical edge;
      // the scene intersection, not a second drawn outline, clips the light.
      float secondAxis = a.x + a.y + a.z - max(a.x,max(a.y,a.z)) - min(a.x,min(a.y,a.z));
      edgeDistance = max(0.0, extent - uBevel - secondAxis);
    }
    float spacing = imageExtent * (1.0 - exp(-uLayerSpacing[id]));
    float width = max(footprint * 1.25, spacing * mix(.16, .8, uLayerSoftness) * (1.0 + order * uLayerSoftness * .25));
    // Wavelength separation is along the optical contour, not a hue-painted
    // face. A coloured incident source filters the result in linear light.
    float separation = spectralDispersion * imageExtent * 4.0;
    // Anchor the light image at the cubical contour, not an illuminated
    // patch inside the face. Dispersion stays within the soft contour lobe.
    float offset = layer == 0 ? 0.0 : min(separation * (float(channel) * .8 + .12), width * .35);
#ifdef HYBRID_AB
    float spectrumOffset = separation*(float(channel)*.8+.12);
    offset=mix(offset,min(spectrumOffset+width*.32,spacing*.8),
      internalImage*uHybridColorMix*.8);
#endif
    vec3 worldPoint = p + openCenter(id);
    // Box-aligned distance follows the planar Axis instead of circular shells.
    // Euclidean radial widening made the distant iso-brightness bands bow.
    float axisDistance = max(abs(worldPoint.x), max(abs(worldPoint.y), abs(worldPoint.z)));
    float spreadAmount = smoothstep(.06, .3, uLayerSpacing[id]);
    float signedBandDistance = edgeDistance - offset;
    // Keep the main contour width constant along an edge; layer spacing still
    // opens the gradient, but position-dependent growth no longer fans it out.
    float spreadWidth = width * (1.0 + spreadAmount * .85);
    // Bound the tail so a wide spacing does not turn the whole face into a
    // flat luminous fill. Lower peak radiance as the lobe spreads its energy.
    spreadWidth = min(spreadWidth, max(width, imageExtent * .32));
    // Keep the Axis end crisp; away from it the same contour energy opens
    // into a broad tail, rather than terminating on a cube's back edge.
    float opening = smoothstep(uHalf * .7, uHalf * 3.5, axisDistance);
    spreadWidth *= 1.6;
    float foldLock = 1.0 - smoothstep(uHalf * .9, uHalf * 2.4, axisDistance);
    // Shape contrast stays inside the existing contour lobe, never a face fill
    // or an independently drawn edge. Different face normals receive different
    // lobe widths and intensities from one fixed world-space direction.
    vec3 faceNormal = vec3(0.0); faceNormal[faceAxis] = sign(p[faceAxis]);
    float faceLight = dot(faceNormal, normalize(vec3(.43,.8,-.41)));
    spreadWidth *= mix(.58,.88,.5+.5*faceLight);
    // Cut the existing optical contour into the gray carrier first, then let
    // that narrow reflection open to its final gradient. No extra edge mesh
    // or screen-space line is drawn, and the finished lobe stays unchanged.
    float finalSpreadWidth = spreadWidth;
    if (uIdentityMix < 1.0) spreadWidth *= uIdentityEngraving > .5
      ? mix(.28,1.0,smoothstep(.26,.82,uIdentityMix))
      : mix(2.4,1.0,smoothstep(.12,.88,uIdentityMix));
    float band = exp(-pow(signedBandDistance / spreadWidth, 2.0)) * (width / spreadWidth);
    float core = exp(-pow(edgeDistance / max(width * .27, footprint), 2.0)) * .14;
    // Static reflection filtering only: this normal never displaces the
    // straight contour or its constant planar image ray.
    // Do not soften the reflection normal as distance increases: that creates
    // a curved virtual lens even though the actual layer contour is straight.
    vec3 n = normalize(sign(p) * exp((a - max(a.x,max(a.y,a.z))) / max(imageExtent / (48.0 * (1.0 + uSurfaceCurvature)),.0001)));
    vec3 reflectDirection = reflect(ray, n);
    float incident = environmentProfile(worldPoint, reflectDirection, .035 + uRoughness * .14 + order * .007, internalImage)[channel];
    incident *= mix(1.0, mix(.78,1.18,.5+.5*faceLight),foldLock);
    float attenuation = exp(-order * mix(.08, .6, uLayerFalloff) - uAbsorption * (uHalf - imageExtent) * 2.0);
#ifdef HYBRID_AB
    float falloff=mix(mix(.08,.6,uLayerFalloff),.10,uHybridDensity*.85);
    attenuation=exp(-order*falloff-uAbsorption*(uHalf-imageExtent)*2.0);
#endif
    float openFalloff = 1.0 - smoothstep(uHalf * 2.0, uHalf * 8.0, axisDistance);
    float edgeFresnel = mix(.32, 1.0, pow(1.0 - abs(dot(-ray, n)), 3.0));
    float boundaryFade = layer == 0 ? 1.0 : smoothstep(0.0, max(footprint * 1.5, width * .45), -contour);
    // Advect brightness along the existing outer image, not its geometry.
    // Max-norm distance agrees across adjoining faces, so the travelling
    // highlight crosses the fold without a UV seam or a bent contour.
    // Keep a nonzero floor: the black Axis gap always has a light boundary.
    float edgeTravel = 1.0;
    if (layer == 0) {
      float travelPhase = axisDistance / max(uHalf, .0001) * 2.4
        - dimensionPhase * uLightMotionCycles + float(id) * .45;
      float travelAmount = uLightMotionCycles > .5 ? min(1.0, uSpeed * 2.5) : 0.0;
      edgeTravel = mix(1.0, .75 + .25 * cos(travelPhase), travelAmount);
    }
    float lightPower = 1.0;
    if (uIdentityMix < 1.0 && uIdentityEngraving > .5) {
      // Engraving travels along the cubical contour from the shared Axis.
      // Max-norm distance agrees across adjacent faces: no circular wipe,
      // bending, random particles or view-dependent motion.
      float arrival = .035 + order / max(count, 1.0) * .12
        + smoothstep(0.0,uHalf*5.0,axisDistance)*.10;
      float cut = smoothstep(arrival, arrival+.17, uIdentityMix);
      float release = smoothstep(arrival+.24, .91, uIdentityMix);
      float grooveWidth = max(footprint*1.5, finalSpreadWidth*.33);
      float groove = exp(-pow(edgeDistance/grooveWidth,2.0));
      // The erosion front grows out of the illuminated groove, not out of a
      // radial/screen mask. It removes gray locally before the remote residue.
      float releaseWidth = finalSpreadWidth * (0.35 + 20.0*release*release);
      float released = release * (1.0-smoothstep(releaseWidth*.55,
        releaseWidth+footprint*2.0, edgeDistance));
      engraving.x = max(engraving.x, appearance*cut*groove*activation*openFalloff);
      engraving.y = max(engraving.y, appearance*released*activation);
      float etchStage = cut*(1.0-smoothstep(.42,.82,uIdentityMix));
      // Compensate the narrow lobe's peak rather than causing a white flash.
      lightPower = cut * mix(.36,1.0,smoothstep(.20,.75,uIdentityMix));
      layerVisibility = mix(1.0,layerVisibility,smoothstep(.50,.93,uIdentityMix));
      core += groove * etchStage * .12;
    } else if (uIdentityMix < 1.0) {
      // Preserve the saved pre-engraving expression. When stagger is enabled,
      // the absolute-second gate replaces its old count-normalized onset.
      float arrival=order/max(count,1.0)*.14;
      lightPower=uIdentityLayerTiming.w>.5 ? 1.0 : smoothstep(.015,.68,uIdentityMix-arrival);
      engraving.z += appearance*activation*attenuation*(band+core)*boundaryFade*openFalloff;
    }
    radiance += appearance * lightPower * activation * layerVisibility * edgeTravel * attenuation * (band + core * (1.0 - opening)) * incident * edgeFresnel * boundaryFade * openFalloff;
    if (layer == 0 && uIdentityAxisAccent.y > 0.0) {
      // A single grazing key-light pulse on the SAME nearest-Axis contour.
      // Existing ray, rounded silhouette, Fresnel, appearance/stagger and gap
      // masks remain authoritative. No new outline, face fill or emissive mesh.
      float reach = uHalf * mix(.4, 5.0, smoothstep(.04,.80,uIdentityAxisAccent.x));
      float arrival = 1.0-smoothstep(reach*.72,reach+uHalf*.45,axisDistance);
      float accentWidth = max(footprint*1.5, width*.30);
      float accentLobe = exp(-pow(edgeDistance/accentWidth,2.0))*.65
        +exp(-pow(edgeDistance/max(footprint*2.0,width*.85),2.0))*.12;
      vec3 tint = uLightCycle ? uCycleColors[0]*uCycleWeights.r
        +uCycleColors[1]*uCycleWeights.g+uCycleColors[2]*uCycleWeights.b : srgbToLinear(uLightColor);
      float keyLight = mix(1.0,tint[channel],.12)*min(uLightIntensity,2.0)*.60;
      radiance += appearance*lightPower*activation*layerVisibility*attenuation
        *accentLobe*keyLight*edgeFresnel*boundaryFade*openFalloff
        *arrival*uIdentityAxisAccent.y;
    }
  }
  return radiance * uReflection * 1.2 * clamp((ior - 1.0) * 2.0, 0.0, 1.0);
}

// HYBRID_OPTICS_SOURCE

void main() {
  vec2 xy = ((gl_FragCoord.xy + uTileOrigin + uJitter) / uResolution * 2.0 - 1.0) + uFrameOffset;
  float aspect = uResolution.x / uResolution.y;
  float scale = 3.0 / uZoom / min(aspect, 1.0);
  vec2 materialXY = identityDimensionPosition(xy,aspect);
  vec3 ro = uCamera * 12.0 + uRight * (materialXY.x + 2.0 * uPanX / 100.0) * aspect * scale + uUp * materialXY.y * scale;
  vec3 rd = -uCamera;
  int id = -1; float distance = FAR;
  for (int cube = 0; cube < 3; ++cube) {
    float t = intersectRoundedAt(ro, rd, openCenter(cube), uHalf + openExtension());
    if (t < distance) { distance = t; id = cube; }
  }
  if (id < 0 && uIdentityMix >= 1.0) { fragColor = vec4(0,0,0,1); return; }
  vec3 entry = ro + distance * rd;
  float footprint = 6.0 / uZoom / min(uResolution.x, uResolution.y);
  vec3 colour = vec3(0);
  vec3 engravingR=vec3(0), engravingG=vec3(0), engravingB=vec3(0);
  if (id >= 0 && uIdentityMix > 0.0) colour = vec3(dimensionLayers(entry, rd, id, 0, footprint,engravingR), dimensionLayers(entry, rd, id, 1, footprint,engravingG), dimensionLayers(entry, rd, id, 2, footprint,engravingB));
#ifdef HYBRID_AB
  int glassId; float glassDistance=hybridSceneHit(ro,rd,glassId);
  if(glassId>=0 && uIdentityMix>0.0) {
    vec3 glassEntry=ro+glassDistance*rd;
    vec3 internalReflection=vec3(traceGlass(ro,rd,0,glassId,glassDistance),traceGlass(ro,rd,1,glassId,glassDistance),traceGlass(ro,rd,2,glassId,glassDistance));
    vec3 hybridR,hybridG,hybridB;
    vec3 images=vec3(hybridDimensionLayers(glassEntry,rd,glassId,0,footprint,hybridR),hybridDimensionLayers(glassEntry,rd,glassId,1,footprint,hybridG),hybridDimensionLayers(glassEntry,rd,glassId,2,footprint,hybridB));
    engravingR=max(engravingR,hybridR); engravingG=max(engravingG,hybridG); engravingB=max(engravingB,hybridB);
    colour+=internalReflection*.52*smoothstep(.12,.88,uIdentityMix)*identityLayerVisibility(0.0)+images;
    colour+=vec3(hybridReflectedFaces(glassEntry,rd,glassId,0),hybridReflectedFaces(glassEntry,rd,glassId,1),hybridReflectedFaces(glassEntry,rd,glassId,2));
  }
#endif
  colour *= uExposure;
  if (uIdentityMix < 1.0 && uIdentityEngraving > .5) {
    vec2 engraved=max(engravingR.xy,max(engravingG.xy,engravingB.xy));
    float relief=1.0-.48*engraved.x*(1.0-smoothstep(.50,.86,uIdentityMix));
    // Gray stays solid while light is being inscribed. Only afterwards does
    // the carrier release from those marks, leaving the dimension light in
    // place. The late closure handles background/no-layer carrier fragments.
    float residue=1.0-smoothstep(.82,1.0,uIdentityMix);
#ifdef HYBRID_AB
    // Local etched contours now release the carrier where the hybrid light
    // forms. Clear unlit remnants gradually, not in one late gray-sheet drop.
    residue=1.0-smoothstep(.48,1.0,uIdentityMix);
#endif
    colour += identity25(xy,aspect)*relief*(1.0-engraved.y)*residue;
  } else if (uIdentityMix < 1.0) {
    float focus=smoothstep(.22,.86,uIdentityMix);
    float contourResponse=1.0-exp(-max(engravingR.z,max(engravingG.z,engravingB.z))*2.5);
    float scattering=mix(1.0,contourResponse,focus);
    float neutralEnergy=1.0/(1.0+5.0*pow(uIdentityMix,3.0)/max(1.0-uIdentityMix,.00001));
    colour += identity25(xy,aspect)*scattering*neutralEnergy;
  }
  // Preserve highlight radiance for the HDR optical resolve. On devices with
  // no floating render target, use a reversible range-compressed fallback.
  colour = max(colour, vec3(0));
  if (!uHDR) colour = colour / (vec3(1) + colour);
  fragColor = vec4(colour, 1);
}
