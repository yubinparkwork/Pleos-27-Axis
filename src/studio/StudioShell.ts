import { ModeRegistry } from "./ModeRegistry";
import type { StudioModeContext, StudioModeInstance } from "./ModeTypes";
import { createStudioState, type StudioState } from "./StudioState";

export class StudioShell {
  private readonly state: StudioState;
  private active: StudioModeInstance | null = null;

  constructor(private readonly root: HTMLElement, private readonly registry: ModeRegistry, initialModeId = "glass-3d") {
    this.state = createStudioState(initialModeId);
  }

  mount(): void { this.activate(this.state.activeModeId); }

  switchMode(id: string): void {
    if (this.active?.id === id) return;
    this.activate(id);
  }

  remountActiveMode(): void { this.activate(this.state.activeModeId, true); }

  applyVariation(modeId: string, variationId: string): void {
    if (this.state.activeModeId !== modeId) this.activate(modeId);
    if (!this.active?.applyVariation) throw new Error(`Studio mode does not support variations: ${modeId}`);
    this.active.applyVariation(variationId);
  }

  get activeMode(): StudioModeInstance {
    if (!this.active) throw new Error("Studio mode is not mounted.");
    return this.active;
  }

  inspect(): object {
    const definition = this.registry.get(this.state.activeModeId);
    return {
      activeMode: definition.id,
      modeLabel: definition.label,
      capabilities: { ...definition.capabilities },
      registeredModes: this.registry.list().map(({ id, label, description, capabilities }) => ({ id, label, description, capabilities })),
      lifecycle: { mounted: Boolean(this.active), canvasCount: this.root.querySelectorAll("canvas").length },
      sharedState: { artboard: this.state.shared.artboard ?? null },
    };
  }

  dispose(): void {
    if (!this.active) return;
    this.state.modeStates[this.active.id] = this.active.serialize();
    this.captureSharedState(this.active);
    this.active.unmount();
    this.active.dispose();
    this.active = null;
    this.root.replaceChildren();
  }

  private activate(id: string, force = false): void {
    if (!force && this.active?.id === id) return;
    const definition = this.registry.get(id);
    if (this.active) {
      this.state.modeStates[this.active.id] = this.active.serialize();
      this.captureSharedState(this.active);
      this.active.unmount();
      this.active.dispose();
      this.active = null;
    }
    this.root.replaceChildren();
    const context: StudioModeContext = {
      root: this.root,
      listModes: () => this.registry.list(),
      requestMode: (nextId) => this.switchMode(nextId),
      requestVariation: (modeId, variationId) => this.applyVariation(modeId, variationId),
    };
    const instance = definition.create(context);
    this.state.activeModeId = id;
    this.active = instance;
    instance.mount();
    const cached = this.state.modeStates[id];
    if (cached !== undefined) instance.restore(cached);
    if (Object.keys(this.state.shared).length) instance.setSharedState?.(this.state.shared);
    else this.captureSharedState(instance);
  }

  private captureSharedState(instance: StudioModeInstance): void {
    const shared = instance.getSharedState?.();
    if (shared) this.state.shared = { ...this.state.shared, ...shared };
  }
}
