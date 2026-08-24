import { createAxisGraph, createReferenceFrame, getApprovedAxisDefinition, type AxisGraph } from "../axis";
import type { AxisGraphLike } from "../geometry/FoldSurfaceBuilder";
import { MotionEngine } from "../motion/MotionEngine";
import { PleosRenderer } from "../renderer/PleosRenderer";
import { DEFAULT_STATE, cloneState, type OutputSettings } from "../state/studioState";
import { StillExporter, type ExportProgress } from "./StillExporter";

const receiver = new URLSearchParams(location.search).get("receiver") ?? "http://127.0.0.1:4174";
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Export QA DOM is missing ${selector}`);
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
  const response = await fetch(`${receiver}/artifact`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream", "X-Filename": filename },
    body: blob,
  });
  if (!response.ok) throw new Error(`QA receiver rejected ${filename}: ${response.status}`);
}

async function submitJSON(filename: string, value: unknown): Promise<void> {
  await submit(filename, new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
}

function log(message: string): void {
  status.textContent += `\n${message}`;
}

async function run(): Promise<void> {
  const state = cloneState(DEFAULT_STATE);
  state.showGrid = false;
  state.showAxisGuide = false;
  state.showWireframe = false;
  state.motion.playing = false;
  state.motion.time = 0.875;

  const definition = getApprovedAxisDefinition("axis-30-basic");
  if (!definition) throw new Error("Missing approved axis definition");
  const graph = createAxisGraph(definition, createReferenceFrame(3.5, 2.6), {
    requireApprovedCombination: true,
    snapAnchor: true,
  });
  graph.rays.forEach((ray) => {
    if (state.fold.rayDepth[ray.id] === undefined) state.fold.rayDepth[ray.id] = 0.08 * Math.sin(ray.angleDeg * Math.PI / 180);
  });

  const renderer = new PleosRenderer(canvas, stage);
  const motion = new MotionEngine();
  const exporter = new StillExporter(renderer);
  renderer.setGraph(adaptGraph(graph), state);
  const renderFrame = (): void => {
    const frame = motion.evaluate(state.fold, state.motion);
    renderer.updateFrame(state, frame.fold, frame.layerReveal, frame.sweep, frame.elementTime);
    renderer.render();
  };
  renderFrame();

  const progress: Array<ExportProgress & { output: string }> = [];
  const stillSettings: OutputSettings = {
    width: 2800,
    height: 2080,
    format: "png",
    supersampling: 1,
    transparent: false,
    quality: "high",
  };

  try {
    log("Rendering 2800×2080 PNG");
    const png = await exporter.createStillBlob(stillSettings, (entry) => progress.push({ ...entry, output: "png" }));
    await submit("pleos-27-axis-master-2800x2080.png", png);

    log("Rendering half-float EXR");
    const exr = await exporter.createStillBlob({ ...stillSettings, format: "exr" }, (entry) => progress.push({ ...entry, output: "exr" }));
    await submit("pleos-27-axis-master-2800x2080.exr", exr);

    log("Rendering fixed-timestep 60-frame PNG ZIP");
    const originalTime = state.motion.time;
    const sampledTimes: number[] = [];
    const sequence = await exporter.exportMotionSequence({
      width: 960,
      height: 540,
      frameRate: 30,
      frames: 60,
      download: false,
      getTime: () => state.motion.time,
      setTime: (time) => {
        state.motion.time = time;
        if (time !== originalTime) sampledTimes.push(time);
      },
      renderFrame,
    }, (entry) => progress.push({ ...entry, output: "sequence" }));
    await submit("pleos-27-axis-preview-60frames.zip", sequence);

    const report = {
      status: "complete",
      renderer: renderer.inspect(),
      still: { width: 2800, height: 2080, pngBytes: png.size, exrBytes: exr.size, exrStorage: "RGBA half-float scene-linear" },
      sequence: {
        width: 960,
        height: 540,
        frames: 60,
        frameRate: 30,
        firstTime: sampledTimes[0],
        lastTime: sampledTimes[59],
        restoredTime: state.motion.time,
        expectedRestoredTime: originalTime,
        zipBytes: sequence.size,
      },
      progress,
      userAgent: navigator.userAgent,
    };
    await submitJSON("export-runtime-report.json", report);
    status.textContent = "QA_COMPLETE";
    document.title = "QA_COMPLETE";
  } finally {
    renderer.dispose();
  }
}

run().catch(async (error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  status.textContent = `QA_FAILED\n${message}`;
  document.title = "QA_FAILED";
  try { await submitJSON("export-runtime-error.json", { status: "failed", message }); } catch { /* receiver may be the failure */ }
});
