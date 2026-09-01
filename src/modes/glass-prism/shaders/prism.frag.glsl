#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uBackgroundTexture;
uniform vec2 uResolution;
uniform vec2 uAnchor;
uniform float uTime;
uniform float uScale;
uniform float uCubeScale;
uniform float uGap;
uniform float uBevel;
uniform float uMotionStrength;
uniform int uMotionKind;
uniform float uIor;
uniform float uDispersion;
uniform float uRoughness;
uniform float uReflection;
uniform float uRefractionStrength;
uniform float uTransparency;
uniform vec3 uTint;
uniform float uAbsorption;
uniform float uSurfaceTextureStrength;
uniform float uSurfaceTextureScale;
uniform int uInternalBounces;
uniform bool uEnvironment;
uniform float uEnvironmentIntensity;
uniform float uCameraYaw;
uniform float uCameraPitch;
uniform float uZoom;
uniform bool uTransparent;
#define TAU 6.28318530718

struct Hit {
  float valid;
  float nearDepth;
  float farDepth;
  vec3 local;
  vec3 farLocal;
  vec3 normal;
  vec3 textureGradient;
  float textureSignal;
  float index;
  mat3 basis;
  mat3 inverseBasis;
  mat3 normalMatrix;
  vec3 translation;
};

struct PathData {
  vec2 uv;
  float fresnel;
  float edge;
  vec3 normal;
};

mat3 rotX(float a) { float c=cos(a),s=sin(a); return mat3(1,0,0,0,c,s,0,-s,c); }
mat3 rotY(float a) { float c=cos(a),s=sin(a); return mat3(c,0,-s,0,1,0,s,0,c); }
mat3 rotZ(float a) { float c=cos(a),s=sin(a); return mat3(c,s,0,-s,c,0,0,0,1); }

float glassSurfaceField(vec3 p) {
  vec3 q=(p-.5)*uSurfaceTextureScale;
  float broad=sin(dot(q,vec3(.73,1.17,.41))*1.42+sin(dot(q,vec3(-.31,.48,1.06))*.82)*.72);
  float stria=sin(dot(q,vec3(-.28,.86,1.21))*3.15+cos(dot(q,vec3(.92,.24,-.37))*.63))*.26;
  return broad*.74+stria;
}

float roundedBoxDistance(vec3 p,float radius) {
  vec3 q=abs(p-.5)-(vec3(.5)-radius);
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-radius;
}

vec3 roundedBoxNormal(vec3 p,float radius) {
  vec3 e=vec3(.001,0,0);
  return normalize(vec3(
    roundedBoxDistance(p+e.xyy,radius)-roundedBoxDistance(p-e.xyy,radius),
    roundedBoxDistance(p+e.yxy,radius)-roundedBoxDistance(p-e.yxy,radius),
    roundedBoxDistance(p+e.yyx,radius)-roundedBoxDistance(p-e.yyx,radius)
  ));
}

Hit intersectCube(vec2 p,mat3 basis,vec3 translation,float index) {
  mat3 ib=inverse(basis);
  mat3 normalMatrix=transpose(ib);
  vec3 ro=ib*(vec3(p,-5.0)-translation);
  vec3 rd=ib*vec3(0,0,1);
  vec3 invd=1.0/rd;
  vec3 t0=(vec3(0)-ro)*invd,t1=(vec3(1)-ro)*invd;
  vec3 n=min(t0,t1),f=max(t0,t1);
  float tn=max(max(n.x,n.y),n.z),tf=min(min(f.x,f.y),f.z);
  float radius=clamp(uBevel,.0001,.24),entry=max(tn,0.0),exit=tf,frontFound=0.0,backFound=0.0;
  for(int stepIndex=0;stepIndex<16;stepIndex++) {
    float distance=roundedBoxDistance(ro+rd*entry,radius);
    if(distance<.0006) { frontFound=1.0; break; }
    entry+=max(distance,.0006);
  }
  for(int stepIndex=0;stepIndex<16;stepIndex++) {
    float distance=roundedBoxDistance(ro+rd*exit,radius);
    if(distance<.0006) { backFound=1.0; break; }
    exit-=max(distance,.0006);
  }
  Hit h;
  h.valid=step(max(tn,0.0),tf)*frontFound*backFound*step(entry,exit);
  h.nearDepth=entry;
  h.farDepth=exit;
  h.local=ro+rd*entry;
  h.farLocal=ro+rd*exit;
  h.index=index;
  h.basis=basis;
  h.inverseBasis=ib;
  h.normalMatrix=normalMatrix;
  h.translation=translation;
  vec3 localNormal=roundedBoxNormal(h.local,radius);
  float textureStep=.0025;
  vec3 te=vec3(textureStep,0,0);
  vec3 textureGradient=vec3(
    glassSurfaceField(h.local+te.xyy)-glassSurfaceField(h.local-te.xyy),
    glassSurfaceField(h.local+te.yxy)-glassSurfaceField(h.local-te.yxy),
    glassSurfaceField(h.local+te.yyx)-glassSurfaceField(h.local-te.yyx)
  )/(textureStep*2.0);
  h.normal=normalize(normalMatrix*localNormal);
  h.textureGradient=normalMatrix*textureGradient;
  h.textureSignal=glassSurfaceField(h.local);
  return h;
}

