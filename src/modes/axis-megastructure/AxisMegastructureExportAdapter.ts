import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { AxisMegastructureMode } from "./AxisMegastructureMode";

export class AxisMegastructureExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => AxisMegastructureMode) {}
  supportedFormats(): readonly string[] { return ["image/png"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer !== "raster") return Promise.reject(new Error("Axis Megastructure는 고품질 WebGL2 래스터 PNG를 사용합니다."));
    return this.getMode().exportStill(options.quality, options.download ?? false);
  }
}
