import * as THREE from "three";
import { PhysicalSpotLight, ShapedAreaLight } from "three-gpu-pathtracer";

export type PleosLightType = "rect" | "point" | "spot" | "directional";
export type LightingPresetName = "pleos-rgb" | "pleos-blue" | "pleos-prism" | "dark-studio" | "soft-glass" | "custom";

export const PLEOS_BRAND_COLORS = [
  { name: "Red 1", value: "#FFCDD7", family: "Red" },
  { name: "Red 2", value: "#FA293C", family: "Red" },
  { name: "Red 3", value: "#55110E", family: "Red" },
  { name: "Green 1", value: "#B4FFD2", family: "Green" },
  { name: "Green 2", value: "#0ADC91", family: "Green" },
  { name: "Green 3", value: "#053C32", family: "Green" },
  { name: "Blue 1", value: "#CDDCFF", family: "Blue" },
  { name: "Blue 2", value: "#4664FF", family: "Blue" },
  { name: "Blue 3", value: "#2350FF", family: "Blue" },
  { name: "Blue 4", value: "#0F235A", family: "Blue" },
  { name: "White", value: "#FFFFFF", family: "Neutral" },
  { name: "Light Gray 1", value: "#F2F2F2", family: "Neutral" },
  { name: "Light Gray 2", value: "#E5E5E5", family: "Neutral" },
  { name: "Light Gray 3", value: "#CCCCCC", family: "Neutral" },
  { name: "Dark Gray 1", value: "#262626", family: "Neutral" },
  { name: "Dark Gray 2", value: "#4D4D4D", family: "Neutral" },
  { name: "Dark Gray 3", value: "#999999", family: "Neutral" },
  { name: "Black", value: "#000000", family: "Neutral" },
] as const;

export interface PleosLightData {
  id: string;
  name: string;
  enabled: boolean;
  type: PleosLightType;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  intensity: number;
  exposure: number;
  width: number;
  height: number;
  angle: number;
  penumbra: number;
  distance: number;
  decay: number;
  castShadow: boolean;
  shadowIntensity: number;
  shadowSoftness: number;
  bias: number;
  normalBias: number;
}

export interface LightingGlobals {
  masterIntensity: number;
  environmentIntensity: number;
  exposure: number;
  bloomIntensity: number;
  reflectionStrength: number;
  refractionStrength: number;
  colorSaturation: number;
}

export interface LightingState {
  globals: LightingGlobals;
  lights: PleosLightData[];
  selectedId: string | null;
  preset: LightingPresetName;
}

export type LightingChangeKind = "lights" | "transform" | "globals" | "selection";

const DEFAULT_GLOBALS: LightingGlobals = {
  masterIntensity: 1,
  environmentIntensity: 0.58,
  exposure: 1.05,
  bloomIntensity: 0.12,
  reflectionStrength: 1,
  refractionStrength: 1,
  colorSaturation: 0.88,
};