void traceRoundedExit(vec3 entryLocal,vec3 localDirection,float radius,out vec3 exitLocal,out vec3 exitNormal) {
  vec3 direction=normalize(localDirection);
  vec3 start=clamp(entryLocal+direction*.002,vec3(.0001),vec3(.9999));
  vec3 safeDirection=direction;
  if(abs(safeDirection.x)<.00001) safeDirection.x=safeDirection.x<0.0?-.00001:.00001;
  if(abs(safeDirection.y)<.00001) safeDirection.y=safeDirection.y<0.0?-.00001:.00001;
  if(abs(safeDirection.z)<.00001) safeDirection.z=safeDirection.z<0.0?-.00001:.00001;
  vec3 boundary=mix(vec3(0),vec3(1),step(vec3(0),direction));
  vec3 boundaryTimes=(boundary-start)/safeDirection;
  float low=0.0,high=min(boundaryTimes.x,min(boundaryTimes.y,boundaryTimes.z));
  for(int stepIndex=0;stepIndex<10;stepIndex++) {
    float middle=(low+high)*.5;
    if(roundedBoxDistance(start+direction*middle,radius)<0.0) low=middle;
    else high=middle;
  }
  exitLocal=clamp(start+direction*high,vec3(0),vec3(1));
  exitNormal=roundedBoxNormal(exitLocal,radius);
}

PathData traceGlassPath(Hit hit,vec3 incident,vec3 entryNormal,float ior,float channelOffset) {
  PathData path;
  vec3 insideDirection=refract(incident,entryNormal,1.0/max(1.001,ior));
  if(length(insideDirection)<.001) insideDirection=reflect(incident,entryNormal);
  vec3 localDirection=hit.inverseBasis*insideDirection;
  vec3 exitLocal,exitLocalNormal;
  traceRoundedExit(hit.local,localDirection,clamp(uBevel,.0001,.24),exitLocal,exitLocalNormal);
  vec3 entryWorld=hit.basis*hit.local+hit.translation;
  vec3 exitWorld=hit.basis*exitLocal+hit.translation;
  vec3 exitNormal=normalize(hit.normalMatrix*exitLocalNormal);
  vec3 exitDirection=refract(insideDirection,-exitNormal,max(1.001,ior));
  if(length(exitDirection)<.001) exitDirection=reflect(insideDirection,-exitNormal);
  float backgroundDistance=.18+length(exitWorld-entryWorld)*.12;
  vec2 samplePoint=exitWorld.xy+exitDirection.xy/max(.08,abs(exitDirection.z))*backgroundDistance;
  samplePoint=mix(entryWorld.xy,samplePoint,clamp(uRefractionStrength,0.0,1.5));
  vec2 uvPerWorld=vec2(uScale*uZoom*.5/(uResolution.x/uResolution.y),uScale*uZoom*.5);
  float roughness=(uRoughness*.018+uSurfaceTextureStrength*.004)*sqrt(max(.001,length(exitWorld-entryWorld)));
  vec2 roughOffset=vec2(hit.textureSignal,-hit.textureSignal*.63)*roughness*(1.0+channelOffset*.15);
  path.uv=clamp(gl_FragCoord.xy/uResolution+(samplePoint-entryWorld.xy)*uvPerWorld+roughOffset,vec2(.001),vec2(.999));
  float f0=pow((ior-1.0)/(ior+1.0),2.0);
  float exitCos=clamp(dot(insideDirection,exitNormal),0.0,1.0);
  path.fresnel=clamp((f0+(1.0-f0)*pow(1.0-exitCos,5.0))*(1.0+float(uInternalBounces)*.08),0.0,.96);
  float edgeDistance=min(min(exitLocal.x,1.0-exitLocal.x),min(min(exitLocal.y,1.0-exitLocal.y),min(exitLocal.z,1.0-exitLocal.z)));
  path.edge=1.0-smoothstep(0.0,max(.002,uBevel*1.35),edgeDistance);
  path.normal=exitNormal;
  return path;
}

