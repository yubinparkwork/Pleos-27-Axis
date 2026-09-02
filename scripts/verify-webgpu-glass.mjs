import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appSource = await readFile(path.join(root, "src/crystal/MotionStudioApp.ts"), "utf8");
const backendSource = await readFile(path.join(root, "src/crystal/rendering/WebGPUPreviewBackend.ts"), "utf8");
const pathBackendSource = await readFile(path.join(root, "src/crystal/rendering/WebGPUPathTracerBackend.ts"), "utf8");
const lightingSource = await readFile(path.join(root, "src/crystal/LightingSystem.ts"), "utf8");

assert.match(backendSource, /from "three\/webgpu"/, "Glass preview must import the Three.js WebGPU renderer stack");
assert.match(backendSource, /new WebGPURenderer/, "A real WebGPURenderer instance is required");
assert.match(backendSource, /RectAreaLightNode\.setLTC/, "WebGPU Rect Area Lights require LTC textures");
assert.match(backendSource, /new PostProcessing/, "WebGPU preview needs the TSL post-processing pipeline");
assert.match(backendSource, /bloom\(sceneColor/, "WebGPU preview must retain the established bloom stage");
assert.match(backendSource, /isWebGPUBackend === true/, "Runtime backend inspection must distinguish native WebGPU from fallback");
assert.match(appSource, /this\.webgpuPreview\.isNativeWebGPU/, "Only a native WebGPU backend may replace the established preview");
assert.match(pathBackendSource, /from "three-gpu-pathtracer\/webgpu"/, "Final rendering must use the official WebGPU path-tracer entry");
assert.match(pathBackendSource, /new WebGPUPathTracer/, "A native WebGPU path tracer instance is required");
assert.match(pathBackendSource, /getSampleCountsAsync/, "WebGPU convergence must use measured per-pixel sample counts");
assert.match(appSource, /backend: "webgpu" \| "webgl"/, "Every path render job must record its actual backend");
assert.match(appSource, /this\.webgpuPathTracer\.prepare/, "Final path rendering must route through WebGPU when available");
assert.match(appSource, /"WebGL 폴백"/, "The established WebGL path tracer must remain an explicit fallback");
assert.match(appSource, /if \(this\.renderJob \|\| this\.videoExportJob\)/, "ResizeObserver must not cancel an active render");
assert.match(appSource, /PATH_PREVIEW_REVEAL_SAMPLES/, "The accumulated path canvas must not replace the preview while its target is still black");
assert.match(appSource, /samples >= Math\.min\(PATH_PREVIEW_REVEAL_SAMPLES, job\.targetSamples\)/, "The path canvas should be revealed only after useful samples exist");
assert.match(lightingSource, /new THREE\.RectAreaLight/, "Editable area lights must use the renderer-neutral Three.js light class");
assert.match(lightingSource, /new THREE\.SpotLight/, "Editable spot lights must use the renderer-neutral Three.js light class");
assert.match(lightingSource, /new ShapedAreaLight/, "Finite path-tracing strip surrogates must remain available");

console.log(JSON.stringify({
  status: "pass",
  previewBackend: "Three.js WebGPU + TSL",
  unsupportedFallback: "established Three.js WebGL preview",
  highQualityBackend: "three-gpu-pathtracer WebGPU wavefront compute",
  unsupportedFallback: "three-gpu-pathtracer WebGL/GLSL",
}, null, 2));
