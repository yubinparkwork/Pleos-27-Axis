import * as THREE from "three";
import { AXIS_DIRECTION_FAMILIES, axisDirection } from "../../axis";

export type SpectralFlowPresetId = "subtle" | "balanced" | "active";
export type SpectralFlowDirection = "axis-30" | "axis-90" | "axis-150" | "reverse" | "auto";

export interface SpectralFlowState {
  preset: SpectralFlowPresetId;
  flowPosition: number;
  flowDirection: SpectralFlowDirection;
  flowSpeed: number;
  flowWidth: number;
  flowSoftness: number;
  spectrumSpread: number;
  spectrumSeparation: number;
  saturation: number;
  spectralLag: number;
  coreIntensity: number;
  coreWidth: number;
  falloff: number;
  edgeAttraction: number;
  reflection: number;
  darkness: number;
  bloom: number;
}

export const SPECTRAL_FLOW_PRESETS: Readonly<Record<SpectralFlowPresetId, SpectralFlowState>> = {
  subtle: {
    preset: "subtle", flowPosition: 0, flowDirection: "axis-30", flowSpeed: .42,
    flowWidth: .48, flowSoftness: .76, spectrumSpread: .48, spectrumSeparation: .18,
    saturation: .42, spectralLag: .1, coreIntensity: 1.72, coreWidth: .18,
    falloff: 2.35, edgeAttraction: .92, reflection: 1.08, darkness: .72, bloom: .08,
  },
  balanced: {
    preset: "balanced", flowPosition: 0, flowDirection: "axis-30", flowSpeed: .68,
    flowWidth: .6, flowSoftness: .7, spectrumSpread: .78, spectrumSeparation: .32,
    saturation: .72, spectralLag: .16, coreIntensity: 2.5, coreWidth: .22,
    falloff: 1.9, edgeAttraction: 1.32, reflection: 1.3, darkness: .63, bloom: .16,
  },
  active: {
    preset: "active", flowPosition: 0, flowDirection: "auto", flowSpeed: .92,
    flowWidth: .72, flowSoftness: .62, spectrumSpread: 1.02, spectrumSeparation: .44,
    saturation: .92, spectralLag: .22, coreIntensity: 3.05, coreWidth: .24,
    falloff: 1.55, edgeAttraction: 1.72, reflection: 1.52, darkness: .55, bloom: .28,
  },
};

