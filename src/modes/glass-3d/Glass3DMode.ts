import { MotionStudioApp } from "../../crystal/MotionStudioApp";
import type { StudioModeContext, StudioModeDefinition, StudioModeInstance, StudioSharedState } from "../../studio/ModeTypes";
import type { Glass3DState } from "./Glass3DState";
import { Glass3DExportAdapter } from "./Glass3DExportAdapter";

export class Glass3DMode implements StudioModeInstance {
  readonly id = "glass-3d";
  readonly exportAdapter = new Glass3DExportAdapter(() => this.controller);
  private app: MotionStudioApp | null = null;
  private cachedState: Glass3DState | null = null;

  constructor(private readonly context: StudioModeContext) {}

  get controller(): MotionStudioApp {
    if (!this.app) throw new Error("Glass 3D mode is not mounted.");
    return this.app;
  }

  mount(): void {
    if (this.app) return;
    this.app = new MotionStudioApp(this.context.root, {
      activeModeId: this.id,
      modes: this.context.listModes().map(({ id, label }) => ({ id, label })),
      onModeChange: (id) => this.context.requestMode(id),
      onVariationChange: (modeId, variationId) => this.context.requestVariation(modeId, variationId),
    });
  }

  unmount(): void { if (this.app) this.cachedState = { snapshot: this.app.serializeModeState() }; }
  resize(): void { window.dispatchEvent(new Event("resize")); }
  getState(): Glass3DState { return { snapshot: this.controller.serializeModeState() }; }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { void this.controller.exportPng(false); }
  applyVariation(id: string): void { this.controller.applyVariation(id); }
  getSharedState(): StudioSharedState { return { artboard: this.controller.serializeModeState().format }; }
  setSharedState(state: StudioSharedState): void {
    if (!state.artboard) return;
    const snapshot = this.controller.serializeModeState();
    this.controller.restoreModeState({ ...snapshot, format: state.artboard as typeof snapshot.format });
  }
  serialize(): Glass3DState { return this.app ? this.getState() : this.cachedState as Glass3DState; }
  restore(state: unknown): void {
    const candidate = state as Partial<Glass3DState> | null;
    if (!candidate?.snapshot) return;
    this.cachedState = { snapshot: candidate.snapshot };
    if (this.app) this.app.restoreModeState(candidate.snapshot);
  }
  dispose(): void { this.app?.dispose(); this.app = null; }
}

export const GLASS_3D_MODE: StudioModeDefinition = {
  id: "glass-3d",
  label: "Glass 3D",
  description: "Three.js optical solids, branded light and path-traced output",
  capabilities: { motion: true, pathTracing: true, rasterExport: true, transparency: true, print: true },
  create: (context) => new Glass3DMode(context),
};
