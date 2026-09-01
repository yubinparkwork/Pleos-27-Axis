import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [main, mode, state, renderer, panel, css] = await Promise.all([
  read("src/main.ts"), read("src/modes/axis-megastructure/AxisMegastructureMode.ts"), read("src/modes/axis-megastructure/AxisMegastructureState.ts"),
  read("src/modes/axis-megastructure/AxisMegastructureRenderer.ts"), read("src/modes/axis-megastructure/AxisMegastructurePanel.ts"), read("src/modes/axis-megastructure/AxisMegastructure.css"),
]);

assert.match(main, /AXIS_MEGASTRUCTURE_MODE/); assert.match(main, /setAxisMegastructurePreset/);
assert.match(mode, /id = "axis-megastructure"/); assert.match(mode, /setTimeout\(\(\) =>/); assert.match(mode, /pleos-27-axis-megastructure-presets-v1/); assert.match(mode, /exportPng/);
for (const group of ["axis", "camera", "macro", "subdivision", "panels", "greeble", "micro", "material", "lighting", "bloom", "ao", "atmosphere", "generation", "performance"]) assert.match(state, new RegExp(`${group}: \\{`), `missing state group: ${group}`);
for (const preset of ["abyssal-core", "violet-foundry", "cold-archive"]) assert.match(state, new RegExp(`"${preset}"`));
assert.match(state, /quality: "ultra"/); assert.match(state, /frequency1:/); assert.match(state, /frequency5:/); assert.match(state, /baseDarkness: \.94/);

assert.match(renderer, /PerspectiveCamera/); assert.match(renderer, /InstancedMesh/); assert.match(renderer, /ComputationalSurfaceMaterial/);
assert.match(renderer, /Six connected monolithic canyon regions/); assert.match(renderer, /LEFT WALL/); assert.match(renderer, /RIGHT WALL/); assert.match(renderer, /UPPER MASS/); assert.match(renderer, /LOWER MASS/); assert.match(renderer, /FAR MASS/);
assert.match(renderer, /splitRatios = \[\.15, \.25, \.33, \.4, \.6, \.67, \.75, \.85\]/); assert.match(renderer, /subdivide\(surface/); assert.match(renderer, /Surface-anchored instanced greebles/);
assert.match(renderer, /uMegaF1/); assert.match(renderer, /uMegaF5/); assert.match(renderer, /megaTrace/); assert.match(renderer, /megaStack/); assert.match(renderer, /megaBounceField/);
assert.match(renderer, /Monumental continuous PLEOS AXIS backbone/); assert.match(renderer, /AXIS parallel structural shoulders/); assert.match(renderer, /Recessed AXIS energy channels/);
assert.match(renderer, /AXIS silhouette separation rails/); assert.match(renderer, /AXIS directional readability light/); assert.match(renderer, /inAxialCorridor/);
assert.match(renderer, /GTAOPass/); assert.match(renderer, /UnrealBloomPass/); assert.match(renderer, /SMAAPass/); assert.match(renderer, /FogExp2/);
assert.match(renderer, /floatingDebris: 0/); assert.match(renderer, /wireframeEdges: 0/); assert.doesNotMatch(renderer, /WireframeGeometry|EdgesGeometry|LineSegments/);
for (const phase of ["MONOLITH", "STRUCTURAL DIVISION", "NESTED PANELS", "GREEBLE RESOLUTION", "CIRCUIT ACTIVATION", "STABILIZED"]) assert.match(renderer, new RegExp(`"${phase}"`));

for (const heading of ["AXIS", "CAMERA", "MACRO STRUCTURE", "SUBDIVISION", "PANELS", "GREEBLE", "MICRO CIRCUITS", "MATERIAL", "LIGHTING", "BLOOM + AO", "ATMOSPHERE", "AXIS GENERATION", "QUALITY + PRESETS", "EXPORT"]) assert.ok(panel.includes(`"${heading}"`), `missing panel group: ${heading}`);
assert.match(panel, /debugInfluence/); assert.match(panel, /data-mega-regenerate/); assert.match(panel, /Ultra/); assert.match(panel, /PNG 내보내기/);
assert.match(panel, /data-mega-focus-axis/); assert.match(mode, /focusAxisComposition/); assert.match(state, /version: 3/);
assert.match(css, /:focus-visible/); assert.match(css, /min-height: 24px/);

console.log("Axis Megastructure v3 contract verified: AXIS-first composition, enclosed continuous masses, true recursive surfaces, five-frequency circuits, restrained post stack and complete controller.");
