import { mount, unmount } from "svelte";
import { writable, type Writable } from "svelte/store";
import AxisFormationPanel from "./AxisFormationPanel.svelte";
import type { AxisHabitatPresetId, AxisHabitatState } from "./AxisHabitatState";

export interface AxisHabitatMetrics {
  fps?: number;
  dpr?: number;
  drawCalls?: number;
  quality?: string;
  stage?: string;
  fragments?: number;
}

interface AxisHabitatPanelActions {
  change(path: string): void;
  preset(id: AxisHabitatPresetId): void;
  reset(): void;
  resetMotion(): void;
  export(): Promise<void>;
}

export class AxisHabitatPanel {
  private readonly stateStore: Writable<AxisHabitatState>;
  private readonly metricsStore = writable<AxisHabitatMetrics>({});
  private readonly component: ReturnType<typeof mount>;

  constructor(private readonly root: HTMLElement, private readonly state: AxisHabitatState, actions: AxisHabitatPanelActions) {
    this.stateStore = writable(state);
    this.component = mount(AxisFormationPanel, {
      target: root,
      props: {
        stateStore: this.stateStore,
        metricsStore: this.metricsStore,
        onChange: actions.change,
        onPreset: actions.preset,
        onReset: actions.reset,
        onResetMotion: actions.resetMotion,
        onExport: actions.export,
      },
    });
  }

  sync(metrics?: AxisHabitatMetrics): void {
    this.stateStore.set(this.state);
    if (metrics) this.metricsStore.set(metrics);
  }

  focusExport(): void {
    this.root.querySelector<HTMLButtonElement>("[data-formation-tab='output']")?.click();
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>("[data-habitat-output]")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  dispose(): void {
    void unmount(this.component);
    this.root.replaceChildren();
  }
}
