import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { MotionStudioApp } from "../../crystal/MotionStudioApp";

export class Glass3DExportAdapter implements ModeExportAdapter {
  constructor(private readonly getApp: () => MotionStudioApp) {}

  supportedFormats(): readonly string[] { return ["png-raster", "png-path-traced", "png-print", "png-sequence"]; }

  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    const app = this.getApp();
    if (options.quality === "print") return app.renderPrintFrame(options.download ?? true);
    if (options.renderer === "raster" || options.quality === "draft") return app.exportPng(options.download ?? true);
    return app.renderCurrentFrame(options.download ?? true);
  }

  async exportSequence(): Promise<string> { return this.getApp().getSequenceCommand(); }
}
