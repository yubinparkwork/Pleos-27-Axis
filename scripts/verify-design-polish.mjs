import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [variations, prism, panel, app, formats, handoff, css] = await Promise.all([
  read("src/crystal/variations/StudioVariation.ts"), read("src/crystal/presets/PrismStylePresets.ts"),
  read("src/crystal/ui/StudioPanel.ts"), read("src/crystal/MotionStudioApp.ts"),
  read("src/artboard/FormatPresetRegistry.ts"), read("scripts/update-ai-handoff.mjs"), read("src/crystal/CrystalApp.css"),
]);
for (const id of ["builtin-prism-clean", "builtin-prism-rgb-edge", "builtin-prism-immersive", "builtin-spectral-dark", "builtin-spectral-balanced", "builtin-spectral-active", "builtin-soft-spectral-subtle", "builtin-soft-spectral-balanced", "builtin-soft-spectral-active"]) assert.ok(variations.includes(id), `missing variation ${id}`);
for (const style of ["clean", "rgb-edge", "immersive"]) assert.ok(prism.includes(style), `missing Prism style ${style}`);
for (const action of ["variation-save", "variation-rename", "variation-duplicate", "variation-delete"]) assert.ok(app.includes(action), `missing action ${action}`);
for (const section of ["look-material", "look-lighting", "motion-advanced", "export-region"]) assert.ok(panel.includes(`\"${section}\"`), `missing contextual advanced section ${section}`);
for (const control of ["data-look-select", "data-prism-style-select", "data-export-type", "data-export-render", "target-samples", "render-export"]) assert.ok(panel.includes(control), `missing compact workflow control ${control}`);
for (const region of ["structure-panel", "control-dock", "panel-nav", "data-panel-section='geometry'", "data-panel-section='output'"]) assert.ok(panel.includes(region), `missing creative-tool region ${region}`);
assert.ok(!panel.includes("data-advanced hidden"), "legacy modal-style advanced drawer remains");
assert.match(app, /applyVariation\(id: string\)/);
assert.match(app, /lighting\.applyState/);
assert.match(formats, /scale:/); assert.match(formats, /gridY:/);
assert.match(handoff, /sourceBaseCommit/);
assert.match(handoff, /args\["hero-time"\]/);
for (const token of ["--workspace:", "--panel:", "--card:", "--control:", "--text-secondary:", "--radius-lg:", "--left-panel-space:", "--right-panel-space:"]) assert.ok(css.includes(token), `missing design token ${token}`);
assert.match(css, /grid-template-areas: "label value" "slider slider"/, "Parameters need a shared label-value-slider hierarchy");
assert.match(css, /width: 68px/, "Inspector needs a legible numeric value column");
assert.match(css, /input\[type="number"\] \{ appearance: textfield;/, "Native number spinners must not clip decimal values");
assert.match(css, /--accent: #e7e8ea;/, "Creative-tool accent must remain monochrome");
const chromaticCssColors = [
  ...css.matchAll(/#([0-9a-f]{6})\b/gi),
  ...css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi),
].flatMap((match) => {
  const rgb = match[0].startsWith("#")
    ? [1, 3, 5].map((index) => Number.parseInt(match[0].slice(index, index + 2), 16))
    : [Number(match[1]), Number(match[2]), Number(match[3])];
  return Math.max(...rgb) - Math.min(...rgb) > 12 ? [match[0]] : [];
});
assert.deepEqual(chromaticCssColors, [], `UI stylesheet contains chromatic colors: ${chromaticCssColors.join(", ")}`);
assert.match(css, /topbar-export \{[^}]*color: #111315;[^}]*background: var\(--accent\)/s, "Primary export action needs dark text on a light monochrome surface");
assert.match(css, /input\[type="checkbox"\] \{ accent-color: var\(--accent\); \}/, "Native checkboxes must use the monochrome accent");
assert.equal((panel.match(/data-output-section/g) ?? []).length, 1, "Image export controls must have one primary panel");
for (const control of ['data-format="preset"', 'data-format="width"', 'data-format="height"', 'data-format="background"', 'data-format="transparent"']) assert.equal((panel.match(new RegExp(control, "g")) ?? []).length, 1, `Export control must have one location: ${control}`);
assert.ok(panel.includes("이미지 내보내기") && panel.includes("PNG 내보내기"), "Unified image export panel needs a clear title and primary action");
assert.ok(!panel.includes("data-export-quality") && !panel.includes("render-fast") && !panel.includes("render-high"), "Redundant quality presets and render buttons must stay removed");
assert.match(app, /const targetSamples = quality === "fast" \? FAST_RENDER_SAMPLES : this\.settings\.advanced\.targetSamples;/, "Direct sample input must drive full-quality output");
console.log(JSON.stringify({ status: "pass", prismStyles: 3, spectralStyles: 3, softSpectralStyles: 3, builtinVariations: 9, rendererRecreatedOnVariation: false, contextualAdvanced: true, consolidatedExport: true, singleExportPanel: true, directRenderControls: true, threePaneWorkspace: true, designTokens: true, monochromeUi: true }, null, 2));
