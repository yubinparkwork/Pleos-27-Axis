import * as THREE from "three";
import type { DimentionR3FState } from "./DimentionR3FState";

// Finite studio emitters, shared by environment capture and the local
// reflection approximation. No surface albedo, screen gradient or noise.
const BANKS = [
  { n: [1,0,0], u: [0,0,1], v: [0,1,0] },
  { n: [-1,0,0], u: [0,0,-1], v: [0,1,0] },
  { n: [0,1,0], u: [1,0,0], v: [0,0,1] },
  { n: [0,-1,0], u: [1,0,0], v: [0,0,-1] },
  { n: [0,0,1], u: [-1,0,0], v: [0,1,0] },
  { n: [0,0,-1], u: [1,0,0], v: [0,1,0] },
] as const;
export const SOFTBOX_IDS = Array.from({ length: 18 }, (_, i) => i);

// Narrow luminous core surrounded by a wide, smooth penumbra. Nearby RGB
// profiles overlap in linear light, producing intermediate hues naturally.
export const softboxProfileGLSL = /* glsl */`
float softboxProfile(vec2 p, float blur) {
  float curve = p.x + 0.16 * p.y * p.y;
  float core = exp(-pow(curve / (0.13 + blur), 2.0));
  float halo = exp(-pow(curve / (0.43 + blur), 2.0));
  float lengthFade = 1.0 - smoothstep(0.30, 1.0, abs(p.y));
  float border = 1.0 - smoothstep(0.80, 1.0, abs(p.x));
  return (core * 0.68 + halo * 0.32) * lengthFade * border;
}`;

export function createSoftboxes() {
  return SOFTBOX_IDS.map(() => ({
    position: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(),
    color: new THREE.Color(), size: new THREE.Vector2(),
  }));
}

export function updateSoftboxes(boxes: ReturnType<typeof createSoftboxes>, state: DimentionR3FState, phase: number): void {
  const coverage = state.lighting.rgbCoverage;
  for (let i = 0; i < boxes.length; i++) {
    const colorIndex = i % 3;
    const bankIndex = Math.floor(i / 3);
    const bank = BANKS[bankIndex];
    const light = colorIndex === 0 ? state.lighting.rig.red : colorIndex === 1 ? state.lighting.rig.green : state.lighting.rig.blue;
    const box = boxes[i];
    const angle = phase + bankIndex * .43;
    const offset = (colorIndex + Math.floor(bankIndex / 2)) % 3 - 1;
    const width = .55 + coverage * .55;
    const height = 2.0 + coverage * 1.2;
    // Closely spaced cores, overlapping penumbras. Their common slow motion
    // keeps a mixed-light bank intact instead of pulling each hue apart.
    const across = offset * width * .31 + Math.sin(angle) * .55
      + Math.sin(phase + THREE.MathUtils.degToRad(light.phase)) * .12;
    const rise = Math.sin(angle * .83) * light.orbitHeight * .12;
    const radius = Math.max(2, light.orbitRadius * 1.18);
    box.position.set(
      light.positionX + bank.n[0] * radius + bank.u[0] * across + bank.v[0] * rise,
      light.positionY + bank.n[1] * radius + bank.u[1] * across + bank.v[1] * rise,
      light.positionZ + bank.n[2] * radius + bank.u[2] * across + bank.v[2] * rise,
    );
    box.u.fromArray(bank.u); box.v.fromArray(bank.v);
    box.size.set(width, height);
    const power = light.enabled ? state.lighting.master * state.lighting.rgb * light.intensity : 0;
    box.color.set(light.color).multiplyScalar(9 * (1 - Math.exp(-Math.max(0, power) / 3)));
  }
}
