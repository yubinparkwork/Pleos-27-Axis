import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const mainSource = await readFile(path.join(root, "src/main.ts"), "utf8");
const shellSource = await readFile(path.join(root, "src/studio/StudioShell.ts"), "utf8");
const glassModeSource = await readFile(path.join(root, "src/modes/glass-3d/Glass3DMode.ts"), "utf8");
const appSource = await readFile(path.join(root, "src/crystal/MotionStudioApp.ts"), "utf8");
const webgpuPathSource = await readFile(path.join(root, "src/crystal/rendering/WebGPUPathTracerBackend.ts"), "utf8");
const panelSource = await readFile(path.join(root, "src/crystal/ui/StudioPanel.ts"), "utf8");
const lightingSource = await readFile(path.join(root, "src/crystal/LightingSystem.ts"), "utf8");

assert.ok(packageJson.dependencies.three, "Three.js dependency is required");
assert.ok(packageJson.dependencies["three-gpu-pathtracer"], "GPU path tracer dependency is required");
assert.ok(packageJson.dependencies.mediabunny, "Browser-side MP4 muxing dependency is required");
assert.match(mainSource, /new StudioShell\(root!, registry, "glass-3d"\)/, "Mode Studio shell must own the default entry");
assert.match(mainSource, /register\(GLASS_3D_MODE\)/, "Glass 3D must be the registered production mode");
assert.match(shellSource, /definition\.create\(context\)/, "Studio shell must create renderers through the active mode definition");
assert.match(glassModeSource, /new MotionStudioApp\(this\.context\.root/, "Glass 3D mode must own the path-traced Motion Studio app");
assert.match(webgpuPathSource, /new WebGPUPathTracer\(this\.renderer\)/, "WebGPUPathTracer must own the preferred final renderer");
assert.match(appSource, /new WebGLPathTracer\(this\.pathRenderer\)/, "WebGLPathTracer must remain available as a compatibility fallback");
assert.match(appSource, /new THREE\.OrthographicCamera\(/, "Default camera must be orthographic");
assert.match(appSource, /transmissiveBounces = this\.settings\.advanced\.bounces \+ 4/, "High-quality transmission bounce budget is missing");
assert.match(appSource, /this\.pathTracer\.setScene\(this\.scene, this\.pathCamera\)/, "Current-frame path tracing must synchronize the scene");
assert.match(appSource, /pleos-27-axis-settings-v2/, "Settings V2 must persist locally");
assert.match(appSource, /this\.webgpuPathTracer\.renderSample\(timestamp\)/, "Manual high-quality render must accumulate native WebGPU samples");
assert.match(appSource, /this\.pathTracer\.renderSample\(\)/, "Compatibility rendering must continue to accumulate WebGL samples");
assert.match(appSource, /new CanvasSource\(encodingCanvas/, "Path-traced video must encode deterministic canvas frames");
assert.match(appSource, /outputSize\.height \+ outputSize\.height % 2/, "H.264 output height must be padded to an even number");
assert.match(appSource, /await source\.add\(frame \/ fps, 1 \/ fps\)/, "Video frames need fixed timestamps and durations");
assert.match(appSource, /new Mp4OutputFormat/, "Path-traced video must produce an MP4 container");
assert.match(appSource, /colorDominanceWeights/, "RGB motion lights must cycle through camera-facing color dominance");
assert.match(appSource, /SPECTRAL_DOMINANT_SHARE = \.76/, "Dominant RGB light must target roughly 70 percent visual share");
assert.match(appSource, /new UnrealBloomPass/, "Subtle bloom must be composited into preview and final output");
assert.match(panelSource, /data-mode-panel="glass-3d"/, "Glass 3D needs one mode-specific inspector panel");
assert.doesNotMatch(panelSource, /data-inspector-tab/, "The production mode inspector cannot expose permanent technical tabs");
assert.match(panelSource, /data-context-advanced/, "Technical controls must live in contextual details sections");
assert.match(panelSource, /data-scrub/, "Inspector numeric inputs must support horizontal scrubbing");
assert.match(panelSource, /영상 · MP4/, "Export type must expose browser-side MP4 output");
assert.match(panelSource, /"target-samples", "샘플", 16, 2048, 16/, "Path-traced sample control must support up to 2048 spp");
assert.match(lightingSource, /PLEOS_BRAND_COLORS/, "Pleos brand palette is required");
assert.match(lightingSource, /new THREE\.RectAreaLight/, "Renderer-neutral Rect Area Lights must be supported");
assert.match(lightingSource, /new THREE\.SpotLight/, "Renderer-neutral Spot Lights must be supported");
assert.match(lightingSource, /new ShapedAreaLight/, "Path-traced finite strip surrogates must be supported");
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
  assert.equal(beveledSpacing.bevelGapCompensation.strategy, "projected-geometry-solver");
  assert.ok(beveledSpacing.bevelGapCompensation.projectedInsetBias > 0, "Rounded geometry must report its projected lower-pair inset");
  assert.ok(beveledSpacing.bevelGapCompensation.residual < 1e-5, "Projected gap solver must equalize the three visible seams");
  assembly.setGap(0);
  assert.deepEqual(assembly.inspect().cornerPositions, [[0, 0, 0], [0, 0, 0], [0, 0, 0]], "Gap 0 must preserve the exact shared corner at every bevel radius");
  assembly.dispose();

  console.log(JSON.stringify({
    status: "pass",
    renderer: "three-gpu-pathtracer WebGPU with WebGL fallback",
    solids: meshes.length,
    linePrimitives: lines.length,
    sharedCorner: inspection.sharedCorner,
    defaultLights: lighting.lights.length,
  }, null, 2));
} finally {
  await server.close();
}
