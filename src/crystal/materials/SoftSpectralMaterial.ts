import * as THREE from "three";
import { axisDirection } from "../../axis";

export type SoftSpectralPresetId = "subtle" | "balanced" | "active";

export interface SoftSpectralState {
  preset: SoftSpectralPresetId;
  glow: number;
  spectrum: number;
  edge: number;
  darkness: number;
  motionDepth: number;
  centerRadius: number;
  centerSoftness: number;
  spectrumSpread: number;
  spectrumSeparation: number;
  saturation: number;
  phaseOffset: number;
  edgeAttraction: number;
  edgeSoftness: number;
  reflection: number;
  roughness: number;
  falloff: number;
  bloom: number;
}

export const SOFT_SPECTRAL_PRESETS: Readonly<Record<SoftSpectralPresetId, SoftSpectralState>> = {
  subtle: {
    preset: "subtle", glow: .72, spectrum: .48, edge: .38, darkness: .82, motionDepth: .34,
    centerRadius: .72, centerSoftness: .82, spectrumSpread: .72, spectrumSeparation: .18,
    saturation: .58, phaseOffset: 0, edgeAttraction: .52, edgeSoftness: .86,
    reflection: 1.08, roughness: .19, falloff: 2.25, bloom: .07,
  },
  balanced: {
    preset: "balanced", glow: 1.08, spectrum: .76, edge: .58, darkness: .74, motionDepth: .52,
    centerRadius: .86, centerSoftness: .76, spectrumSpread: .92, spectrumSeparation: .27,
    saturation: .78, phaseOffset: 0, edgeAttraction: .72, edgeSoftness: .78,
    reflection: 1.32, roughness: .15, falloff: 1.82, bloom: .13,
  },
  active: {
    preset: "active", glow: 1.42, spectrum: 1.02, edge: .78, darkness: .66, motionDepth: .72,
    centerRadius: 1.02, centerSoftness: .68, spectrumSpread: 1.14, spectrumSeparation: .36,
    saturation: .94, phaseOffset: 0, edgeAttraction: .94, edgeSoftness: .68,
    reflection: 1.56, roughness: .12, falloff: 1.48, bloom: .22,
  },
};