vec3 studioEnvironment(vec3 normal) {
  float vertical=clamp(normal.y*.5+.5,0.0,1.0);
  float sideSoftbox=pow(clamp(abs(normal.x),0.0,1.0),7.0);
  vec3 environment=mix(vec3(.12,.125,.135),vec3(.84,.86,.89),vertical);
  environment+=vec3(.1,.105,.115)*sideSoftbox;
  return environment;
}

vec3 spectralTexture(vec3 local,vec3 normal,float thickness,float index) {
  vec3 q=local-.5;
  float phase=index*2.094;
  float flow=TAU*uTime;
  vec3 movingDirection=normalize(vec3(.62+.31*sin(flow+phase),-.34+.28*cos(flow*2.0+phase*.73),.48+.27*sin(flow*3.0-phase*.41)));
  float drift=sin(flow*2.0+phase)*.10+cos(flow*3.0-phase*.7)*.045;
  float curl=sin(dot(q.xy,vec2(7.1,-5.3))+flow*2.0+phase)*.028;
  float coordinate=dot(q,movingDirection)+normal.x*(.08+.05*sin(flow+phase))+normal.y*.06+drift+curl;
  float width=max(.018,.064-uDispersion*.18);
  float rDistance=fract(coordinate*2.35+.04)-.50;
  float gDistance=fract(coordinate*2.35+.00)-.50;
  float bDistance=fract(coordinate*2.35-.045)-.50;
  float red=exp(-pow(rDistance/width,2.0))+.24*exp(-pow(rDistance/(width*3.8),2.0));
  float green=exp(-pow(gDistance/width,2.0))+.24*exp(-pow(gDistance/(width*3.8),2.0));
  float blue=exp(-pow(bDistance/width,2.0))+.24*exp(-pow(bDistance/(width*3.8),2.0));
  float fold=pow(max(0.0,sin((q.x-q.y+q.z)*11.0+flow*3.0+phase)),6.0);
  float focus=smoothstep(.05,.64,thickness)*(0.42+fold*.58);
  return vec3(red,green,blue)*focus;
}

