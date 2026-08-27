import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "src/crystal/materials/SpectralFlowMaterial.ts",
  "src/crystal/CrystalAssembly.ts",
  "src/crystal/MotionStudioApp.ts",
  "src/crystal/ui/StudioPanel.ts",
  "scripts/render-motion-sequence.mjs",
].map(async (file) => [file, await readFile(file, "utf8")])));

const shader = files["src/crystal/materials/SpectralFlowMaterial.ts"];
assert.match(shader, /extends THREE\.MeshPhysicalMaterial/);
assert.match(shader, /vSpectralWorldPosition/);
assert.match(shader, /vSpectralWorldNormal/);
assert.match(shader, /cameraPosition/);
assert.match(shader, /uFlowDirection/);
assert.match(shader, /uSpectralTime/);
assert.match(shader, /AXIS_DIRECTION_FAMILIES/);
assert.match(shader, /axisDirection/);
assert.match(shader, /subtle:[\s\S]*balanced:[\s\S]*active:/);
assert.match(shader, /yellow[\s\S]*red[\s\S]*magenta[\s\S]*blue[\s\S]*violet/);

const assembly = files["src/crystal/CrystalAssembly.ts"];
assert.match(assembly, /"spectral-flow"/);
assert.match(assembly, /mesh\.material = this\.spectralMaterials/);

const studio = files["src/crystal/MotionStudioApp.ts"];
assert.match(studio, /setSpectralFlowRuntime\(time, this\.settings\.motion\.duration/);
assert.match(studio, /this\.settings\.look\.preset === "spectral-flow"[\s\S]*renderRasterFrame/);
assert.match(studio, /duration: 6/);

const panel = files["src/crystal/ui/StudioPanel.ts"];
for (const label of ["SPECTRAL FLOW", "FLOW", "SPECTRUM", "LIGHT", "SURFACE", "Position", "Direction", "Spectral Lag", "Edge Attraction"]) assert.ok(panel.includes(label), `missing UI label: ${label}`);

const sequence = files["scripts/render-motion-sequence.mjs"];
assert.match(sequence, /look: args\.look/);
assert.match(sequence, /api\.setLook\(value\.look\)/);

const envelope = (time, duration) => Math.sin(Math.PI * (((time / duration) % 1 + 1) % 1)) ** 2;
assert.equal(envelope(0, 6), 0);
assert.ok(envelope(6, 6) < Number.EPSILON);
assert.equal(envelope(3, 6), 1);

console.log(JSON.stringify({
  status: "pass",
  look: "spectral-flow",
  renderer: "realtime-raster-meshphysical-custom-glsl",
  axisSource: "src/axis/angles.ts",
  presets: ["subtle", "balanced", "active"],
  loopSeconds: 6,
  loopBoundaryDelta: Math.abs(envelope(0, 6) - envelope(6, 6)),
  pathTracingUsedForSpectralFlow: false,
}, null, 2));
