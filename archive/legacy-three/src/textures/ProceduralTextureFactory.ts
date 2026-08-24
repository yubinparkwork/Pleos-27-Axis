import * as THREE from "three";

export type ProceduralTextureId =
  | "none" | "fine-grain" | "coarse-grain" | "brushed-linear" | "brushed-radial"
  | "paper-fiber" | "polymer-microtexture" | "frosted-noise" | "speckle"
  | "micro-dot" | "scanline" | "ordered-dither" | "topographic-line"
  | "grid" | "circuit-trace" | "directional-streak" | "woven-pattern";

export interface TextureBundle {
  normal?: THREE.CanvasTexture;
  roughness?: THREE.CanvasTexture;
  color?: THREE.CanvasTexture;
  dispose(): void;
}

function randomFactory(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function textureFromCanvas(canvas: HTMLCanvasElement, color = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function heightToNormal(source: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const targetContext = target.getContext("2d");
  if (!sourceContext || !targetContext) return target;
  const input = sourceContext.getImageData(0, 0, width, height);
  const output = targetContext.createImageData(width, height);
  const valueAt = (x: number, y: number): number => input.data[((y + height) % height * width + (x + width) % width) * 4] / 255;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (valueAt(x + 1, y) - valueAt(x - 1, y)) * strength;
      const dy = (valueAt(x, y + 1) - valueAt(x, y - 1)) * strength;
      const vector = new THREE.Vector3(-dx, -dy, 1).normalize();
      const offset = (y * width + x) * 4;
      output.data[offset] = (vector.x * 0.5 + 0.5) * 255;
      output.data[offset + 1] = (vector.y * 0.5 + 0.5) * 255;
      output.data[offset + 2] = vector.z * 255;
      output.data[offset + 3] = 255;
    }
  }
  targetContext.putImageData(output, 0, 0);
  return target;
}

function createHeightCanvas(id: ProceduralTextureId, seed: number, size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const random = randomFactory(seed);
  context.fillStyle = "rgb(128,128,128)";
  context.fillRect(0, 0, size, size);

  if (id === "none") return canvas;
  if (["fine-grain", "coarse-grain", "polymer-microtexture", "frosted-noise", "speckle"].includes(id)) {
    const image = context.createImageData(size, size);
    const scale = id === "coarse-grain" ? 34 : id === "speckle" ? 55 : id === "frosted-noise" ? 28 : 15;
    for (let index = 0; index < image.data.length; index += 4) {
      const value = Math.max(0, Math.min(255, 128 + (random() - 0.5) * scale));
      image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    if (id === "coarse-grain") {
      context.globalAlpha = 0.18;
      context.filter = "blur(2px)";
      context.drawImage(canvas, 0, 0);
      context.filter = "none";
    }
  } else if (id === "brushed-linear" || id === "directional-streak") {
    context.fillStyle = "#7f7f7f";
    context.fillRect(0, 0, size, size);
    const count = id === "brushed-linear" ? 1900 : 520;
    for (let index = 0; index < count; index += 1) {
      const y = random() * size;
      const value = 80 + random() * 100;
      context.strokeStyle = `rgba(${value},${value},${value},${0.08 + random() * 0.24})`;
      context.lineWidth = random() < 0.82 ? 0.5 : 1.5;
      context.beginPath();
      const start = random() * size;
      context.moveTo(start, y);
      context.lineTo(Math.min(size, start + size * (0.08 + random() * 0.58)), y + (random() - 0.5) * 1.2);
      context.stroke();
    }
  } else if (id === "brushed-radial") {
    context.translate(size / 2, size / 2);
    for (let index = 0; index < 1400; index += 1) {
      const angle = random() * Math.PI * 2;
      const length = size * (0.18 + random() * 0.55);
      context.strokeStyle = `rgba(255,255,255,${0.025 + random() * 0.1})`;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
      context.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
      context.stroke();
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
  } else if (id === "paper-fiber") {
    context.fillStyle = "#858585";
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < 1700; index += 1) {
      const x = random() * size;
      const y = random() * size;
      const angle = (random() - 0.5) * 0.7;
      const length = 3 + random() * 22;
      const value = random() > 0.5 ? 210 : 55;
      context.strokeStyle = `rgba(${value},${value},${value},${0.08 + random() * 0.2})`;
      context.lineWidth = 0.35 + random() * 1.2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  } else if (id === "micro-dot") {
    context.fillStyle = "#747474";
    context.fillRect(0, 0, size, size);
    for (let y = 8; y < size; y += 16) for (let x = 8; x < size; x += 16) {
      context.fillStyle = "#b0b0b0";
      context.beginPath();
      context.arc(x, y, 2.4, 0, Math.PI * 2);
      context.fill();
    }
  } else if (id === "scanline") {
    for (let y = 0; y < size; y += 5) {
      context.fillStyle = y % 10 === 0 ? "#9a9a9a" : "#6f6f6f";
      context.fillRect(0, y, size, 2);
    }
  } else if (id === "ordered-dither") {
    const matrix = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const value = 92 + matrix[y % 4][x % 4] * 5;
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x, y, 1, 1);
    }
  } else if (id === "topographic-line") {
    context.strokeStyle = "#a4a4a4";
    context.lineWidth = 1;
    for (let band = 0; band < 18; band += 1) {
      context.beginPath();
      for (let x = 0; x <= size; x += 4) {
        const y = band * 31 + Math.sin(x * 0.021 + band) * 12 + Math.sin(x * 0.006) * 23;
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
  } else if (id === "grid") {
    context.strokeStyle = "#9b9b9b";
    context.lineWidth = 1;
    for (let p = 0; p <= size; p += 32) {
      context.beginPath(); context.moveTo(p, 0); context.lineTo(p, size); context.stroke();
      context.beginPath(); context.moveTo(0, p); context.lineTo(size, p); context.stroke();
    }
  } else if (id === "circuit-trace") {
    context.strokeStyle = "#a7a7a7";
    context.lineWidth = 2;
    for (let index = 0; index < 28; index += 1) {
      const x = Math.round(random() * 16) * 32;
      const y = Math.round(random() * 16) * 32;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + (random() > 0.5 ? 1 : -1) * 96, y); context.lineTo(x + (random() > 0.5 ? 1 : -1) * 96, y + (random() > 0.5 ? 1 : -1) * 64); context.stroke();
    }
  } else if (id === "woven-pattern") {
    context.fillStyle = "#666";
    context.fillRect(0, 0, size, size);
    context.lineWidth = 3;
    for (let p = -size; p < size * 2; p += 12) {
      context.strokeStyle = "rgba(215,215,215,.25)";
      context.beginPath(); context.moveTo(p, 0); context.lineTo(p + size, size); context.stroke();
      context.strokeStyle = "rgba(28,28,28,.3)";
      context.beginPath(); context.moveTo(p + size, 0); context.lineTo(p, size); context.stroke();
    }
  }
  return canvas;
}

export function createProceduralTexture(id: ProceduralTextureId, seed: number, repeat = 4): TextureBundle {
  if (id === "none") return { dispose() {} };
  const height = createHeightCanvas(id, seed);
  const normalCanvas = heightToNormal(height, id === "brushed-linear" ? 7 : 4.2);
  const roughness = textureFromCanvas(height);
  const normal = textureFromCanvas(normalCanvas);
  normal.repeat.set(repeat, repeat);
  roughness.repeat.set(repeat, repeat);
  return {
    normal,
    roughness,
    dispose() { normal.dispose(); roughness.dispose(); },
  };
}
