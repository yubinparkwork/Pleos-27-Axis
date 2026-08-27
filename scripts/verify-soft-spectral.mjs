import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "src/crystal/materials/SoftSpectralMaterial.ts", "src/crystal/CrystalAssembly.ts", "src/crystal/MotionStudioApp.ts",
  "src/crystal/ui/StudioPanel.ts", "src/crystal/variations/StudioVariation.ts", "src/main.ts",
].map(async (file) => [file, await readFile(file, "utf8")])));
const shader = files["src/crystal/materials/SoftSpectralMaterial.ts"];
for (const token of ["extends THREE.MeshPhysicalMaterial", "vSoftWorldPosition", "vSoftWorldNormal", "cameraPosition", "axisDirection", "centerField", "edgeField", "softPalette", "uSoftTime"]) assert.ok(shader.includes(token), `missing shader contract: ${token}`);
assert.match(shader, /subtle:[\s\S]*balanced:[\s\S]*active:/);
assert.match(shader, /cyan \* 1\.18[\s\S]*blue \* 1\.12[\s\S]*magenta \* \.34/);
assert.match(files["src/crystal/CrystalAssembly.ts"], /"soft-spectral"[\s\S]*softSpectralMaterials/);
assert.match(files["src/crystal/MotionStudioApp.ts"], /preset === "soft-spectral"[\s\S]*restoreRestPose/);
assert.match(files["src/crystal/MotionStudioApp.ts"], /setSoftSpectralRuntime\(time, this\.settings\.motion\.duration/);
for (const label of ["광량", "스펙트럼", "모서리", "어두움", "모션 깊이", "중심 반경", "모서리 부드러움"]) assert.ok(files["src/crystal/ui/StudioPanel.ts"].includes(label), `missing UI label: ${label}`);
for (const id of ["builtin-soft-spectral-subtle", "builtin-soft-spectral-balanced", "builtin-soft-spectral-active"]) assert.ok(files["src/crystal/variations/StudioVariation.ts"].includes(id), `missing variation: ${id}`);
assert.match(files["src/main.ts"], /setSoftSpectralPreset/);
const envelope = (time) => .5 - .5 * Math.cos(time / 8 * Math.PI * 2);
assert.ok(Math.abs(envelope(0) - envelope(8)) < Number.EPSILON);
console.log(JSON.stringify({ status: "pass", look: "soft-spectral", renderer: "realtime-raster-meshphysical-custom-glsl", geometryMotion: false, duration: 8, presets: ["subtle", "balanced", "active"] }, null, 2));
