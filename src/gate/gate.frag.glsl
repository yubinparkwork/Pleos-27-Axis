#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uStructure;
uniform vec2 uWidth;
uniform vec2 uShape;
uniform vec4 uLight;
uniform vec4 uTiming;
uniform float uFade;
uniform vec3 uRed,uGreen,uBlue;
uniform vec4 uMaterial,uOptics;
uniform vec2 uRig;
uniform vec3 uFace;
out vec4 color;
float ease(float x){x=clamp(x,0.,1.);return x*x*x*(x*(x*6.-15.)+10.);}
vec3 cycleWeights(float time){
  float period=uTiming.y+uTiming.z+uTiming.w+3.*uFade,t=mod(max(time,0.),period);
  if(t<uTiming.y)return vec3(1,0,0);
  t-=uTiming.y;if(t<uFade)return mix(vec3(1,0,0),vec3(0,1,0),ease(t/uFade));
  t-=uFade;if(t<uTiming.z)return vec3(0,1,0);
  t-=uTiming.z;if(t<uFade)return mix(vec3(0,1,0),vec3(0,0,1),ease(t/uFade));
  t-=uFade;if(t<uTiming.w)return vec3(0,0,1);
  return mix(vec3(0,0,1),vec3(1,0,0),ease((t-uTiming.w)/uFade));
}
// Adapter for the shared A/B studio emitters below. All colour occurs in
// reflected/refracted emitter rays; it is not a uniform colour painted on a U.
#define HYBRID_AB
vec3 srgbToLinear(vec3 v){return mix(v/12.92,pow((v+.055)/1.055,vec3(2.4)),step(vec3(.04045),v));}
const vec3 uLightColor=vec3(1.);
const bool uLightCycle=true;
const float uLightMotionCycles=1.,uSpeed=.25,uLightIntensity=1.;
#define uSpread uRig.x
#define uRoughness uOptics.y
#define uHybridDistortion uMaterial.x
#define uHybridDensity uMaterial.y
#define uHybridColorMix uMaterial.z
float uPhase;
vec3 uCycleWeights,uCycleColors[3];
// STUDIO_PROFILE_SOURCE

