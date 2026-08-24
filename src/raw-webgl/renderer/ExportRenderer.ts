import type { GLCapabilities, Texture2D } from "../core";
import { RenderTarget as Target } from "../core";
import type { ExportPass } from "../passes/ExportPass";

export interface ExportSampleRequest {
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly jitterNdc: readonly [number, number];
  readonly transparent: boolean;
}

export interface PNGExportOptions {
  readonly width: number;
  readonly height: number;
  readonly supersampling?: 1 | 2;
  readonly accumulationSamples?: 1 | 8 | 16 | 32;
  readonly transparent?: boolean;
  readonly filename?: string;
  readonly download?: boolean;
  /** Internal target estimate supplied by the active material pipeline. */
  readonly estimatedPipelineBytesPerPixel?: number;
}

export interface PNGExportResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly samples: number;
  readonly filename: string;
}

export type ExportSampleRenderer = (request: ExportSampleRequest) => Texture2D;

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let value = index;
  while (value > 0) {
    fraction /= base;
    result += fraction * (value % base);
    value = Math.floor(value / base);
  }
  return result;
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.trim().replace(/\.png$/i, "").replace(/[^a-z0-9._-]+/gi, "-");
  return `${normalized || "pleos-new-axis-raw"}.png`;
}

async function encodePng(pixelsBottomUp: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Browser 2D canvas is unavailable for PNG encoding.");
  const rowBytes = width * 4;
  const row = new Uint8ClampedArray(rowBytes);
  for (let y = 0; y < Math.floor(height / 2); y += 1) {
    const topOffset = y * rowBytes;
    const bottomOffset = (height - 1 - y) * rowBytes;
    row.set(pixelsBottomUp.subarray(topOffset, topOffset + rowBytes));
    pixelsBottomUp.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
    pixelsBottomUp.set(row, bottomOffset);
  }
  const imagePixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(
    pixelsBottomUp.buffer as ArrayBuffer,
    pixelsBottomUp.byteOffset,
    pixelsBottomUp.byteLength,
  );
  context.putImageData(new ImageData(imagePixels, width, height), 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoder returned no data.")), "image/png");
  });
}

export class ExportRenderer {
  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly capabilities: GLCapabilities,
    private readonly exportPass: ExportPass,
  ) {}

  async exportPNG(options: PNGExportOptions, renderSample: ExportSampleRenderer): Promise<PNGExportResult> {
    const width = Math.round(options.width);
    const height = Math.round(options.height);
    const supersampling = options.supersampling ?? 1;
    const samples = options.accumulationSamples ?? 1;
    const renderWidth = width * supersampling;
    const renderHeight = height * supersampling;
    this.validateDimensions(
      width,
      height,
      renderWidth,
      renderHeight,
      options.estimatedPipelineBytesPerPixel ?? (this.capabilities.hdrColorBuffer ? 36 : 24),
    );
    const filename = sanitizeFilename(options.filename ?? "pleos-new-axis-raw");
    const resolveTarget = new Target(this.gl, this.capabilities, {
      width,
      height,
      hdr: false,
      depth: false,
      label: "PNG Export Resolve",
    });
    const readback = new Uint8Array(width * height * 4);
    const accumulated = samples > 1 ? new Uint16Array(readback.length) : null;
    try {
      for (let sample = 0; sample < samples; sample += 1) {
        const jitterX = samples > 1 ? halton(sample + 1, 2) - 0.5 : 0;
        const jitterY = samples > 1 ? halton(sample + 1, 3) - 0.5 : 0;
        const source = renderSample({
          renderWidth,
          renderHeight,
          jitterNdc: [2 * jitterX / renderWidth, 2 * jitterY / renderHeight],
          transparent: options.transparent ?? false,
        });
        this.exportPass.resolve(source, resolveTarget);
        this.exportPass.readPixels(resolveTarget, readback);
        if (accumulated) {
          for (let index = 0; index < readback.length; index += 1) accumulated[index] += readback[index];
        }
      }
      if (accumulated) {
        for (let index = 0; index < readback.length; index += 1) {
          readback[index] = Math.round(accumulated[index] / samples);
        }
      }
      const averaged = new Uint8ClampedArray(readback.buffer, readback.byteOffset, readback.byteLength);
      const blob = await encodePng(averaged, width, height);
      if (options.download !== false) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      return { blob, width, height, renderWidth, renderHeight, samples, filename };
    } finally {
      resolveTarget.dispose();
    }
  }

  private validateDimensions(
    width: number,
    height: number,
    renderWidth: number,
    renderHeight: number,
    pipelineBytesPerPixel: number,
  ): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError("PNG export dimensions must be positive integers.");
    }
    const maximum = Math.min(this.capabilities.maxTextureSize, this.capabilities.maxRenderbufferSize);
    if (renderWidth > maximum || renderHeight > maximum) {
      throw new RangeError(
        `Requested ${renderWidth} × ${renderHeight} supersampled render exceeds the GPU limit ${maximum}.`,
      );
    }
    const estimatedBytes = renderWidth * renderHeight * pipelineBytesPerPixel + width * height * 4;
    if (estimatedBytes > 1_000_000_000) {
      throw new RangeError(`Export would allocate about ${Math.ceil(estimatedBytes / 1_048_576)} MiB of GPU targets; reduce output size or supersampling.`);
    }
  }
}
