import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { AxisTrailsMode } from "./AxisTrailsMode";

export class AxisTrailsExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => AxisTrailsMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-transparent", "png-print"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Axis Trails는 실시간 라인 렌더러를 사용합니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
}