export function createSoftSpectralState(preset: SoftSpectralPresetId = "balanced"): SoftSpectralState {
  return { ...SOFT_SPECTRAL_PRESETS[preset] };
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

export function sanitizeSoftSpectralState(value?: Partial<SoftSpectralState>): SoftSpectralState {
  const preset = value?.preset === "subtle" || value?.preset === "active" ? value.preset : "balanced";
  const base = createSoftSpectralState(preset);
  return {
    preset,
    glow: finite(value?.glow, base.glow, 0, 2.5), spectrum: finite(value?.spectrum, base.spectrum, 0, 2),
    edge: finite(value?.edge, base.edge, 0, 2), darkness: finite(value?.darkness, base.darkness, .1, 1),
    motionDepth: finite(value?.motionDepth, base.motionDepth, 0, 1.5), centerRadius: finite(value?.centerRadius, base.centerRadius, .1, 2.5),
    centerSoftness: finite(value?.centerSoftness, base.centerSoftness, .05, 1), spectrumSpread: finite(value?.spectrumSpread, base.spectrumSpread, .1, 2.5),
    spectrumSeparation: finite(value?.spectrumSeparation, base.spectrumSeparation, 0, 1), saturation: finite(value?.saturation, base.saturation, 0, 1.5),
    phaseOffset: finite(value?.phaseOffset, base.phaseOffset, -1, 1), edgeAttraction: finite(value?.edgeAttraction, base.edgeAttraction, 0, 2),
    edgeSoftness: finite(value?.edgeSoftness, base.edgeSoftness, .05, 1), reflection: finite(value?.reflection, base.reflection, 0, 3),
    roughness: finite(value?.roughness, base.roughness, .02, .5), falloff: finite(value?.falloff, base.falloff, .3, 4),
    bloom: finite(value?.bloom, base.bloom, 0, 1),
  };
}

export class SoftSpectralMaterial extends THREE.MeshPhysicalMaterial {
  readonly isSoftSpectralMaterial = true;
  private state: SoftSpectralState;
  private readonly softUniforms = {
    uSoftTime: { value: 0 }, uSoftDuration: { value: 8 }, uSoftMotionEnabled: { value: 0 }, uSoftSweep: { value: 0 },
    uSoftAxis: { value: new THREE.Vector2(1, 0) }, uSoftGlow: { value: 1 }, uSoftSpectrum: { value: .8 },
    uSoftEdge: { value: .6 }, uSoftDarkness: { value: .74 }, uSoftMotionDepth: { value: .5 },
    uSoftCenterRadius: { value: .86 }, uSoftCenterSoftness: { value: .76 }, uSoftSpread: { value: .92 },
    uSoftSeparation: { value: .27 }, uSoftSaturation: { value: .78 }, uSoftPhaseOffset: { value: 0 },
    uSoftEdgeAttraction: { value: .72 }, uSoftEdgeSoftness: { value: .78 }, uSoftReflection: { value: 1.32 },
    uSoftFalloff: { value: 1.82 },
  };

  constructor(state: SoftSpectralState = createSoftSpectralState()) {
    super({
      color: 0x080b12, metalness: .015, roughness: .15, transmission: .08, thickness: 1.8, ior: 1.52,
      attenuationColor: new THREE.Color(0x080d18), attenuationDistance: 2.2, clearcoat: .64,
      clearcoatRoughness: .07, envMapIntensity: 1.4, specularIntensity: 1, specularColor: new THREE.Color(0xffffff),
      side: THREE.FrontSide,
    });
    this.name = "PleosSoftSpectralMaterial";
    this.state = sanitizeSoftSpectralState(state);
    this.setState(this.state);
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.softUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vSoftWorldPosition;\nvarying vec3 vSoftWorldNormal;\nvarying vec3 vSoftLocalPosition;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSoftLocalPosition = transformed;\nvSoftWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSoftWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec3 vSoftWorldPosition;
varying vec3 vSoftWorldNormal;
varying vec3 vSoftLocalPosition;
uniform float uSoftTime; uniform float uSoftDuration; uniform float uSoftMotionEnabled; uniform float uSoftSweep;
uniform vec2 uSoftAxis;
uniform float uSoftGlow; uniform float uSoftSpectrum; uniform float uSoftEdge; uniform float uSoftDarkness;
uniform float uSoftMotionDepth; uniform float uSoftCenterRadius; uniform float uSoftCenterSoftness;
uniform float uSoftSpread; uniform float uSoftSeparation; uniform float uSoftSaturation; uniform float uSoftPhaseOffset;
uniform float uSoftEdgeAttraction; uniform float uSoftEdgeSoftness; uniform float uSoftReflection; uniform float uSoftFalloff;

float softGaussian( float x, float width ) { float q = x / max( width, 0.0001 ); return exp( -q * q * 1.8 ); }
vec3 softPalette( float coordinate, float separation, float spread ) {
  float width = max( .11, .28 * spread );
  float cyan = softGaussian( coordinate + separation * .72, width * 1.2 );
  float blue = softGaussian( coordinate, width * 1.15 );
  float violet = softGaussian( coordinate - separation * .78, width );
  float magenta = softGaussian( coordinate - separation * 1.48, width * .82 );
  float warm = softGaussian( coordinate + separation * 2.8, width * .42 ) * .045;
  return vec3( .08, .88, 1.0 ) * cyan * 1.18 + vec3( .06, .32, 1.0 ) * blue * 1.12
    + vec3( .40, .10, 1.0 ) * violet * .52 + vec3( 1.0, .08, .52 ) * magenta * .34 + vec3( 1.0, .56, .18 ) * warm;
}`)
        .replace("#include <opaque_fragment>", `
  float phase = fract( uSoftTime / max( uSoftDuration, .0001 ) + uSoftPhaseOffset );
  float loopWave = .5 - .5 * cos( phase * PI * 2.0 );
  float pulse = mix( .64, mix( .48, 1.0, loopWave ), uSoftMotionEnabled * uSoftMotionDepth );
  vec2 centered = vSoftWorldPosition.xy;
  float radial = length( centered );
  float centerOuter = uSoftCenterRadius * mix( 1.65, 2.5, uSoftCenterSoftness );
  float centerField = 1.0 - smoothstep( uSoftCenterRadius * .18, centerOuter, radial );
  centerField = pow( max( centerField, 0.0 ), uSoftFalloff ) * pulse;
  vec2 axis = normalize( uSoftAxis );
  float alongAxis = dot( centered, axis );
  float acrossAxis = dot( centered, vec2( -axis.y, axis.x ) );
  float drift = sin( phase * PI * 2.0 ) * uSoftMotionDepth + uSoftSweep * .42;
  float broadAxis = softGaussian( acrossAxis - drift * .34, .72 + uSoftSpread * .72 );
  float spectralCoordinate = acrossAxis - drift * .48 + alongAxis * .085;
  vec3 palette = softPalette( spectralCoordinate, uSoftSeparation, uSoftSpread );
  float paletteLuma = dot( palette, vec3( .2126, .7152, .0722 ) );
  palette = mix( vec3( paletteLuma ), palette, uSoftSaturation );
  vec3 softWorldNormal = normalize( vSoftWorldNormal );
  vec3 viewDirection = normalize( cameraPosition - vSoftWorldPosition );
  float fresnel = pow( 1.0 - clamp( abs( dot( softWorldNormal, viewDirection ) ), 0.0, 1.0 ), mix( 1.6, 3.6, uSoftEdgeSoftness ) );
  float normalBreak = .42 + .58 * abs( dot( softWorldNormal.xy, axis ) );
  float edgeField = mix( fresnel, fresnel * normalBreak, clamp( uSoftEdgeAttraction * .5, 0.0, 1.0 ) );
  vec3 darkBody = outgoingLight * mix( .34, .065, uSoftDarkness ) * (.72 + uSoftReflection * .3);
  vec3 centerColor = mix( vec3( .72, .78, 1.0 ), vec3( 1.0 ), centerField ) * centerField * uSoftGlow;
  vec3 spectrumColor = palette * broadAxis * ( .22 + centerField * .78 ) * uSoftSpectrum;
  vec3 edgeColor = mix( vec3( .06, .38, 1.0 ), vec3( .20, .78, 1.0 ), clamp( .5 + acrossAxis * .14, 0.0, 1.0 ) ) * edgeField * uSoftEdge;
  outgoingLight = darkBody + centerColor + spectrumColor + edgeColor;
  #include <opaque_fragment>`);
    };
    this.customProgramCacheKey = () => "pleos-soft-spectral-v1";
  }

  get softSpectralState(): SoftSpectralState { return { ...this.state }; }

  setState(state: SoftSpectralState): void {
    this.state = sanitizeSoftSpectralState(state);
    const u = this.softUniforms;
    u.uSoftGlow.value = this.state.glow; u.uSoftSpectrum.value = this.state.spectrum; u.uSoftEdge.value = this.state.edge;
    u.uSoftDarkness.value = this.state.darkness; u.uSoftMotionDepth.value = this.state.motionDepth;
    u.uSoftCenterRadius.value = this.state.centerRadius; u.uSoftCenterSoftness.value = this.state.centerSoftness;
    u.uSoftSpread.value = this.state.spectrumSpread; u.uSoftSeparation.value = this.state.spectrumSeparation;
    u.uSoftSaturation.value = this.state.saturation; u.uSoftPhaseOffset.value = this.state.phaseOffset;
    u.uSoftEdgeAttraction.value = this.state.edgeAttraction; u.uSoftEdgeSoftness.value = this.state.edgeSoftness;
    u.uSoftReflection.value = this.state.reflection; u.uSoftFalloff.value = this.state.falloff;
    this.roughness = this.state.roughness; this.envMapIntensity = 1.1 * this.state.reflection;
  }

  setRuntime(time: number, duration: number, motionEnabled: boolean, sweep = 0): void {
    const phase = duration > 0 ? time / duration : 0;
    const family = [30, 90, 150];
    const direction = axisDirection(family[Math.floor((((phase % 1) + 1) % 1) * 3) % 3]);
    this.softUniforms.uSoftTime.value = time; this.softUniforms.uSoftDuration.value = Math.max(duration, 1 / 120);
    this.softUniforms.uSoftMotionEnabled.value = motionEnabled ? 1 : 0; this.softUniforms.uSoftSweep.value = sweep;
    this.softUniforms.uSoftAxis.value.set(direction.x, direction.y).normalize();
  }
}
