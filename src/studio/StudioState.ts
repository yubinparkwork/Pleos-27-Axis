import type { StudioSharedState } from "./ModeTypes";

export interface StudioState {
  version: 2;
  activeModeId: string;
  modeStates: Record<string, unknown>;
  shared: StudioSharedState;
}

export const createStudioState = (activeModeId = "glass-3d"): StudioState => ({ version: 2, activeModeId, modeStates: {}, shared: {} });
