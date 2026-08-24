import * as THREE from "three";
import type { SpectralSettings } from "../state/studioState";

export interface SpectralShaderUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uFacePhase: THREE.IUniform<number>;
  uColorMode: THREE.IUniform<number>;
  uSpectralIntensity: THREE.IUniform<number>;
  uSpectralWidth: THREE.IUniform<number>;
  uBandSoftness: THREE.IUniform<number>;
  uBandCompression: THREE.IUniform<number>;
  uSpectralScale: THREE.IUniform<number>;
  uSpectralStretch: THREE.IUniform<number>;
  uHueOffset: THREE.IUniform<number>;
  uWarmBias: THREE.IUniform<number>;
  uVioletBias: THREE.IUniform<number>;
  uCyanAccent: THREE.IUniform<number>;
  uWhiteCore: THREE.IUniform<number>;
  uCausticContrast: THREE.IUniform<number>;
  uCurvatureInfluence: THREE.IUniform<number>;
  uAxisInfluence: THREE.IUniform<number>;
  uCenterInfluence: THREE.IUniform<number>;
  uFlowInfluence: THREE.IUniform<number>;
  uDispersion: THREE.IUniform<number>;
  uIridescence: THREE.IUniform<number>;
  uFresnelPower: THREE.IUniform<number>;
  uRoughness: THREE.IUniform<number>;
  uTransmission: THREE.IUniform<number>;
  uThickness: THREE.IUniform<number>;
  uIor: THREE.IUniform<number>;
  uEdgeRoughness: THREE.IUniform<number>;
  uEdgeOpticalBoost: THREE.IUniform<number>;
  uThicknessVariation: THREE.IUniform<number>;
  uEdgeThickness: THREE.IUniform<number>;
  uCenterThickness: THREE.IUniform<number>;
  uVolumeScale: THREE.IUniform<number>;
  uSpectralSamples: THREE.IUniform<number>;
  uIridescenceIor: THREE.IUniform<number>;
  uFilmThicknessMin: THREE.IUniform<number>;
  uFilmThicknessMax: THREE.IUniform<number>;
  uFilmThicknessNoise: THREE.IUniform<number>;
  uAttenuationDistance: THREE.IUniform<number>;
  uInternalDensity: THREE.IUniform<number>;
  uAbsorptionStrength: THREE.IUniform<number>;
  uImperfectionAmount: THREE.IUniform<number>;
  uScratchScale: THREE.IUniform<number>;
  uScratchDensity: THREE.IUniform<number>;
  uSurfaceWaviness: THREE.IUniform<number>;
  uCausticIntensity: THREE.IUniform<number>;
  uKeyIntensity: THREE.IUniform<number>;
  uWarmCard: THREE.IUniform<number>;
  uCoolCard: THREE.IUniform<number>;
  uCenterAccent: THREE.IUniform<number>;
  uBloom: THREE.IUniform<number>;
  uHaze: THREE.IUniform<number>;
  uGrain: THREE.IUniform<number>;
  uDither: THREE.IUniform<number>;
  uBreath: THREE.IUniform<number>;
  uFlowSpeed: THREE.IUniform<number>;
  uCenterPulse: THREE.IUniform<number>;
  uSelected: THREE.IUniform<number>;
}

