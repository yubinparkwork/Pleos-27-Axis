// Closed optical proxy: original A transport; never a primary visible shell.
// Surface-to-proxy mapping is art directed; transport inside it uses actual
// rounded-box intersections, Fresnel, TIR and neighbouring-solid transmission.
float proxyThroughScene(vec3 ro, vec3 rd, float ior, int channel, float coneWidth) {
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

float proxyTraceGlass(vec3 ro, vec3 rd, int channel, int firstId, float firstT) {
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
  float radiance = 0.0; // Never show the exterior proxy or direct transmission.
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
    if (bounce > 0 && reflectance < .9999) {
      radiance += energy * (1.0 - reflectance) * proxyThroughScene(p + normal * EPS * 4.0, normalize(exitRay), ior, channel, coneWidth);
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

float hybridReflectedFaces(vec3 entry, vec3 rd, int id, int channel) {
  if(uHybridFaceReflection<=0.0 || uHybridOpening<=0.0 || uLightIntensity<=0.0 || uBounces<2) return 0.0;
  vec3 direction=sign(uCenters[id]);
  vec3 anchor=uCenters[id]-direction*uHalf;
  vec3 distanceFromAnchor=max((entry-anchor)*direction,vec3(0.0));
  // Continuous compactification of the open surface into the closed optical
  // proxy. No screen-space texture, primary proxy hit or visible rear cap.
  float reach=mix(1.4,3.8,uHybridFaceWidth)*uHalf;
  vec3 mapped=direction*(2.0*uHalf*(1.0-exp(-distanceFromAnchor/reach))-uHalf);
  for(int i=0;i<4;i++) mapped-=boxNormal(mapped)*boxSDF(mapped);
  vec3 normal=boxNormal(mapped);
  if(dot(rd,normal)>=-.001) return 0.0;
  float transported=proxyTraceGlass(mapped+uCenters[id],rd,channel,id,0.0);
  float farDistance=max(distanceFromAnchor.x,max(distanceFromAnchor.y,distanceFromAnchor.z));
  float openingFade=1.0-smoothstep(uHalf*3.0,uHalf*7.0,farDistance);
  float formation=smoothstep(.18,.92,uIdentityMix)*identityLayerVisibility(0.0);
  float grazing=smoothstep(.001,.16,-dot(rd,normal));
  return transported*uReflection*uHybridFaceReflection*1.25*openingFade*formation*grazing;
}
