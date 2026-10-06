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
#ifdef AXIS_SPLIT
uniform float uAxisFaceGap;
#endif
uniform float uIOR;
uniform float uDispersion;
uniform float uRoughness;
uniform float uSurfaceCurvature;
uniform float uReflection;
uniform vec3 uFaceGainTop,uFaceGainLeft,uFaceGainRight;
uniform float uFaceDimensionContrast;
uniform vec3 uStructureTop,uStructureLeft,uStructureRight;
uniform float uStructureContrast;
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
uniform float uLayerLightContrast;
uniform float uLayerLightLength;
uniform float uLayerLightCycles;
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
uniform float uIdentityTransitionBrightness;
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
uniform float uOutputFootprint;
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
float intersectRoundedBox(vec3 ro, vec3 rd, vec3 center, vec3 halfSize, float radius) {
  vec3 p = ro - center;
  vec3 inv = 1.0 / (sign(rd + vec3(1e-20)) * max(abs(rd), vec3(1e-8)));
  vec3 a = (-vec3(halfSize) - p) * inv;
  vec3 b = (vec3(halfSize) - p) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  float nearT = max(lo.x, max(lo.y, lo.z));
  float farT = min(hi.x, min(hi.y, hi.z));
  if (farT < max(nearT, EPS)) return FAR;
  if (radius < 0.000001) return nearT > EPS ? nearT : farT;
  // Solve small bevel cylinders/spheres close to their bounding box, not
  // from the distant camera. Otherwise bb*bb-aa*cc loses the radius term
  // in float32 and produces unstable hits/normals as the view moves.
  float rayStart=0.0;
#ifdef HYBRID_AB
  rayStart=max(0.0,nearT-max(radius*.5,EPS*8.0));
#endif
  p+=rd*rayStart;
  vec3 inner = halfSize - radius;
  float best = FAR;
  for (int axis = 0; axis < 3; ++axis) {
    int a = (axis + 1) % 3, b = (axis + 2) % 3;
    for (int side = 0; side < 2; ++side) {
      float s = side == 0 ? -1.0 : 1.0;
      if (abs(rd[axis]) > 1e-8) {
        float t = (s * halfSize[axis] - p[axis]) / rd[axis];
        vec3 h = p + t * rd;
        if (t > EPS && t < best && abs(h[a]) <= inner[a]+1e-6 && abs(h[b]) <= inner[b]+1e-6) best = t;
      }
    }
    for (int sa = 0; sa < 2; ++sa) for (int sb = 0; sb < 2; ++sb) {
      vec2 signs = vec2(sa == 0 ? -1.0 : 1.0, sb == 0 ? -1.0 : 1.0);
      vec2 q = vec2(p[a], p[b]) - signs * vec2(inner[a],inner[b]);
      vec2 d = vec2(rd[a], rd[b]);
      float aa = dot(d, d), bb = dot(q, d), cc = dot(q, q) - radius * radius;
      float disc = bb * bb - aa * cc;
      if (aa < 1e-10 || disc < 0.0) continue;
      float root = sqrt(max(0.0, disc));
      for (int k = 0; k < 2; ++k) {
        float t = (-bb + (k == 0 ? -root : root)) / aa;
        vec3 h = p + t * rd;
        vec2 quadrant = vec2(h[a], h[b]) * signs;
        if (t > EPS && t < best && abs(h[axis]) <= inner[axis]+1e-6 && quadrant.x>=inner[a]-1e-6 && quadrant.y>=inner[b]-1e-6) best = t;
      }
    }
  }
  for (int corner = 0; corner < 8; ++corner) {
    vec3 signs = vec3((corner & 1) == 0 ? -1.0 : 1.0, (corner & 2) == 0 ? -1.0 : 1.0, (corner & 4) == 0 ? -1.0 : 1.0);
    vec3 q = p - signs * inner;
    float b = dot(q, rd), c = dot(q, q) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) continue;
    float root = sqrt(max(0.0, disc));
    for (int k = 0; k < 2; ++k) {
      float t = -b + (k == 0 ? -root : root);
      vec3 h = (p + t * rd) * signs;
      if (t > EPS && t < best && all(greaterThanEqual(h,inner-vec3(1e-6)))) best = t;
    }
  }
  return best>=FAR ? FAR : best+rayStart;
}

