import type { ModeExportAdapter, StudioExportQuality } from "../../studio/ModeTypes";
import type { KineticGlassMode } from "./KineticGlassMode";

export class KineticGlassExportAdapter implements ModeExportAdapter {
  constructor(private readonly getMode: () => KineticGlassMode) {}
  supportedFormats(): readonly string[] { return ["png-raster", "png-transparent", "png-print"]; }
  exportStill(options: { renderer: "raster" | "path"; quality: StudioExportQuality; download?: boolean }): Promise<string> {
    if (options.renderer === "path") return Promise.reject(new Error("Kinetic Glass는 실시간 Three.js 물리 렌더러를 사용합니다."));
    return this.getMode().exportStill(options.quality, options.download ?? true);
  }
}
