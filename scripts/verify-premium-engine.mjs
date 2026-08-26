import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredModules = [
  "animation/AnimationSystem.ts",
  "camera/FixedAxisCamera.ts",
  "config/EngineTypes.ts",
  "environment/EnvironmentSystem.ts",
  "geometry/AxisGeometryFactory.ts",
  "interaction/LockedZoomInteraction.ts",
  "lighting/LightingSystem.ts",
  "lines/LineSystem.ts",
  "materials/MaterialSystem.ts",
  "particles/ParticleSystem.ts",
  "performance/AdaptiveQuality.ts",
  "postprocessing/PostProcessingSystem.ts",
  "renderer/PremiumRenderer.ts",
  "scene/PleosScene.ts",
  "shaders/SpatialGradientSystem.ts",
];

const failures = [];
for (const relative of requiredModules) {
  const filename = path.join(root, "src/engine", relative);
  try {
    const info = await stat(filename);
    if (!info.isFile() || info.size === 0) failures.push(`${relative}: empty`);
  } catch {
    failures.push(`${relative}: missing`);
  }
}

const [mainSource, rendererSource, particleSource, postSource, packageSource] = await Promise.all([
  readFile(path.join(root, "src/main.ts"), "utf8"),
  readFile(path.join(root, "src/engine/renderer/PremiumRenderer.ts"), "utf8"),
  readFile(path.join(root, "src/engine/particles/ParticleSystem.ts"), "utf8"),
  readFile(path.join(root, "src/engine/postprocessing/PostProcessingSystem.ts"), "utf8"),
  readFile(path.join(root, "package.json"), "utf8"),
]);

const checks = [
  [mainSource.includes('from "./engine"'), "main.ts does not mount the premium engine"],
  [!mainSource.includes("RawWebGLRenderer"), "main.ts still imports the retired raw renderer"],
  [rendererSource.includes("new THREE.WebGPURenderer"), "WebGPURenderer is not configured"],
  [rendererSource.includes("forceWebGL"), "WebGL2 fallback is not configured"],
  [particleSource.includes("StorageInstancedBufferAttribute"), "GPU storage particles are missing"],
  [particleSource.includes("configureFallbackParticles"), "instanced fallback particles are missing"],
  [postSource.includes("RenderPipeline"), "node post-processing pipeline is missing"],
  [postSource.includes("bloom("), "HDR bloom is missing"],
  [JSON.parse(packageSource).dependencies?.three, "three dependency is missing"],
];
checks.forEach(([passed, message]) => { if (!passed) failures.push(message); });

if (failures.length > 0) {
  console.error("Premium engine verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Premium engine verification passed (${requiredModules.length} modules, WebGPU + WebGL2 fallback).`);