float intersectRoundedAt(vec3 ro, vec3 rd, vec3 center, float halfSize) {
  return intersectRoundedBox(ro,rd,center,vec3(halfSize),uBevel);
}

#ifdef AXIS_SPLIT
// Three independent, finite-thickness dielectric panels per original domain.
// They have real front/back/side patches and rounded rims, not discarded hits.
// The frame remains anchored at the original near planes; tangential bounds
// move apart. No panel overlaps its perpendicular neighbour.
float splitThickness() { return min(.06,.024+uBevel*.12)*smoothstep(0.0,.01,uAxisFaceGap); }
float splitInset() { return splitThickness()+uAxisFaceGap*.70710678118; }
void splitPanel(int id,int face,out vec3 center,out vec3 extent,out float radius) {
  float inset=splitInset();
  float reach=2.0*uHalf*(1.0+8.0*uHybridOpening);
  vec3 low=vec3(inset),high=vec3(reach);
  low[face]=0.0;high[face]=splitThickness();
  extent=(high-low)*.5;
  center=uCenters[id]+sign(uCenters[id])*((high+low)*.5-vec3(uHalf));
  radius=min(uBevel,splitThickness()*.45);
}
vec3 splitPanelNormal(vec3 world,int id,int face) {
  vec3 center,extent;float radius;splitPanel(id,face,center,extent,radius);
  vec3 p=world-center,q=abs(p)-(extent-radius),outside=max(q,0.0);
  if(dot(outside,outside)>1e-12)return normalize(outside)*sign(p);
  int axis=q.x>q.y&&q.x>q.z?0:q.y>q.z?1:2;
  vec3 n=vec3(0);n[axis]=sign(p[axis]);return n;
}
int splitPanelAt(vec3 world,int id) {
  float best=FAR;int face=0;
  for(int i=0;i<3;++i){
    vec3 center,extent;float radius;splitPanel(id,i,center,extent,radius);
    vec3 q=abs(world-center)-(extent-radius);
    float d=abs(length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-radius);
    if(d<best){best=d;face=i;}
  }
  return face;
}
float splitHit(vec3 ro,vec3 rd,int id) {
  float best=FAR;
  for(int face=0;face<3;++face){
    vec3 center,extent;float radius;splitPanel(id,face,center,extent,radius);
    best=min(best,intersectRoundedBox(ro,rd,center,extent,radius));
  }
  return best;
}
// Camera-visible carrier contains ONLY the outward front patches. Back and
// thickness walls still close the dielectric for internal ray transport, but
// must never become a second coloured image carrier inside the open joint.
float splitFrontHit(vec3 ro,vec3 rd,int id) {
  float best=FAR;
  for(int face=0;face<3;++face){
    vec3 front=vec3(0);front[face]=-sign(uCenters[id][face]);
    if(dot(rd,front)>=-1e-6)continue;
    vec3 center,extent;float radius;splitPanel(id,face,center,extent,radius);
    float t=intersectRoundedBox(ro,rd,center,extent,radius);
    if(t>=best)continue;
    vec3 n=splitPanelNormal(ro+t*rd,id,face);
    // Keep the front half of the polished rim, not its vertical side wall.
    if(dot(n,front)>.001)best=t;
  }
  return best;
}
// Transport the established virtual images WITH the detached face. The
// original closed optical proxy remains an intentional expression layer.
vec3 splitImageEntry(vec3 world,int id) {
  if(uAxisFaceGap<=0.0)return world;
  int face=splitPanelAt(world,id);
  vec3 q=(world-uCenters[id])*sign(uCenters[id])+vec3(uHalf);
  for(int i=0;i<3;++i)q[i]=i==face?0.0:max(0.0,q[i]-splitInset());
  return uCenters[id]+sign(uCenters[id])*(q-vec3(uHalf));
}
float splitImageEnvelope(vec3 world,int id) {
  if(uAxisFaceGap<=0.0)return 1.0;
  int face=splitPanelAt(world,id);
  vec3 q=(world-uCenters[id])*sign(uCenters[id])+vec3(uHalf);
  float edge=min(q[(face+1)%3],q[(face+2)%3])-splitInset();
  // Image energy rolls off over the polished lip; actual Fresnel reflection
  // of the rounded side wall is traced separately, not a black feather mask.
  return smoothstep(0.0,max(.012,uAxisFaceGap*.6+uBevel*.16),edge);
}
float splitInteriorWeight(vec3 world,int id) {
  if(uAxisFaceGap<=0.0)return 1.0;
  int face=splitPanelAt(world,id);
  vec3 q=(world-uCenters[id])*sign(uCenters[id])+vec3(uHalf);
  float edge=min(q[(face+1)%3],q[(face+2)%3])-splitInset();
  // Straight distance from the actual panel edge, not radius from the origin.
  // The outer anchor owns this narrow strip; curved inner images enter smoothly.
  return smoothstep(uHalf*.005,uHalf*.035,max(0.0,edge));
}
#endif

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
#ifdef HYBRID_AB
      // Refine the converged secondary hit without expanding every bounce
      // into all analytic patches (too expensive for interactive previews).
      for(int refine=0;refine<2;++refine){
        vec3 h=p+t*rd;
        float s=dot(boxNormal(h),rd);
        if(abs(s)>.025)t=clamp(t-boxSDF(h)/s,max(nearT,EPS),farT);
      }
