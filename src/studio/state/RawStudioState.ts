import {
  MATTE_PRESETS,
  PRISM_PRESETS,
  type MattePresetId,
  type MatteState,
  type PrismPresetId,
  type PrismState,
  type Vec3,
} from "../../raw-webgl/materials/materialPresets";
import {
  cloneLightingPreset,
  type LightingPresetId,
  type LightingState,
} from "../../raw-webgl/lighting/lightingPresets";

export type RawInspectorTab = "material" | "lighting" | "output";

export type RawMaterialMode = "matte" | "prism";
export type RawGeometryMode = "folded-surface" | "closed-optical-solid";
export type RawCameraMode = "orthographic" | "perspective";
export type RawRenderQuality = "draft" | "balanced" | "high" | "final";
export type RawToneMapping = "neutral" | "aces-fitted";
export type RawDebugMode =
  | "shaded"
  | "wireframe"
  | "vertices"
  | "face-normal"
  | "face-id"
  | "axis-ray"
  | "center-node"
  | "depth"
  | "thickness";

export type RawAxisFamily = "30deg" | "45deg";
export type RawAxisVariation =
  | "30-basic"
  | "30-v1"
  | "30-v2"
  | "30-v3"
  | "45-basic"
  | "45-v1"
  | "45-v2"
  | "45-v3";

export interface RawGeometryState {
  axisFamily: RawAxisFamily;
  variation: RawAxisVariation;
  originGrid: [number, number];
  mode: RawGeometryMode;
  foldDepth: number;
  solidThickness: number;
  bevelEnabled: boolean;
  bevelWidth: number;
  bevelSegments: number;
  bevelCurvature: number;
  edgeRoughness: number;
  edgeHighlightStrength: number;
}

export interface RawMaterialState {
  mode: RawMaterialMode;
  mattePreset: MattePresetId;
  prismPreset: PrismPresetId;
  matte: MatteState;
  prism: PrismState;
}

export interface RawCameraState {
  mode: RawCameraMode;
  position: Vec3;
  target: Vec3;
  fov: number;
  orthoZoom: number;
  near: number;
  far: number;
  roll: number;
  locked: boolean;
}

export interface RawPostState {
  toneMapping: RawToneMapping;
  exposure: number;
  contrast: number;
  whitePoint: number;
  blackLift: number;
  dither: boolean;
  fxaa: boolean;
  internalScale: number;
}

export interface RawOutputState {
  quality: RawRenderQuality;
  width: number;
  height: number;
  aspectLock: boolean;
  supersampling: 1 | 2;
  accumulationSamples: 8 | 16 | 32;
  transparent: boolean;
  filename: string;
  post: RawPostState;
}

export interface RawDebugState {
  mode: RawDebugMode;
  showAxisGuides: boolean;
  showCenterNode: boolean;
  showBounds: boolean;
  freezeRender: boolean;
}

export interface RawStudioUiState {
  tab: RawInspectorTab;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}

export interface RawStudioState {
  version: 1;
  scenePreset: RawScenePresetId;
  geometry: RawGeometryState;
  material: RawMaterialState;
  lighting: LightingState;
  camera: RawCameraState;
  output: RawOutputState;
  debug: RawDebugState;
  ui: RawStudioUiState;
}

export type RawScenePresetId =
  | "matte-reference"
  | "matte-graphite"
  | "matte-pleos-blue"
  | "prism-clear"
  | "prism-smoked"
  | "prism-pleos-blue"
  | "prism-full-spectrum";

export interface RawScenePresetDefinition {
  id: RawScenePresetId;
  name: string;
  description: string;
  materialMode: RawMaterialMode;
  materialPreset: MattePresetId | PrismPresetId;
  lightingPreset: LightingPresetId;
  experimental: boolean;
}

export const RAW_SCENE_PRESETS: readonly RawScenePresetDefinition[] = [
  { id: "matte-reference", name: "Matte Reference", description: "Neutral Type B baseline", materialMode: "matte", materialPreset: "matte-reference", lightingPreset: "reference-flat", experimental: false },
  { id: "matte-graphite", name: "Matte Graphite", description: "Dark product surface", materialMode: "matte", materialPreset: "matte-graphite", lightingPreset: "softbox-studio", experimental: false },
  { id: "matte-pleos-blue", name: "Matte Pleos Blue", description: "Restrained tone-on-tone", materialMode: "matte", materialPreset: "matte-pleos-blue", lightingPreset: "softbox-studio", experimental: false },
  { id: "prism-clear", name: "Clear Prism", description: "Neutral optical test", materialMode: "prism", materialPreset: "prism-clear", lightingPreset: "prism-studio", experimental: false },
  { id: "prism-smoked", name: "Smoked Prism", description: "Deep neutral absorption", materialMode: "prism", materialPreset: "prism-smoked", lightingPreset: "dark-optical", experimental: false },
  { id: "prism-pleos-blue", name: "Pleos Blue Prism", description: "Controlled blue attenuation", materialMode: "prism", materialPreset: "prism-pleos-blue", lightingPreset: "prism-studio", experimental: false },
  { id: "prism-full-spectrum", name: "Full Spectrum Prism", description: "Color review required", materialMode: "prism", materialPreset: "prism-full-spectrum", lightingPreset: "prism-studio", experimental: true },
] as const;

export interface RawStudioChange {
  path: string;
  reason: "initialize" | "control" | "preset" | "command" | "external";
}

