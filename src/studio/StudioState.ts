import type { StudioSharedState } from "./ModeTypes";

export interface StudioState {
  activeModeId: string;
  modeStates: Record<string, unknown>;
  shared: StudioSharedState;
}

export const createStudioState = (activeModeId = "glass-3d"): StudioState => ({ activeModeId, modeStates: {}, shared: {} });