#endif
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
      // The red flank misses more of the reflected field than the central
      // green strip. Open its aperture toward the centre only while it leads.
      // Widening preserves core energy; a bounded luminance correction below
      // compensates the darker brand red without changing its spectral colour.
      float redLead = smoothstep(.35,.85,uCycleWeights.r);
      if (redLead > 0.0) {
        float redDistance = x + ribbonSeparation * mix(1.0,.78,redLead);
        float redWidth = width * mix(1.0,1.28,redLead);
        profiles.r = exp(-redDistance*redDistance/(redWidth*redWidth)) * (.55/redWidth)
          + exp(-redDistance*redDistance/(redWidth*redWidth*3.5)) * shoulderPower;
      }
      // Broad overlapping source shoulders keep a secondary source visible
      // when its narrow core lies outside this reflected ray. Still multiplied
      // by the optical contour: never add uniform RGB illumination to faces.
      profiles = mix(profiles,vec3(ribbon+shoulder),uHybridColorMix*internalImage*.50);
      float redLuminance = dot(uCycleColors[0],vec3(.2126,.7152,.0722));
      float greenLuminance = dot(uCycleColors[1],vec3(.2126,.7152,.0722));
      float redPower = clamp(sqrt(greenLuminance/max(redLuminance,.02)),1.0,1.5);
      profiles.r *= mix(1.0,redPower,redLead);
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
#ifdef AXIS_SPLIT
  if(uAxisFaceGap>0.0)return splitPanelNormal(world,id,splitPanelAt(world,id));