export type RawStudioListener = (
  state: Readonly<RawStudioState>,
  change: RawStudioChange,
) => void;

const cloneMatte = (id: MattePresetId): MatteState => structuredClone(MATTE_PRESETS[id].state);
const clonePrism = (id: PrismPresetId): PrismState => structuredClone(PRISM_PRESETS[id].state);

export function createDefaultRawStudioState(): RawStudioState {
  return {
    version: 1,
    scenePreset: "matte-reference",
    geometry: {
      axisFamily: "30deg",
      variation: "30-v1",
      originGrid: [10, 10],
      // The default composition follows the approved Type B New Axis idea:
      // two true cubes meet at the 20 x 20 grid's exact center node.
      mode: "closed-optical-solid",
      foldDepth: 0.42,
      // sqrt(1/2) keeps each approved 30° projected basis orthogonal in 3D,
      // so the canonical Prism starts as two true cubes rather than skewed boxes.
      solidThickness: Math.SQRT1_2,
      bevelEnabled: false,
      bevelWidth: 0.018,
      bevelSegments: 3,
      bevelCurvature: 0.58,
      edgeRoughness: 0.14,
      edgeHighlightStrength: 0.62,
    },
    material: {
      mode: "matte",
      mattePreset: "matte-reference",
      prismPreset: "prism-clear",
      matte: cloneMatte("matte-reference"),
      prism: clonePrism("prism-clear"),
    },
    lighting: cloneLightingPreset("softbox-studio"),
    camera: {
      // The guide's 30-degree rays are defined in screen space. A locked
      // orthographic front view preserves those exact projected directions.
      mode: "orthographic",
      position: [0, 0, 8],
      target: [0, 0, 0],
      fov: 34,
      orthoZoom: 0.36,
      near: 0.01,
      far: 40,
      roll: 0,
      locked: true,
    },
    output: {
      quality: "balanced",
      width: 2800,
      height: 2080,
      aspectLock: true,
      supersampling: 1,
      accumulationSamples: 16,
      transparent: false,
      filename: "pleos-new-axis-raw",
      post: {
        toneMapping: "neutral",
        exposure: 1,
        contrast: 1,
        whitePoint: 1,
        blackLift: 0,
        dither: true,
        fxaa: true,
        internalScale: 1.25,
      },
    },
    debug: {
      mode: "shaded",
      showAxisGuides: false,
      showCenterNode: false,
      showBounds: false,
      freezeRender: false,
    },
    ui: {
      tab: "material",
      leftPanelOpen: true,
      rightPanelOpen: true,
    },
  };
}

export function applyRawScenePreset(
  state: RawStudioState,
  presetId: RawScenePresetId,
): RawStudioState {
  const preset = RAW_SCENE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return structuredClone(state);
  const next = structuredClone(state);
  next.scenePreset = preset.id;
  next.material.mode = preset.materialMode;
  // Material changes must never replace the locked two-cube Axis identity.
  next.geometry.mode = "closed-optical-solid";
  next.geometry.bevelEnabled = preset.materialMode === "prism";
  if (preset.materialMode === "prism") {
    next.geometry.axisFamily = "30deg";
    next.geometry.variation = "30-v1";
  }
  next.lighting = cloneLightingPreset(preset.lightingPreset);
  if (preset.id === "prism-pleos-blue") {
    const warmCard = next.lighting.cards[2];
    const coolCard = next.lighting.cards[3];
    if (warmCard) warmCard.enabled = false;
    if (coolCard) coolCard.color = [0.061246, 0.127438, 1];
  }
  if (preset.materialMode === "matte") {
    const materialId = preset.materialPreset as MattePresetId;
    next.material.mattePreset = materialId;
    next.material.matte = cloneMatte(materialId);
  } else {
    const materialId = preset.materialPreset as PrismPresetId;
    next.material.prismPreset = materialId;
    next.material.prism = clonePrism(materialId);
  }
  return next;
}

export function applyRawMaterialPreset(
  state: RawStudioState,
  presetId: MattePresetId | PrismPresetId,
): RawStudioState {
  const next = structuredClone(state);
  if (presetId in MATTE_PRESETS) {
    const id = presetId as MattePresetId;
    next.material.mode = "matte";
    next.material.mattePreset = id;
    next.material.matte = cloneMatte(id);
    next.geometry.mode = "closed-optical-solid";
    next.geometry.bevelEnabled = false;
  } else {
    const id = presetId as PrismPresetId;
    next.material.mode = "prism";
    next.material.prismPreset = id;
    next.material.prism = clonePrism(id);
    next.geometry.mode = "closed-optical-solid";
    next.geometry.bevelEnabled = true;
    next.geometry.axisFamily = "30deg";
    next.geometry.variation = "30-v1";
  }
  return next;
}

export class RawStudioStore {
  private state: RawStudioState;
  private readonly listeners = new Set<RawStudioListener>();

  constructor(initialState: RawStudioState = createDefaultRawStudioState()) {
    this.state = structuredClone(initialState);
  }

  get snapshot(): Readonly<RawStudioState> {
    return this.state;
  }

  replace(next: RawStudioState, change: RawStudioChange): void {
    this.state = structuredClone(next);
    this.listeners.forEach((listener) => listener(this.state, change));
  }

  update(mutator: (draft: RawStudioState) => void, change: RawStudioChange): void {
    const draft = structuredClone(this.state);
    mutator(draft);
    this.replace(draft, change);
  }

  subscribe(listener: RawStudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
