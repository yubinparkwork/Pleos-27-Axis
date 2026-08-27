import { RenderTarget, type GLCapabilities } from "../core";

/** Reused target set for background, thickness, optical composite and post. */
export class PipelineTargets {
  readonly scene: RenderTarget;
  readonly backface: RenderTarget | null;
  readonly composite: RenderTarget | null;
  readonly ldr: RenderTarget;
  readonly final: RenderTarget;
  readonly backfacePrecision: "rgba16f" | "encoded-rgba8" | "not-used";

  constructor(
    gl: WebGL2RenderingContext,
    capabilities: GLCapabilities,
    public width: number,
    public height: number,
    readonly mode: "matte" | "prism",
    label = "Preview",
  ) {
    this.scene = new RenderTarget(gl, capabilities, { width, height, hdr: true, depth: mode === "matte", label: `${label} Scene HDR` });
    const highPrecisionBackface = mode === "prism"
      && capabilities.hdrColorBuffer
      && width * height <= 12_000_000;
    this.backface = mode === "prism"
      ? new RenderTarget(gl, capabilities, {
          width,
          height,
          hdr: highPrecisionBackface,
          depth: true,
          label: `${label} Backface Encoded`,
        })
      : null;
    this.backfacePrecision = mode === "prism"
      ? (highPrecisionBackface ? "rgba16f" : "encoded-rgba8")
      : "not-used";
    this.composite = mode === "prism"
      ? new RenderTarget(gl, capabilities, { width, height, hdr: true, depth: true, label: `${label} Composite HDR` })
      : null;
    this.ldr = new RenderTarget(gl, capabilities, { width, height, hdr: false, depth: false, label: `${label} Tone Mapped` });
    this.final = new RenderTarget(gl, capabilities, { width, height, hdr: false, depth: false, label: `${label} Final` });
  }

  get hdr(): boolean { return this.scene.hdr && (this.composite?.hdr ?? true); }

  resize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.scene.resize(width, height);
    this.backface?.resize(width, height);
    this.composite?.resize(width, height);
    this.ldr.resize(width, height);
    this.final.resize(width, height);
    return true;
  }

  dispose(): void {
    this.scene.dispose();
    this.backface?.dispose();
    this.composite?.dispose();
    this.ldr.dispose();
    this.final.dispose();
  }
}
