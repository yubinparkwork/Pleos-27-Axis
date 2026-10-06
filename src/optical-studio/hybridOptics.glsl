// A's refracted reflection-image family, opened away from the shared Axis.
// The optical domain and every nested image extend together; B owns the anchor and
// temporal envelopes. These are optical images, not nested opaque geometry.
#ifdef HYBRID_AB
// Object-space optical image normals identify the actual faces, not screen
// halves or view-selected face IDs. Continuous weights retain the bevel blend.
float dimensionFaceGain(vec3 imageNormal,int id){
  vec3 w=pow(abs(imageNormal),vec3(4.));w/=max(w.x+w.y+w.z,.000001);
  vec3 gains=id==0?uFaceGainTop:id==1?uFaceGainLeft:uFaceGainRight;
  return dot(w,gains)*mix(1.,mix(1.35,.65,w.y),uFaceDimensionContrast);
}
float hybridDimensionLayers(vec3 entry, vec3 rd, int id, int channel, float footprint, out vec3 engraving) {
  engraving=vec3(0.0);
  float count = uDimensions[id];
  if (count <= 0.0 || uLightIntensity <= 0.0) return 0.0;
  vec3 local = entry-hybridCenter(id);
  vec3 outward = hybridNormal(entry,id);
#ifdef AXIS_SPLIT
  // Entry is transported into the virtual image domain, not a physical rim.
  outward=roundedNormal(entry-hybridCenter(id),uHalf+hybridExtension());
#endif
  vec3 shading = opticalNormal(entry-uCenters[id],outward);
  float ior = max(1.0001,uIOR+uDispersion*(float(channel)-1.0)*.5);
  vec3 ray = refract(rd,shading,1.0/ior);
  if (dot(ray,outward)>=0.0) ray=refract(rd,outward,1.0/ior);
  ray=normalize(ray);
  vec3 inv=1.0/(sign(ray+vec3(1e-20))*max(abs(ray),vec3(1e-8)));
  float radiance=0.0;
  for(int layer=0;layer<50;++layer) {
    float order=float(layer);
    float activation=smoothstep(0.0,1.0,count-order);
    if(activation<=0.0) break;
    float appearance=identityLayerVisibility(order);
    if(appearance<=0.0) break;
    float phase=uPhase-uDimensionDelay[id];
    float visibility=smoothstep(.12,.82,.5+.5*cos(phase*uLayerFadeCycles-order*uLayerStagger-float(id)*.45));
    float envelope=mix(1.0,visibility,uLayerFadeAmount);
    envelope=mix(1.0,envelope,identityLayerLoopBlend(order));
    float imageOrder=order+(.5-.5*cos(uPhase*uHybridDepthCycles))*uHybridDepthFlow*2.0;
    float imageExtent=(uHalf-uBevel*.16)*exp(-uLayerSpacing[id]*(imageOrder+.7));
    float extent=imageExtent+hybridExtension();
    // Subpixel reflection images contribute no resolvable structure.
    if(imageExtent<footprint*.5) break;
    vec3 ta=(-vec3(extent)-local)*inv, tb=(vec3(extent)-local)*inv;
    vec3 nearV=min(ta,tb), farV=max(ta,tb);
    float nearT=max(nearV.x,max(nearV.y,nearV.z));
    float farT=min(farV.x,min(farV.y,farV.z));
    if(farT<max(nearT,0.0)) continue;
    vec3 p=local+max(nearT,0.0)*ray;
    vec3 a=abs(p);
    int faceAxis=a.x>a.y&&a.x>a.z?0:a.y>a.z?1:2;
    vec2 signedUV=faceAxis==0?p.yz:faceAxis==1?p.xz:p.xy;
    float radius=min(imageExtent*.38,uBevel*imageExtent/uHalf+imageExtent*mix(.025,.28,uHybridDistortion));
    vec2 q=abs(signedUV)-vec2(extent-radius);
    float contour=length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius;
    float edgeDistance=max(0.0,-contour);
    float spacing=imageExtent*(1.0-exp(-uLayerSpacing[id]));
    float width=max(footprint*1.25,spacing*mix(.16,.8,uLayerSoftness)*(1.0+order*uLayerSoftness*.25));
    float offset=uDispersion*imageExtent*4.0*(float(channel)*.8+.12)+width*.32;
    vec2 edgeWeights=exp((q-max(q.x,q.y))/max(width*1.5,imageExtent*.12));
    vec2 smoothSign=signedUV/sqrt(signedUV*signedUV+vec2(width*width*.15));
    vec2 contourNormal=normalize(edgeWeights)*smoothSign;
    vec3 tangent=faceAxis==0?vec3(0,-contourNormal.x,-contourNormal.y)
      :faceAxis==1?vec3(-contourNormal.x,0,-contourNormal.y):vec3(-contourNormal.x,-contourNormal.y,0);
    vec3 worldPoint=p+hybridCenter(id);
    float axisDistance=length(worldPoint);
    float alignment=dot(tangent,worldPoint/max(axisDistance,.00001));
    float farFromAxis=smoothstep(0.0,uHalf*3.0,axisDistance);
    float signedBand=edgeDistance-offset;
    float outwardTail=smoothstep(0.0,.8,signedBand*alignment/width);
    float spreadWidth=width*(1.0+smoothstep(.06,.3,uLayerSpacing[id])*(.2*farFromAxis+outwardTail*(.65+2.0*farFromAxis)));
    spreadWidth=min(spreadWidth,max(width,imageExtent*.32));
    float finalSpreadWidth=spreadWidth;
    float formation=1.0, faceFormation=1.0, release=0.0;
    if(uIdentityMix<1.0) {
      // One spatial handover for images, broad shoulders and the gray carrier.
      // Stagger=0 means simultaneous layers, NOT an immediate full-light gate.
      float arrival=.025+order/max(count,1.0)*.12
        +smoothstep(0.0,uHalf*5.0,axisDistance)*.08;
      // One raw clock, eased once. Previously nested easing compressed most
      // optical energy into a short bright burst in the middle of the dissolve.
      formation=smoothstep(arrival,arrival+.65,uIdentityAxisAccent.x);
      faceFormation=smoothstep(arrival+.10,1.0,uIdentityAxisAccent.x);
      release=smoothstep(arrival+.10,.88,uIdentityMix);
      spreadWidth*=mix(.65,1.0,faceFormation);
    }
    float band=exp(-pow(signedBand/spreadWidth,2.0))*(width/spreadWidth);
    float core=exp(-pow(edgeDistance/max(width*.27,footprint),2.0))*.14;
    // A's smooth optical image normal, rather than B's fixed planar normal.
    // Preserve A's local rounded optical figure, independent of extension.
    // Scaling normals by the expanded box would flatten away A's character.
    vec3 faceProximity=max(vec3(1.0)-(vec3(extent)-a)/imageExtent,vec3(.00001));
    vec3 n=normalize(sign(p)*pow(faceProximity,vec3(mix(24.0,10.0,uHybridDistortion))));
    float faceGain=dimensionFaceGain(n,id);
    float incident=environmentProfile(entry,reflect(ray,n),.035+uRoughness*.14+order*.007,1.0)[channel];
    // Modulate each optical image along its length, not the surface shape.
    envelope*=layerLightEnvelope(worldPoint,id,order);
    float decay=mix(mix(.08,.6,uLayerFalloff),.10,uHybridDensity*.8);
    float attenuation=exp(-order*decay-uAbsorption*(uHalf-imageExtent)*2.0);
    float edgeFresnel=mix(.32,1.0,pow(1.0-abs(dot(-ray,n)),3.0));
    float boundaryFade=smoothstep(0.0,max(footprint*1.5,width*.45),-contour);
    // Fade well before the remote numerical cap, never at the original cube
    // boundary. The gradient itself continues through that former boundary.
    float farReach=max(abs(worldPoint.x),max(abs(worldPoint.y),abs(worldPoint.z)));
    float openFalloff=1.0-smoothstep(uHalf*4.0,uHalf*8.0,farReach);
    openFalloff=mix(1.0,openFalloff,uHybridOpening);
    if(uIdentityMix<1.0) {
      float groove=exp(-pow(edgeDistance/max(footprint*1.5,finalSpreadWidth*.33),2.0));
      float releaseWidth=finalSpreadWidth*(.35+20.0*release*release);
      float released=release*(1.0-smoothstep(releaseWidth*.55,releaseWidth+footprint*2.0,edgeDistance));
      engraving.x=max(engraving.x,appearance*formation*groove*activation*openFalloff);
      engraving.y=max(engraving.y,appearance*released*activation*openFalloff);
      engraving.z+=appearance*formation*activation*attenuation*(band+core)*boundaryFade*openFalloff;
    }
    // Narrow initial grooves must not brighten inversely with their width.
    radiance+=faceGain*formation*(spreadWidth/finalSpreadWidth)*activation*appearance*envelope*attenuation*(band+core)*incident*edgeFresnel*boundaryFade*openFalloff;
    // Broad optical shoulders on the OPEN images, not an opaque surface fill.
    // The original contour/Axis is untouched; all radiance is sampled from the
    // same RGB rig. A bounded 8-image budget keeps 50-layer scenes interactive.
    if(layer<8 && uHybridFaceReflection>0.0 && uHybridOpening>0.0) {
      float sheetWidth=max(footprint*2.0,imageExtent*mix(.055,.42,uHybridFaceWidth));
      float sheetCenter=imageExtent*(.09+.045*order)+offset;
      float sheet=exp(-pow((edgeDistance-sheetCenter)/sheetWidth,2.0));
      vec3 alongFace=normalize(cross(n,tangent));
      float longitudinal=dot(worldPoint,alongFace)/uHalf;
      float aperture=exp(-pow((longitudinal-.6*float(id-1))/2.6,4.0));
      float sheetEnergy=.32*exp(-order*.32)*uHybridFaceReflection*uHybridOpening*aperture;
      // A displaced virtual reflection stretches across the face. The optical
      // normal perturbation is continuous in 3D; no face-ID colour switching.
      vec3 overlapNormal=normalize(n+tangent*(.12+.28*uHybridDistortion)
        *exp(-edgeDistance/(imageExtent*.55))+alongFace*clamp(longitudinal,-4.0,4.0)*.025);
      float overlapLight=environmentProfile(worldPoint,reflect(ray,overlapNormal),
        .065+uRoughness*.22+order*.012,1.0)[channel];
      float overlapBand=exp(-pow((edgeDistance-sheetCenter-sheetWidth*.85)/(sheetWidth*1.35),2.0));
      float faceLight=sheet*incident+uHybridRefractionOverlap*.75*overlapBand*overlapLight;
      radiance+=faceGain*formation*faceFormation*activation*appearance*envelope*attenuation*sheetEnergy*faceLight
        *edgeFresnel*boundaryFade*openFalloff;
    }
  }
  return radiance*uReflection*1.2*clamp((ior-1.0)*2.0,0.0,1.0);
}
#endif
