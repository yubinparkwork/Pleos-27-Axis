precision highp float;
precision highp int;
varying vec2 vUv;
uniform sampler2D uBaseline;
uniform sampler2D uVariant;
uniform int uMode;
uniform float uSplit;
uniform float uOverlayOpacity;
uniform bool uTransparent;
uniform float uMasterContrast;
uniform float uMasterBrightness;
uniform bool uGrayscale;
uniform bool uPlaneDebug;
uniform bool uAxisDebug;
uniform vec2 uDesignSize;
uniform vec2 uOrigin;
uniform vec2 uTop;
uniform vec2 uMainLeft;
uniform vec2 uMainRight;
uniform vec2 uRightDown;
uniform vec2 uSoftDown;

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float lineDistance(vec2 ray, vec2 q) { return abs(cross2(ray, q)) / max(length(ray), 0.0001); }
float rayProgress(vec2 ray, vec2 q) { return dot(q, ray) / max(dot(ray, ray), 0.0001); }
float rayDistance(vec2 p, vec2 endpoint) { vec2 r=endpoint-uOrigin; vec2 q=p-uOrigin; return rayProgress(r,q)>=0.0 ? lineDistance(r,q) : 10000.0; }
bool wedge(vec2 a, vec2 b, vec2 q) { return cross2(a,q)>=0.0 && cross2(q,b)>=0.0; }
int planeId(vec2 p) { vec2 q=p-uOrigin; vec2 a=uTop-uOrigin,b=uMainRight-uOrigin,c=uRightDown-uOrigin,d=uSoftDown-uOrigin,e=uMainLeft-uOrigin; if(wedge(a,b,q))return 0;if(wedge(b,c,q))return 1;if(wedge(c,d,q))return 2;if(wedge(d,e,q))return 3;return 4; }
vec3 planeColor(int id) { if(id==0)return vec3(.15,.65,1.);if(id==1)return vec3(1.,.43,.1);if(id==2)return vec3(.57,.18,.9);if(id==3)return vec3(.13,.8,.44);return vec3(.92,.2,.35); }

void main() {
  vec4 baselineSample = texture2D(uBaseline, vUv);
  vec4 variantSample = texture2D(uVariant, vUv);
  vec3 baseline = baselineSample.rgb;
  vec3 variant = variantSample.rgb;
  vec3 color = variant;
  float alpha = variantSample.a;
  if (uMode == 0) color = baseline;
  else if (uMode == 2) { color = vUv.x < uSplit ? baseline : mix(baseline, variant, uOverlayOpacity); alpha = vUv.x < uSplit ? baselineSample.a : mix(baselineSample.a, variantSample.a, uOverlayOpacity); }
  else if (uMode == 3) color = abs(baseline - variant) * 4.0;
  color = (color - 0.5) * uMasterContrast + 0.5 + uMasterBrightness;
  if (uGrayscale) { float l=dot(color,vec3(.299,.587,.114)); color=vec3(l); }
  vec2 p=vec2(vUv.x,1.0-vUv.y)*uDesignSize;
  if(uPlaneDebug) color=planeColor(planeId(p));
  if(uAxisDebug) { float d=min(min(rayDistance(p,uTop),rayDistance(p,uMainLeft)),min(min(rayDistance(p,uMainRight),rayDistance(p,uRightDown)),rayDistance(p,uSoftDown))); color=mix(color,vec3(.1,.85,1.),1.0-smoothstep(1.0,4.0,d)); }
  gl_FragColor=vec4(clamp(color,0.0,1.0),uTransparent ? alpha : 1.0);
}
