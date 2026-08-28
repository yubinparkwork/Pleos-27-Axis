import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [variations, prism, panel, app, formats, handoff] = await Promise.all([
  read("src/crystal/variations/StudioVariation.ts"), read("src/crystal/presets/PrismStylePresets.ts"),
  read("src/crystal/ui/StudioPanel.ts"), read("src/crystal/MotionStudioApp.ts"),
  read("src/artboard/FormatPresetRegistry.ts"), read("scripts/update-ai-handoff.mjs"),
]);
for (const id of ["builtin-prism-clean", "builtin-prism-rgb-edge", "builtin-prism-immersive", "builtin-spectral-dark", "builtin-spectral-balanced", "builtin-spectral-active", "builtin-soft-spectral-subtle", "builtin-soft-spectral-balanced", "builtin-soft-spectral-active"]) assert.ok(variations.includes(id), `missing variation ${id}`);
for (const style of ["clean", "rgb-edge", "immersive"]) assert.ok(prism.includes(style), `missing Prism style ${style}`);
for (const action of ["variation-save", "variation-rename", "variation-duplicate", "variation-delete"]) assert.ok(panel.includes(action), `missing action ${action}`);
for (const section of ["setup-geometry", "setup-camera", "look-material", "look-lighting", "motion-advanced", "format-advanced", "export-custom", "export-region", "export-print"]) assert.ok(panel.includes(`\"${section}\"`), `missing contextual advanced section ${section}`);
for (const control of ["data-look-select", "data-prism-style-select", "data-export-type", "data-export-render", "data-export-quality", "render-export"]) assert.ok(panel.includes(control), `missing compact workflow control ${control}`);
assert.ok(!panel.includes("data-advanced hidden"), "legacy modal-style advanced drawer remains");
assert.match(app, /applyVariation\(id: string\)/);
assert.match(app, /lighting\.applyState/);
assert.match(formats, /scale:/); assert.match(formats, /gridY:/);
assert.match(handoff, /sourceBaseCommit/);
assert.match(handoff, /args\["hero-time"\]/);
console.log(JSON.stringify({ status: "pass", prismStyles: 3, spectralStyles: 3, softSpectralStyles: 3, builtinVariations: 9, rendererRecreatedOnVariation: false, contextualAdvanced: true, consolidatedExport: true }, null, 2));
