import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { DimentionR3FMode } from "./DimentionR3FMode";

export class DimentionR3FExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => DimentionR3FMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-transparent", "png-print", "mp4-raster-4k"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Dimention R3F는 실시간 R3F 래스터 렌더러를 사용합니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
}