void main() {
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 p=(uv-uAnchor)*vec2(uResolution.x/uResolution.y,1.0)*2.0/max(uScale*uZoom,.001);
  float pulse=uMotionKind==1?1.0+sin(TAU*uTime)*uMotionStrength*.12:1.0;
  float explode=uMotionKind==2?(0.5-0.5*cos(TAU*uTime))*uMotionStrength*.34:0.0;
  float span=.54*uCubeScale*pulse,dep=span*.70710678;
  vec3 a=vec3(cos(.5235987756)*span,sin(.5235987756)*span,dep),b=vec3(0,span,-dep),c=vec3(-cos(.5235987756)*span,sin(.5235987756)*span,dep);
  mat3 view=rotX(uCameraPitch)*rotY(uCameraYaw);
  vec3 touches[3]=vec3[3](vec3(0),vec3(1,1,0),vec3(0,1,1));
  vec2 gapDirs[3]=vec2[3](vec2(0,1),vec2(-.8660254,-.5),vec2(.8660254,-.5));
  Hit best;
  best.valid=0.0;
  best.nearDepth=1e8;
  for(int i=0;i<3;i++) {
    float phase=TAU*uTime+float(i)*2.094;
    float rotateMask=uMotionKind==0?1.0:0.0;
    mat3 objectRotation=rotY(sin(phase)*uMotionStrength*.46*rotateMask)*rotX(cos(phase*.73+float(i))*uMotionStrength*.28*rotateMask)*rotZ(sin(phase*.51+float(i))*uMotionStrength*.12*rotateMask);
    mat3 basis=view*objectRotation*mat3(a,b,c);
    vec3 translation=-basis*touches[i]+vec3(gapDirs[i]*(uGap+explode),0);
    Hit hit=intersectCube(p,basis,translation,float(i));
    if(hit.valid>.5&&hit.nearDepth<best.nearDepth) best=hit;
  }
  vec4 background=texture(uBackgroundTexture,uv);
  if(best.valid<.5) {
    outColor=uTransparent?vec4(background.rgb,0.0):background;
    return;
  }

  float thickness=max(0.0,best.farDepth-best.nearDepth);
  vec3 incident=vec3(0,0,1);
  float edgeDistance=min(min(best.local.x,1.0-best.local.x),min(min(best.local.y,1.0-best.local.y),min(best.local.z,1.0-best.local.z)));
  float frontEdge=1.0-smoothstep(0.0,max(.002,uBevel),edgeDistance);
  vec3 geometricNormal=best.normal;
  vec3 surfaceGradient=best.textureGradient-geometricNormal*dot(best.textureGradient,geometricNormal);
  float gradientLength=length(surfaceGradient);
  vec3 normal=gradientLength>.0001?normalize(geometricNormal+surfaceGradient/gradientLength*uSurfaceTextureStrength*(.055+.035*abs(best.textureSignal))):geometricNormal;

  float spectralIorOffset=uDispersion*.16;
  PathData redPath=traceGlassPath(best,incident,normal,max(1.001,uIor-spectralIorOffset),-1.0);
  PathData greenPath=traceGlassPath(best,incident,normal,max(1.001,uIor),0.0);
  PathData bluePath=traceGlassPath(best,incident,normal,max(1.001,uIor+spectralIorOffset),1.0);
  vec3 refracted=vec3(texture(uBackgroundTexture,redPath.uv).r,texture(uBackgroundTexture,greenPath.uv).g,texture(uBackgroundTexture,bluePath.uv).b);

  float entryF0=pow((uIor-1.0)/(uIor+1.0),2.0);
  float entryFresnel=entryF0+(1.0-entryF0)*pow(1.0-clamp(dot(-incident,normal),0.0,1.0),5.0);
  float exitFresnel=(redPath.fresnel+greenPath.fresnel+bluePath.fresnel)/3.0;
  float exitEdge=(redPath.edge+greenPath.edge+bluePath.edge)/3.0;
  vec3 absorption=exp(-uAbsorption*thickness*vec3(1.08,.72,.48));
  vec3 tintTransmission=mix(vec3(1),uTint,.2+uAbsorption*.35);
  vec3 transmitted=refracted*absorption*tintTransmission;
  vec3 entryEnvironment=uEnvironment?studioEnvironment(normal)*uEnvironmentIntensity:background.rgb;
  vec3 exitEnvironment=uEnvironment?studioEnvironment(greenPath.normal)*uEnvironmentIntensity:refracted;
  float exitWeight=clamp(exitFresnel*uReflection+exitEdge*.008*uReflection,0.0,.24);
  float entryWeight=clamp(entryFresnel*uReflection+frontEdge*.012*uReflection,0.0,.24);
  transmitted=mix(transmitted,exitEnvironment,exitWeight);
  vec3 optical=mix(transmitted,entryEnvironment,entryWeight);
  vec3 opaqueBody=mix(background.rgb*.82+uTint*.18,entryEnvironment,.08+uReflection*.12);
  vec3 color=mix(opaqueBody,optical,clamp(uTransparency,0.0,1.0));

  vec3 spectrum=spectralTexture(best.local,normal,thickness,best.index);
  float spectralGain=smoothstep(.018,.075,uDispersion)*.38;
  color+=spectrum*spectralGain*(.025+frontEdge*.1+exitEdge*.05)*uTransparency;
  color+=vec3(.88,.91,.96)*(frontEdge+exitEdge*.55)*(.003+.014*uReflection);
  float alpha=uTransparent?clamp((1.0-uTransparency)+entryWeight+exitWeight+frontEdge*.025+exitEdge*.018,.018,.92):1.0;
  outColor=vec4(max(color,0.0),alpha);
}
