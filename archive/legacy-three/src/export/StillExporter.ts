import * as THREE from "three";
import { EXRExporter } from "three/addons/exporters/EXRExporter.js";
import { zipSync } from "fflate";
import type { PleosRenderer } from "../renderer/PleosRenderer";
import type { OutputSettings } from "../state/studioState";

const MAX_SUPERSAMPLED_PIXELS = 64 * 1024 * 1024;
const MAX_MULTISAMPLED_PIXELS = 16 * 1024 * 1024;

export interface ExportProgress {
  phase: string;
  progress: number;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extensionFor(format: OutputSettings["format"]): string {
  return format === "jpeg" ? "jpg" : format;
}

export class StillExporter {
  private cancelled = false;

  constructor(private readonly studio: PleosRenderer) {}

  cancel(): void { this.cancelled = true; }

  async exportStill(settings: OutputSettings, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    this.cancelled = false;
    const blob = await this.createStillBlob(settings, notify);
    downloadBlob(blob, `pleos-27-axis-${settings.width}x${settings.height}.${extensionFor(settings.format)}`);
    notify?.({ phase: "Complete", progress: 1 });
    return blob;
  }

  async exportAccumulatedStill(settings: OutputSettings, requestedSamples: number, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    if (settings.format !== "png") return this.exportStill(settings, notify);
    this.cancelled = false;
    const maxTexture = this.studio.renderer.capabilities.maxTextureSize;
    if (settings.width > maxTexture || settings.height > maxTexture) throw new Error(`GPU limit ${maxTexture}px exceeded. Tiled accumulation is required.`);
    const pixelCount = settings.width * settings.height;
    const memorySafeSamples = pixelCount > 32 * 1024 * 1024 ? Math.min(8, requestedSamples) : pixelCount > 12 * 1024 * 1024 ? Math.min(16, requestedSamples) : requestedSamples;
    const target = new THREE.WebGLRenderTarget(settings.width, settings.height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const accumulator = new Uint32Array(pixelCount * 4);
    const pixels = new Uint8Array(pixelCount * 4);
    try {
      for (let sample = 0; sample < memorySafeSamples; sample += 1) {
        if (this.cancelled) throw new Error("Export cancelled");
        const camera = this.studio.activeCamera.clone();
        const jitterX = (halton(sample + 1, 2) - 0.5) * 2 / settings.width;
        const jitterY = (halton(sample + 1, 3) - 0.5) * 2 / settings.height;
        camera.projectionMatrix.elements[8] += jitterX;
        camera.projectionMatrix.elements[9] += jitterY;
        this.studio.renderToTarget(target, camera);
        await this.studio.renderer.readRenderTargetPixelsAsync(target, 0, 0, settings.width, settings.height, pixels);
        for (let index = 0; index < pixels.length; index += 1) accumulator[index] += pixels[index];
        notify?.({ phase: `Accumulating ${sample + 1}/${memorySafeSamples}`, progress: 0.08 + (sample + 1) / memorySafeSamples * 0.78 });
        if (sample % 4 === 3) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const averaged = new Uint8ClampedArray(accumulator.length);
      const rowBytes = settings.width * 4;
      for (let y = 0; y < settings.height; y += 1) {
        const sourceRow = settings.height - y - 1;
        for (let x = 0; x < rowBytes; x += 1) averaged[y * rowBytes + x] = Math.round(accumulator[sourceRow * rowBytes + x] / memorySafeSamples);
      }
      const canvas = document.createElement("canvas"); canvas.width = settings.width; canvas.height = settings.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("2D encoding context unavailable");
      context.putImageData(new ImageData(averaged, settings.width, settings.height), 0, 0);
      notify?.({ phase: "Encoding accumulated PNG", progress: 0.94 });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed")), "image/png"));
      downloadBlob(blob, `pleos-27-axis-final-${settings.width}x${settings.height}.png`);
      notify?.({ phase: memorySafeSamples < requestedSamples ? `Complete · memory-safe ${memorySafeSamples} samples` : "Complete", progress: 1 });
      return blob;
    } finally { target.dispose(); }
  }

  /**
   * Renders and encodes a still without causing a browser download.
   * Keeping this boundary public makes the exporter testable and lets future
   * integrations send the exact master bytes to another local destination.
   */
  async createStillBlob(settings: OutputSettings, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    this.cancelled = false;
    notify?.({ phase: "Preparing exact frame", progress: 0.08 });
    if (settings.format === "exr") return this.renderEXR(settings, notify);
    return this.renderRaster(settings, notify);
  }

  private async renderRaster(settings: OutputSettings, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    const maxTexture = this.studio.renderer.capabilities.maxTextureSize;
    const requestedScale = settings.supersampling;
    const requestedPixels = settings.width * requestedScale * settings.height * requestedScale;
    const scale = Math.max(settings.width * requestedScale, settings.height * requestedScale) > maxTexture || requestedPixels > MAX_SUPERSAMPLED_PIXELS ? 1 : requestedScale;
    const width = settings.width * scale;
    const height = settings.height * scale;
    if (width > maxTexture || height > maxTexture) throw new Error(`GPU limit ${maxTexture}px exceeded. Tiled export is required.`);
    const samples = settings.quality === "draft" || scale > 1 || width * height > MAX_MULTISAMPLED_PIXELS ? 0 : Math.min(4, this.studio.renderer.capabilities.maxSamples);
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, samples });
    // Raster targets must use the same output transform as the visible canvas;
    // otherwise linear values are handed to the browser encoder as if sRGB.
    target.texture.colorSpace = THREE.SRGBColorSpace;
    try {
      notify?.({ phase: scale > 1 ? `${scale}× supersampling` : "Offscreen render", progress: 0.28 });
      this.studio.renderToTarget(target);
      if (this.cancelled) throw new Error("Export cancelled");
      const pixels = new Uint8Array(width * height * 4);
      await this.studio.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, pixels);
      notify?.({ phase: "High-quality downsample", progress: 0.72 });
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      const sourceContext = source.getContext("2d");
      if (!sourceContext) throw new Error("2D encoding context unavailable");
      const flipped = new Uint8ClampedArray(pixels.length);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y += 1) {
        flipped.set(pixels.subarray((height - y - 1) * rowBytes, (height - y) * rowBytes), y * rowBytes);
      }
      sourceContext.putImageData(new ImageData(flipped, width, height), 0, 0);
      const output = document.createElement("canvas");
      output.width = settings.width;
      output.height = settings.height;
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("Output encoding context unavailable");
      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = "high";
      outputContext.drawImage(source, 0, 0, settings.width, settings.height);
      const mime = settings.format === "jpeg" ? "image/jpeg" : settings.format === "webp" ? "image/webp" : "image/png";
      const quality = settings.format === "png" ? undefined : 0.96;
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed")), mime, quality));
      return blob;
    } finally {
      target.dispose();
    }
  }

  private async renderEXR(settings: OutputSettings, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    const maxTexture = this.studio.renderer.capabilities.maxTextureSize;
    if (settings.width > maxTexture || settings.height > maxTexture) throw new Error(`GPU limit ${maxTexture}px exceeded. Tiled EXR is not available.`);
    const target = new THREE.WebGLRenderTarget(settings.width, settings.height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    try {
      notify?.({ phase: "Scene-linear half-float render", progress: 0.3 });
      this.studio.renderToTarget(target);
      if (this.cancelled) throw new Error("Export cancelled");
      notify?.({ phase: "Encoding OpenEXR", progress: 0.68 });
      const bytes = await new EXRExporter().parse(this.studio.renderer, target, { type: THREE.HalfFloatType });
      const blob = new Blob([bytes], { type: "image/x-exr" });
      return blob;
    } finally {
      target.dispose();
    }
  }

  async exportMotionSequence(options: {
    width: number;
    height: number;
    frameRate: number;
    frames: number;
    getTime(): number;
    setTime(time: number): void;
    renderFrame(): void;
    download?: boolean;
  }, notify?: (progress: ExportProgress) => void): Promise<Blob> {
    this.cancelled = false;
    const originalTime = options.getTime();
    const files: Record<string, Uint8Array> = {};
    try {
      for (let frame = 0; frame < options.frames; frame += 1) {
        if (this.cancelled) throw new Error("Export cancelled");
        options.setTime(frame / options.frameRate);
        options.renderFrame();
        const blob = await this.renderRaster({ width: options.width, height: options.height, format: "png", supersampling: 1, transparent: false, quality: "balanced" });
        files[`pleos-axis-${String(frame).padStart(4, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
        notify?.({ phase: `Rendering frame ${frame + 1}/${options.frames}`, progress: (frame + 1) / options.frames * 0.92 });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      notify?.({ phase: "Packing PNG sequence", progress: 0.96 });
      const archive = zipSync(files, { level: 1 });
      const blob = new Blob([archive], { type: "application/zip" });
      if (options.download !== false) downloadBlob(blob, `pleos-27-axis-${options.frames}frames.zip`);
      notify?.({ phase: "Complete", progress: 1 });
      return blob;
    } finally {
      options.setTime(originalTime);
      options.renderFrame();
    }
  }
}

function halton(index: number, base: number): number {
  let fraction = 1; let result = 0; let value = index;
  while (value > 0) { fraction /= base; result += fraction * (value % base); value = Math.floor(value / base); }
  return result;
}
