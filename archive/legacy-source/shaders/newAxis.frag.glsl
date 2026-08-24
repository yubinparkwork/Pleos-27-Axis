precision highp float;
precision highp int;

varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uDesignSize;
uniform vec2 uOrigin;
uniform vec2 uTop;
uniform vec2 uMainLeft;
uniform vec2 uMainRight;
uniform vec2 uRightDown;
uniform vec2 uSoftDown;
uniform vec2 uLeftBoundary;
uniform float uLeftShadowWidth;
uniform float uSoftDownWidthStart;
uniform float uSoftDownWidthEnd;
uniform float uLumTopRight;
uniform float uLumRightMiddle;
uniform float uLumBottomLeft;
uniform float uLumLeftMiddle;
uniform float uLumBlack;
uniform float uTime;
uniform int uFitMode;
uniform int uDebugMode;
uniform bool uShowGuides;
uniform bool uTextureEnabled;
uniform float uTextureAmount;
uniform float uTextureScale;
uniform float uTextureSeamIntensity;

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
  for (int octave = 0; octave < 5; octave++) {
    value += valueNoise(p) * amplitude;
    p = rotation * p * 2.03 + vec2(13.1, 7.7);
    amplitude *= 0.5;
  }
  return value;
}

float signedLineDistance(vec2 ray, vec2 q) {
  return cross2(ray, q) / max(length(ray), 0.0001);
}

float rayProgress(vec2 ray, vec2 q) {
  return dot(q, ray) / max(dot(ray, ray), 0.0001);
}

float distanceToMainAxis(vec2 p) {
  vec2 q = p - uOrigin;
  vec2 ray = rayProgress(uMainRight - uOrigin, q) >= 0.0
    ? uMainRight - uOrigin
    : uMainLeft - uOrigin;
  return abs(signedLineDistance(ray, q));
}

float distanceToTopAxis(vec2 p) {
  return abs(signedLineDistance(uTop - uOrigin, p - uOrigin));
}

float distanceToRightDownAxis(vec2 p) {
  return abs(signedLineDistance(uRightDown - uOrigin, p - uOrigin));
}

float distanceToSoftDownFold(vec2 p) {
  return signedLineDistance(uSoftDown - uOrigin, p - uOrigin);
}

bool inClockwiseWedge(vec2 a, vec2 b, vec2 q) {
  return cross2(a, q) >= 0.0 && cross2(q, b) >= 0.0;
}

int getPlaneId(vec2 p) {
  vec2 q = p - uOrigin;
  vec2 top = uTop - uOrigin;
  vec2 mainRight = uMainRight - uOrigin;
  vec2 rightDown = uRightDown - uOrigin;
  vec2 softDown = uSoftDown - uOrigin;
  vec2 mainLeft = uMainLeft - uOrigin;

  if (inClockwiseWedge(top, mainRight, q)) return 0;
  if (inClockwiseWedge(mainRight, rightDown, q)) return 1;
  if (inClockwiseWedge(rightDown, softDown, q)) return 2;
  if (inClockwiseWedge(softDown, mainLeft, q)) return 3;
  return 4;
}

float leftPlaneLighting(vec2 p) {
  vec2 boundaryRay = uOrigin - uLeftBoundary;
  float sd = signedLineDistance(boundaryRay, p - uLeftBoundary);
  return smoothstep(-uLeftShadowWidth * 0.52, uLeftShadowWidth * 0.48, sd);
}

