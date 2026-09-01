export interface StudioModeCapabilities {
  motion: boolean;
  pathTracing: boolean;
  rasterExport: boolean;
  transparency: boolean;
  print: boolean;
}

export type StudioExportQuality = "draft" | "high" | "print" | "custom";

export interface StudioSharedState {
  artboard?: unknown;
  inspectorCollapsed?: boolean;
}

export interface StudioVariationSummary {
  id: string;
  label: string;
  builtin: boolean;
  modeId: string;
}

export interface ModeExportAdapter {
  supportedFormats(): readonly string[];
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string>;
  exportSequence?(options?: { download?: boolean }): Promise<string>;
}

export interface StudioModeContext {
  root: HTMLElement;
  listModes(): readonly StudioModeDefinition[];
  requestMode(id: string): void;
  requestVariation(modeId: string, variationId: string): void;
  notifyStateChange(): void;
  requestUiRefresh(): void;
}

export interface StudioModeInstance {
  readonly id: string;
  readonly exportAdapter: ModeExportAdapter;
  mount(): void;
  unmount(): void;
  resize(width: number, height: number): void;
  getState(): unknown;
  setState(state: unknown): void;
  renderPreview(): void | Promise<void>;
  applyVariation?(id: string): void;
  listVariations?(): StudioVariationSummary[];
  focusExport?(): void;
  inspect?(): object;
  command?(name: string, payload?: unknown): unknown;
  getSharedState?(): StudioSharedState;
  setSharedState?(state: StudioSharedState): void;
  serialize(): unknown;
  restore(state: unknown): void;
  dispose(): void;
}

export interface StudioModeDefinition {
  id: string;
  label: string;
  description?: string;
  capabilities: StudioModeCapabilities;
  ownsVariation?(id: string): boolean;
  create(context: StudioModeContext): StudioModeInstance;
}
