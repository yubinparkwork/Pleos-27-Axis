import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const requiredFiles = [
  "src/axis/AxisGraph.ts",
  "src/axis/presets.ts",
  "src/axis/validation.ts",
  "src/brand/colors.ts",
  "src/brand/toneOnTone.ts",
  "src/brand/compliance.ts",
  "src/geometry/FoldSurfaceBuilder.ts",
  "src/materials/MaterialRegistry.ts",
  "src/renderer/PleosRenderer.ts",
  "src/state/studioState.ts",
  "src/textures/TextureUploader.ts",
  "src/ui/AppShell.ts",
  "docs/source-audit.md",
  "docs/implementation-assumptions.md",
];

const contents = Object.fromEntries(await Promise.all(requiredFiles.map(async (relativePath) => {
  const content = await readFile(path.join(root, relativePath), "utf8");
  return [relativePath, content];
})));

const compact = (value) => value.replace(/\s+/g, "");
const presetSource = compact(contents["src/axis/presets.ts"]);
const approvedRays = {
  "30-basic": [-90, -30, 30, 90, 210],
  "30-v1": [-90, -30, 30, 90, 150, 210],
  "30-v2": [-30, 30, 90, 210],
  "30-v3": [-30, 30, 90],
  "45-basic": [-135, -45, 0, 45, 135, 180],
  "45-v1": [-135, -90, -45, 45, 90, 135, 180],
  "45-v2": [-135, 45, 180],
  "45-v3": [-135, -90, 0, 45, 90],
};

for (const [id, rays] of Object.entries(approvedRays)) {
  assert.ok(
    presetSource.includes(`[${rays.join(",")}]`),
    `${id} approved ray list is missing or changed`,
  );
}

const definitionIds = [
  "axis-30-basic",
  "axis-30-variation-1",
  "axis-30-variation-2",
  "axis-30-variation-3",
  "axis-45-basic",
  "axis-45-variation-1",
  "axis-45-variation-2",
  "axis-45-variation-3",
];
for (const id of definitionIds) {
  assert.ok(contents["src/axis/presets.ts"].includes(`"${id}"`), `Missing definition ${id}`);
}

const requiredColors = [
  "#000000", "#FFFFFF", "#262626", "#4D4D4D", "#999999", "#F2F2F2", "#E5E5E5", "#CCCCCC",
  "#FFCDD7", "#FA293C", "#55110E", "#B4FFD2", "#0ADC91", "#053C32", "#CDDCFF", "#4664FF", "#2350FF", "#0F235A",
];
for (const color of requiredColors) {
  assert.ok(contents["src/brand/colors.ts"].includes(color), `Missing Pleos color token ${color}`);
}

const stateSource = contents["src/state/studioState.ts"];
assert.match(stateSource, /anchor:\s*\{\s*gridX:\s*10,\s*gridY:\s*10\s*\}/, "Default anchor must be the 20x20 grid center");
assert.match(stateSource, /width:\s*2800,\s*height:\s*2080/, "Default master must be 2800x2080");
assert.match(contents["src/axis/AxisGraph.ts"], /outputWidth\s*\/\s*1920/, "Display line-width scaling rule is missing");
assert.match(contents["src/renderer/PleosRenderer.ts"], /NoToneMapping/, "Baseline renderer must not add tone mapping");
assert.match(contents["src/renderer/PleosRenderer.ts"], /SRGBColorSpace/, "Presentation color space must be sRGB");

const productionFiles = await listFiles([path.join(root, "src"), path.join(root, "public")]);
const productionPdfFiles = productionFiles.filter((file) => file.toLowerCase().endsWith(".pdf"));
assert.deepEqual(productionPdfFiles, [], "PDF references must not be shipped from src/ or public/");

for (const file of productionFiles.filter((file) => /\.(?:ts|tsx|js|mjs|css|html|glsl)$/i.test(file))) {
  const source = await readFile(file, "utf8");
  assert.ok(!/Pleos 2[57] Design (?:Guidelines|Kickoff)\.pdf/i.test(source), `${path.relative(root, file)} imports or embeds a source PDF`);
  assert.ok(!/public\/reference|\/reference\/pleos-3d-new-axis/i.test(source), `${path.relative(root, file)} depends on the retired reference image`);
}

const legacyScripts = (await readdir(path.join(root, "archive", "legacy-scripts"))).filter((name) => name.endsWith(".mjs"));
assert.ok(legacyScripts.length >= 5, "Expected the previous automation scripts to remain archived");

const report = {
  status: "pass",
  requiredFiles: requiredFiles.length,
  approvedAxisDefinitions: definitionIds.length,
  approvedRaySets: Object.keys(approvedRays).length,
  brandColorTokens: requiredColors.length,
  productionPdfFiles: productionPdfFiles.length,
  archivedLegacyScripts: legacyScripts.sort(),
};

const outputDirectory = path.join(root, "artifacts", "verification");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "axis-core.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

async function listFiles(roots) {
  const output = [];
  for (const directory of roots) {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) output.push(...await listFiles([target]));
        else if (entry.isFile()) output.push(target);
      }
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return output;
}
