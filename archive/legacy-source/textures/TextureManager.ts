import * as THREE from "three";
import type { TextureSettings } from "../state/threeDStudioState";
import type { FaceId, TextureSlot } from "./types";
import { ProceduralTextureFactory } from "./ProceduralTextureFactory";

const COLOR_SLOTS = new Set<TextureSlot>(["baseColor", "emissive"]);

export class TextureManager {
  private readonly factory = new ProceduralTextureFactory();
  private procedural: THREE.Texture | null = null;
  private proceduralKey = "";
  private readonly uploads = new Map<TextureSlot, THREE.Texture>();
  private lastTime = 0;

  update(settings: TextureSettings): void {
    const key = JSON.stringify([settings.procedural, settings.seed, settings.intensity, settings.contrast, settings.brightness, settings.inversion]);
    if (key !== this.proceduralKey) {
      this.procedural?.dispose(); this.procedural = this.factory.create(settings.procedural, settings); this.proceduralKey = key;
    }
    if (this.procedural) this.transform(this.procedural, settings);
    this.uploads.forEach((texture) => this.transform(texture, settings));
  }

  async upload(file: File, slot: TextureSlot, settings: TextureSettings): Promise<void> {
    this.remove(slot);
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("Texture canvas unavailable");
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const image = context.getImageData(0, 0, canvas.width, canvas.height); const channelIndex = { r: 0, g: 1, b: 2, a: 3, rgb: -1 }[settings.channel];
    for (let i = 0; i < image.data.length; i += 4) {
      if (channelIndex >= 0) image.data[i] = image.data[i + 1] = image.data[i + 2] = image.data[i + channelIndex];
      for (let channel = 0; channel < 3; channel += 1) {
        const weighted = 128 + (image.data[i + channel] - 128) * settings.intensity;
        const inverted = settings.inversion ? 255 - weighted : weighted;
        image.data[i + channel] = Math.max(0, Math.min(255, (inverted - 128) * settings.contrast + 128 + settings.brightness * 255));
      }
    }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = COLOR_SLOTS.has(slot) ? THREE.SRGBColorSpace : THREE.NoColorSpace; this.transform(texture, settings); this.uploads.set(slot, texture);
  }

  remove(slot: TextureSlot): void { this.uploads.get(slot)?.dispose(); this.uploads.delete(slot); }
  hasUpload(slot: TextureSlot): boolean { return this.uploads.has(slot); }

  textureFor(slot: TextureSlot, face: FaceId, settings: TextureSettings): THREE.Texture | null {
    if (!settings.enabled || (settings.target !== "all-faces" && settings.target !== face)) return null;
    const uploaded = this.uploads.get(slot); if (uploaded) return uploaded;
    return settings.slot === slot ? this.procedural : null;
  }

  animate(time: number, settings: TextureSettings): boolean {
    if (!settings.animated || !settings.enabled) return false;
    const delta = Math.max(0, time - this.lastTime); this.lastTime = time;
    const update = (texture: THREE.Texture): void => { texture.offset.x = (texture.offset.x + delta * settings.animationSpeed * .04) % 1; texture.needsUpdate = true; };
    if (this.procedural) update(this.procedural); this.uploads.forEach(update); return true;
  }

  dispose(): void { this.procedural?.dispose(); this.uploads.forEach((texture) => texture.dispose()); this.uploads.clear(); }

  private transform(texture: THREE.Texture, settings: TextureSettings): void {
    const wrap = settings.wrap === "repeat" ? THREE.RepeatWrapping : settings.wrap === "mirror" ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapS = texture.wrapT = wrap; texture.repeat.set(settings.scale * settings.scaleX, settings.scale * settings.scaleY);
    texture.center.set(.5, .5); texture.rotation = THREE.MathUtils.degToRad(settings.rotation); texture.offset.set(settings.offsetX, settings.offsetY); texture.needsUpdate = true;
  }
}
