import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { AxisHabitatMode } from "./AxisHabitatMode";

export class AxisHabitatExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => AxisHabitatMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-print"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Formation Loop는 최적화된 실시간 WebGL2 래스터 모드입니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
}