let idCounter = 0;
function lightId(): string {
  idCounter += 1;
  return `pleos-light-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function makeLight(name: string, type: PleosLightType, color: string, position: [number, number, number], rotation: [number, number, number], intensity: number, overrides: Partial<PleosLightData> = {}): PleosLightData {
  return {
    id: lightId(), name, enabled: true, type, color, position, rotation, intensity,
    exposure: 0, width: 3, height: 4, angle: 32, penumbra: 0.55, distance: 18,
    decay: 2, castShadow: true, shadowIntensity: 1, shadowSoftness: 2,
    bias: -0.0002, normalBias: 0.02, ...overrides,
  };
}

function rotationTowardOrigin(position: [number, number, number], rollDegrees = 0): [number, number, number] {
  const matrix = new THREE.Matrix4().lookAt(
    new THREE.Vector3().fromArray(position),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  );
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
  if (rollDegrees !== 0) quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rollDegrees)),
  );
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as [number, number, number];
}

function mirrorLightForMainCamera(light: PleosLightData): PleosLightData {
  const position: [number, number, number] = [light.position[0], light.position[1], -light.position[2]];
  return {
    ...light,
    position,
    rotation: light.type === "point" ? [...light.rotation] : rotationTowardOrigin(position, light.rotation[2]),
  };
}

const PRESET_BUILDERS: Record<Exclude<LightingPresetName, "custom">, () => PleosLightData[]> = {
  "pleos-rgb": () => [
    makeLight("White Key", "rect", "#FFFFFF", [-4.8, 4.6, 5.5], [-28, -35, 0], 28, { width: 4.2, height: 6.2 }),
    makeLight("Blue Rim", "rect", "#4664FF", [4.7, 2.0, 2.4], [-8, 65, 0], 18, { width: 1.1, height: 5.4 }),
    makeLight("Blue Back", "spot", "#2350FF", [1.8, 3.2, -4.8], [-12, 158, 0], 15, { angle: 26, penumbra: 0.7 }),
    makeLight("Red Side", "rect", "#FA293C", [-4.2, -0.8, 1.8], [10, -65, 4], 14, { width: 1.2, height: 4.8 }),
    makeLight("Red Accent", "point", "#FFCDD7", [-1.4, -2.8, 2.8], [0, 0, 0], 22, { distance: 10 }),
    makeLight("Green Top", "spot", "#B4FFD2", [0.2, 5.4, 1.4], [-68, 0, 0], 13, { angle: 34, penumbra: 0.76 }),
    makeLight("Green Edge", "rect", "#0ADC91", [3.3, -2.7, 1.3], [25, 58, -4], 12, { width: 1, height: 4.4 }),
    makeLight("White Fill", "rect", "#E5E5E5", [0, -3.8, 5.8], [32, 0, 0], 12, { width: 5.6, height: 2.2 }),
    makeLight("Soft Direction", "directional", "#CDDCFF", [1.5, 5, 6], [-35, 18, 0], 2.2),
  ],
  "pleos-blue": () => [
    makeLight("Blue 1 Key", "rect", "#CDDCFF", [-4.5, 4.4, 5.4], [-28, -38, 0], 28, { width: 4.5, height: 6.5 }),
    makeLight("Blue 2 Side", "rect", "#4664FF", [4.8, 1.2, 2.2], [0, 68, 0], 19, { width: 1, height: 5.8 }),
    makeLight("Blue 3 Back", "spot", "#2350FF", [0, 3, -5], [-14, 180, 0], 18, { angle: 30, penumbra: 0.75 }),
    makeLight("Blue 4 Low", "rect", "#0F235A", [-2.4, -3.4, 2], [28, -35, 0], 20, { width: 3, height: 1 }),
    makeLight("Neutral Fill", "rect", "#F2F2F2", [1.2, 4.8, 6], [-32, 12, 0], 13, { width: 5.4, height: 4 }),
  ],
  "pleos-prism": () => [
    makeLight("White Optical Key", "rect", "#FFFFFF", [-4.7, 4.8, 5.6], [-30, -36, 0], 32, { width: 4.8, height: 7 }),
    makeLight("White Edge", "rect", "#F2F2F2", [4.8, 1.8, 3], [-5, 64, 0], 24, { width: 0.8, height: 5.8 }),
    makeLight("Blue Whisper", "spot", "#4664FF", [2.4, 3.2, -4], [-18, 150, 0], 8, { angle: 24, penumbra: 0.72 }),
    makeLight("Red Whisper", "rect", "#FA293C", [-3.8, -2, 2], [18, -58, 0], 6, { width: 0.7, height: 3.8 }),
    makeLight("Green Whisper", "rect", "#0ADC91", [3.2, -2.5, 1.8], [24, 55, 0], 5.5, { width: 0.8, height: 3.8 }),
    makeLight("White Fill", "rect", "#CCCCCC", [0, -4, 5], [34, 0, 0], 11, { width: 6, height: 2 }),
  ],
  "dark-studio": () => [
    makeLight("Hard White Key", "rect", "#FFFFFF", [-4.8, 4.3, 5], [-28, -40, 0], 38, { width: 1.2, height: 6.5 }),
    makeLight("Blue Rim", "rect", "#2350FF", [4.7, 2, 1], [0, 72, 0], 24, { width: 0.65, height: 5.5 }),
    makeLight("Red Rim", "rect", "#FA293C", [-4.2, -1.3, 1], [10, -68, 0], 17, { width: 0.65, height: 4.5 }),
    makeLight("Green Pin", "spot", "#0ADC91", [1.5, -3.6, 3], [28, 12, 0], 13, { angle: 18, penumbra: 0.42 }),
  ],
  "soft-glass": () => [
    makeLight("Large White Key", "rect", "#FFFFFF", [-4.6, 4.8, 5.8], [-30, -36, 0], 25, { width: 7.5, height: 8 }),
    makeLight("Large Neutral Fill", "rect", "#E5E5E5", [4.8, 2, 4], [-10, 62, 0], 18, { width: 5.5, height: 7 }),
    makeLight("Soft Blue Top", "rect", "#CDDCFF", [0, 5.6, 1], [-74, 0, 0], 7, { width: 6, height: 3 }),
    makeLight("Soft Green Low", "rect", "#B4FFD2", [0, -4.5, 4], [35, 0, 0], 5, { width: 6.5, height: 2.5 }),
  ],
};

function cloneLight(light: PleosLightData): PleosLightData {
  return { ...light, id: lightId(), position: [...light.position], rotation: [...light.rotation] };
}

export function createLightingPreset(name: Exclude<LightingPresetName, "custom"> = "pleos-rgb"): LightingState {
  // Preset coordinates were originally authored for a +Z camera. The
  // production camera is fixed at -Z, so mirror the complete rig into the
  // visible hemisphere and aim every directional emitter back at the origin.
  const lights = PRESET_BUILDERS[name]().map(mirrorLightForMainCamera);
  const globals = { ...DEFAULT_GLOBALS };
  if (name === "dark-studio") Object.assign(globals, { environmentIntensity: 0.22, exposure: 1.1, bloomIntensity: 0.18 });
  if (name === "soft-glass") Object.assign(globals, { environmentIntensity: 0.9, exposure: 1.02, bloomIntensity: 0.07, colorSaturation: 0.65 });
  if (name === "pleos-prism") Object.assign(globals, { environmentIntensity: 0.62, bloomIntensity: 0.1, colorSaturation: 0.78 });
  return { globals, lights, selectedId: lights[0]?.id ?? null, preset: name };
}

export function migrateLightingRigToMainCamera(state: LightingState): LightingState {
  return {
    ...state,
    globals: { ...state.globals },
    lights: state.lights.map(mirrorLightForMainCamera),
  };
}

export function sanitizeLightingState(value: unknown): LightingState {
  if (!value || typeof value !== "object") return createLightingPreset();
  const raw = value as Partial<LightingState>;
  const fallback = createLightingPreset();
  const number = (input: unknown, defaultValue: number, min: number, max: number): number =>
    typeof input === "number" && Number.isFinite(input) ? THREE.MathUtils.clamp(input, min, max) : defaultValue;
  const vector = (input: unknown, defaultValue: [number, number, number]): [number, number, number] =>
    Array.isArray(input) && input.length === 3 && input.every((item) => typeof item === "number" && Number.isFinite(item))
      ? [input[0], input[1], input[2]] : [...defaultValue];
  const lights = Array.isArray(raw.lights) ? raw.lights.map((item, index) => {
    const source = item as Partial<PleosLightData>;
    const base = fallback.lights[index % fallback.lights.length];
    return {
      ...base,
      id: typeof source.id === "string" ? source.id : lightId(),
      name: typeof source.name === "string" ? source.name.slice(0, 40) : `Light ${String(index + 1).padStart(2, "0")}`,
      enabled: source.enabled !== false,
      type: source.type === "rect" || source.type === "point" || source.type === "spot" || source.type === "directional" ? source.type : base.type,
      color: typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color) ? source.color : base.color,
      position: vector(source.position, base.position), rotation: vector(source.rotation, base.rotation),
      intensity: number(source.intensity, base.intensity, 0, 100), exposure: number(source.exposure, 0, -8, 8),
      width: number(source.width, base.width, 0.05, 20), height: number(source.height, base.height, 0.05, 20),
      angle: number(source.angle, base.angle, 1, 89), penumbra: number(source.penumbra, base.penumbra, 0, 1),
      distance: number(source.distance, base.distance, 0, 100), decay: number(source.decay, base.decay, 0, 4),
      castShadow: source.castShadow !== false, shadowIntensity: number(source.shadowIntensity, 1, 0, 1),
      shadowSoftness: number(source.shadowSoftness, 2, 0, 20), bias: number(source.bias, -0.0002, -0.02, 0.02),
      normalBias: number(source.normalBias, 0.02, 0, 1),
    };
  }) : fallback.lights;
  if (lights.length === 0) lights.push(...fallback.lights);
  const globals = raw.globals ?? fallback.globals;
  const state: LightingState = {
    globals: {
      masterIntensity: number(globals.masterIntensity, fallback.globals.masterIntensity, 0, 4),
      environmentIntensity: number(globals.environmentIntensity, fallback.globals.environmentIntensity, 0, 3),
      exposure: number(globals.exposure, fallback.globals.exposure, 0.2, 3),
      bloomIntensity: number(globals.bloomIntensity, fallback.globals.bloomIntensity, 0, 1.5),
      reflectionStrength: number(globals.reflectionStrength, fallback.globals.reflectionStrength, 0, 3),
      refractionStrength: number(globals.refractionStrength, fallback.globals.refractionStrength, 0, 1.25),
      colorSaturation: number(globals.colorSaturation, fallback.globals.colorSaturation, 0, 2),
    },
    lights,
    selectedId: typeof raw.selectedId === "string" && lights.some((light) => light.id === raw.selectedId) ? raw.selectedId : lights[0].id,
    preset: raw.preset === "pleos-rgb" || raw.preset === "pleos-blue" || raw.preset === "pleos-prism" || raw.preset === "dark-studio" || raw.preset === "soft-glass" ? raw.preset : "custom",
  };
  return state;
}

interface RuntimeLight {
  object: THREE.Light;
  target?: THREE.Object3D;
  helper: THREE.Group;
}

function colorWithSaturation(hex: string, multiplier: number): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * multiplier, 0, 1), hsl.l);
  return color;
}

export class LightingSystem {
  readonly state: LightingState;
  private readonly scene: THREE.Scene;
  private readonly overlayScene: THREE.Scene;
  private readonly onChange: (kind: LightingChangeKind) => void;
  private readonly runtime = new Map<string, RuntimeLight>();
  private editingVisible = false;

  constructor(scene: THREE.Scene, overlayScene: THREE.Scene, initial: LightingState, onChange: (kind: LightingChangeKind) => void) {
    this.scene = scene;
    this.overlayScene = overlayScene;
    this.state = sanitizeLightingState(initial);
    this.onChange = onChange;
    this.rebuildAll();
  }

  get selected(): PleosLightData | null { return this.state.lights.find((light) => light.id === this.state.selectedId) ?? null; }
  get selectedObject(): THREE.Object3D | null { return this.state.selectedId ? this.runtime.get(this.state.selectedId)?.object ?? null : null; }

  setEditingVisible(value: boolean): void { this.editingVisible = value; this.updateHelpers(); }

  select(id: string): void { this.state.selectedId = id; this.updateHelpers(); this.onChange("selection"); }

  add(): void {
    const index = this.state.lights.length + 1;
    const position: [number, number, number] = [3.5, 3.5, -4.5];
    const light = makeLight(`Light ${String(index).padStart(2, "0")}`, "rect", "#FFFFFF", position, rotationTowardOrigin(position), 12);
    this.state.lights.push(light); this.state.selectedId = light.id; this.state.preset = "custom";
    this.createRuntime(light); this.updateHelpers(); this.onChange("lights");
  }

  duplicate(id: string): void {
    const source = this.state.lights.find((light) => light.id === id); if (!source) return;
    const light = cloneLight(source); light.name = `${source.name} 복사`; light.position = [source.position[0] + 0.35, source.position[1] + 0.25, source.position[2]];
    this.state.lights.push(light); this.state.selectedId = light.id; this.state.preset = "custom";
    this.createRuntime(light); this.updateHelpers(); this.onChange("lights");
  }

  remove(id: string): void {
    if (this.state.lights.length <= 1) return;
    const index = this.state.lights.findIndex((light) => light.id === id); if (index < 0) return;
    this.disposeRuntime(id); this.state.lights.splice(index, 1);
    if (this.state.selectedId === id) this.state.selectedId = this.state.lights[Math.min(index, this.state.lights.length - 1)].id;
    this.state.preset = "custom"; this.updateHelpers(); this.onChange("lights");
  }

  applyPreset(name: Exclude<LightingPresetName, "custom">): void {
    const preset = createLightingPreset(name);
    this.runtime.forEach((_, id) => this.disposeRuntime(id));
    this.state.globals = preset.globals; this.state.lights = preset.lights; this.state.selectedId = preset.selectedId; this.state.preset = name;
    this.rebuildAll(); this.onChange("lights"); this.onChange("globals");
  }

  updateGlobal<K extends keyof LightingGlobals>(key: K, value: LightingGlobals[K]): void {
    this.state.globals[key] = value; this.state.preset = "custom";
    if (key === "masterIntensity" || key === "colorSaturation") this.state.lights.forEach((light) => this.applyData(light));
    this.onChange("globals");
  }

  updateLight<K extends keyof PleosLightData>(id: string, key: K, value: PleosLightData[K]): void {
    const light = this.state.lights.find((item) => item.id === id); if (!light) return;
    light[key] = value; this.state.preset = "custom";
    if (key === "type") { this.disposeRuntime(id); this.createRuntime(light); }
    else this.applyData(light);
    this.updateHelpers(); this.onChange(key === "position" || key === "rotation" ? "transform" : "lights");
  }

  syncSelectedFromObject(): void {
    const data = this.selected; const object = this.selectedObject; if (!data || !object) return;
    data.position = object.position.toArray() as [number, number, number];
    data.rotation = [THREE.MathUtils.radToDeg(object.rotation.x), THREE.MathUtils.radToDeg(object.rotation.y), THREE.MathUtils.radToDeg(object.rotation.z)];
    this.applyData(data); this.state.preset = "custom"; this.updateHelpers(); this.onChange("transform");
  }

  private rebuildAll(): void { this.state.lights.forEach((light) => this.createRuntime(light)); this.updateHelpers(); }

  private createRuntime(data: PleosLightData): void {
    let object: THREE.Light;
    let target: THREE.Object3D | undefined;
    if (data.type === "rect") object = new ShapedAreaLight(data.color, data.intensity, data.width, data.height);
    else if (data.type === "spot") { const spot = new PhysicalSpotLight(data.color, data.intensity); object = spot; target = spot.target; }
    else if (data.type === "directional") { const directional = new THREE.DirectionalLight(data.color, data.intensity); object = directional; target = directional.target; }
    else object = new THREE.PointLight(data.color, data.intensity, data.distance, data.decay);
    object.name = data.name; this.scene.add(object); if (target) this.scene.add(target);
    const helper = this.createHelper(data); this.overlayScene.add(helper);
    this.runtime.set(data.id, { object, target, helper }); this.applyData(data);
  }

  private applyData(data: PleosLightData): void {
    const runtime = this.runtime.get(data.id); if (!runtime) return;
    const object = runtime.object;
    object.name = data.name; object.visible = data.enabled; object.color.copy(colorWithSaturation(data.color, this.state.globals.colorSaturation));
    object.intensity = data.intensity * Math.pow(2, data.exposure) * this.state.globals.masterIntensity;
    object.position.fromArray(data.position);
    object.rotation.set(...data.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    object.updateMatrixWorld(true);
    if (object instanceof THREE.RectAreaLight) { object.width = data.width; object.height = data.height; }
    if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight) { object.distance = data.distance; object.decay = data.decay; }
    if (object instanceof THREE.SpotLight) { object.angle = THREE.MathUtils.degToRad(data.angle); object.penumbra = data.penumbra; (object as PhysicalSpotLight).radius = data.shadowSoftness * 0.025; }
    if ("castShadow" in object) object.castShadow = data.castShadow;
    if ((object instanceof THREE.PointLight || object instanceof THREE.SpotLight || object instanceof THREE.DirectionalLight) && object.shadow) {
      object.shadow.intensity = data.shadowIntensity;
      object.shadow.bias = data.bias; object.shadow.normalBias = data.normalBias; object.shadow.radius = data.shadowSoftness;
      object.shadow.mapSize.set(1024, 1024);
    }
    if (runtime.target) {
      const direction = new THREE.Vector3(0, 0, -1).applyEuler(object.rotation).normalize();
      runtime.target.position.copy(object.position).add(direction.multiplyScalar(5)); runtime.target.updateMatrixWorld(true);
    }
    this.updateHelper(data, runtime);
  }

  private createHelper(data: PleosLightData): THREE.Group {
    const group = new THREE.Group(); group.name = `${data.name} Gizmo`; group.renderOrder = 999;
    const material = new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.88, depthTest: false });
    const geometry = new THREE.BufferGeometry();
    const line = new THREE.LineSegments(geometry, material); line.renderOrder = 999; group.add(line);
    return group;
  }

  private updateHelper(data: PleosLightData, runtime = this.runtime.get(data.id)): void {
    if (!runtime) return;
    const group = runtime.helper; const line = group.children[0] as THREE.LineSegments;
    const material = line.material as THREE.LineBasicMaterial; material.color.set(data.color);
    const vertices: number[] = [];
    const segment = (a: [number, number, number], b: [number, number, number]): void => { vertices.push(...a, ...b); };
    const w = data.type === "rect" ? data.width * 0.5 : 0.22; const h = data.type === "rect" ? data.height * 0.5 : 0.22;
    segment([-w, -h, 0], [w, -h, 0]); segment([w, -h, 0], [w, h, 0]); segment([w, h, 0], [-w, h, 0]); segment([-w, h, 0], [-w, -h, 0]);
    if (data.type === "spot") {
      const length = Math.min(data.distance || 5, 5); const radius = Math.tan(THREE.MathUtils.degToRad(data.angle)) * length;
      segment([0, 0, 0], [radius, 0, -length]); segment([0, 0, 0], [-radius, 0, -length]); segment([0, 0, 0], [0, radius, -length]); segment([0, 0, 0], [0, -radius, -length]);
    } else if (data.type !== "point") segment([0, 0, 0], [0, 0, -2]);
    else { segment([-0.35, 0, 0], [0.35, 0, 0]); segment([0, -0.35, 0], [0, 0.35, 0]); segment([0, 0, -0.35], [0, 0, 0.35]); }
    line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    group.position.copy(runtime.object.position); group.quaternion.copy(runtime.object.quaternion); group.visible = this.editingVisible && data.id === this.state.selectedId;
  }

  updateHelpers(): void { this.state.lights.forEach((light) => this.updateHelper(light)); }

  private disposeRuntime(id: string): void {
    const runtime = this.runtime.get(id); if (!runtime) return;
    this.scene.remove(runtime.object); if (runtime.target) this.scene.remove(runtime.target); this.overlayScene.remove(runtime.helper);
    runtime.helper.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
    if (runtime.object instanceof ShapedAreaLight) runtime.object.dispose(); this.runtime.delete(id);
  }

  dispose(): void { [...this.runtime.keys()].forEach((id) => this.disposeRuntime(id)); }
}
