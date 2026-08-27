import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const mainSource = await readFile(path.join(root, "src/main.ts"), "utf8");
const appSource = await readFile(path.join(root, "src/crystal/NewAxisCrystalApp.ts"), "utf8");
const lightingSource = await readFile(path.join(root, "src/crystal/LightingSystem.ts"), "utf8");

assert.ok(packageJson.dependencies.three, "Three.js dependency is required");
assert.ok(packageJson.dependencies["three-gpu-pathtracer"], "GPU path tracer dependency is required");
assert.match(mainSource, /else\s*\{[\s\S]*new NewAxisCrystalApp\(appRoot\)/, "Path-traced app must be the default entry");
assert.match(appSource, /new WebGLPathTracer\(this\.renderer\)/, "WebGLPathTracer must own the active renderer");
assert.match(appSource, /new THREE\.OrthographicCamera\(/, "Default camera must be orthographic");
assert.match(appSource, /transmissiveBounces\s*=\s*Math\.max\(this\.settings\.bounces \+ 2, 8\)/, "High-quality transmission bounce budget is missing");
assert.match(appSource, /updateCamera\(\)/, "Camera changes must reset accumulation");
assert.match(appSource, /updateMaterials\(\)/, "Material changes must reset accumulation");
assert.match(appSource, /data-action="render-fast"/, "Fast render button is required");
assert.match(appSource, /data-action="render-high"/, "High-quality render button is required");
assert.match(appSource, /if \(this\.exportJob \|\| this\.isRendering\) \{\s*this\.pathTracer\.renderSample\(\)/, "Path tracing must only run after manual render or export starts");
assert.match(appSource, /localStorage\.setItem\(STORAGE_KEY/, "Settings must persist locally");
assert.match(appSource, /data-region="\$\{name\}"/, "Pixel render-region inputs are required");
assert.match(appSource, /setViewOffset\(stageWidth, stageHeight, region\.x, region\.y, region\.width, region\.height\)/, "Partial rendering must use a camera view offset");
assert.match(appSource, /this\.renderer\.setPixelRatio\(1\)/, "Render-region pixels must map 1:1 to exported PNG pixels");
assert.match(appSource, /amount \/ 25\.4/, "Millimeter values must convert through the configured PPI");
assert.match(appSource, /centerRenderRegion\(\)/, "The render region must support screen-center initialization");
assert.match(appSource, /event\.shiftKey \? 10 : 1/, "Render-region keyboard controls must support 1px and Shift+10px steps");
assert.match(appSource, /type ExportPpi = 72 \| 150 \| 300/, "72, 150, and 300 PPI exports are required");
assert.match(appSource, /this\.pathTracer\.renderScale = 1/, "Final PPI export must render at full internal resolution");
assert.match(appSource, /ppi === 300 \? 256/, "300 PPI export needs a high sample floor");
assert.match(appSource, /0x70, 0x48, 0x59, 0x73/, "PNG pHYs metadata chunk is required");
assert.match(appSource, /new UnrealBloomPass/, "Subtle bloom must be composited into preview and final output");
for (const tab of ["object", "material", "light", "render", "export"]) {
  assert.match(appSource, new RegExp(`data-inspector-(?:tab|view)=\\"${tab}\\"`), `Inspector ${tab} tab is required`);
}
assert.match(appSource, /data-scrub/, "Inspector numeric inputs must support horizontal scrubbing");
assert.match(lightingSource, /PLEOS_BRAND_COLORS/, "Pleos brand palette is required");
assert.match(lightingSource, /new ShapedAreaLight/, "Rect area lights must be supported");
assert.match(lightingSource, /new PhysicalSpotLight/, "Physical spot lights must be supported");
assert.match(lightingSource, /new THREE\.DirectionalLight/, "Directional lights must be supported");
assert.match(lightingSource, /new THREE\.PointLight/, "Point lights must be supported");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { createLightingPreset } = await server.ssrLoadModule("/src/crystal/LightingSystem.ts");
  const lighting = createLightingPreset("pleos-rgb");
  assert.ok(lighting.lights.length >= 8 && lighting.lights.length <= 12, "Default lighting must use 8–12 lights");
  assert.equal(new Set(lighting.lights.map((light) => light.id)).size, lighting.lights.length, "Every light needs a unique id");
  const { CrystalAssembly } = await server.ssrLoadModule("/src/crystal/CrystalAssembly.ts");
  const assembly = new CrystalAssembly();
  const meshes = [];
  const lines = [];
  assembly.traverse((object) => {
    if (object.isMesh) meshes.push(object);
    if (object.isLine) lines.push(object);
  });
  assert.equal(meshes.length, 3, "Exactly three optical solids must define the Axis");
  assert.equal(lines.length, 0, "Axis cannot use line primitives");
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    assert.ok(position && position.count > 100, "Optical solid needs rounded closed geometry");
    assert.ok(mesh.geometry.getIndex(), "Optical solid must remain indexed and closed");
    for (let index = 0; index < position.count; index += 1) {
      assert.ok(Number.isFinite(position.getX(index)) && Number.isFinite(position.getY(index)) && Number.isFinite(position.getZ(index)), "Geometry contains non-finite coordinates");
    }
  }
  const inspection = assembly.inspect();
  assert.deepEqual(inspection.sharedCorner, [0, 0, 0]);
  assert.equal(inspection.solids, 3);
  assembly.setGap(0.2);
  const spaced = assembly.inspect();
  assert.equal(spaced.gap, 0.2);
  assert.equal(spaced.sharedCorner, null);
  for (const position of spaced.cornerPositions) {
    assert.ok(Math.abs(Math.hypot(...position) - 0.2) < 1e-6, "Every cube must receive the same gap offset");
  }
  assert.equal(new Set(spaced.cornerPositions.map((position) => position.map((value) => value.toFixed(5)).join(","))).size, 3, "Gap directions must be distinct");
  assembly.dispose();

  console.log(JSON.stringify({
    status: "pass",
    renderer: "three-gpu-pathtracer",
    solids: meshes.length,
    linePrimitives: lines.length,
    sharedCorner: inspection.sharedCorner,
    defaultLights: lighting.lights.length,
  }, null, 2));
} finally {
  await server.close();
}