#endif
  return roundedNormal(world-hybridCenter(id),uHalf+hybridExtension());
}
// Parent geometry, before opticalNormal/refraction or any internal image hit.
// Every optical branch on a wall/floor receives the same achromatic gain.
float structureLightingGain(vec3 world,int id) {
  vec3 w=pow(abs(hybridNormal(world,id)),vec3(4.0));
  w/=max(w.x+w.y+w.z,.000001);
  vec3 gains=id==0?uStructureTop:id==1?uStructureLeft:uStructureRight;
  return dot(w,gains)*mix(1.0,mix(1.35,.65,w.y),uStructureContrast);
}
float hybridHit(vec3 ro, vec3 rd, int id) {
#ifdef AXIS_SPLIT
  if(uAxisFaceGap>0.0)return splitHit(ro,rd,id);
#endif
  if(uHybridOpening<=0.0) {
    return intersectCube(ro,rd,id);
  }
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

// Output-pixel angular footprint of a polished bevel. Independent of the
// supersampling grid: increasing spp must not shrink the reflection filter.
float bevelReflectionCone(vec3 normal, vec3 ray) {
#ifdef HYBRID_AB
  float pixel=uOutputFootprint;
  float curved=1.0-max(abs(normal.x),max(abs(normal.y),abs(normal.z)));
  float curvatureWeight=smoothstep(.0005,.08,curved);
  float grazing=1.0/max(.25,abs(dot(normal,ray)));
  return min(.22,pixel/max(uBevel,.002)*grazing*.12)*curvatureWeight;
#else
  return 0.0;
#endif
}

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
    coneWidth=max(coneWidth,bevelReflectionCone(outward,rd));
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
  coneWidth=max(coneWidth,bevelReflectionCone(outward,rd));
#ifdef AXIS_SPLIT
  if(uAxisFaceGap>0.0) {
    // Integrate the small polished rim over an output pixel instead of
    // retaining a subpixel, high-frequency reflected source image.
    float pixel=max(6.0/uZoom/min(uResolution.x,uResolution.y),uOutputFootprint);
    coneWidth+=min(.16,pixel/max(splitThickness()*.45,.001)*.06);
  }
#endif
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
    coneWidth=max(coneWidth,bevelReflectionCone(normal,internalRay));
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
#ifdef AXIS_SPLIT
      if(uAxisFaceGap>0.0 && bounce==0)exitContribution=0.0;
#endif
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
// Object-space brightness only: the carrier geometry, normals and RGB rig stay
// untouched. Max norm is continuous across folded faces, unlike per-face UVs.
float layerLightEnvelope(vec3 point, int id, float order) {
  if (uLayerLightContrast <= 0.0) return 1.0;
  vec3 reach=abs(point);
  float along=max(reach.x,max(reach.y,reach.z))/max(uHalf,.0001);
  // One shared Axis-centred clock for ALL images. A positive temporal phase
  // moves a fixed brightness crest toward smaller object-space distances:
  // d(along)/dt < 0. No per-cube/layer offset that breaks the common flow.
  // Keep the original independent layer appearance/fade controls upstream.
  float phase=along*6.28318530718/max(uLayerLightLength,.25)
    +uPhase*uLayerLightCycles;
  float pulse=.5+.5*cos(phase);
  pulse=pulse*pulse*(3.0-2.0*pulse);
  // Never boost radiance or introduce white clipping; retain a 15% floor.
  return mix(1.0,.15+.85*pulse,uLayerLightContrast);
}

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
#ifdef HYBRID_AB
    if(uIdentityMix<1.0)
      spreadWidth=finalSpreadWidth*mix(.65,1.0,smoothstep(.12,1.0,uIdentityAxisAccent.x));
#endif
    float band = exp(-pow(signedBandDistance / spreadWidth, 2.0)) * (width / spreadWidth);
    float core = exp(-pow(edgeDistance / max(width * .27, footprint), 2.0)) * .14;
    // Static reflection filtering only: this normal never displaces the
    // straight contour or its constant planar image ray.
    // Do not soften the reflection normal as distance increases: that creates
    // a curved virtual lens even though the actual layer contour is straight.
    vec3 n = normalize(sign(p) * exp((a - max(a.x,max(a.y,a.z))) / max(imageExtent / (48.0 * (1.0 + uSurfaceCurvature)),.0001)));
#ifdef AXIS_SPLIT
    // No rounded reflection normal on the Axis anchor. Project the source
    // sampling point onto the closest straight edge, keeping brightness free
    // to travel ALONG it without bending the cross-edge gradient.
    if(uAxisFaceGap>0.0) {
      float innerBlend=smoothstep(uHalf*.01,uHalf*.04,edgeDistance);
      n=normalize(mix(faceNormal,n,innerBlend));
      int sideA=(faceAxis+1)%3,sideB=(faceAxis+2)%3;
      int edgeAxis=a[sideA]>a[sideB]?sideA:sideB;
      float edgePosition=openCenter(id)[edgeAxis]+sign(p[edgeAxis])*extent;
      worldPoint[edgeAxis]=mix(edgePosition,worldPoint[edgeAxis],innerBlend);
    }
#endif
    vec3 reflectDirection = reflect(ray, n);
    // Virtual corner normals can change much faster than the geometric
    // contour. Filter their source footprint without moving the Axis edge.
    float sourceCone=.035+uRoughness*.14+order*.007;
#ifdef HYBRID_AB
    float normalRadius=max(imageExtent/(48.0*(1.0+uSurfaceCurvature)),.0001);
    sourceCone=max(sourceCone,min(.22,uOutputFootprint/normalRadius*.06));
#endif
    float incident = environmentProfile(worldPoint, reflectDirection, sourceCone, internalImage)[channel];
    incident *= layerLightEnvelope(worldPoint,id,order);
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
#ifdef HYBRID_AB
    // Match the inner images' surface handover, without changing the finished
    // B anchor. Keep late-arriving layers independent of the global clock.
    lightPower=smoothstep(.025,.72,uIdentityAxisAccent.x);
    if(uIdentityMix>=1.0)lightPower=1.0;
    float loopVisibility=mix(1.0,mix(.25,1.0,visibility),uLayerFadeAmount);
    layerVisibility=mix(1.0,loopVisibility,identityLayerLoopBlend(order));
#endif
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
#ifdef HYBRID_AB
      // A coloured grazing glint, not a broad white sheet superimposed on RGB.
      accentWidth=max(footprint*1.5,width*.22);
      accentLobe=exp(-pow(edgeDistance/accentWidth,2.0))*.55;
      keyLight=mix(.12,tint[channel],.88)*min(uLightIntensity,2.0)*.42
        *(1.0-smoothstep(.38,.78,uIdentityAxisAccent.x));
#endif
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
#ifdef AXIS_SPLIT
    if(uAxisFaceGap>0.0)t=splitFrontHit(ro,rd,cube);
#endif
    if (t < distance) { distance = t; id = cube; }
  }
  if (id < 0 && uIdentityMix >= 1.0) { fragColor = vec4(0,0,0,1); return; }
  vec3 entry = ro + distance * rd;