export function createSpectralFlowState(preset: SpectralFlowPresetId = "balanced"): SpectralFlowState {
  return { ...SPECTRAL_FLOW_PRESETS[preset] };
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

export function sanitizeSpectralFlowState(value?: Partial<SpectralFlowState>): SpectralFlowState {
  const preset = value?.preset === "subtle" || value?.preset === "active" ? value.preset : "balanced";
  const base = createSpectralFlowState(preset);
  const direction = value?.flowDirection;
  return {
    preset,
    flowPosition: finite(value?.flowPosition, base.flowPosition, -3, 3),
    flowDirection: direction === "axis-90" || direction === "axis-150" || direction === "reverse" || direction === "auto" ? direction : "axis-30",
    flowSpeed: finite(value?.flowSpeed, base.flowSpeed, 0, 3),
    flowWidth: finite(value?.flowWidth, base.flowWidth, .08, 2.4),
    flowSoftness: finite(value?.flowSoftness, base.flowSoftness, .05, 1),
    spectrumSpread: finite(value?.spectrumSpread, base.spectrumSpread, .1, 2.5),
    spectrumSeparation: finite(value?.spectrumSeparation, base.spectrumSeparation, 0, 1.4),
    saturation: finite(value?.saturation, base.saturation, 0, 2),
    spectralLag: finite(value?.spectralLag, base.spectralLag, 0, .75),
    coreIntensity: finite(value?.coreIntensity, base.coreIntensity, 0, 5),
    coreWidth: finite(value?.coreWidth, base.coreWidth, .02, .8),
    falloff: finite(value?.falloff, base.falloff, .25, 4),
    edgeAttraction: finite(value?.edgeAttraction, base.edgeAttraction, 0, 2.5),
    reflection: finite(value?.reflection, base.reflection, 0, 3),
    darkness: finite(value?.darkness, base.darkness, .1, 1),
    bloom: finite(value?.bloom, base.bloom, 0, 1.5),
  };
}

const axisAngles = AXIS_DIRECTION_FAMILIES["30deg"];

function canonicalAxisDirection(direction: SpectralFlowDirection, phase: number): THREE.Vector2 {
  let angle: (typeof axisAngles)[number] = axisAngles.find((candidate) => candidate === 30) ?? axisAngles[0];
  if (direction === "axis-90") angle = axisAngles.find((candidate) => candidate === 90) ?? angle;
  else if (direction === "axis-150") angle = axisAngles.find((candidate) => candidate === 150) ?? angle;
  else if (direction === "reverse") angle = axisAngles.find((candidate) => candidate === 210) ?? angle;
  else if (direction === "auto") {
    const familyIndex = Math.floor((((phase % 1) + 1) % 1) * 3) % 3;
    const requested = familyIndex === 0 ? 30 : familyIndex === 1 ? 90 : 150;
    angle = axisAngles.find((candidate) => candidate === requested) ?? angle;
  }
  const vector = axisDirection(angle);
  return new THREE.Vector2(vector.x, vector.y).normalize();
}

export class SpectralFlowMaterial extends THREE.MeshPhysicalMaterial {
  readonly isSpectralFlowMaterial = true;
  private state: SpectralFlowState;
  private time = 0;
  private duration = 6;
  private readonly spectralUniforms = {
    uSpectralTime: { value: 0 },
    uSpectralDuration: { value: 6 },
    uSpectralMotionEnabled: { value: 0 },
    uSpectralMotionOffset: { value: 0 },
    uAxisOrigin: { value: new THREE.Vector2(0, 0) },
    uFlowDirection: { value: new THREE.Vector2(1, 0) },
    uFlowPosition: { value: 0 },
    uFlowSpeed: { value: .8 },
    uFlowWidth: { value: .65 },
    uFlowSoftness: { value: .58 },
    uSpectrumSpread: { value: .9 },
    uSpectrumSeparation: { value: .42 },
    uSpectralSaturation: { value: 1 },
    uSpectralLag: { value: .13 },
    uCoreIntensity: { value: 2.1 },
    uCoreWidth: { value: .19 },
    uSpectralFalloff: { value: 1.65 },
    uEdgeAttraction: { value: 1.18 },
    uSpectralReflection: { value: 1.38 },
    uSurfaceDarkness: { value: .47 },
  };

  constructor(state: SpectralFlowState = createSpectralFlowState()) {
    super({
      color: 0x06080a,
      metalness: .02,
      roughness: .14,
      transmission: .12,
      thickness: 1.6,
      ior: 1.52,
      attenuationColor: new THREE.Color(0x0b1013),
      attenuationDistance: 2.8,
      clearcoat: .58,
      clearcoatRoughness: .045,
      envMapIntensity: 1.45,
      specularIntensity: 1,
      specularColor: new THREE.Color(0xffffff),
      side: THREE.FrontSide,
    });
    this.name = "PleosSpectralFlowMaterial";
    this.state = sanitizeSpectralFlowState(state);
    this.setState(this.state);
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.spectralUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vSpectralWorldPosition;\nvarying vec3 vSpectralWorldNormal;\nvarying vec3 vSpectralLocalPosition;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSpectralLocalPosition = transformed;\nvSpectralWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSpectralWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec3 vSpectralWorldPosition;
varying vec3 vSpectralWorldNormal;
varying vec3 vSpectralLocalPosition;
uniform float uSpectralTime;
uniform float uSpectralDuration;
uniform float uSpectralMotionEnabled;
uniform float uSpectralMotionOffset;
uniform vec2 uAxisOrigin;
uniform vec2 uFlowDirection;
uniform float uFlowPosition;
uniform float uFlowSpeed;
uniform float uFlowWidth;
uniform float uFlowSoftness;
uniform float uSpectrumSpread;
uniform float uSpectrumSeparation;
uniform float uSpectralSaturation;
uniform float uSpectralLag;
uniform float uCoreIntensity;
uniform float uCoreWidth;
uniform float uSpectralFalloff;
uniform float uEdgeAttraction;
uniform float uSpectralReflection;
uniform float uSurfaceDarkness;

float spectralGaussian( float x, float width ) {
  float safeWidth = max( width, 0.0001 );
  float q = x / safeWidth;
  return exp( -q * q * 2.25 );
}

vec3 pleosSpectralPalette( float signedDistance, float separation, float spread ) {
  float width = max( 0.055, 0.17 * spread );
  float yellow = spectralGaussian( signedDistance + separation * 1.55, width );
  float red = spectralGaussian( signedDistance + separation * 0.78, width * 1.05 );
  float magenta = spectralGaussian( signedDistance, width * 1.1 );
  float blue = spectralGaussian( signedDistance - separation * 0.78, width * 1.08 );
  float violet = spectralGaussian( signedDistance - separation * 1.55, width );
  return vec3( 1.00, 0.78, 0.12 ) * yellow
    + vec3( 1.00, 0.055, 0.018 ) * red
    + vec3( 0.72, 0.035, 0.72 ) * magenta
    + vec3( 0.035, 0.22, 1.00 ) * blue
    + vec3( 0.34, 0.025, 0.88 ) * violet;
}`)
        .replace("#include <opaque_fragment>", `
  float spectralPhase = fract( uSpectralTime / max( uSpectralDuration, 0.0001 ) );
  float loopEnvelope = pow( sin( PI * spectralPhase ), 2.0 );
  float motionEnvelope = mix( 1.0, loopEnvelope, uSpectralMotionEnabled );
  float travel = sin( spectralPhase * PI * 2.0 ) * uFlowSpeed + uSpectralMotionOffset * uFlowSpeed;
  float axisCoordinate = dot( vSpectralWorldPosition.xy - uAxisOrigin, normalize( uFlowDirection ) );
  float signedBandDistance = axisCoordinate - ( uFlowPosition + travel );
  float innerWidth = uFlowWidth * mix( 0.28, 0.72, uFlowSoftness );
  float outerWidth = uFlowWidth * mix( 1.05, 1.75, uFlowSoftness );
  float broadBand = 1.0 - smoothstep( innerWidth, outerWidth, abs( signedBandDistance ) );
  broadBand = pow( max( broadBand, 0.0 ), uSpectralFalloff );
  vec3 worldNormal = normalize( vSpectralWorldNormal );
  vec3 viewDirection = normalize( cameraPosition - vSpectralWorldPosition );
  float fresnel = pow( 1.0 - clamp( abs( dot( worldNormal, viewDirection ) ), 0.0, 1.0 ), 2.2 );
  float faceBreakup = 0.76 + 0.24 * abs( dot( worldNormal, normalize( vec3( uFlowDirection, 0.36 ) ) ) );
  float edgeResponse = mix( 1.0, 0.42 + fresnel * 1.9, clamp( uEdgeAttraction / 2.5, 0.0, 1.0 ) );
  float laggedDistance = signedBandDistance - uSpectralLag * sin( spectralPhase * PI * 2.0 );
  vec3 spectralColor = pleosSpectralPalette( laggedDistance, uSpectrumSeparation, uSpectrumSpread );
  float spectralLuma = dot( spectralColor, vec3( 0.2126, 0.7152, 0.0722 ) );
  spectralColor = mix( vec3( spectralLuma ), spectralColor, uSpectralSaturation );
  float core = spectralGaussian( signedBandDistance, max( uCoreWidth, 0.015 ) ) * uCoreIntensity;
  vec3 surfaceBase = outgoingLight * mix( 0.82, 0.16, uSurfaceDarkness ) * ( 0.42 + uSpectralReflection * 0.52 );
  vec3 spectralEnergy = ( spectralColor * broadBand * faceBreakup * edgeResponse + vec3( core ) ) * motionEnvelope;
  outgoingLight = surfaceBase + spectralEnergy;
  #include <opaque_fragment>`);
    };
    this.customProgramCacheKey = () => "pleos-spectral-flow-v1";
  }

  get spectralState(): SpectralFlowState { return { ...this.state }; }

  setState(state: SpectralFlowState): void {
    this.state = sanitizeSpectralFlowState(state);
    const u = this.spectralUniforms;
    u.uFlowPosition.value = this.state.flowPosition;
    u.uFlowSpeed.value = this.state.flowSpeed;
    u.uFlowWidth.value = this.state.flowWidth;
    u.uFlowSoftness.value = this.state.flowSoftness;
    u.uSpectrumSpread.value = this.state.spectrumSpread;
    u.uSpectrumSeparation.value = this.state.spectrumSeparation;
    u.uSpectralSaturation.value = this.state.saturation;
    u.uSpectralLag.value = this.state.spectralLag;
    u.uCoreIntensity.value = this.state.coreIntensity;
    u.uCoreWidth.value = this.state.coreWidth;
    u.uSpectralFalloff.value = this.state.falloff;
    u.uEdgeAttraction.value = this.state.edgeAttraction;
    u.uSpectralReflection.value = this.state.reflection;
    u.uSurfaceDarkness.value = this.state.darkness;
    this.syncDirection();
  }

  setRuntime(time: number, duration: number, motionEnabled: boolean, motionOffset = 0): void {
    this.time = time;
    this.duration = Math.max(duration, 1 / 120);
    this.spectralUniforms.uSpectralTime.value = time;
    this.spectralUniforms.uSpectralDuration.value = this.duration;
    this.spectralUniforms.uSpectralMotionEnabled.value = motionEnabled ? 1 : 0;
    this.spectralUniforms.uSpectralMotionOffset.value = motionOffset;
    this.syncDirection();
  }

  private syncDirection(): void {
    const phase = this.duration > 0 ? this.time / this.duration : 0;
    this.spectralUniforms.uFlowDirection.value.copy(canonicalAxisDirection(this.state.flowDirection, phase));
  }
}
