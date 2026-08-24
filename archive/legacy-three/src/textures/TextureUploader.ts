import * as THREE from "three";

export type SurfaceTextureSlot = "baseColor" | "normal";

export interface UploadedTextureAsset {
  slot: SurfaceTextureSlot;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  texture: THREE.CanvasTexture;
}

export interface TextureUploadOptions {
  maxDimension?: number;
  anisotropy?: number;
}

const MAX_FILE_BYTES = 64 * 1024 * 1024;

function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Owns user-supplied GPU textures for the current browser session.
 * Uploaded pixels are decoded locally and never leave the browser.
 */
export class TextureUploader {
  private readonly assets = new Map<SurfaceTextureSlot, UploadedTextureAsset>();

  async load(file: File, slot: SurfaceTextureSlot, options: TextureUploadOptions = {}): Promise<UploadedTextureAsset> {
    if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, WebP, or other browser-supported image");
    if (file.size > MAX_FILE_BYTES) throw new Error("Texture files must be 64 MB or smaller");

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("This image could not be decoded by the browser");
    }

    try {
      const maxDimension = Math.max(256, Math.min(options.maxDimension ?? 4096, 8192));
      const fitted = fitWithin(bitmap.width, bitmap.height, maxDimension);
      const canvas = document.createElement("canvas");
      canvas.width = fitted.width;
      canvas.height = fitted.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Unable to prepare the uploaded texture");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      // Material color supplies the approved Pleos family. Converting incoming
      // albedo to luminance preserves surface detail without importing a new hue.
      context.filter = slot === "baseColor" ? "grayscale(1)" : "none";
      context.drawImage(bitmap, 0, 0, fitted.width, fitted.height);

      const texture = new THREE.CanvasTexture(canvas);
      texture.name = `User ${slot}: ${file.name}`;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.max(1, options.anisotropy ?? 1);
      texture.colorSpace = slot === "baseColor" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;

      const asset: UploadedTextureAsset = {
        slot,
        fileName: file.name,
        mimeType: file.type,
        width: fitted.width,
        height: fitted.height,
        texture,
      };
      this.remove(slot);
      this.assets.set(slot, asset);
      return asset;
    } finally {
      bitmap.close();
    }
  }

  get(slot: SurfaceTextureSlot): UploadedTextureAsset | undefined {
    return this.assets.get(slot);
  }

  remove(slot: SurfaceTextureSlot): boolean {
    const current = this.assets.get(slot);
    if (!current) return false;
    current.texture.dispose();
    this.assets.delete(slot);
    return true;
  }

  dispose(): void {
    this.assets.forEach((asset) => asset.texture.dispose());
    this.assets.clear();
  }
}
