import * as THREE from "three/webgpu";
import type { DirectLightState, LightingState } from "../../raw-webgl/lighting/lightingPresets";

type NamedLight = "key" | "fill" | "rim" | "upperLeft" | "lowerRight";

function srgbColor(source: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(source[0], source[1], source[2]);
}

function lightPosition(source: Readonly<DirectLightState>): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(source.azimuth);
  const elevation = THREE.MathUtils.degToRad(source.elevation);
  const radius = Math.max(0.1, source.distance);
  const horizontal = Math.cos(elevation) * radius;
  return new THREE.Vector3(
    source.target[0] + Math.cos(azimuth) * horizontal,
    source.target[1] + Math.sin(elevation) * radius,
    source.target[2] + Math.sin(azimuth) * horizontal,
  );
}

export class LightingSystem {
  readonly group = new THREE.Group();
  private readonly hemisphere = new THREE.HemisphereLight(0xdbe8ff, 0x020207, 0.08);
  private readonly lights: Record<NamedLight, THREE.PointLight> = {
    key: new THREE.PointLight(),
    fill: new THREE.PointLight(),
    rim: new THREE.PointLight(),
    upperLeft: new THREE.PointLight(),
    lowerRight: new THREE.PointLight(),
  };

  constructor(initialState: Readonly<LightingState>) {
    this.group.name = "Premium Lighting";
    this.group.add(this.hemisphere, ...Object.values(this.lights));
    Object.values(this.lights).forEach((light) => {
      light.decay = 2;
      light.castShadow = false;
    });
    this.update(initialState);
  }

  update(state: Readonly<LightingState>, optical = false): void {
    const directScale = optical ? 0.055 : 1;
    this.hemisphere.intensity = optical
      ? Math.max(0.001, state.softArea.ambientIntensity * 0.35)
      : Math.max(0.002, state.environmentIntensity * 0.12 + state.softArea.ambientIntensity);
    this.hemisphere.color.copy(srgbColor([0.78, 0.88, 1]));
    this.hemisphere.groundColor.copy(srgbColor(state.backgroundColor));
    (Object.keys(this.lights) as NamedLight[]).forEach((name) => this.updateLight(this.lights[name], state[name], directScale));
  }

  dispose(): void {
    Object.values(this.lights).forEach((light) => light.dispose());
    this.group.clear();
  }

  private updateLight(light: THREE.PointLight, source: Readonly<DirectLightState>, intensityScale: number): void {
    light.visible = source.enabled && source.intensity > 0;
    light.color.copy(srgbColor(source.color));
    light.intensity = Math.max(0, source.intensity) * 18 * intensityScale;
    light.distance = source.influenceRadius > 0 ? Math.max(source.influenceRadius * 3.2, 0.1) : 0;
    light.decay = Math.max(1.6, 2 + source.falloff * 2);
    light.position.copy(lightPosition(source));
  }
}
