import type { OpticalState } from './OpticalState';

export const PLEOS_CYCLE_COLORS = ['#FA293C', '#0ADC91', '#2350FF'] as const;
export const CYCLE_NAMES = ['레드', '그린', '블루'] as const;

/** The custom colour remains the starting family's colour, not cube albedo. */
export function startingLightFamily(hex: string): number {
  const c = Number.parseInt(hex.slice(1), 16);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return g >= r && g >= b ? 1 : r >= b ? 0 : 2;
}

/** R/G/B power fractions. One closed, C2-smooth G→R→B loop per duration.
 * A short plateau lets each look settle; the final 65% of each stage dissolves.
 * Every channel stays >= 10%; summed power is exactly one, including transitions.
 * Accept caller-owned output so renderer updates allocate no arrays.
 */
export function writeLightWeights(state: Readonly<OpticalState>, out: Float32Array): void {
  const phase = ((state.time / state.duration - state.lightCycleOffset) % 1 + 1) % 1;
  const stage = phase * 3, current = Math.floor(stage), fraction = stage - current;
  const t = Math.max(0, Math.min(1, (fraction - .35) / .65));
  const ease = t * t * t * (t * (t * 6 - 15) + 10);
  const start = startingLightFamily(state.lightColor);
  const lead = (start - current + 3) % 3, next = (lead + 2) % 3;
  out.fill(.1);
  out[lead] += .7 * (1 - ease);
  out[next] += .7 * ease;
}

/** Linear-light emitter colours, each at its own spatial ribbon position. */
export function writeLightPalette(state: Readonly<OpticalState>, out: Float32Array): void {
  const start = startingLightFamily(state.lightColor);
  for (let i = 0; i < 3; i++) {
    const c = Number.parseInt((i === start ? state.lightColor : PLEOS_CYCLE_COLORS[i]).slice(1), 16);
    for (let j = 0; j < 3; j++) {
      const v = ((c >> ((2 - j) * 8)) & 255) / 255;
      out[i * 3 + j] = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }
  }
}

export function inspectLightCycle(state: Readonly<OpticalState>) {
  const weights = new Float32Array(3);
  writeLightWeights(state, weights);
  return { enabled: state.lightCycle, periodSeconds: state.duration, phaseOffset: state.lightCycleOffset,
    order: 'green → red → blue (rotated to chosen starting colour)',
    powerFractionsRGB: Array.from(weights), dominant: CYCLE_NAMES[weights.indexOf(Math.max(...weights))],
    meaning: 'emitter power fractions, not guaranteed screen colour coverage' };
}
