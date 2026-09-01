import { DEFAULT_ARTBOARD, type ArtboardState } from "../../artboard/ArtboardState";

export type AxisTrailsPresetId = "pleos-blue" | "spectral-signal" | "white-axis";

export interface AxisTrailsState {
  version: 1;
  preset: AxisTrailsPresetId;
  trails: { count: number; points: number; width: number; spacing: number; opacity: number };
  motion: { enabled: boolean; time: number; duration: number; speed: number; stiffness: number; damping: number; axisLock: number; cursorInfluence: number; autonomous: number };
  look: { bloom: number; exposure: number; guideOpacity: number; originGlow: number };
  artboard: ArtboardState;
  export: { ppi: number };
}

const base = (): AxisTrailsState => ({
  version: 1,
  preset: "pleos-blue",
  trails: { count: 22, points: 34, width: 0.011, spacing: 0.058, opacity: 0.74 },
  motion: { enabled: true, time: 0, duration: 10, speed: 1, stiffness: 17, damping: 0.84, axisLock: 0.82, cursorInfluence: 1, autonomous: 0.48 },
  look: { bloom: 0.62, exposure: 1.02, guideOpacity: 0.11, originGlow: 0.48 },
  artboard: { ...DEFAULT_ARTBOARD, axisAnchor: { ...DEFAULT_ARTBOARD.axisAnchor }, background: "#020306" },
  export: { ppi: 300 },
});

export const AXIS_TRAILS_PRESETS: Readonly<Record<AxisTrailsPresetId, AxisTrailsState>> = {
  "pleos-blue": base(),
  "spectral-signal": {
    ...base(), preset: "spectral-signal",
    trails: { ...base().trails, count: 28, width: .01, spacing: .054, opacity: .78 },
    motion: { ...base().motion, stiffness: 22, damping: .79, axisLock: .72, autonomous: .62 },
    look: { ...base().look, bloom: 1.08, exposure: 1.16, guideOpacity: .09 },
  },
  "white-axis": {
    ...base(), preset: "white-axis",
    trails: { ...base().trails, count: 12, width: .012, spacing: .09, opacity: .82 },
    motion: { ...base().motion, stiffness: 15, damping: .86, axisLock: .96, autonomous: .34 },
    look: { ...base().look, bloom: .48, exposure: .96, guideOpacity: .2, originGlow: .42 },
    artboard: { ...base().artboard, background: "#000000" },
  },
};

export const cloneAxisTrailsState = (state: AxisTrailsState): AxisTrailsState => JSON.parse(JSON.stringify(state)) as AxisTrailsState;
export const createAxisTrailsState = (preset: AxisTrailsPresetId = "pleos-blue"): AxisTrailsState => cloneAxisTrailsState(AXIS_TRAILS_PRESETS[preset]);

export function sanitizeAxisTrailsState(value: unknown): AxisTrailsState {
  const candidate = value as Partial<AxisTrailsState> | null;
  const preset = candidate?.preset && candidate.preset in AXIS_TRAILS_PRESETS ? candidate.preset : "pleos-blue";
  const fallback = createAxisTrailsState(preset);
  return {
    ...fallback, ...candidate, version: 1, preset,
    trails: { ...fallback.trails, ...candidate?.trails },
    motion: { ...fallback.motion, ...candidate?.motion },
    look: { ...fallback.look, ...candidate?.look },
    artboard: { ...fallback.artboard, ...candidate?.artboard, axisAnchor: { ...fallback.artboard.axisAnchor, ...candidate?.artboard?.axisAnchor } },
    export: { ...fallback.export, ...candidate?.export },
  };
}