const vertexShader = /* glsl */`
  precision highp float;
  attribute float aAxisDistance;
  attribute float aCenterDistance;
  attribute float aFaceEdge;
  uniform float uTime;
  uniform float uBreath;
  uniform float uCenterPulse;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying float vAxisDistance;
  varying float vCenterDistance;
  varying float vFaceEdge;

  void main() {
    vec3 transformed = position;
    float lock = smoothstep(0.0, 0.065, aAxisDistance) * smoothstep(0.0, 0.07, aCenterDistance);
    float loop = sin(uTime * 6.2831853 + position.x * 1.35 + position.y * 0.82);
    float pulse = sin(uTime * 6.2831853) * exp(-aCenterDistance * 6.5);
    transformed.z += lock * loop * uBreath * 0.075 + lock * pulse * uCenterPulse * 0.035;
    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    vAxisDistance = aAxisDistance;
    vCenterDistance = aCenterDistance;
    vFaceEdge = aFaceEdge;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uFacePhase;
  uniform float uColorMode;
  uniform float uSpectralIntensity;
  uniform float uSpectralWidth;
  uniform float uBandSoftness;
  uniform float uBandCompression;
  uniform float uSpectralScale;
  uniform float uSpectralStretch;
  uniform float uHueOffset;
  uniform float uWarmBias;
  uniform float uVioletBias;
  uniform float uCyanAccent;
  uniform float uWhiteCore;
  uniform float uCausticContrast;
  uniform float uCurvatureInfluence;
  uniform float uAxisInfluence;
  uniform float uCenterInfluence;
  uniform float uFlowInfluence;
  uniform float uDispersion;
  uniform float uIridescence;
  uniform float uFresnelPower;
  uniform float uRoughness;
  uniform float uTransmission;
  uniform float uThickness;
  uniform float uIor;
  uniform float uEdgeRoughness;
  uniform float uEdgeOpticalBoost;
  uniform float uThicknessVariation;
  uniform float uEdgeThickness;
  uniform float uCenterThickness;
  uniform float uVolumeScale;
  uniform float uSpectralSamples;
  uniform float uIridescenceIor;
  uniform float uFilmThicknessMin;
  uniform float uFilmThicknessMax;
  uniform float uFilmThicknessNoise;
  uniform float uAttenuationDistance;
  uniform float uInternalDensity;
  uniform float uAbsorptionStrength;
  uniform float uImperfectionAmount;
  uniform float uScratchScale;
  uniform float uScratchDensity;
  uniform float uSurfaceWaviness;
  uniform float uCausticIntensity;
  uniform float uKeyIntensity;
  uniform float uWarmCard;
  uniform float uCoolCard;
  uniform float uCenterAccent;
  uniform float uBloom;
  uniform float uHaze;
  uniform float uGrain;
  uniform float uDither;
  uniform float uFlowSpeed;
  uniform float uSelected;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  varying float vAxisDistance;
  varying float vCenterDistance;
  varying float vFaceEdge;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float bump(float x, float center, float width) {
    float d = (x - center) / max(width, 0.001);
    return exp(-d * d * 2.1);
  }

  vec3 fullSpectrum(float x, float width) {
    x = fract(x);
    vec3 deepViolet = vec3(0.13, 0.015, 0.31) * bump(x, 0.02, width * 1.18) * uVioletBias;
    vec3 blue = vec3(0.08, 0.18, 1.0) * bump(x, 0.16, width * 0.9);
    vec3 cyan = vec3(0.02, 0.72, 1.0) * bump(x, 0.28, width * 0.72) * uCyanAccent;
    vec3 warmWhite = vec3(1.0, 0.92, 0.82) * bump(x, 0.43, width * 0.65) * uWhiteCore;
    vec3 yellow = vec3(1.0, 0.72, 0.05) * bump(x, 0.52, width * 0.58) * uWarmBias;
    vec3 orange = vec3(1.0, 0.16, 0.015) * bump(x, 0.62, width * 0.72) * uWarmBias;
    vec3 magenta = vec3(0.93, 0.015, 0.38) * bump(x, 0.76, width * 0.88) * uVioletBias;
    vec3 violet = vec3(0.42, 0.025, 1.0) * bump(x, 0.92, width * 1.08) * uVioletBias;
    return deepViolet + blue + cyan + warmWhite + yellow + orange + magenta + violet;
  }

  vec3 pleosBlue(float x, float width) {
    x = fract(x);
    return vec3(0.027, 0.067, 0.173) * bump(x, 0.03, width * 1.3)
      + vec3(0.059, 0.137, 0.353) * bump(x, 0.24, width)
      + vec3(0.09, 0.22, 0.66) * bump(x, 0.46, width * 0.86)
      + vec3(0.137, 0.314, 1.0) * bump(x, 0.66, width * 0.75)
      + vec3(0.804, 0.863, 1.0) * bump(x, 0.83, width * 0.65) * uWhiteCore;
  }

  vec3 environmentColor(vec3 direction) {
    vec3 d = normalize(direction);
    float horizon = smoothstep(-0.65, 0.82, d.y);
    vec3 environment = mix(vec3(0.0045), vec3(0.075, 0.078, 0.082), horizon);
    float overhead = pow(max(dot(d, normalize(vec3(-0.28, 0.83, 0.48))), 0.0), 36.0);
    float verticalCard = pow(max(dot(d, normalize(vec3(0.88, 0.04, 0.47))), 0.0), 78.0);
    float warmCard = pow(max(dot(d, normalize(vec3(-0.76, -0.18, 0.62))), 0.0), 64.0);
    float broadSoftbox = exp(-pow((d.x + 0.18) / 0.42, 2.0)) * smoothstep(-0.72, 0.68, d.y);
    environment += vec3(0.92, 0.95, 1.0) * overhead * 0.9;
    environment += vec3(0.48, 0.62, 0.76) * verticalCard * 0.52;
    environment += vec3(0.92, 0.72, 0.5) * warmCard * 0.32;
    environment += vec3(0.16, 0.18, 0.22) * broadSoftbox * 0.55;
    return environment;
  }

  float ggxDistribution(float noH, float roughness) {
    float a = max(0.025, roughness * roughness);
    float a2 = a * a;
    float denominator = noH * noH * (a2 - 1.0) + 1.0;
    return a2 / max(0.0001, 3.14159265 * denominator * denominator);
  }

  float smithVisibility(float noV, float noL, float roughness) {
    float k = pow(roughness + 1.0, 2.0) / 8.0;
    float gv = noV / mix(noV, 1.0, k);
    float gl = noL / mix(noL, 1.0, k);
    return gv * gl;
  }

  vec3 directSpecular(vec3 N, vec3 V, vec3 L, vec3 radiance, float f0, float roughness) {
    vec3 H = normalize(V + L);
    float noV = max(dot(N, V), 0.001);
    float noL = max(dot(N, L), 0.0);
    float noH = max(dot(N, H), 0.0);
    float voH = max(dot(V, H), 0.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - voH, 5.0);
    float specular = ggxDistribution(noH, roughness) * smithVisibility(noV, noL, roughness) * fresnel;
    return radiance * specular * noL;
  }

  vec3 thinFilm(float thicknessNm, float cosTheta) {
    float phase = 6.2831853 * 2.0 * uIridescenceIor * thicknessNm * max(0.12, cosTheta);
    vec3 wavelengths = vec3(680.0, 550.0, 440.0);
    return 0.5 + 0.5 * cos(phase / wavelengths + vec3(0.0, 1.7, 3.4));
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 warmDir = normalize(vec3(-0.62, 0.7, 0.54));
    vec3 coolDir = normalize(vec3(0.72, -0.28, 0.64));
    float physicalEdge = 1.0 - smoothstep(0.0, 0.065, vFaceEdge);
    float waveA = sin(vWorldPosition.x * uScratchScale + vWorldPosition.y * 1.73);
    float waveB = sin(vWorldPosition.y * (uScratchScale * 0.61) - vWorldPosition.z * 8.7);
    vec3 microNormal = normalize(vec3(waveA, waveB, 1.0));
    N = normalize(mix(N, normalize(N + microNormal * 0.18), uImperfectionAmount * (0.35 + 0.65 * uSurfaceWaviness)));
    float noV = max(abs(dot(N, V)), 0.001);
    float warmLight = pow(max(dot(N, warmDir), 0.0), mix(1.2, 3.4, uRoughness)) * uWarmCard;
    float coolLight = pow(max(dot(N, coolDir), 0.0), mix(1.1, 3.0, uRoughness)) * uCoolCard;
    float dielectricF0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float physicalFresnel = dielectricF0 + (1.0 - dielectricF0) * pow(1.0 - noV, 5.0);
    float artisticFresnel = pow(clamp(1.0 - noV, 0.0, 1.0), uFresnelPower);
    float curvature = clamp(length(fwidth(N)) * 4.2, 0.0, 1.0);
    float axisField = exp(-vAxisDistance * 7.5);
    float centerField = exp(-vCenterDistance * 4.8);
    float flow = sin(vWorldPosition.x * 2.7 + vWorldPosition.y * 1.35 + sin(vWorldPosition.y * 2.1 + uFacePhase) * 0.42 + uTime * uFlowSpeed * 6.2831853);
    float spectralCoordinate =
      dot(vWorldPosition.xy, normalize(vec2(0.72, 0.39))) * uSpectralScale * 0.15
      + N.x * uSpectralStretch * 0.1
      + axisField * uAxisInfluence * 0.045
      + centerField * uCenterInfluence * 0.065
      + curvature * uCurvatureInfluence * 0.035
      + flow * uFlowInfluence * 0.05
      + uFacePhase + uHueOffset;
    spectralCoordinate = fract(spectralCoordinate * max(0.45, uBandCompression * 0.64));
    float width = mix(0.022, 0.072, uBandSoftness) * mix(0.7, 1.35, uSpectralWidth * 2.0);
    float sampleQuality = mix(0.72, 1.18, clamp((uSpectralSamples - 3.0) / 6.0, 0.0, 1.0));
    vec3 spectrum = uColorMode > 0.5 ? fullSpectrum(spectralCoordinate, width) : pleosBlue(spectralCoordinate, width);
    vec3 shiftedR = uColorMode > 0.5 ? fullSpectrum(spectralCoordinate + uDispersion * 0.025 * sampleQuality, width) : pleosBlue(spectralCoordinate + uDispersion * 0.018 * sampleQuality, width);
    vec3 shiftedB = uColorMode > 0.5 ? fullSpectrum(spectralCoordinate - uDispersion * 0.025 * sampleQuality, width) : pleosBlue(spectralCoordinate - uDispersion * 0.018 * sampleQuality, width);
    spectrum.r = mix(spectrum.r, shiftedR.r, uDispersion);
    spectrum.b = mix(spectrum.b, shiftedB.b, uDispersion);
    float lightResponse = 0.012 + warmLight * 0.54 + coolLight * 0.4 + artisticFresnel * uIridescence * 0.42 + curvature * 0.08 + physicalEdge * 0.16;
    float centerGlow = centerField * centerField * uCenterAccent * (0.45 + 0.55 * warmLight);
    float caustic = pow(clamp(lightResponse + centerGlow, 0.0, 2.0), uCausticContrast);
    vec3 reflected = environmentColor(reflect(-V, N));
    float eta = 1.0 / max(1.01, uIor);
    vec3 refractedR = environmentColor(refract(-V, N, eta * (1.0 + uDispersion * 0.018)));
    vec3 refractedG = environmentColor(refract(-V, N, eta));
    vec3 refractedB = environmentColor(refract(-V, N, eta * (1.0 - uDispersion * 0.018)));
    vec3 refracted = vec3(refractedR.r, refractedG.g, refractedB.b);
    float localThickness = uThickness * uVolumeScale;
    localThickness *= 1.0 + uThicknessVariation * (physicalEdge * uEdgeThickness + centerField * uCenterThickness - 0.5);
    float opticalPath = max(0.01, localThickness) / max(0.18, noV);
    vec3 absorption = mix(vec3(0.12), vec3(0.07, 0.105, 0.18), 1.0 - uColorMode) * uAbsorptionStrength;
    refracted *= exp(-absorption * opticalPath * uInternalDensity / max(0.05, uAttenuationDistance));
    vec3 internalReflection = environmentColor(reflect(refract(-V, N, eta), -N));
    vec3 base = mix(vec3(0.006), refracted * 0.72, clamp(uTransmission, 0.0, 1.0));
    base = mix(base, reflected, physicalFresnel);
    base += internalReflection * (0.025 + artisticFresnel * 0.08) * uTransmission;
    float effectiveRoughness = mix(uRoughness, uEdgeRoughness, physicalEdge);
    vec3 specular = directSpecular(N, V, warmDir, vec3(1.0, 0.78, 0.58) * uWarmCard, dielectricF0, effectiveRoughness)
      + directSpecular(N, V, coolDir, vec3(0.55, 0.7, 1.0) * uCoolCard, dielectricF0, effectiveRoughness);
    float internalWave = sin(dot(vWorldPosition.xy, vec2(1.18, -0.76)) * 2.15 + N.z * 1.7 + uFacePhase * 9.0);
    float internalFocus = pow(max(internalWave, 0.0), 9.0) * (0.3 + 0.7 * uTransmission);
    float fractureCoordinate = dot(vWorldPosition, normalize(vec3(0.71, -0.48, 0.52)))
      + sin(dot(vWorldPosition, vec3(1.17, 0.63, -0.82)) * 2.1 + uFacePhase * 9.0) * 0.13;
    float fractureCenter = mix(-0.34, 0.3, fract(uFacePhase * 17.31 + 0.27));
    float fractureDistance = abs(fractureCoordinate - fractureCenter);
    float fractureCore = exp(-fractureDistance * fractureDistance * 420.0);
    float fractureHalo = max(exp(-fractureDistance * fractureDistance * 54.0) - fractureCore, 0.0);
    float internalFracture = fractureCore * mix(0.34, 1.0, clamp(uImperfectionAmount * 5.0, 0.0, 1.0));
    float prismRibbon = pow(max(sin(spectralCoordinate * 6.2831853 + vWorldPosition.z * 2.1), 0.0), 18.0);
    float spectralMask = smoothstep(0.3, 0.78, caustic + centerField * uCenterAccent * 0.18 + physicalEdge * 0.22 + internalFocus * 0.48);
    spectralMask = max(spectralMask, prismRibbon * (0.26 + uDispersion) + internalFracture * 0.38);
    float filmNoise = sin(dot(vWorldPosition, vec3(7.1, 11.7, 5.3)) + waveA * 0.7) * 0.5 + 0.5;
    float filmThickness = mix(uFilmThicknessMin, uFilmThicknessMax, mix(centerField, filmNoise, uFilmThicknessNoise));
    vec3 filmColor = thinFilm(filmThickness, noV);
    vec3 color = base + specular * uKeyIntensity * 0.55 + spectrum * spectralMask * uSpectralIntensity * uCausticIntensity * 0.5;
    color *= 1.0 - internalFracture * (0.2 + 0.22 * uInternalDensity);
    color += mix(vec3(0.66, 0.83, 1.0), spectrum, 0.68) * fractureHalo * uSpectralIntensity * uCausticIntensity * 0.32;
    color += reflected * prismRibbon * physicalFresnel * uEdgeOpticalBoost * 0.18;
    color += filmColor * uIridescence * physicalFresnel * (0.08 + 0.16 * uTransmission);
    color += reflected * physicalEdge * uEdgeOpticalBoost * (0.16 + 0.42 * physicalFresnel);
    color += spectrum * pow(max(caustic - 0.55, 0.0), 1.4) * uBloom;
    color = mix(color, color + reflected * 0.4, artisticFresnel * uHaze);
    color += vec3(uSelected * 0.045);
    float noise = hash12(gl_FragCoord.xy + uFacePhase * 791.0) - 0.5;
    color += noise * (uGrain * 0.35 + uDither / 255.0);
    gl_FragColor = vec4(max(color, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSpectralMaterial(settings: SpectralSettings, faceIndex: number, faceCount: number): THREE.ShaderMaterial {
  const uniforms: SpectralShaderUniforms = {
    uTime: { value: 0 },
    uFacePhase: { value: faceIndex / Math.max(1, faceCount) * 0.37 },
    uColorMode: { value: settings.colorMode === "full-spectrum-experimental" ? 1 : 0 },
    uSpectralIntensity: { value: settings.spectralIntensity }, uSpectralWidth: { value: settings.spectralWidth },
    uBandSoftness: { value: settings.bandSoftness }, uBandCompression: { value: settings.bandCompression },
    uSpectralScale: { value: settings.spectralScale }, uSpectralStretch: { value: settings.spectralStretch },
    uHueOffset: { value: settings.hueOffset }, uWarmBias: { value: settings.warmBias }, uVioletBias: { value: settings.violetBias },
    uCyanAccent: { value: settings.cyanAccent }, uWhiteCore: { value: settings.whiteCore }, uCausticContrast: { value: settings.causticContrast },
    uCurvatureInfluence: { value: settings.curvatureInfluence }, uAxisInfluence: { value: settings.axisInfluence },
    uCenterInfluence: { value: settings.centerInfluence }, uFlowInfluence: { value: settings.flowInfluence },
    uDispersion: { value: settings.dispersion }, uIridescence: { value: settings.iridescence }, uFresnelPower: { value: settings.fresnelPower },
    uRoughness: { value: settings.roughness }, uTransmission: { value: settings.transmission }, uThickness: { value: settings.thickness }, uIor: { value: settings.ior },
    uEdgeRoughness: { value: settings.edgeRoughness }, uEdgeOpticalBoost: { value: settings.edgeOpticalBoost },
    uThicknessVariation: { value: settings.thicknessVariation }, uEdgeThickness: { value: settings.edgeThickness },
    uCenterThickness: { value: settings.centerThickness }, uVolumeScale: { value: settings.volumeScale },
    uSpectralSamples: { value: settings.spectralSamples }, uIridescenceIor: { value: settings.iridescenceIOR },
    uFilmThicknessMin: { value: settings.filmThicknessMin }, uFilmThicknessMax: { value: settings.filmThicknessMax },
    uFilmThicknessNoise: { value: settings.filmThicknessNoise }, uAttenuationDistance: { value: settings.attenuationDistance },
    uInternalDensity: { value: settings.internalDensity }, uAbsorptionStrength: { value: settings.absorptionStrength },
    uImperfectionAmount: { value: settings.imperfectionAmount }, uScratchScale: { value: settings.scratchScale },
    uScratchDensity: { value: settings.scratchDensity }, uSurfaceWaviness: { value: settings.surfaceWaviness },
    uCausticIntensity: { value: settings.causticIntensity },
    uKeyIntensity: { value: settings.keyIntensity }, uWarmCard: { value: settings.warmCard },
    uCoolCard: { value: settings.coolCard }, uCenterAccent: { value: settings.centerAccent }, uBloom: { value: settings.bloom },
    uHaze: { value: settings.haze }, uGrain: { value: settings.grain }, uDither: { value: settings.dither },
    uBreath: { value: settings.breath }, uFlowSpeed: { value: settings.flowSpeed }, uCenterPulse: { value: settings.centerPulse },
    uSelected: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: `Spectral Caustic / Face ${faceIndex + 1}`,
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: true,
  });
  return material;
}

export function updateSpectralUniforms(material: THREE.ShaderMaterial, settings: SpectralSettings): void {
  const u = material.uniforms as SpectralShaderUniforms;
  u.uColorMode.value = settings.colorMode === "full-spectrum-experimental" ? 1 : 0;
  const pairs: Array<[keyof SpectralShaderUniforms, number]> = [
    ["uSpectralIntensity", settings.spectralIntensity], ["uSpectralWidth", settings.spectralWidth], ["uBandSoftness", settings.bandSoftness],
    ["uBandCompression", settings.bandCompression], ["uSpectralScale", settings.spectralScale], ["uSpectralStretch", settings.spectralStretch],
    ["uHueOffset", settings.hueOffset], ["uWarmBias", settings.warmBias], ["uVioletBias", settings.violetBias], ["uCyanAccent", settings.cyanAccent],
    ["uWhiteCore", settings.whiteCore], ["uCausticContrast", settings.causticContrast], ["uCurvatureInfluence", settings.curvatureInfluence],
    ["uAxisInfluence", settings.axisInfluence], ["uCenterInfluence", settings.centerInfluence], ["uFlowInfluence", settings.flowInfluence],
    ["uDispersion", settings.dispersion], ["uIridescence", settings.iridescence], ["uFresnelPower", settings.fresnelPower], ["uRoughness", settings.roughness],
    ["uTransmission", settings.transmission], ["uThickness", settings.thickness], ["uIor", settings.ior],
    ["uEdgeRoughness", settings.edgeRoughness], ["uEdgeOpticalBoost", settings.edgeOpticalBoost], ["uThicknessVariation", settings.thicknessVariation],
    ["uEdgeThickness", settings.edgeThickness], ["uCenterThickness", settings.centerThickness], ["uVolumeScale", settings.volumeScale],
    ["uSpectralSamples", settings.spectralSamples], ["uIridescenceIor", settings.iridescenceIOR], ["uFilmThicknessMin", settings.filmThicknessMin],
    ["uFilmThicknessMax", settings.filmThicknessMax], ["uFilmThicknessNoise", settings.filmThicknessNoise], ["uAttenuationDistance", settings.attenuationDistance],
    ["uInternalDensity", settings.internalDensity], ["uAbsorptionStrength", settings.absorptionStrength], ["uImperfectionAmount", settings.imperfectionAmount],
    ["uScratchScale", settings.scratchScale], ["uScratchDensity", settings.scratchDensity], ["uSurfaceWaviness", settings.surfaceWaviness],
    ["uCausticIntensity", settings.causticIntensity],
    ["uKeyIntensity", settings.keyIntensity], ["uWarmCard", settings.warmCard], ["uCoolCard", settings.coolCard], ["uCenterAccent", settings.centerAccent],
    ["uBloom", settings.bloom], ["uHaze", settings.haze], ["uGrain", settings.grain], ["uDither", settings.dither], ["uBreath", settings.breath],
    ["uFlowSpeed", settings.flowSpeed], ["uCenterPulse", settings.centerPulse],
  ];
  pairs.forEach(([key, value]) => { u[key].value = value; });
}
