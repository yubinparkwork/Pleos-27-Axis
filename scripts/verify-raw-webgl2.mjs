import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "src");
const artifactRoot = path.join(root, "artifacts", "raw-webgl2");

const requiredSourceFiles = [
  "src/raw-webgl/core/GLContext.ts",
  "src/raw-webgl/core/GLCapabilities.ts",
  "src/raw-webgl/core/ShaderProgram.ts",
  "src/raw-webgl/core/Buffer.ts",
  "src/raw-webgl/core/VertexArray.ts",
  "src/raw-webgl/core/UniformBuffer.ts",
  "src/raw-webgl/core/Texture.ts",
  "src/raw-webgl/core/Framebuffer.ts",
  "src/raw-webgl/core/RenderTarget.ts",
  "src/raw-webgl/core/GLStateCache.ts",
  "src/raw-webgl/core/ResourceManager.ts",
  "src/raw-webgl/geometry/index.ts",
  "src/raw-webgl/geometry/types.ts",
  "src/raw-webgl/geometry/foldedSurface.ts",
  "src/raw-webgl/geometry/closedOpticalSolid.ts",
  "src/raw-webgl/geometry/validation.ts",
  "src/raw-webgl/camera/OrbitController.ts",
  "src/raw-webgl/materials/materialPresets.ts",
  "src/raw-webgl/lighting/lightingPresets.ts",
  "src/raw-webgl/renderer/RawWebGLRenderer.ts",
  "src/studio/state/RawStudioState.ts",
  "src/studio/ui/RawStudioApp.ts",
];

const expectedPipelineResponsibilities = [
  "background",
  "matte",
  "prism-backface",
  "prism-front",
  "composite",
  "tonemap",
  "fxaa",
  "export",
];

const shaderEntryFiles = [
  "src/raw-webgl/shaders/matte/matte.vert.glsl",
  "src/raw-webgl/shaders/matte/matte.frag.glsl",
  "src/raw-webgl/shaders/prism/prism-backface.vert.glsl",
  "src/raw-webgl/shaders/prism/prism-backface.frag.glsl",
  "src/raw-webgl/shaders/prism/prism-front.vert.glsl",
  "src/raw-webgl/shaders/prism/prism-front.frag.glsl",
  "src/raw-webgl/shaders/post/fullscreen.vert.glsl",
  "src/raw-webgl/shaders/post/background.frag.glsl",
  "src/raw-webgl/shaders/post/copy.frag.glsl",
  "src/raw-webgl/shaders/post/tonemap.frag.glsl",
  "src/raw-webgl/shaders/post/fxaa.frag.glsl",
];

const commonShaderFiles = [
  "src/raw-webgl/shaders/common/color-space.glsl",
  "src/raw-webgl/shaders/common/math.glsl",
  "src/raw-webgl/shaders/common/brdf.glsl",
  "src/raw-webgl/shaders/common/fresnel.glsl",
  "src/raw-webgl/shaders/common/tone-mapping.glsl",
  "src/raw-webgl/shaders/common/dithering.glsl",
  "src/raw-webgl/shaders/common/environment.glsl",
];

const forbiddenPackages = [
  "three",
  "@types/three",
  "babylonjs",
  "@babylonjs/core",
  "regl",
  "twgl.js",
  "ogl",
  "pixi.js",
  "luma.gl",
  "@luma.gl/core",
  "playcanvas",
  "@react-three/fiber",
];

const missingFiles = [];
for (const relativePath of [...requiredSourceFiles, ...shaderEntryFiles, ...commonShaderFiles]) {
  if (!await exists(path.join(root, relativePath))) missingFiles.push(relativePath);
}
assert.deepEqual(missingFiles, [], `Missing Raw WebGL2 implementation files:\n${missingFiles.join("\n")}`);

const productionFiles = (await listFiles(sourceRoot)).filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(file));
const forbiddenSourceHits = [];
const engineImport = /(?:\bfrom\s*|\bimport\s+|\bimport\s*\(|\brequire\s*\()\s*["'](?:three(?:\/[^"']*)?|babylonjs(?:\/[^"']*)?|@babylonjs\/[^"']+|regl|twgl(?:\.js)?|ogl|pixi\.js|luma\.gl|@luma\.gl\/[^"']+|playcanvas|@react-three\/fiber)["']/g;
const forbiddenSymbols = /\b(?:THREE\.|WebGLRenderer\b|MeshPhysicalMaterial\b)/g;

for (const file of productionFiles) {
  const source = await readFile(file, "utf8");
  for (const pattern of [engineImport, forbiddenSymbols]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      forbiddenSourceHits.push(`${path.relative(root, file)}:${line} ${match[0]}`);
    }
  }
}
assert.deepEqual(
  forbiddenSourceHits,
  [],
  `Production src still references a forbidden renderer or engine:\n${forbiddenSourceHits.join("\n")}`,
);

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const declaredPackages = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
  ...(packageJson.optionalDependencies ?? {}),
};
const forbiddenDependencyHits = forbiddenPackages.filter((name) => Object.hasOwn(declaredPackages, name));
assert.deepEqual(
  forbiddenDependencyHits,
  [],
  `Remove forbidden engine dependencies after the legacy archive is complete: ${forbiddenDependencyHits.join(", ")}`,
);

