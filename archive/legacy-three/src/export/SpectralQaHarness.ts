import { createAxisGraph, createReferenceFrame, getApprovedAxisDefinition, type AxisGraph } from "../axis";
import type { AxisGraphLike } from "../geometry/FoldSurfaceBuilder";
import { applySpectralPreset, SPECTRAL_PRESETS } from "../materials/spectralPresets";
import { MotionEngine } from "../motion/MotionEngine";
import { PleosRenderer } from "../renderer/PleosRenderer";
import { DEFAULT_STATE, cloneState } from "../state/studioState";
import { StillExporter } from "./StillExporter";

const receiver = new URLSearchParams(location.search).get("receiver") ?? "http://127.0.0.1:4175";
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Spectral QA DOM is missing ${selector}`);
  return element;
}
const status = requireElement<HTMLElement>("#qa-status");
const canvas = requireElement<HTMLCanvasElement>("#qa-canvas");
const stage = requireElement<HTMLElement>("#qa-stage");

function adaptGraph(graph: AxisGraph): AxisGraphLike {
  return {
    origin: graph.origin,
    rays: graph.rays.map((ray) => ({ id: ray.id, angleDeg: ray.angleDeg, direction: ray.direction, endpoint: ray.endpoint })),
    frame: { minX: graph.bounds.left, maxX: graph.bounds.right, minY: graph.bounds.bottom, maxY: graph.bounds.top },
  };
}

async function submit(filename: string, blob: Blob): Promise<void> {
  const response = await fetch(`${receiver}/artifact`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream", "X-Filename": filename }, body: blob });
  if (!response.ok) throw new Error(`Receiver rejected ${filename}: ${response.status}`);
}

async function run(): Promise<void> {
  const query = new URLSearchParams(location.search);
  const requestedPreset = query.get("preset");
  const requestedSize = Number(query.get("size") ?? "0");
  const requestedVariant = query.get("variant");
  const requestedFilename = query.get("filename");
  const definition = getApprovedAxisDefinition("axis-30-variation-1");
  if (!definition) throw new Error("Missing axis-30-variation-1");
  const graph = createAxisGraph(definition, createReferenceFrame(3.5, 2.6), { requireApprovedCombination: true, snapAnchor: true });
  const state = cloneState(DEFAULT_STATE);
  state.anchor = { gridX: 10, gridY: 10 };
  state.layers.enabled = false;
  state.elements = { ...state.elements, grid: false, nodes: false, connections: false, circuit: false, orbit: false, arrows: false };
  state.motion = { ...state.motion, playing: false, preset: "fold-breath", time: 2.7, duration: 10, intensity: 0.18 };
  state.camera = { ...state.camera, mode: "perspective-exploration", preset: "three-quarter-left", parallax: false, fov: 31 };
  state.showAxisGuide = false;
  state.showGrid = false;
  state.showWireframe = false;
  const renderer = new PleosRenderer(canvas, stage);
  const exporter = new StillExporter(renderer);
  const motion = new MotionEngine();
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), outputs: [], renderer: null };
  try {
    const presets = requestedPreset ? SPECTRAL_PRESETS.filter((preset) => preset.id === requestedPreset) : SPECTRAL_PRESETS;
    if (presets.length === 0) throw new Error(`Unknown spectral preset ${requestedPreset}`);
    for (const preset of presets) {
      state.spectral = applySpectralPreset(state.spectral, preset.id);
      state.spectral.quality = "high";
      if (requestedVariant === "geometry-wireframe") { state.spectral.enabled = false; state.showWireframe = true; }
      if (requestedVariant === "geometry-solid") { state.spectral.enabled = false; state.showWireframe = false; }
      if (requestedVariant === "glass-basic") { state.spectral.dispersion = 0; state.spectral.iridescence = 0; state.spectral.absorptionStrength = 0.08; state.spectral.causticIntensity = 0.18; }
      if (requestedVariant === "glass-dispersion") { state.spectral.dispersion = 0.46; state.spectral.iridescence = 0; state.spectral.spectralSamples = 9; state.spectral.causticIntensity = 1.2; }
      if (requestedVariant === "glass-iridescence") { state.spectral.dispersion = 0.02; state.spectral.iridescence = 0.88; state.spectral.filmThicknessNoise = 0.34; }
      if (requestedVariant === "glass-attenuation") { state.spectral.dispersion = 0.04; state.spectral.iridescence = 0.02; state.spectral.attenuationDistance = 0.32; state.spectral.internalDensity = 1.25; state.spectral.absorptionStrength = 1.8; }
      if (requestedVariant === "lighting-softbox") { state.spectral.dispersion = 0.02; state.spectral.iridescence = 0.02; state.spectral.warmCard = 0.75; state.spectral.coolCard = 0.9; state.spectral.causticIntensity = 0.22; }
      if (requestedVariant === "lighting-spectral") { state.spectral.dispersion = 0.38; state.spectral.iridescence = 0.36; state.spectral.warmCard = 1.15; state.spectral.coolCard = 1.25; state.spectral.causticIntensity = 1.35; }
      renderer.setGraph(adaptGraph(graph), state);
      const frame = motion.evaluate(state.fold, state.motion);
      renderer.updateFrame(state, frame.fold, frame.layerReveal, frame.sweep, frame.elementTime);
      renderer.render();
      const size = requestedSize || 2048;
      if (size >= 4096) state.spectral.quality = "final";
      status.textContent = `Rendering ${preset.name} ${size}`;
      const preview = await exporter.createStillBlob({ width: size, height: size, format: "png", supersampling: 1, transparent: false, quality: size >= 4096 ? "final" : "high" });
      const previewName = requestedFilename ?? `${preset.id}-${size}.png`;
      await submit(previewName, preview);
      (report.outputs as unknown[]).push({ preset: preset.id, width: size, height: size, bytes: preview.size, filename: previewName });
    }

    if (!requestedPreset) {
    state.spectral = applySpectralPreset(state.spectral, "soft-spectral-caustic");
    state.spectral.quality = "final";
    renderer.setGraph(adaptGraph(graph), state);
    const finalFrame = motion.evaluate(state.fold, state.motion);
    renderer.updateFrame(state, finalFrame.fold, finalFrame.layerReveal, finalFrame.sweep, finalFrame.elementTime);
    status.textContent = "Rendering Soft Spectral Caustic 4096";
    const finalMaster = await exporter.createStillBlob({ width: 4096, height: 4096, format: "png", supersampling: 1, transparent: false, quality: "final" });
    await submit("soft-spectral-caustic-4096.png", finalMaster);
    (report.outputs as unknown[]).push({ preset: "soft-spectral-caustic", width: 4096, height: 4096, bytes: finalMaster.size, filename: "soft-spectral-caustic-4096.png" });
    }
    report.renderer = renderer.inspect();
    report.maxTextureSupports8192 = renderer.renderer.capabilities.maxTextureSize >= 8192;
    report.completedAt = new Date().toISOString();
    await submit("spectral-runtime-report.json", new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" }));
    status.textContent = "SPECTRAL_QA_COMPLETE";
    document.title = "SPECTRAL_QA_COMPLETE";
  } finally {
    renderer.dispose();
  }
}

run().catch(async (error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  status.textContent = `SPECTRAL_QA_FAILED\n${message}`;
  document.title = "SPECTRAL_QA_FAILED";
  try { await submit("spectral-runtime-error.json", new Blob([message], { type: "text/plain" })); } catch { /* receiver may be unavailable */ }
});
