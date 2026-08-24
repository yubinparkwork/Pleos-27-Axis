import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const beforePath = path.join(projectRoot, "artifacts/baseline/before-render-2800x2080.png");
const afterPath = path.join(projectRoot, "artifacts/rebuild/pleos-27-axis-master-2800x2080.png");
const heatmapPath = path.join(projectRoot, "artifacts/rebuild/legacy-rebuild-difference.png");
const reportPath = path.join(projectRoot, "artifacts/rebuild/legacy-rebuild-comparison.json");

const before = PNG.sync.read(fs.readFileSync(beforePath));
const after = PNG.sync.read(fs.readFileSync(afterPath));
if (before.width !== after.width || before.height !== after.height) {
  throw new Error(`Dimension mismatch: ${before.width}×${before.height} vs ${after.width}×${after.height}`);
}

const heatmap = new PNG({ width: before.width, height: before.height });
let rgbAbsoluteTotal = 0;
let luminanceAbsoluteTotal = 0;
let changedPixels = 0;
const pixels = before.width * before.height;

for (let offset = 0; offset < before.data.length; offset += 4) {
  const redDifference = Math.abs(before.data[offset] - after.data[offset]);
  const greenDifference = Math.abs(before.data[offset + 1] - after.data[offset + 1]);
  const blueDifference = Math.abs(before.data[offset + 2] - after.data[offset + 2]);
  const beforeLuminance = before.data[offset] * 0.2126 + before.data[offset + 1] * 0.7152 + before.data[offset + 2] * 0.0722;
  const afterLuminance = after.data[offset] * 0.2126 + after.data[offset + 1] * 0.7152 + after.data[offset + 2] * 0.0722;
  const luminanceDifference = Math.abs(beforeLuminance - afterLuminance);
  rgbAbsoluteTotal += redDifference + greenDifference + blueDifference;
  luminanceAbsoluteTotal += luminanceDifference;
  if (luminanceDifference > 5) changedPixels += 1;
  const energy = Math.min(255, Math.round(luminanceDifference * 2.2));
  heatmap.data[offset] = energy;
  heatmap.data[offset + 1] = Math.round(energy * 0.12);
  heatmap.data[offset + 2] = Math.round(energy * 0.04);
  heatmap.data[offset + 3] = 255;
}

fs.writeFileSync(heatmapPath, PNG.sync.write(heatmap));
const report = {
  status: "informational-only",
  reason: "The user requested a rule-led rebuild, so the legacy visual is archived rather than used as a pixel target.",
  before: beforePath,
  after: afterPath,
  width: before.width,
  height: before.height,
  meanAbsoluteRgbError: rgbAbsoluteTotal / (pixels * 3),
  meanAbsoluteLuminanceError: luminanceAbsoluteTotal / pixels,
  changedPixelsAbove5: changedPixels,
  changedPixelRatioAbove5: changedPixels / pixels,
  heatmap: heatmapPath,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
