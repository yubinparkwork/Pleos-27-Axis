import * as THREE from "three/webgpu";
import type { LightingState } from "../../raw-webgl/lighting/lightingPresets";

interface HdrCard {
  u: number;
  v: number;
  width: number;
  height: number;
  energy: number;
  color: readonly [number, number, number];
}

const HDR_CARDS: readonly HdrCard[] = [
  { u: 0.18, v: 0.27, width: 0.11, height: 0.22, energy: 9.5, color: [1, 0.98, 0.92] },
  { u: 0.73, v: 0.72, width: 0.09, height: 0.2, energy: 7.8, color: [0.72, 0.86, 1] },
  { u: 0.49, v: 0.48, width: 0.022, height: 0.34, energy: 12, color: [1, 1, 1] },
  { u: 0.89, v: 0.43, width: 0.032, height: 0.19, energy: 5.6, color: [1, 0.2, 0.05] },
  { u: 0.34, v: 0.59, width: 0.028, height: 0.16, energy: 5.2, color: [0.04, 0.2, 1] },
];

function wrappedDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 1 - direct);
}

function createOpticalEnvironment(resolution: number): THREE.DataTexture {
  const width = Math.max(256, Math.min(1024, resolution));
  const height = Math.max(128, Math.round(width * 0.5));
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const offset = (y * width + x) * 4;
      const horizon = Math.exp(-Math.pow((v - 0.52) / 0.24, 2));
      let red = 0.0012 + horizon * 0.0022;
      let green = 0.0016 + horizon * 0.0028;
      let blue = 0.0034 + horizon * 0.0064;
      HDR_CARDS.forEach((card) => {
        const dx = wrappedDistance(u, card.u) / card.width;
        const dy = Math.abs(v - card.v) / card.height;
        const glow = Math.exp(-(dx * dx + dy * dy) * 2.35) * card.energy;
        red += glow * card.color[0];
        green += glow * card.color[1];
        blue += glow * card.color[2];
      });
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.name = "Pleos Procedural HDR Optical Studio";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class EnvironmentSystem {
  private environment: THREE.DataTexture | null = null;

  get texture(): THREE.Texture | null {
    return this.environment;
  }

  async initialize(_renderer: THREE.WebGPURenderer, scene: THREE.Scene, resolution: number): Promise<void> {
    this.environment = createOpticalEnvironment(resolution);
    scene.environment = this.environment;
  }

  update(scene: THREE.Scene, state: Readonly<LightingState>): void {
    scene.environmentIntensity = Math.max(0, state.environmentIntensity);
    scene.environmentRotation.set(0, THREE.MathUtils.degToRad(state.environmentRotation), 0);
  }

  dispose(scene: THREE.Scene): void {
    scene.environment = null;
    this.environment?.dispose();
    this.environment = null;
  }
}
