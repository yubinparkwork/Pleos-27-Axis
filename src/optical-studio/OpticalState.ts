export interface OpticalState {
  gap: number; bevel: number; ior: number; dispersion: number; roughness: number; surfaceCurvature: number;
  reflection: number; absorption: number; lightIntensity: number; lightSpread: number;
  red: number; green: number; blue: number; exposure: number; zoom: number;
  azimuth: number; elevation: number; time: number; duration: number; speed: number;
  dimensionTop: number; dimensionLeft: number; dimensionRight: number; bloom: number;
  dimensionSpacing: number; dimensionSoftness: number; dimensionFalloff: number;
  dimensionSpacingTop: number; dimensionSpacingLeft: number; dimensionSpacingRight: number;
  lightColor: string;
  lightCycle: boolean; lightCycleOffset: number;
  bounces: number; playing: boolean; aspect: string;
}

export const OPTICAL_ZOOM_RANGE = [0.4, 24] as const;
export const OPTICAL_DIMENSION_KEYS = ['dimensionTop', 'dimensionLeft', 'dimensionRight'] as const;
export const OPTICAL_SPACING_KEYS = ['dimensionSpacingTop', 'dimensionSpacingLeft', 'dimensionSpacingRight'] as const;

export const OPTICAL_DEFAULTS: Readonly<OpticalState> = Object.freeze({
  gap: 0.025, bevel: 0.32, ior: 1.5, dispersion: 0.045, roughness: 0.12, surfaceCurvature: 0.065,
  reflection: 1, absorption: 0.04, lightIntensity: 0.9, lightSpread: 1,
  red: 1, green: 0, blue: 0, exposure: 1, zoom: .50,
  azimuth: 45, elevation: 35.264389682754654, time: 0, duration: 15, speed: 0.4,
  dimensionTop: 3, dimensionLeft: 4, dimensionRight: 3, bloom: 0.18,
  dimensionSpacing: 0.14, dimensionSoftness: 0.55, dimensionFalloff: 0.55, lightColor: '#FFFFFF',
  dimensionSpacingTop: .14, dimensionSpacingLeft: .14, dimensionSpacingRight: .14,
  bounces: 16, playing: true, aspect: "main",
  lightCycle: false, lightCycleOffset: 0,
});

const ranges: Record<Exclude<keyof OpticalState, "playing" | "aspect" | "lightColor" | "lightCycle">, readonly [number, number]> = {
  lightCycleOffset: [0, 1],
  gap: [0, 0.4], bevel: [0, 0.6], ior: [1, 2.5], dispersion: [0, 0.15],
  roughness: [0, 0.3], surfaceCurvature: [0, 0.24], reflection: [0, 2], absorption: [0, 2], lightIntensity: [0, 5],
  lightSpread: [0.2, 2], red: [0, 2], green: [0, 2], blue: [0, 2], exposure: [0.25, 3],
  zoom: OPTICAL_ZOOM_RANGE, azimuth: [-180, 180], elevation: [-80, 80],
  time: [0, 30], duration: [1, 30], speed: [0, 1], bounces: [1, 16],
  dimensionTop: [0, 12], dimensionLeft: [0, 12], dimensionRight: [0, 12], bloom: [0, 1],
  dimensionSpacing: [0.06, 0.3], dimensionSoftness: [0.05, 1], dimensionFalloff: [0, 1],
  dimensionSpacingTop: [.06, .3], dimensionSpacingLeft: [.06, .3], dimensionSpacingRight: [.06, .3],
};

export function normalizeLightColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

// Legacy RGB weights belonged to the light rig, not to cube albedo. Convert
// once when loading old state; explicit new colour always takes precedence.
function legacyLightColor(data: Partial<OpticalState>): string {
  const weights = [data.red, data.green, data.blue].map(v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0);
  const palette = [[250, 41, 60], [10, 220, 145], [35, 80, 255]];
  const rgb = [0, 1, 2].map(channel => weights.reduce((sum, weight, i) => sum + weight * palette[i][channel], 0));
  const scale = 255 / Math.max(255, ...rgb);
  return '#' + rgb.map(v => Math.round(v * scale).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function sanitizeOpticalState(input: unknown): OpticalState {
  const state = { ...OPTICAL_DEFAULTS };
  if (!input || typeof input !== "object") return state;
  const data = input as Partial<OpticalState>;
  for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      state[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
    }
  }
  state.bounces = Math.round(state.bounces);
  // Older saves contain only a shared spacing. Inherit it without changing
  // the appearance; explicit per-cube values always win.
  for (const key of OPTICAL_SPACING_KEYS) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) state[key] = state.dimensionSpacing;
  }
  // Continuous layer budget: fractional last layer fades instead of popping.
  state.lightColor = normalizeLightColor(data.lightColor) ??
    (['red', 'green', 'blue'].some(key => key in data) ? legacyLightColor(data) : OPTICAL_DEFAULTS.lightColor);
  state.time = Math.min(state.time, state.duration);
  if (typeof data.playing === "boolean") state.playing = data.playing;
  if (typeof data.lightCycle === 'boolean') state.lightCycle = data.lightCycle;
  if (["main", "4x5", "9x16", "16x9"].includes(data.aspect ?? "")) state.aspect = data.aspect!;
  return state;
}

export function opticalDimensions(aspect: string, longEdge = 3840): [number, number] {
  const ratio = aspect === "4x5" ? 4 / 5 : aspect === "9x16" ? 9 / 16 : aspect === "16x9" ? 16 / 9 : 1;
  return ratio >= 1 ? [longEdge, Math.round(longEdge / ratio)] : [Math.round(longEdge * ratio), longEdge];
}