#ifdef AXIS_SPLIT
  float carrierEnvelope=id>=0?splitImageEnvelope(entry,id):1.0;
  if(id>=0)entry=splitImageEntry(entry,id);
#endif
  // At high spatial sample counts the source grid is finer than the output.
  // Preserve a resolvable radiance lobe rather than shrinking reflection
  // details below one final pixel as supersampling increases.
  float footprint = max(6.0 / uZoom / min(uResolution.x, uResolution.y), uOutputFootprint * .8);
#ifdef HYBRID_AB
  // The affine face handover can magnify a pixel near the shared folds.
  // Filter in its transported footprint rather than the unwarped canvas.
  if(uIdentityMix>0.0 && uIdentityMix<1.0)
    footprint=clamp(max(length(dFdx(ro)),length(dFdy(ro))),footprint,footprint*4.0);
#endif
  vec3 colour = vec3(0);
  vec3 engravingR=vec3(0), engravingG=vec3(0), engravingB=vec3(0);
  if (id >= 0 && uIdentityMix > 0.0) colour = vec3(dimensionLayers(entry, rd, id, 0, footprint,engravingR), dimensionLayers(entry, rd, id, 1, footprint,engravingG), dimensionLayers(entry, rd, id, 2, footprint,engravingB));
#ifdef HYBRID_AB
  if(id>=0) colour*=structureLightingGain(entry,id);
#endif
#ifdef AXIS_SPLIT
  colour*=carrierEnvelope;
#endif
#ifdef HYBRID_AB
  int glassId; float glassDistance=hybridSceneHit(ro,rd,glassId);
#ifdef AXIS_SPLIT
  // All visible image branches must share the front-only primary hit.
  // Calling the closed transport hit here reintroduced the hidden rear wall.
  if(uAxisFaceGap>0.0){glassId=id;glassDistance=distance;}
