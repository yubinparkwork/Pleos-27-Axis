import type { FaceId, ProjectionMode, ProceduralTextureKind, TextureSlot, TextureTarget } from "../textures/types";
import type { MaterialPresetId } from "../materials/materialPresets";
import type { LightingPresetId } from "../lighting/lightingPresets";
import type { CameraPresetId } from "../camera/cameraPresets";

export type RendererMode = "baseline-2d" | "studio-3d" | "split-compare" | "difference";
export type CameraMode = "orthographic" | "perspective";
export type PreviewQuality = "draft" | "balanced" | "high";

export interface NewAxisGeometrySettings {
  centerDepth: number;
  outerRadius: number;
  depthScale: number;
  depthExaggeration: number;
  objectScale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  rayDepth: { top: number; upperRight: number; lowerRight: number; softDown: number; lowerLeft: number };
  exploded: number;
  crease: { enabled: boolean; width: number; segments: number; smoothness: number };
}

export interface CameraSettings {
  mode: CameraMode;
  preset: CameraPresetId;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
  zoom: number;
  roll: number;
  orbit: boolean;
  damping: boolean;
  locked: boolean;
}

export interface MaterialSettings {
  preset: MaterialPresetId;
  baseColor: string;
  opacity: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  iridescence: number;
  iridescenceIOR: number;
  iridescenceThickness: number;
  specularIntensity: number;
  specularColor: string;
  emissive: string;
  emissiveIntensity: number;
  side: "front" | "double";
  depthWrite: boolean;
  flatShading: boolean;
  environmentIntensity: number;
}

export interface FaceMaterialOverride { enabled: boolean; color: string; roughness: number; metalness: number }

export interface TextureSettings {
  procedural: ProceduralTextureKind;
  enabled: boolean;
  projection: ProjectionMode;
  target: TextureTarget;
  slot: TextureSlot;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  intensity: number;
  contrast: number;
  brightness: number;
  inversion: boolean;
  seed: number;
  animated: boolean;
  animationSpeed: number;
  channel: "rgb" | "r" | "g" | "b" | "a";
  wrap: "repeat" | "mirror" | "clamp";
  uploadedSlots: Partial<Record<TextureSlot, string>>;
}

export interface LightSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  position: [number, number, number];
  target: [number, number, number];
  shadow: boolean;
  shadowBias: number;
  softness: number;
}

export interface LightingSettings {
  preset: LightingPresetId;
  key: LightSettings;
  fill: LightSettings;
  rim: LightSettings;
  ambientIntensity: number;
  environmentIntensity: number;
  environmentRotation: number;
  backgroundLuminance: number;
  helpers: boolean;
}

export interface PostSettings {
  bloom: boolean; bloomStrength: number; bloomThreshold: number;
  vignette: boolean; vignetteAmount: number;
  filmGrain: boolean; grainAmount: number;
  dither: boolean; ditherAmount: number;
  chromaticAberration: boolean; chromaticAmount: number;
  contrast: number; exposure: number;
  depthOfField: boolean; focus: number; aperture: number; maxBlur: number;
}

export interface Output3DSettings {
  preset: string; width: number; height: number; aspectLock: boolean; transparent: boolean;
  antialiasing: boolean; supersampling: 1 | 2; format: "png" | "jpeg" | "webp"; quality: number; filename: string;
}

export interface DebugSettings { wireframe: boolean; normals: boolean; vertices: boolean; axes: boolean; }

export interface NewAxis3DStudioState {
  rendererMode: RendererMode;
  splitPosition: number;
  overlayOpacity: number;
  geometry: NewAxisGeometrySettings;
  camera: CameraSettings;
  material: MaterialSettings;
  faceOverrides: Partial<Record<FaceId, FaceMaterialOverride>>;
  texture: TextureSettings;
  lighting: LightingSettings;
  post: PostSettings;
  output: Output3DSettings;
  debug: DebugSettings;
  previewQuality: PreviewQuality;
  selectedFaceId: FaceId | null;
  activeGeometryPresetId: string;
  activeMaterialPresetId: MaterialPresetId;
}

export const default3DState: NewAxis3DStudioState = {
  rendererMode: "baseline-2d", splitPosition: .5, overlayOpacity: 1,
  geometry: {
    centerDepth: .12, outerRadius: 4, depthScale: 1, depthExaggeration: 1, objectScale: 1,
    rotation: [0, 0, 0], position: [0, 0, 0],
    rayDepth: { top: -.06, upperRight: .08, lowerRight: -.1, softDown: .13, lowerLeft: -.04 },
    exploded: 0, crease: { enabled: false, width: .018, segments: 1, smoothness: .35 },
  },
  camera: { mode: "orthographic", preset: "reference-front", position: [0, 0, 5], target: [0, 0, 0], fov: 42, near: .05, far: 100, zoom: 1, roll: 0, orbit: true, damping: true, locked: false },
  material: {
    preset: "reference-matte", baseColor: "#6b6b6b", opacity: 1, roughness: .88, metalness: .03,
    clearcoat: .04, clearcoatRoughness: .8, transmission: 0, thickness: .2, ior: 1.45, iridescence: 0,
    iridescenceIOR: 1.3, iridescenceThickness: 320, specularIntensity: .35, specularColor: "#ffffff",
    emissive: "#000000", emissiveIntensity: 0, side: "double", depthWrite: true, flatShading: true, environmentIntensity: .35,
  },
  faceOverrides: {},
  texture: {
    procedural: "fine-grain", enabled: false, projection: "screen", target: "all-faces", slot: "baseColor",
    scale: 1, scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0, intensity: .3, contrast: 1.2,
    brightness: 0, inversion: false, seed: 17, animated: false, animationSpeed: .1, channel: "rgb", wrap: "repeat", uploadedSlots: {},
  },
  lighting: {
    preset: "reference-flat",
    key: { enabled: true, color: "#ffffff", intensity: 2.2, position: [-2.6, 2.4, 4.2], target: [0, 0, 0], shadow: true, shadowBias: -.0002, softness: 2 },
    fill: { enabled: true, color: "#d9e1ff", intensity: 1.15, position: [3, .6, 3.3], target: [0, 0, 0], shadow: false, shadowBias: 0, softness: 3 },
    rim: { enabled: true, color: "#ffffff", intensity: 1.8, position: [.4, -3.2, 1.4], target: [0, 0, 0], shadow: false, shadowBias: 0, softness: 2 },
    ambientIntensity: .5, environmentIntensity: .65, environmentRotation: 0, backgroundLuminance: .012, helpers: false,
  },
  post: { bloom: false, bloomStrength: .25, bloomThreshold: .72, vignette: false, vignetteAmount: .25, filmGrain: false, grainAmount: .04, dither: false, ditherAmount: .08, chromaticAberration: false, chromaticAmount: .0015, contrast: 1, exposure: 0, depthOfField: false, focus: .975, aperture: .015, maxBlur: .008 },
  output: { preset: "2800x2080", width: 2800, height: 2080, aspectLock: true, transparent: false, antialiasing: true, supersampling: 1, format: "png", quality: .92, filename: "pleos-new-axis-3d" },
  debug: { wireframe: false, normals: false, vertices: false, axes: false }, previewQuality: "balanced", selectedFaceId: null,
  activeGeometryPresetId: "reference-fold", activeMaterialPresetId: "reference-matte",
};
