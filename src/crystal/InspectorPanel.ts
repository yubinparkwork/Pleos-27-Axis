export type InspectorTab = "object" | "material" | "light" | "render" | "export";

const TABS: InspectorTab[] = ["object", "material", "light", "render", "export"];

export class InspectorPanel {
  private readonly appRoot: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly onStateChange: (tab: InspectorTab, collapsed: boolean) => void;
  private activeTab: InspectorTab;
  private collapsed: boolean;

  constructor(appRoot: HTMLElement, activeTab: InspectorTab, collapsed: boolean, onStateChange: (tab: InspectorTab, collapsed: boolean) => void) {
    this.appRoot = appRoot;
    this.dock = this.require<HTMLElement>(".control-dock");
    this.toggleButton = this.require<HTMLButtonElement>("[data-action='inspector-toggle']");
    this.onStateChange = onStateChange;
    this.activeTab = TABS.includes(activeTab) ? activeTab : "material";
    this.collapsed = collapsed;
    this.dock.querySelectorAll<HTMLButtonElement>("[data-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => this.setTab(button.dataset.inspectorTab as InspectorTab));
    });
    this.dock.querySelector<HTMLButtonElement>("[data-action='inspector-close']")?.addEventListener("click", () => this.setCollapsed(true));
    this.toggleButton.addEventListener("click", () => this.setCollapsed(!this.collapsed));
    this.apply();
  }

  setTab(tab: InspectorTab): void {
    if (!TABS.includes(tab)) return;
    this.activeTab = tab;
    if (this.collapsed) this.collapsed = false;
    this.apply(); this.onStateChange(this.activeTab, this.collapsed);
  }

  toggle(): void { this.setCollapsed(!this.collapsed); }

  setCollapsed(value: boolean): void {
    this.collapsed = value; this.apply(); this.onStateChange(this.activeTab, this.collapsed);
  }

  private apply(): void {
    this.appRoot.classList.toggle("controls-hidden", this.collapsed);
    this.dock.querySelectorAll<HTMLButtonElement>("[data-inspector-tab]").forEach((button) => {
      const active = button.dataset.inspectorTab === this.activeTab;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active));
    });
    this.dock.querySelectorAll<HTMLElement>("[data-inspector-view]").forEach((view) => {
      const active = view.dataset.inspectorView === this.activeTab;
      view.classList.toggle("active", active); view.hidden = !active;
    });
    this.toggleButton.setAttribute("aria-expanded", String(!this.collapsed));
    this.toggleButton.title = this.collapsed ? "Inspector 열기 (Tab)" : "Inspector 닫기 (Tab)";
  }

  private require<T extends Element>(selector: string): T {
    const element = this.appRoot.querySelector<T>(selector);
    if (!element) throw new Error(`Missing inspector element: ${selector}`);
    return element;
  }
}
