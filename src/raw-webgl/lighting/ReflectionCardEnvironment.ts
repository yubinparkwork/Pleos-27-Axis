import type { ShaderProgram } from "../core";
import type { LightingState, ReflectionCardState } from "./lightingPresets";

const CARD_COUNT = 5;

export interface ReflectionCardUniformData {
  readonly directions: Float32Array;
  readonly rights: Float32Array;
  readonly ups: Float32Array;
  readonly colors: Float32Array;
  readonly data: Float32Array;
  environmentIntensity: number;
  environmentRotationRadians: number;
}

export class ReflectionCardEnvironment implements ReflectionCardUniformData {
  public readonly directions = new Float32Array(CARD_COUNT * 3);
  public readonly rights = new Float32Array(CARD_COUNT * 3);
  public readonly ups = new Float32Array(CARD_COUNT * 3);
  public readonly colors = new Float32Array(CARD_COUNT * 3);
  public readonly data = new Float32Array(CARD_COUNT * 4);
  public environmentIntensity = 1;
  public environmentRotationRadians = 0;

  public update(lighting: Readonly<LightingState>): ReflectionCardUniformData {
    for (let index = 0; index < CARD_COUNT; index += 1) {
      this.writeCard(index, lighting.cards[index]);
    }
    this.environmentIntensity = Math.max(0, lighting.environmentIntensity);
    this.environmentRotationRadians = lighting.environmentRotation * Math.PI / 180;
    return this;
  }

  private writeCard(index: number, card: Readonly<ReflectionCardState> | undefined): void {
    const directionOffset = index * 3;
    const dataOffset = index * 4;
    if (!card) {
      this.directions.set([0, 0, 1], directionOffset);
      this.rights.set([1, 0, 0], directionOffset);
      this.ups.set([0, 1, 0], directionOffset);
      this.colors.set([0, 0, 0], directionOffset);
      this.data.set([0.1, 0.1, 0.1, 0], dataOffset);
      return;
    }
    const azimuth = card.azimuth * Math.PI / 180;
    const elevation = card.elevation * Math.PI / 180;
    const rotation = card.rotation * Math.PI / 180;
    const cosElevation = Math.cos(elevation);
    const direction: [number, number, number] = [
      Math.cos(azimuth) * cosElevation,
      Math.sin(elevation),
      Math.sin(azimuth) * cosElevation,
    ];
    const baseRight = normalize(cross(Math.abs(direction[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0], direction));
    const baseUp = normalize(cross(direction, baseRight));
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const right = add(scale(baseRight, cosine), scale(baseUp, sine));
    const up = add(scale(baseUp, cosine), scale(baseRight, -sine));
    this.directions.set(direction, directionOffset);
    this.rights.set(right, directionOffset);
    this.ups.set(up, directionOffset);
    this.colors.set(card.color, directionOffset);
    this.data.set([
      Math.max(0.002, card.width),
      Math.max(0.002, card.height),
      Math.max(0.002, card.softness),
      card.enabled ? Math.max(0, card.intensity) : 0,
    ], dataOffset);
  }
}

const sharedEnvironment = new ReflectionCardEnvironment();

export function uploadReflectionCardUniforms(
  gl: WebGL2RenderingContext,
  program: ShaderProgram,
  lighting: Readonly<LightingState>,
): void {
  const environment = sharedEnvironment.update(lighting);
  gl.uniform3fv(program.uniform("uCardDirection[0]"), environment.directions);
  gl.uniform3fv(program.uniform("uCardRight[0]"), environment.rights);
  gl.uniform3fv(program.uniform("uCardUp[0]"), environment.ups);
  gl.uniform3fv(program.uniform("uCardColor[0]"), environment.colors);
  gl.uniform4fv(program.uniform("uCardData[0]"), environment.data);
  gl.uniform1f(program.uniform("uEnvironmentIntensity"), environment.environmentIntensity);
  gl.uniform1f(program.uniform("uEnvironmentRotation"), environment.environmentRotationRadians);
}

type MutableVec3 = [number, number, number];

function cross(a: readonly number[], b: readonly number[]): MutableVec3 {
  return [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ];
}

function normalize(value: MutableVec3): MutableVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function scale(value: MutableVec3, scalar: number): MutableVec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function add(a: MutableVec3, b: MutableVec3): MutableVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
