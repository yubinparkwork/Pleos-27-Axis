import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import path from "node:path";

const root = process.cwd();
const beforePath = path.join(root, "artifacts", "baseline", "before-render-2800x2080.png");
const afterPath = path.join(root, "artifacts", "3d", "baseline-after-2800x2080.png");
const before = PNG.sync.read(await readFile(beforePath));
const after = PNG.sync.read(await readFile(afterPath));
if (before.width !== after.width || before.height !== after.height) throw new Error("Baseline dimensions differ");

const heat = new PNG({ width: before.width, height: before.height });
let sum = 0; let max = 0; let changed = 0;
for (let i = 0; i < before.data.length; i += 4) {
  const dr = Math.abs(before.data[i] - after.data[i]); const dg = Math.abs(before.data[i + 1] - after.data[i + 1]); const db = Math.abs(before.data[i + 2] - after.data[i + 2]);
  const d = (dr + dg + db) / 3; sum += d; max = Math.max(max, dr, dg, db); if (dr || dg || db) changed += 1;
  heat.data[i] = Math.min(255, d * 12); heat.data[i + 1] = Math.min(255, Math.max(0, d * 5 - 40)); heat.data[i + 2] = 0; heat.data[i + 3] = 255;
}
const pixels = before.width * before.height;
const report = { width: before.width, height: before.height, meanAbsoluteError255: sum / pixels, maxChannelError: max, changedPixels: changed, changedPercent: changed / pixels * 100 };
await writeFile(path.join(root, "artifacts", "3d", "baseline-difference.png"), PNG.sync.write(heat));
await writeFile(path.join(root, "artifacts", "3d", "baseline-comparison.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
