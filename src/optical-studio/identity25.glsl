uniform float uIdentityMix;
uniform float uIdentityEngraving;
uniform vec2 uIdentityAxisAccent; // raw handover progress, single eased intensity
uniform vec4 uIdentityLayerTiming; // elapsed seconds, layer delay, fade duration, enabled

float identityLayerVisibility(float order) {
  return uIdentityLayerTiming.w < .5 ? 1.0
    : smoothstep(0.0,uIdentityLayerTiming.z,uIdentityLayerTiming.x-order*uIdentityLayerTiming.y);
}

// A newly arriving image settles before inheriting the authored disappearance
// loop. This clock is per layer, not the global gray-plane dissolve: late
// staggered layers must not appear halfway through an already-dark envelope.
float identityLayerLoopBlend(float order) {
  float handover = smoothstep(.70,1.0,uIdentityMix);
  if (uIdentityLayerTiming.w < .5) return handover;
  float age = uIdentityLayerTiming.x-order*uIdentityLayerTiming.y;
  return handover*smoothstep(uIdentityLayerTiming.z+.35,
    uIdentityLayerTiming.z+1.35,age);
}
uniform float uIdentityAngles[3];
uniform float uIdentityTargets[3];
uniform vec4 uIdentityAngular[6];
uniform vec2 uIdentityRadial[6];
uniform vec3 uIdentityStrokes[6];

// Inverse of the existing output shoulder. The fitted grayscale values are
// display-space observations; convert once to radiance before the common HDR pass.
float identityRadiance(float displayValue) {
  float x = clamp(displayValue, 0.0, .97);
  float y = x <= .04045 ? x/12.92 : pow((x+.055)/1.055,2.4);
  float a = 2.43*y - 2.51, b = .59*y - .03, c = .14*y;
  return max(0.0, (-b-sqrt(max(0.0,b*b-4.0*a*c)))/(2.0*a));
}

vec3 identity25(vec2 xy, float aspect) {
  const float PI = 3.14159265359;
  vec2 p = vec2((xy.x + 2.0*uPanX/100.0)*aspect, -xy.y);
  float theta = atan(p.y,p.x);
  float radius = length(p)*.5;
  float aa = min(.04, 2.0/uResolution.y/max(length(p),.002));
  float gray=0.0, weights=0.0, edge=0.0;
  for(int i=0;i<6;i++) {
    float start = uIdentityAngles[i%3] + (i>=3?PI:0.0);
    float end = i==5 ? uIdentityAngles[0]+2.0*PI : uIdentityAngles[(i+1)%3] + (i>=2?PI:0.0);
    float span=max(.001,end-start);
    float angle=mod(theta-start+PI,2.0*PI)-PI;
    float weight=smoothstep(-aa,aa,angle)*(1.0-smoothstep(span-aa,span+aa,angle));
    float t=clamp(angle/span,0.0,1.0);
    vec4 c=uIdentityAngular[i]; vec2 r=uIdentityRadial[i];
    float value=clamp(c.x+t*(c.y+t*(c.z+t*c.w))+radius*(r.x+r.y*t),0.0,1.0);
    gray+=weight*value; weights+=weight;
    vec3 stroke=uIdentityStrokes[i];
    float along=cos(theta-start)*radius;
    float distance=abs(sin(theta-start))*radius;
    // Fitted video strokes use .006 as a sampling guard around the origin,
    // not an intentional Axis gap. Remove that inset and cover the shared
    // endpoint with the same thin stroke (no extra center dot or new geometry).
    float strokeStart=max(0.0,stroke.x-.006);
    float line=(1.0-smoothstep(.00025,.0008+0.5/uResolution.y,distance))
      *smoothstep(strokeStart-1.0/uResolution.y,strokeStart,along)
      *(1.0-smoothstep(stroke.y-.001,stroke.y+.001,along));
    edge=max(edge,line*stroke.z);
  }
  gray/=max(weights,.001);
  // The original's nearly black line phase is still visible between lit planes.
  gray=max(gray,edge);
  return vec3(identityRadiance(gray));
}

float cross2(vec2 a, vec2 b) { return a.x*b.y-a.y*b.x; }

// Piecewise affine transport: the RGB reflection follows the SAME six faces
// as 25엑시스 while they settle. Linear maps keep all inset contours straight;
// polar angle/radius warps would bend them. Both representations share pan.
vec2 identityDimensionPosition(vec2 xy, float aspect) {
  if (uIdentityMix <= 0.0 || uIdentityMix >= 1.0) return xy;
  if (abs(uIdentityAngles[0]-uIdentityTargets[0])+abs(uIdentityAngles[1]-uIdentityTargets[1])
      +abs(uIdentityAngles[2]-uIdentityTargets[2]) < .000001) return xy;
  const float PI=3.14159265359;
  vec2 p=vec2((xy.x+2.0*uPanX/100.0)*aspect,-xy.y);
  float theta=atan(p.y,p.x);
  for(int i=0;i<6;i++) {
    float start=uIdentityAngles[i%3]+(i>=3?PI:0.0);
    float end=i==5?uIdentityAngles[0]+2.0*PI:uIdentityAngles[(i+1)%3]+(i>=2?PI:0.0);
    float angle=mod(theta-start,2.0*PI);
    if(angle <= end-start+.000001) {
      float targetStart=uIdentityTargets[i%3]+(i>=3?PI:0.0);
      float targetEnd=i==5?uIdentityTargets[0]+2.0*PI:uIdentityTargets[(i+1)%3]+(i>=2?PI:0.0);
      vec2 s0=vec2(cos(start),sin(start)), s1=vec2(cos(end),sin(end));
      vec2 t0=vec2(cos(targetStart),sin(targetStart)), t1=vec2(cos(targetEnd),sin(targetEnd));
      float det=max(cross2(s0,s1),.015);
      vec2 q=t0*(cross2(p,s1)/det)+t1*(cross2(s0,p)/det);
      return vec2(q.x/aspect-2.0*uPanX/100.0,-q.y);
    }
  }
  return xy;
}