float getPlaneLuminance(int planeId, vec2 p) {
  vec2 n = p / uDesignSize;
  float distanceFromOrigin = length(p - uOrigin);

  if (planeId == 0) {
    return uLumTopRight + 20.0 * (n.x - 0.5) + 2.0 * (n.y - 0.5);
  }
  if (planeId == 1) {
    return uLumRightMiddle + 13.0 * (n.x - 0.5) - 4.0 * (n.y - 0.5);
  }
  if (planeId == 2) {
    return uLumBlack;
  }
  if (planeId == 3) {
    float localPeak = 28.0 * exp(-distanceFromOrigin / 690.0);
    return uLumBottomLeft + localPeak - 9.0 * (n.y - 0.5) + 5.0 * (0.5 - n.x);
  }

  float lit = uLumLeftMiddle + 7.0 * (n.x - 0.35) - 3.0 * (n.y - 0.55);
  return mix(uLumBlack, lit, leftPlaneLighting(p));
}

float hardBoundaryBlend(
  vec2 p,
  vec2 endpoint,
  int beforeId,
  int afterId,
  float fallback
) {
  vec2 ray = endpoint - uOrigin;
  vec2 q = p - uOrigin;
  float progress = rayProgress(ray, q);
  float sd = signedLineDistance(ray, q);
  float aa = max(fwidth(sd), 0.72);
  float beforeLum = getPlaneLuminance(beforeId, p);
  float afterLum = getPlaneLuminance(afterId, p);
  float blend = mix(beforeLum, afterLum, smoothstep(-aa, aa, sd));
  float boundaryWeight = step(0.0, progress) * step(abs(sd), aa * 1.25);
  return mix(fallback, blend, boundaryWeight);
}

float resolvedLuminance(vec2 p, int planeId) {
  float lum = getPlaneLuminance(planeId, p);

  vec2 softRay = uSoftDown - uOrigin;
  vec2 q = p - uOrigin;
  float softProgress = clamp(rayProgress(softRay, q), 0.0, 1.0);
  float softDistance = distanceToSoftDownFold(p);
  float softWidth = mix(uSoftDownWidthStart, uSoftDownWidthEnd, softProgress);
  if ((planeId == 2 || planeId == 3)
      && rayProgress(softRay, q) >= 0.0
      && abs(softDistance) < softWidth * 1.5) {
    float bright = getPlaneLuminance(3, p);
    float black = getPlaneLuminance(2, p);
    float fold = smoothstep(-softWidth * 0.42, softWidth * 0.72, softDistance);
    lum = mix(black, bright, fold);
  }

  lum = hardBoundaryBlend(p, uTop, 4, 0, lum);
  lum = hardBoundaryBlend(p, uMainRight, 0, 1, lum);
  lum = hardBoundaryBlend(p, uRightDown, 1, 2, lum);
  lum = hardBoundaryBlend(p, uMainLeft, 3, 4, lum);
  return clamp(lum, 0.0, 255.0);
}

vec3 planeDebugColor(int planeId) {
  if (planeId == 0) return vec3(0.16, 0.66, 1.0);
  if (planeId == 1) return vec3(1.0, 0.44, 0.12);
  if (planeId == 2) return vec3(0.58, 0.20, 0.92);
  if (planeId == 3) return vec3(0.16, 0.82, 0.46);
  return vec3(0.94, 0.22, 0.38);
}

float guideRay(vec2 p, vec2 endpoint) {
  vec2 ray = endpoint - uOrigin;
  vec2 q = p - uOrigin;
  float progress = rayProgress(ray, q);
  float distance = abs(signedLineDistance(ray, q));
  return progress >= 0.0 && progress <= 1.05
    ? 1.0 - smoothstep(0.8, 2.2, distance)
    : 0.0;
}

float rayHeat(vec2 p, vec2 endpoint, float width) {
  vec2 ray = endpoint - uOrigin;
  vec2 q = p - uOrigin;
  float progress = rayProgress(ray, q);
  float distance = abs(signedLineDistance(ray, q));
  float segment = step(0.0, progress) * step(progress, 1.08);
  return exp(-distance / max(width, 0.1)) * segment;
}