const commonShaderNames = new Map(
  commonShaderFiles.map((relativePath) => [path.basename(relativePath, ".glsl"), relativePath]),
);
const shaderIncludeGraph = {};
for (const relativePath of shaderEntryFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const firstMeaningfulLine = source.split(/\r?\n/).find((line) => line.trim() !== "")?.trim();
  assert.equal(firstMeaningfulLine, "#version 300 es", `${relativePath} must begin with #version 300 es`);
  assert.match(source, /precision\s+highp\s+float\s*;/, `${relativePath} must explicitly request highp float precision`);

  const includes = [...source.matchAll(/^\s*#include\s+<([^>]+)>\s*$/gm)].map((match) => match[1]);
  const unresolved = includes.filter((name) => !commonShaderNames.has(name));
  assert.deepEqual(unresolved, [], `${relativePath} has unresolved shader includes: ${unresolved.join(", ")}`);
  shaderIncludeGraph[relativePath] = includes;
}

for (const relativePath of commonShaderFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /^\s*#version\b/m, `${relativePath} is an include fragment and must not declare #version`);
}

const glContextSource = await readFile(path.join(root, "src/raw-webgl/core/GLContext.ts"), "utf8");
assert.match(glContextSource, /getContext\(\s*["']webgl2["']/, "GLContext must explicitly request WebGL2");
assert.doesNotMatch(glContextSource, /getContext\(\s*["']webgl["']/, "A silent WebGL1 fallback is forbidden");
assert.match(glContextSource, /preserveDrawingBuffer:\s*false/, "Preview context must keep preserveDrawingBuffer disabled");
assert.match(glContextSource, /powerPreference:\s*["']high-performance["']/, "High-performance GPU preference request is missing");
assert.match(glContextSource, /webglcontextlost/, "Context-lost handling is missing");
assert.match(glContextSource, /webglcontextrestored/, "Context-restored handling is missing");

const shaderProgramSource = await readFile(path.join(root, "src/raw-webgl/core/ShaderProgram.ts"), "utf8");
assert.match(shaderProgramSource, /numberShaderSource/, "Shader compile errors must include numbered source");
assert.match(shaderProgramSource, /getShaderInfoLog/, "Shader compiler logs are not surfaced");
assert.match(shaderProgramSource, /getProgramInfoLog/, "Shader linker logs are not surfaced");

const framebufferSource = await readFile(path.join(root, "src/raw-webgl/core/Framebuffer.ts"), "utf8");
assert.match(framebufferSource, /checkFramebufferStatus/, "Framebuffer completeness is never checked");
assert.match(framebufferSource, /FRAMEBUFFER_COMPLETE/, "Incomplete framebuffers are not rejected");

const resourceManagerSource = await readFile(path.join(root, "src/raw-webgl/core/ResourceManager.ts"), "utf8");
assert.match(resourceManagerSource, /restoreAll/, "Resource restoration orchestration is missing");
assert.match(resourceManagerSource, /disposeAll/, "Resource disposal orchestration is missing");

const liveImportGraph = await collectLocalImportGraph(path.join(root, "src", "main.ts"));
const rendererEntry = "src/raw-webgl/renderer/RawWebGLRenderer.ts";
assert.ok(
  liveImportGraph.files.includes(rendererEntry),
  `${rendererEntry} exists but is not reachable from the production entry point`,
);
const requiredLiveModules = [
  "src/raw-webgl/core/GLContext.ts",
  "src/raw-webgl/core/ShaderProgram.ts",
  "src/raw-webgl/core/Buffer.ts",
  "src/raw-webgl/core/VertexArray.ts",
  "src/raw-webgl/core/UniformBuffer.ts",
  "src/raw-webgl/core/Texture.ts",
  "src/raw-webgl/core/Framebuffer.ts",
  "src/raw-webgl/core/RenderTarget.ts",
  "src/raw-webgl/core/GLStateCache.ts",
  "src/raw-webgl/core/ResourceManager.ts",
  "src/raw-webgl/geometry/foldedSurface.ts",
  "src/raw-webgl/geometry/closedOpticalSolid.ts",
  "src/raw-webgl/materials/materialPresets.ts",
  "src/raw-webgl/lighting/lightingPresets.ts",
  "src/raw-webgl/camera/OrbitController.ts",
  "src/studio/state/RawStudioState.ts",
  "src/studio/ui/RawStudioApp.ts",
];
const unreachableRequiredModules = requiredLiveModules.filter((file) => !liveImportGraph.files.includes(file));
assert.deepEqual(
  unreachableRequiredModules,
  [],
  `Raw implementation files exist but are disconnected from the production import graph:\n${unreachableRequiredModules.join("\n")}`,
);
const implementationSource = (await Promise.all(
  liveImportGraph.files
    .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs|glsl)$/i.test(file))
    .map((file) => readFile(path.join(root, file), "utf8")),
)).join("\n").toLowerCase();
const pipelineResponsibilityHits = Object.fromEntries(expectedPipelineResponsibilities.map((responsibility) => {
  const aliases = {
    background: ["backgroundpass", "background.frag.glsl"],
    matte: ["mattepass", "matte.frag.glsl"],
    "prism-backface": ["prismbackfacepass", "prism-backface.frag.glsl"],
    "prism-front": ["prismfrontfacepass", "prism-front.frag.glsl"],
    composite: ["compositepass", "copy.frag.glsl"],
    tonemap: ["tonemappass", "tonemap.frag.glsl"],
    fxaa: ["fxaapass", "fxaa.frag.glsl"],
    export: ["exportrenderer", "exportpass", "readpixels"],
  }[responsibility];
  const reachablePaths = liveImportGraph.files.join("\n").toLowerCase();
  return [
    responsibility,
    aliases.some((alias) => reachablePaths.includes(alias) || implementationSource.includes(alias)),
  ];
}));
const missingPipelineResponsibilities = Object.entries(pipelineResponsibilityHits)
  .filter(([, found]) => !found)
  .map(([responsibility]) => responsibility);
assert.deepEqual(
  missingPipelineResponsibilities,
  [],
  `Raw renderer is missing pipeline responsibilities: ${missingPipelineResponsibilities.join(", ")}`,
);

const geometrySelfTest = await runGeometrySelfTest();
assert.equal(
  geometrySelfTest.valid,
  true,
  `Axis geometry self-test failed: ${JSON.stringify(geometrySelfTest, null, 2)}`,
);

const manifestPath = path.join(artifactRoot, "manifest.json");
const artifactManifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifactEntries = Array.isArray(artifactManifest.artifacts) ? artifactManifest.artifacts : [];
const artifactFilesPresent = [];
const artifactFilesPending = [];
for (const entry of artifactEntries) {
  const target = path.join(artifactRoot, entry.file);
  if (await exists(target)) artifactFilesPresent.push(entry.file);
  else artifactFilesPending.push(entry.file);
}
if (process.env.RAW_WEBGL2_REQUIRE_ARTIFACTS === "1") {
  assert.deepEqual(
    artifactFilesPending,
    [],
    `Strict artifact verification failed; missing files:\n${artifactFilesPending.join("\n")}`,
  );
}

const report = {
  status: "pass",
  renderer: "raw-webgl2",
  productionFilesScanned: productionFiles.length,
  forbiddenSourceHits,
  forbiddenDependencyHits,
  requiredImplementationFiles: requiredSourceFiles.length,
  liveImportGraph,
  requiredLiveModules: requiredLiveModules.length,
  pipelineResponsibilities: pipelineResponsibilityHits,
  shaderEntryFiles: shaderEntryFiles.length,
  commonShaderFiles: commonShaderFiles.length,
  shaderIncludeGraph,
  coreContracts: {
    webgl2Only: true,
    preserveDrawingBuffer: false,
    contextLossHandlers: true,
    numberedShaderDiagnostics: true,
    framebufferCompletenessGate: true,
    resourceRestoreAndDispose: true,
  },
  geometrySelfTest,
  artifacts: {
    manifest: path.relative(root, manifestPath),
    strict: process.env.RAW_WEBGL2_REQUIRE_ARTIFACTS === "1",
    present: artifactFilesPresent,
    pending: artifactFilesPending,
  },
};

await mkdir(path.join(root, "artifacts", "verification"), { recursive: true });
await writeFile(
  path.join(root, "artifacts", "verification", "raw-webgl2.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

async function runGeometrySelfTest() {
  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const geometry = await server.ssrLoadModule("/src/raw-webgl/geometry/index.ts");
    assert.equal(typeof geometry.runAxisGeometrySelfTest, "function", "Geometry self-test export is missing");
    return geometry.runAxisGeometrySelfTest();
  } finally {
    await server.close();
  }
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(directory) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

async function collectLocalImportGraph(entryFile) {
  const visited = new Set();
  const edges = [];
  const pending = [entryFile];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|css)$/i.test(current)) continue;
    const source = await readFile(current, "utf8");
    const specifiers = new Set();
    for (const pattern of [
      /\b(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    ]) {
      for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
    }
    for (const rawSpecifier of specifiers) {
      if (!rawSpecifier.startsWith(".")) continue;
      const specifier = rawSpecifier.split("?")[0];
      const resolved = await resolveLocalImport(path.dirname(current), specifier);
      assert.ok(resolved, `${path.relative(root, current)} has an unresolved local import: ${rawSpecifier}`);
      edges.push([path.relative(root, current), path.relative(root, resolved)]);
      if (!visited.has(resolved)) pending.push(resolved);
    }
  }
  return {
    entry: path.relative(root, entryFile),
    files: [...visited].map((file) => path.relative(root, file)).sort(),
    edges: edges.sort((a, b) => a.join("→").localeCompare(b.join("→"))),
  };
}

async function resolveLocalImport(fromDirectory, specifier) {
  const base = path.resolve(fromDirectory, specifier);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.glsl`, `${base}.css`, path.join(base, "index.ts")];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return null;
}