#endif
  if(glassId>=0 && uIdentityMix>0.0) {
    vec3 glassEntry=ro+glassDistance*rd;
    // Freeze structural ownership BEFORE transporting into the image domain.
    float structureGain=structureLightingGain(glassEntry,glassId);
    vec3 internalReflection=vec3(traceGlass(ro,rd,0,glassId,glassDistance),traceGlass(ro,rd,1,glassId,glassDistance),traceGlass(ro,rd,2,glassId,glassDistance));
    float imageEnvelope=1.0;
    float interiorWeight=1.0;
#ifdef AXIS_SPLIT
    interiorWeight=splitInteriorWeight(glassEntry,glassId);
    imageEnvelope=splitImageEnvelope(glassEntry,glassId);
    glassEntry=splitImageEntry(glassEntry,glassId);
#endif
    vec3 hybridR,hybridG,hybridB;
    vec3 images=vec3(hybridDimensionLayers(glassEntry,rd,glassId,0,footprint,hybridR),hybridDimensionLayers(glassEntry,rd,glassId,1,footprint,hybridG),hybridDimensionLayers(glassEntry,rd,glassId,2,footprint,hybridB));
    engravingR=max(engravingR,hybridR); engravingG=max(engravingG,hybridG); engravingB=max(engravingB,hybridB);
    float reflectionFormation=uIdentityMix>=1.0?1.0:smoothstep(.25,1.0,uIdentityAxisAccent.x);
    colour+=structureGain*interiorWeight*(internalReflection*.52*reflectionFormation*identityLayerVisibility(0.0)+images*imageEnvelope);
    colour+=structureGain*interiorWeight*imageEnvelope*vec3(hybridReflectedFaces(glassEntry,rd,glassId,0),hybridReflectedFaces(glassEntry,rd,glassId,1),hybridReflectedFaces(glassEntry,rd,glassId,2));
  }
#endif
#ifdef HYBRID_AB
  // Adjust only the incoming RGB optics. The envelope returns to zero at
  // both ends, preserving the 25 Axis carrier and the finished dimension look.
  if (uIdentityMix < 1.0) {
    float progress=uIdentityAxisAccent.x;
    float transitionPeak=smoothstep(.05,.35,progress)
      *(1.0-smoothstep(.65,.95,progress));
    colour *= 1.0 + (uIdentityTransitionBrightness-1.0)*.65*transitionPeak;
  }
#endif
  colour *= uExposure;
  if (uIdentityMix < 1.0 && uIdentityEngraving > .5) {
#ifdef HYBRID_AB
    // The old gray carrier folds away from the shared Axis in one brief,
    // six-face-synchronous sweep. Its release no longer waits for local RGB
    // illumination, which could leave a flat gray patch in a dark wedge.
    // Max-norm keeps the traveling front aligned with the planar Axis space.
    vec3 carrier=identity25(xy,aspect);
    vec2 axisPlane=vec2((xy.x+2.0*uPanX/100.0)*aspect,xy.y);
    float axisReach=max(abs(axisPlane.x),abs(axisPlane.y));
    float travel=.05*smoothstep(.04,1.4,axisReach);
    float neutralRemainder=1.0-smoothstep(travel,.20+travel,uIdentityAxisAccent.x);
    colour+=carrier*neutralRemainder;
#else
    vec2 engraved=max(engravingR.xy,max(engravingG.xy,engravingB.xy));
    float relief=1.0-.48*engraved.x*(1.0-smoothstep(.50,.86,uIdentityMix));
    vec3 carrier=identity25(xy,aspect);
    // Gray stays solid while light is being inscribed. Only afterwards does
    // the carrier release from those marks, leaving the dimension light in
    // place. The late closure handles background/no-layer carrier fragments.
    float residue=1.0-smoothstep(.82,1.0,uIdentityMix);
    colour += carrier*relief*(1.0-engraved.y)*residue;
#endif
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