vec3 errorMapTexture(vec2 p, int planeId, float lum) {
  vec2 texturePoint = p * (0.0042 * uTextureScale);
  float broad = fbm(texturePoint);
  float directional = fbm(vec2(p.x * 0.0021, p.y * 0.012) * uTextureScale);
  float grain = valueNoise(p * (0.22 * uTextureScale));
  float planeLight = pow(clamp(lum / 140.0, 0.0, 1.0), 0.82);

  float planeBias = 0.018;
  if (planeId == 0) planeBias = 0.085;
  if (planeId == 1) planeBias = 0.070;
  if (planeId == 2) planeBias = 0.010;
  if (planeId == 3) planeBias = 0.105;
  if (planeId == 4) planeBias = 0.032;

  float mainHeat = rayHeat(p, uMainLeft, 2.6) + rayHeat(p, uMainRight, 2.6);
  float topHeat = rayHeat(p, uTop, 2.3);
  float rightHeat = rayHeat(p, uRightDown, 2.5);

  vec2 softRay = uSoftDown - uOrigin;
  vec2 q = p - uOrigin;
  float softProgress = clamp(rayProgress(softRay, q), 0.0, 1.0);
  float softWidth = mix(uSoftDownWidthStart, uSoftDownWidthEnd, softProgress);
  float foldHeat = exp(-abs(distanceToSoftDownFold(p)) / max(softWidth * 0.24, 5.0));
  foldHeat *= step(0.0, rayProgress(softRay, q));

  vec2 leftRay = uOrigin - uLeftBoundary;
  float leftProgress = rayProgress(leftRay, p - uLeftBoundary);
  float leftBand = exp(-abs(signedLineDistance(leftRay, p - uLeftBoundary)) / 42.0);
  leftBand *= step(0.0, leftProgress) * step(leftProgress, 1.08);

  float seamHeat = mainHeat * 0.62 + topHeat * 0.44 + rightHeat * 0.88;
  seamHeat += foldHeat * 0.54 + leftBand * 0.22;
  seamHeat *= uTextureSeamIntensity;

  float field = planeBias + planeLight * (0.075 + broad * 0.17);
  field += (broad - 0.5) * 0.055 + (directional - 0.5) * 0.038;
  field += (grain - 0.5) * 0.022 + seamHeat;
  field = clamp(field * uTextureAmount, 0.0, 1.0);

  float red = smoothstep(0.01, 0.72, field);
  float hot = smoothstep(0.70, 1.0, field);
  return vec3(red, hot * 0.23, hot * 0.012);
}

vec2 screenToDesign(vec2 screenPixel) {
  float containScale = min(uResolution.x / uDesignSize.x, uResolution.y / uDesignSize.y);
  float coverScale = max(uResolution.x / uDesignSize.x, uResolution.y / uDesignSize.y);
  float scale = uFitMode == 1 ? containScale : coverScale;
  vec2 offset = (uResolution - uDesignSize * scale) * 0.5;
  return (screenPixel - offset) / scale;
}

void main() {
  vec2 screenPixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 p = screenToDesign(screenPixel);
  int planeId = getPlaneId(p);
  float timeInvariant = uTime * 0.0;
  float lum = resolvedLuminance(p, planeId) + timeInvariant;
  vec3 color = vec3(lum / 255.0);

  if (uTextureEnabled) {
    color = errorMapTexture(p, planeId, lum);
  }

  if (uDebugMode == 1) {
    color = planeDebugColor(planeId);
  }

  if (uShowGuides) {
    float guides = 0.0;
    guides = max(guides, guideRay(p, uTop));
    guides = max(guides, guideRay(p, uMainLeft));
    guides = max(guides, guideRay(p, uMainRight));
    guides = max(guides, guideRay(p, uRightDown));
    guides = max(guides, guideRay(p, uSoftDown));
    float originGuide = 1.0 - smoothstep(3.0, 8.0, length(p - uOrigin));
    color = mix(color, vec3(0.08, 0.86, 1.0), max(guides * 0.72, originGuide));
  }

  gl_FragColor = vec4(color, 1.0);
}
