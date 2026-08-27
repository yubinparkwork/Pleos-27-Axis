import type { ShaderProgram } from "../core";
import type { DirectLightState, LightingState } from "./lightingPresets";

export interface DirectLightUniformData {
  readonly directions: Float32Array;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly intensities: Float32Array;
}

/** Reusable CPU packing for the Key / Fill / Rim directional rig. */
export class LightRig {
  public readonly directions = new Float32Array(9);
  public readonly positions = new Float32Array(9);
  public readonly colors = new Float32Array(9);
  public readonly intensities = new Float32Array(3);

  public update(lighting: Readonly<LightingState>): DirectLightUniformData {
    const lights = [lighting.key, lighting.fill, lighting.rim] as const;
    lights.forEach((light, index) => this.writeLight(index, light));
    return this;
  }

  private writeLight(index: number, light: Readonly<DirectLightState>): void {
    const azimuth = light.azimuth * Math.PI / 180;
    const elevation = light.elevation * Math.PI / 180;
    const cosElevation = Math.cos(elevation);
    const offset = index * 3;
    this.directions[offset] = Math.cos(azimuth) * cosElevation;
    this.directions[offset + 1] = Math.sin(elevation);
    this.directions[offset + 2] = Math.sin(azimuth) * cosElevation;
    this.positions[offset] = light.target[0] + this.directions[offset] * light.distance;
    this.positions[offset + 1] = light.target[1] + this.directions[offset + 1] * light.distance;
    this.positions[offset + 2] = light.target[2] + this.directions[offset + 2] * light.distance;
    this.colors.set(light.color, offset);
    this.intensities[index] = light.enabled ? Math.max(0, light.intensity) : 0;
  }
}

const sharedLightRig = new LightRig();

export function uploadLightRigUniforms(
  gl: WebGL2RenderingContext,
  program: ShaderProgram,
  lighting: Readonly<LightingState>,
): void {
  const data = sharedLightRig.update(lighting);
  gl.uniform3fv(program.uniform("uLightDirection[0]"), data.directions);
  gl.uniform3fv(program.uniform("uLightPosition[0]"), data.positions);
  gl.uniform3fv(program.uniform("uLightColor[0]"), data.colors);
  gl.uniform3fv(program.uniform("uLightIntensity"), data.intensities);
}
