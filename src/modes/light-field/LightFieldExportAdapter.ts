import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { LightFieldMode } from "./LightFieldMode";

export class LightFieldExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => LightFieldMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-transparent", "png-print", "png-sequence"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Light Field Mode는 path tracing을 사용하지 않습니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
  exportSequence(options?: { download?: boolean }): Promise<string> { return this.getMode().exportSequence(options?.download ?? false); }
}
