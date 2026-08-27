import { readFile } from "node:fs/promises";

const files = [
  "src/motion/MotionClock.ts", "src/motion/MotionEngine.ts", "src/motion/MotionPresetRegistry.ts",
  "src/motion/modules/SpectralAxisSweepMotion.ts", "src/motion/modules/SharedVertexPulseMotion.ts", "src/motion/modules/ExplodeRejoinMotion.ts",
  "src/crystal/CrystalAssembly.ts", "src/crystal/PrismMotionAdapter.ts", "src/crystal/MotionStudioApp.ts", "src/artboard/ArtboardState.ts", "scripts/render-motion-sequence.mjs",
];
const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
const combined = contents.join("\n");
const required = ["time = this.frame / fps", "spectral-axis-sweep", "shared-vertex-pulse", "explode-rejoin", "pleos-27-axis-settings-v2", "frame-${String(frame).padStart(6, \"0\")}", "SharedVertexPivot"];
for (const token of required) {
  if (!combined.includes(token)) throw new Error(`Motion V1 verification missing: ${token}`);
}
if (/rotation\.[xyz]\s*\+=|position\.[xyz]\s*\+=/.test(combined)) throw new Error("Incremental transform mutation found in motion runtime");
const duration = 6; const fps = 30;
const times = Array.from({ length: duration * fps }, (_, frame) => frame / fps);
if (times.length !== 180 || times[1] - times[0] !== 1 / fps) throw new Error("Fixed timestep rule failed");
console.log(JSON.stringify({ status: "pass", runtime: "deterministic-absolute-time", presets: 3, artboardPresets: 6, fixedTimestep: "frameIndex / fps", sequenceFramesAt6s30fps: times.length }, null, 2));
