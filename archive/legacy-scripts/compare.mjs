import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const root = resolve(import.meta.dirname, "..");
const referencePath = resolve(root, "public/reference/pleos-3d-new-axis.png");
const renderPath = resolve(process.argv[2] ?? resolve(root, "artifacts/new-axis-2800x2080.png"));
const heatmapPath = resolve(root, "artifacts/new-axis-difference-heatmap.png");
const reportPath = resolve(root, "artifacts/comparison.json");
const width = 2800;
const height = 2080;
const textMask = { x1: 780, y1: 920, x2: 2020, y2: 1110 };

const [reference, render] = await Promise.all([
  readFile(referencePath).then((data) => PNG.sync.read(data)),
  readFile(renderPath).then((data) => PNG.sync.read(data)),
]);

if (render.width !== width || render.height !== height) {
  throw new Error(`Render must be ${width}x${height}; received ${render.width}x${render.height}`);
}

const geometry = {
  origin: [1398.432, 1040.4368],
  top: [1408.064, 0],
  mainLeft: [0, 1730.768],
  mainRight: [2800, 348.5456],
  rightDown: [2800, 1750.9232],
  softDown: [984.76, 2080],
};

const rays = [
  [geometry.top[0] - geometry.origin[0], geometry.top[1] - geometry.origin[1]],
  [geometry.mainRight[0] - geometry.origin[0], geometry.mainRight[1] - geometry.origin[1]],
  [geometry.rightDown[0] - geometry.origin[0], geometry.rightDown[1] - geometry.origin[1]],
  [geometry.softDown[0] - geometry.origin[0], geometry.softDown[1] - geometry.origin[1]],
  [geometry.mainLeft[0] - geometry.origin[0], geometry.mainLeft[1] - geometry.origin[1]],
];

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const planeId = (x, y) => {
  const q = [x - geometry.origin[0], y - geometry.origin[1]];
  for (let index = 0; index < 4; index += 1) {
    if (cross(rays[index], q) >= 0 && cross(q, rays[index + 1]) >= 0) return index;
  }
  return 4;
};

const sampleReference = (x, y) => {
  const sx = Math.max(0, Math.min(reference.width - 1, (x + 0.5) * reference.width / width - 0.5));
  const sy = Math.max(0, Math.min(reference.height - 1, (y + 0.5) * reference.height / height - 0.5));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(reference.width - 1, x0 + 1);
  const y1 = Math.min(reference.height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const grayAt = (px, py) => {
    const index = (py * reference.width + px) * 4;
    return reference.data[index] * 0.2126
      + reference.data[index + 1] * 0.7152
      + reference.data[index + 2] * 0.0722;
  };
  const top = grayAt(x0, y0) * (1 - tx) + grayAt(x1, y0) * tx;
  const bottom = grayAt(x0, y1) * (1 - tx) + grayAt(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
};

const heatmap = new PNG({ width, height });
const histogram = new Array(256).fill(0);
const planeSums = new Array(5).fill(0);
const planeSignedSums = new Array(5).fill(0);
const planeReferenceSums = new Array(5).fill(0);
const planeRenderSums = new Array(5).fill(0);
const planeCounts = new Array(5).fill(0);
let total = 0;
let validPixels = 0;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const masked = x >= textMask.x1 && x < textMask.x2 && y >= textMask.y1 && y < textMask.y2;
    const referenceGray = sampleReference(x, y);
    const renderGray = render.data[index] * 0.2126
      + render.data[index + 1] * 0.7152
      + render.data[index + 2] * 0.0722;
    const difference = masked ? 0 : Math.abs(referenceGray - renderGray);
    const rounded = Math.min(255, Math.round(difference));
    const boosted = Math.min(255, rounded * 5);
    heatmap.data[index] = boosted;
    heatmap.data[index + 1] = Math.min(255, Math.max(0, boosted - 128));
    heatmap.data[index + 2] = 0;
    heatmap.data[index + 3] = 255;

    if (!masked) {
      const id = planeId(x, y);
      histogram[rounded] += 1;
      total += difference;
      validPixels += 1;
      planeSums[id] += difference;
      planeSignedSums[id] += renderGray - referenceGray;
      planeReferenceSums[id] += referenceGray;
      planeRenderSums[id] += renderGray;
      planeCounts[id] += 1;
    }
  }
}

let running = 0;
let p95 = 0;
let maximum = 0;
for (let value = 0; value < histogram.length; value += 1) {
  if (histogram[value] > 0) maximum = value;
  running += histogram[value];
  if (p95 === 0 && running >= validPixels * 0.95) p95 = value;
}

const planeNames = ["topRight", "rightMiddle", "bottomRight", "bottomLeft", "leftPlane"];
const planeMae = Object.fromEntries(planeNames.map((name, index) => [
  name,
  Number((planeSums[index] / Math.max(planeCounts[index], 1)).toFixed(4)),
]));
const planeSignedError = Object.fromEntries(planeNames.map((name, index) => [
  name,
  Number((planeSignedSums[index] / Math.max(planeCounts[index], 1)).toFixed(4)),
]));
const planeMeans = Object.fromEntries(planeNames.map((name, index) => [
  name,
  {
    reference: Number((planeReferenceSums[index] / Math.max(planeCounts[index], 1)).toFixed(4)),
    render: Number((planeRenderSums[index] / Math.max(planeCounts[index], 1)).toFixed(4)),
  },
]));

const report = {
  reference: referencePath,
  render: renderPath,
  reference_source_size: [reference.width, reference.height],
  comparison_size: [width, height],
  text_exclusion_mask: textMask,
  valid_pixels: validPixels,
  mae_luminance_255: Number((total / validPixels).toFixed(4)),
  p95_luminance_error_255: p95,
  max_luminance_error_255: maximum,
  plane_mae: planeMae,
  plane_signed_error_render_minus_reference: planeSignedError,
  plane_mean_luminance: planeMeans,
  heatmap: heatmapPath,
};

await Promise.all([
  writeFile(heatmapPath, PNG.sync.write(heatmap)),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
]);
console.log(JSON.stringify(report, null, 2));
