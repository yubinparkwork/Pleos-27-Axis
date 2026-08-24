import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const artifacts = path.join(root, "artifacts", "rebuild");
const files = {
  png: path.join(artifacts, "pleos-27-axis-master-2800x2080.png"),
  exr: path.join(artifacts, "pleos-27-axis-master-2800x2080.exr"),
  zip: path.join(artifacts, "pleos-27-axis-preview-60frames.zip"),
  runtime: path.join(artifacts, "export-runtime-report.json"),
};

function cString(buffer, offset) {
  const end = buffer.indexOf(0, offset);
  assert.notEqual(end, -1, "unterminated EXR header string");
  return { value: buffer.toString("ascii", offset, end), next: end + 1 };
}

function parseExrHeader(buffer) {
  assert.equal(buffer.readUInt32LE(0), 20000630, "invalid OpenEXR magic number");
  let offset = 8;
  const attributes = new Map();
  while (buffer[offset] !== 0) {
    const name = cString(buffer, offset); offset = name.next;
    const type = cString(buffer, offset); offset = type.next;
    const size = buffer.readUInt32LE(offset); offset += 4;
    attributes.set(name.value, { type: type.value, data: buffer.subarray(offset, offset + size) });
    offset += size;
  }
  const dataWindow = attributes.get("dataWindow");
  assert.ok(dataWindow, "EXR dataWindow missing");
  assert.equal(dataWindow.type, "box2i");
  const minX = dataWindow.data.readInt32LE(0);
  const minY = dataWindow.data.readInt32LE(4);
  const maxX = dataWindow.data.readInt32LE(8);
  const maxY = dataWindow.data.readInt32LE(12);
  const channels = attributes.get("channels");
  assert.ok(channels, "EXR channels missing");
  let channelOffset = 0;
  const channelTypes = {};
  while (channels.data[channelOffset] !== 0) {
    const channelName = cString(channels.data, channelOffset); channelOffset = channelName.next;
    channelTypes[channelName.value] = channels.data.readInt32LE(channelOffset);
    channelOffset += 16;
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1, channelTypes };
}

function summarizePng(buffer, expectedWidth, expectedHeight) {
  const png = PNG.sync.read(buffer);
  assert.equal(png.width, expectedWidth);
  assert.equal(png.height, expectedHeight);
  let min = 255;
  let max = 0;
  let opaque = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const value = Math.round((png.data[index] + png.data[index + 1] + png.data[index + 2]) / 3);
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (png.data[index + 3] === 255) opaque += 1;
  }
  assert.ok(max - min >= 12, `PNG lacks rendered contrast: ${min}–${max}`);
  assert.equal(opaque, png.width * png.height, "opaque master contains transparent pixels");
  return { width: png.width, height: png.height, luminanceRange: [min, max], opaquePixels: opaque };
}

function makeContactSheet(entries, names) {
  const sourceWidth = 960;
  const sourceHeight = 540;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const columns = 3;
  const rows = 2;
  const sheet = new PNG({ width: thumbWidth * columns, height: thumbHeight * rows });
  names.forEach((name, tile) => {
    const source = PNG.sync.read(Buffer.from(entries[name]));
    const offsetX = (tile % columns) * thumbWidth;
    const offsetY = Math.floor(tile / columns) * thumbHeight;
    for (let y = 0; y < thumbHeight; y += 1) {
      const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / thumbHeight));
      for (let x = 0; x < thumbWidth; x += 1) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / thumbWidth));
        const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
        const targetOffset = ((offsetY + y) * sheet.width + offsetX + x) * 4;
        source.data.copy(sheet.data, targetOffset, sourceOffset, sourceOffset + 4);
      }
    }
  });
  return PNG.sync.write(sheet);
}

const pngBuffer = await readFile(files.png);
const png = summarizePng(pngBuffer, 2800, 2080);

const exrBuffer = await readFile(files.exr);
const exr = parseExrHeader(exrBuffer);
assert.deepEqual({ width: exr.width, height: exr.height }, { width: 2800, height: 2080 });
assert.deepEqual(Object.keys(exr.channelTypes).sort(), ["A", "B", "G", "R"]);
assert.ok(Object.values(exr.channelTypes).every((type) => type === 1), "EXR channels are not half-float");

const zipBuffer = await readFile(files.zip);
const entries = unzipSync(zipBuffer);
const names = Object.keys(entries).sort();
assert.equal(names.length, 60, "sequence does not contain 60 frames");
assert.equal(names[0], "pleos-axis-0000.png");
assert.equal(names[59], "pleos-axis-0059.png");
const firstFrame = summarizePng(Buffer.from(entries[names[0]]), 960, 540);
const lastFrame = summarizePng(Buffer.from(entries[names[59]]), 960, 540);
assert.notDeepEqual(entries[names[0]], entries[names[59]], "first and last sequence frames are identical");
const contactSheetPath = path.join(artifacts, "export-sequence-contact-sheet.png");
await writeFile(contactSheetPath, makeContactSheet(entries, [names[0], names[12], names[24], names[36], names[48], names[59]]));

const runtime = JSON.parse(await readFile(files.runtime, "utf8"));
assert.equal(runtime.status, "complete");
assert.equal(runtime.sequence.frames, 60);
assert.equal(runtime.sequence.frameRate, 30);
assert.equal(runtime.sequence.firstTime, 0);
assert.ok(Math.abs(runtime.sequence.lastTime - 59 / 30) < 1e-12);
assert.equal(runtime.sequence.restoredTime, runtime.sequence.expectedRestoredTime);

const report = {
  status: "pass",
  generatedAt: new Date().toISOString(),
  png: { ...png, bytes: pngBuffer.length, path: files.png },
  exr: { ...exr, bytes: exrBuffer.length, path: files.exr },
  sequence: { frames: names.length, frameRate: 30, firstFrame, lastFrame, bytes: zipBuffer.length, path: files.zip, contactSheetPath },
  runtime: { renderer: runtime.renderer, restoredTime: runtime.sequence.restoredTime, sampledRange: [runtime.sequence.firstTime, runtime.sequence.lastTime] },
};
await writeFile(path.join(artifacts, "export-verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
