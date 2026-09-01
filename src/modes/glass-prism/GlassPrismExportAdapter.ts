import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { GlassPrismMode } from "./GlassPrismMode";
export class GlassPrismExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => GlassPrismMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-transparent", "png-print", "png-sequence"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Glass Prism Mode는 전용 WebGL2 굴절 렌더러를 사용합니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
  exportSequence(options?: { download?: boolean }): Promise<string> { return this.getMode().exportSequence(options?.download ?? false); }
}