vec3 radiance(vec2 p){
  // Actual LED mapping: central physical passage never receives light.
  if(p.x<0.||p.x>5248.||p.y<0.||p.y>2112.)return vec3(0.);
  if(p.y>=576.&&p.x>=448.&&p.x<=4800.)return vec3(0.);
  vec3 sum=vec3(0.);float clock=max(0.,uTime-uLight.w),count=uStructure.x;
  float period=uTiming.y+uTiming.z+uTiming.w+3.*uFade;
  uPhase=clock/period*6.283185307;
  uCycleColors[0]=uRed;uCycleColors[1]=uGreen;uCycleColors[2]=uBlue;
  // The whole U transports one optical cross-section. World/screen position
  // must never modulate energy along a layer (including either corner).
  vec3 viewRay=vec3(0.,0.,-1.);
  for(int i=0;i<50;i++){
    if(float(i)>=count)break;
    float order=float(i),z=fract((order+.35)/count+clock*uStructure.z);
    // Z projection compresses the spacing and velocity as layers recede inward.
    float inset=(1.-exp(-z*uStructure.y))/(1.-exp(-uStructure.y))*.98;
    float visible=ease((uTime-order*uTiming.x)/uLight.w)*smoothstep(0.,.055,z)*(1.-smoothstep(.87,1.,z));
    // Independent optical width: changing layer count no longer shrinks every light.
    // Subpixel footprint bounds the far layers without noise or unstable thin seams.
    // A single open-bottom rounded U distance field, in design pixels. Unlike
    // min(side,top), its corner normal follows the same connected contour;
    // there is no diagonal ownership boundary between separately lit planes.
    float radius=uShape.x*mix(1.,.2,inset);
    vec2 q=vec2(abs(p.x-2624.)-(2624.-448.*inset-radius),576.*inset+radius-p.y);
    vec2 outside=max(q,vec2(0.));
    float offset=-(length(outside)+min(max(q.x,q.y),0.)-radius);
    float footprint=max(5248./uResolution.x,2112./uResolution.y);
    // Project the ribbon and inter-layer space together. Keep a resolvable
    // shoulder in the distance instead of collapsing into subpixel lines.
    float projectedPitch=448.*.98*uStructure.y*exp(-z*uStructure.y)
      /((1.-exp(-uStructure.y))*count);
    float requestedWidth=uWidth.x*exp(-z*uWidth.y*1.4);
    float pitchWidth=projectedPitch*.65;
    float width=max(footprint*.65,requestedWidth*pitchWidth/sqrt(requestedWidth*requestedWidth+pitchWidth*pitchWidth));
    // Keep all legacy values unchanged. The extended range deliberately
    // permits overlapping shoulders instead of saturating at the pitch cap.
    width*=max(1.,uWidth.x/320.);
    float spectralExtent=uLight.z*448.*(.4+z);
    if(abs(offset)>width*5.+spectralExtent||visible<.0001)continue;
    // Transport one contour-local optical frame along the entire U. Rotating
    // world normals from horizontal to vertical sampled unrelated emitters
    // and made a diagonal material seam even on a connected distance field.
    // The signed cross-ribbon coordinate controls the glass shoulder instead.
    // Sample the same optical shoulders on both flanks; a directional energy
    // envelope, not emitter visibility, decides where the sharp edge releases.
    // A/B optical image normal: a smooth figure across the glass section,
    // transported unchanged along the U to avoid corner/longitudinal seams.
    float section=max(0.,offset*sign(uShape.y))/max(width,footprint);
    float figure=1.-exp(-section*mix(.3,.85,uHybridDistortion));
    vec3 normal=normalize(vec3(0.,-.65-figure*mix(.15,1.25,uHybridDistortion),1.));
    vec3 position=vec3(0.,0.,-z*.8);
    // Snell + virtual interior image reflection, as in the approved dimension look.
    vec3 transmitted=refract(viewRay,normal,1./max(1.0001,uOptics.x));
    vec3 innerNormal=normalize(vec3(0.,.6,-1.));
    uCycleWeights=vec3(uMaterial.w)+(1.-3.*uMaterial.w)*cycleWeights(max(0.,clock-z/uStructure.z));
    float cone=.035+uRoughness*.14+z*.02;
    vec3 incident=environmentProfile(position,reflect(viewRay,normal),cone,1.);
    incident+=environmentProfile(position,reflect(transmitted,innerNormal),cone,1.)*.55;
    // Successive virtual glass images use the same studio emitter field as
    // the KV: broad shoulders with separate, softer interior reflections.
    vec3 interior=reflect(transmitted,innerNormal);
    for(int bounce=0;bounce<2;bounce++){
      vec3 wall=normalize(vec3(0.,mix(-.42,.48,float(bounce)),1.));
      interior=reflect(interior,wall);
      incident+=environmentProfile(position,interior,cone+.035*float(bounce+1),1.)
        *(bounce==0?.28:.14);
    }
    float fresnel=mix(.32,1.,pow(1.-abs(dot(-viewRay,normal)),3.));
    for(int c=0;c<3;c++){
      float distance=offset-uLight.z*448.*(float(c)-1.)*(.4+z);
      // HybridAB optical-image language: Gaussian shoulder, narrow crest,
      // depth attenuation, spectral separation; no opaque face fill or textures.
      // + direction: sharp outside/top flank, long inward/downward release.
      // Reverse smoothly for -1; zero is a symmetric optical profile.
      float directed=distance*sign(uShape.y);
      float edgeWidth=max(width*.10,footprint*.9);
      float crest=exp(-pow(distance/edgeWidth,2.));
      float tailLength=max(width*mix(.65,1.5,uStructure.w),footprint);
      // Continuous at the crest; the outward side falls sharply, while the
      // inward side releases gradually into black, without a second peak.
      float inward=exp(-max(directed,0.)/tailLength);
      float outward=exp(-pow(min(directed,0.)/edgeWidth,2.));
      float tail=inward*outward*(1.-smoothstep(width*4.,width*5.,abs(distance)));
      float symmetric=exp(-pow(distance/max(width,footprint*.65),2.));
      float band=mix(symmetric,tail+.14*crest,abs(uShape.y));
      // A/B broad image shoulder and displaced refraction, across depth only.
      float sheetWidth=width*mix(1.1,3.5,uFace.y);
      float sheet=exp(-pow(max(directed,0.)/sheetWidth,2.))*outward;
      vec3 overlapNormal=normalize(normal+vec3(0.,.12+.28*uHybridDistortion,0.));
      float overlap=environmentProfile(position,reflect(transmitted,overlapNormal),cone+.03,1.)[c];
      float faceLight=sheet*uFace.x*.32*(incident[c]+uFace.z*.75*overlap);
      float decay=mix(mix(.35,3.,uLight.y),.5,uHybridDensity*.8);
      sum[c]+=(band*incident[c]+faceLight)*fresnel*visible
        *exp(-z*decay-uOptics.w*z*2.)*uOptics.z*clamp((uOptics.x-1.)*2.,0.,1.)*.96;
    }
  }
  return sum*uLight.x;
}
void main(){
  vec3 sum=vec3(0.);
  // Deterministic subpixel integration in linear light: no stochastic grain.
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 uv=(gl_FragCoord.xy+(vec2(x,y)-.5)*.5)/uResolution;
    sum+=radiance(vec2(uv.x,1.-uv.y)*vec2(5248.,2112.));
  }
  vec3 r=sum*.25*exp2(uRig.y);
  // Same photographic shoulder + sRGB transfer as production OpticalResolve.
  vec3 v=clamp(r*(2.51*r+.03)/(r*(2.43*r+.59)+.14),0.,1.);
  v=mix(v*12.92,1.055*pow(v,vec3(1./2.4))-.055,step(vec3(.0031308),v));
  color=vec4(v,1.);
}
