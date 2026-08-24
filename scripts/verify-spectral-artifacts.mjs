import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "artifacts", "spectral-caustic");
const files = [
  "soft-spectral-caustic-2048.png",
  "pleos-blue-spectral-2048.png",
  "full-spectrum-experimental-2048.png",
  "dark-violet-caustic-2048.png",
];

function summarize(buffer, size) {
  const png = PNG.sync.read(buffer);
  assert.equal(png.width, size);
  assert.equal(png.height, size);
  let min = 255; let max = 0; let alpha = 0; let chromaSum = 0; let clipped = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index]; const g = png.data[index + 1]; const b = png.data[index + 2];
    const value = Math.round((r + g + b) / 3);
    min = Math.min(min, value); max = Math.max(max, value);
    chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
    if (Math.max(r, g, b) >= 254) clipped += 1;
    if (png.data[index + 3] === 255) alpha += 1;
  }
  assert.equal(alpha, size * size);
  assert.ok(max - min > 80, `insufficient tonal range ${min}–${max}`);
  assert.ok(chromaSum / (size * size) > 12, "spectral chroma is too low");
  return { width: size, height: size, luminanceRange: [min, max], meanChroma: chromaSum / (size * size), clippedRatio: clipped / (size * size) };
}

function copyThumbnail(source, target, tile, tileSize) {
  const offsetX = tile * tileSize;
  for (let y = 0; y < tileSize; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / tileSize));
    for (let x = 0; x < tileSize; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / tileSize));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * target.width + offsetX + x) * 4;
      source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
}

const summaries = {};
const contact = new PNG({ width: 2048, height: 512 });
for (let index = 0; index < files.length; index += 1) {
  const buffer = await readFile(path.join(directory, files[index]));
  summaries[files[index]] = { ...summarize(buffer, 2048), bytes: buffer.length };
  copyThumbnail(PNG.sync.read(buffer), contact, index, 512);
}
const finalBuffer = await readFile(path.join(directory, "soft-spectral-caustic-4096.png"));
summaries["soft-spectral-caustic-4096.png"] = { ...summarize(finalBuffer, 4096), bytes: finalBuffer.length };
await writeFile(path.join(directory, "spectral-presets-contact-sheet.png"), PNG.sync.write(contact));
const report = { status: "pass", generatedAt: new Date().toISOString(), images: summaries, contactSheet: path.join(directory, "spectral-presets-contact-sheet.png") };
await writeFile(path.join(directory, "spectral-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
