import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const mainSource = await readFile(path.join(root, "src/main.ts"), "utf8");
const appSource = await readFile(path.join(root, "src/crystal/MotionStudioApp.ts"), "utf8");
const panelSource = await readFile(path.join(root, "src/crystal/ui/StudioPanel.ts"), "utf8");
const lightingSource = await readFile(path.join(root, "src/crystal/LightingSystem.ts"), "utf8");

assert.ok(packageJson.dependencies.three, "Three.js dependency is required");
assert.ok(packageJson.dependencies["three-gpu-pathtracer"], "GPU path tracer dependency is required");
assert.match(mainSource, /new MotionStudioApp\(root!\)/, "Motion Studio path-traced app must be the default entry");
assert.match(appSource, /new WebGLPathTracer\(this\.pathRenderer\)/, "WebGLPathTracer must own the active renderer");
assert.match(appSource, /new THREE\.OrthographicCamera\(/, "Default camera must be orthographic");
assert.match(appSource, /transmissiveBounces = this\.settings\.advanced\.bounces \+ 4/, "High-quality transmission bounce budget is missing");
assert.match(appSource, /this\.pathTracer\.setScene\(this\.scene, this\.pathCamera\)/, "Current-frame path tracing must synchronize the scene");
assert.match(appSource, /pleos-27-axis-settings-v2/, "Settings V2 must persist locally");
assert.match(appSource, /this\.pathTracer\.renderSample\(\)/, "Manual high-quality render must accumulate samples");
assert.match(appSource, /new UnrealBloomPass/, "Subtle bloom must be composited into preview and final output");
assert.match(panelSource, /\["setup", "look", "motion", "format", "export"\]/, "SETUP / LOOK / MOTION / FORMAT / EXPORT tabs are required");
assert.match(panelSource, /data-scrub/, "Inspector numeric inputs must support horizontal scrubbing");
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
  const centroid = spaced.cornerPositions.reduce((sum, position) => position.map((value, index) => value + sum[index]), [0, 0, 0]);
  assert.ok(centroid.every((value) => Math.abs(value) < 1e-6), "Bevel gap correction must keep the Axis centered");
  assert.equal(new Set(spaced.cornerPositions.map((position) => position.map((value) => value.toFixed(5)).join(","))).size, 3, "Gap directions must be distinct");
  assembly.setBevelRadius(0);
  assembly.setGap(0.2);
  const squareSpacing = assembly.inspect();
  const squarePairDistances = squareSpacing.cornerPositions.flatMap((position, index, positions) =>
    positions.slice(index + 1).map((other) => Math.hypot(
      position[0] - other[0], position[1] - other[1], position[2] - other[2],
    )),
  );
  assert.ok(squarePairDistances.every((distance) => Math.abs(distance - squarePairDistances[0]) < 1e-6), "Unbeveled solids must retain equal radial spacing");
  assembly.setBevelRadius(0.15);
  assembly.setGap(0.2);
  const beveledSpacing = assembly.inspect();
  assert.deepEqual(beveledSpacing.screenGapAngles, [90, 210, 330], "Bevel must not rotate the approved screen-space gap rays");
  const pairDistances = beveledSpacing.cornerPositions.flatMap((position, index, positions) =>
    positions.slice(index + 1).map((other) => Math.hypot(
      position[0] - other[0], position[1] - other[1], position[2] - other[2],
    )),
  );
  assert.ok(Math.abs(pairDistances[0] - pairDistances[1]) < 1e-6, "Upper diagonal gaps must remain mirror-symmetric");
  assert.ok(pairDistances[2] > pairDistances[0], "Bevel compensation must widen the visually compressed lower gap");
  assembly.setGap(0);
  assert.deepEqual(assembly.inspect().cornerPositions, [[0, 0, 0], [0, 0, 0], [0, 0, 0]], "Gap 0 must preserve the exact shared corner at every bevel radius");
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
