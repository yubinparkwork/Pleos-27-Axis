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
      onStateChange: () => this.context.notifyStateChange(),
    });
  }

  unmount(): void { if (this.app) this.cachedState = { snapshot: this.app.serializeModeState() }; }
  resize(): void { window.dispatchEvent(new Event("resize")); }
  getState(): Glass3DState { return { snapshot: this.controller.serializeModeState() }; }
  setState(state: unknown): void { this.restore(state); }
  renderPreview(): void { void this.controller.exportPng(false); }
  applyVariation(id: string): void { this.controller.applyVariation(id); }
  listVariations() { return this.controller.listVariations(); }
  focusExport(): void { this.context.root.querySelector<HTMLElement>("[data-inspector-tab='output']")?.click(); }
  inspect(): object { return this.controller.inspect(); }
  command(name: string, payload?: unknown): unknown {
    const app = this.controller;
    if (name === "setArtboard") return app.setArtboard(payload as never);
    if (name === "setRenderRegion") return app.setRenderRegion(payload as never);
    if (name === "export") return this.exportAdapter.exportStill(payload as Parameters<Glass3DExportAdapter["exportStill"]>[0]);
    if (name === "setLook") return app.setLook(payload as never);
    if (name === "setPrismStyle") return app.setPrismStyle(payload as never);
    if (name === "setSpectralFlow") return app.setSpectralFlow(payload as never);
    if (name === "setSpectralFlowPreset") return app.setSpectralFlowPreset(payload as never);
    if (name === "setSoftSpectral") return app.setSoftSpectral(payload as never);
    if (name === "setSoftSpectralPreset") return app.setSoftSpectralPreset(payload as never);
    if (name === "setMotionPreset") return app.setMotionPreset(payload as never);
    if (name === "setMotionStrength") return app.setMotionStrength(payload as never);
    if (name === "configureMotion") return app.configureMotion(payload as never);
    if (name === "play") return app.play();
    if (name === "pause") return app.pause();
    if (name === "seek") return app.seek(Number(payload ?? 0));
    if (name === "resetMotion") return app.resetMotion();
    if (name === "stepFrame") return app.stepFrame(Number(payload ?? 1));
    if (name === "renderPreview") return app.renderPreview((payload as "fast" | "high") ?? "fast");
    if (name === "renderCurrentFrame") return app.renderCurrentFrame(Boolean(payload));
    if (name === "renderPrintFrame") return app.renderPrintFrame(Boolean(payload));
    if (name === "exportPng") return app.exportPng(Boolean(payload));
    if (name === "getMotionState") return app.getMotionState();
    if (name === "getState") return this.getState();
    return undefined;
  }
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
  ownsVariation: (id) => id.startsWith("builtin-") || id.startsWith("user-"),
  create: (context) => new Glass3DMode(context),
};
