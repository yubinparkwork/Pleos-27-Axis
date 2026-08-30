export type InspectorTab = "setup" | "look" | "motion" | "format" | "export" | "object" | "material" | "light" | "render";

export class InspectorPanel {
  private readonly appRoot: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly toggleButtons: HTMLButtonElement[];
  private readonly onStateChange: (tab: InspectorTab, collapsed: boolean) => void;
  private activeTab: InspectorTab;
  private collapsed: boolean;

  constructor(appRoot: HTMLElement, activeTab: InspectorTab, collapsed: boolean, onStateChange: (tab: InspectorTab, collapsed: boolean) => void) {
    this.appRoot = appRoot;
    this.dock = this.require<HTMLElement>(".control-dock");
    this.toggleButtons = Array.from(this.appRoot.querySelectorAll<HTMLButtonElement>("[data-action='inspector-toggle']"));
    if (!this.toggleButtons.length) throw new Error("Missing inspector toggle");
    this.onStateChange = onStateChange;
    this.activeTab = activeTab;
    this.collapsed = collapsed;
    this.dock.querySelector<HTMLButtonElement>("[data-action='inspector-close']")?.addEventListener("click", () => this.setCollapsed(true));
    this.toggleButtons.forEach((button) => button.addEventListener("click", () => this.setCollapsed(!this.collapsed)));
    this.apply();
  }

  setTab(tab: InspectorTab): void {
    this.activeTab = tab;
    if (this.collapsed) this.collapsed = false;
    this.apply(); this.onStateChange(this.activeTab, this.collapsed);
  }

  toggle(): void { this.setCollapsed(!this.collapsed); }

  get tab(): InspectorTab { return this.activeTab; }
  get isCollapsed(): boolean { return this.collapsed; }

  setCollapsed(value: boolean): void {
    this.collapsed = value; this.apply(); this.onStateChange(this.activeTab, this.collapsed);
  }

  private apply(): void {
    this.appRoot.classList.toggle("controls-hidden", this.collapsed);
    this.toggleButtons.forEach((button) => {
      button.setAttribute("aria-expanded", String(!this.collapsed));
      button.title = this.collapsed ? "외형 패널 열기 (Tab)" : "외형 패널 닫기 (Tab)";
    });
  }

  private require<T extends Element>(selector: string): T {
    const element = this.appRoot.querySelector<T>(selector);
    if (!element) throw new Error(`Missing inspector element: ${selector}`);
    return element;
  }
}
