import { spawn, spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const expectedRepository = "github.com/yubinparkwork/Pleos-27-Axis";
const gitRoot = runGit(["rev-parse", "--show-toplevel"]);
const detectedRemote = runGit(["remote", "get-url", "origin"], "no-origin");
if (resolve(gitRoot) !== projectRoot || !detectedRemote.includes(expectedRepository)) {
  throw new Error(`Handoff repository mismatch: expected ${projectRoot} → yubinparkwork/Pleos-27-Axis, received ${gitRoot} → ${detectedRemote}`);
}
const projectPath = relative(gitRoot, projectRoot) || ".";
const docsDirectory = resolve(projectRoot, "docs");
const latestDirectory = resolve(projectRoot, "artifacts/latest");
const appUrl = process.env.PLEOS_HANDOFF_URL ?? "http://127.0.0.1:41741/";

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    parsed[key] = values[index + 1] && !values[index + 1].startsWith("--") ? values[++index] : "true";
  }
  return parsed;
}

function runGit(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function runGitRaw(args, fallback = "") {
  try {
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\r?\n$/, "");
  } catch {
    return fallback;
  }
}

function splitItems(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split("|").map((item) => item.trim()).filter(Boolean);
}

function markdownList(items, empty = "None known") {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function normalizeStatusLine(line) {
  const status = line.slice(0, 2).trim() || "??";
  const file = line.slice(3).trim();
  return { status, file };
}

function runValidation(name, command) {
  const startedAt = Date.now();
  const result = spawnSync("npm", ["run", command], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, CI: "1" },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const tail = output.split("\n").slice(-12).join("\n");
  return {
    name,
    command: `npm run ${command}`,
    status: result.status === 0 ? "pass" : "fail",
    durationMs: Date.now() - startedAt,
    exitCode: result.status ?? 1,
    outputTail: tail,
  };
}

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(appUrl)) return null;
  const port = new URL(appUrl).port || "41741";
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  const deadline = Date.now() + 25_000;
  while (!(await reachable(appUrl))) {
    if (server.exitCode !== null) throw new Error("Vite dev server exited before becoming ready.");
    if (Date.now() > deadline) throw new Error(`Vite dev server did not become ready at ${appUrl}`);
    await new Promise((done) => setTimeout(done, 125));
  }
  return server;
}

function decodePng(dataUrl) {
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Runtime export did not return a PNG data URL.");
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function captureRuntime(options = {}) {
  const server = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  try {
    await page.goto(appUrl, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready), undefined, { timeout: 20_000 });
    const requestedMode = options.mode ?? "glass-3d";
    await page.evaluate((mode) => window.__pleos27Axis.switchMode(mode), requestedMode);
    await page.waitForFunction((mode) => window.__pleos27Axis?.getActiveMode() === mode, requestedMode);
    await page.waitForFunction(() => window.__pleos27Axis?.inspect().ready === true, undefined, { timeout: 20_000 });
    let initialRuntime = await page.evaluate(() => window.__pleos27Axis.inspect());
    const activeLook = options.look ?? initialRuntime.assembly?.look ?? initialRuntime.preset ?? "iridescent-pulse";
    const activeMotionPreset = options.motion ?? initialRuntime.motion?.preset ?? initialRuntime.motion?.kind ?? (requestedMode === "light-field" ? "field-loop" : requestedMode === "dimention-r3f" ? "pleos-light-orbit" : "off");
    const duration = Number(initialRuntime.motion?.duration ?? 9);
    const requestedHeroTime = Number(options.heroTime);
    const heroTime = Number.isFinite(requestedHeroTime) ? Math.max(0, Math.min(duration, requestedHeroTime)) : activeMotionPreset === "off" ? 0 : duration * 0.5;

    await page.evaluate(({ mode, look, preset, durationSeconds, time }) => {
      const api = window.__pleos27Axis;
      if (mode === "light-field") api.setLightFieldPreset(look);
      else if (mode === "glass-prism") api.setGlassPrismPreset(look);
      else if (mode === "kinetic-glass") api.setKineticGlassPreset(look);
      else if (mode === "dimention-r3f") api.modeApi("dimention-r3f").command("setPreset", look);
      else {
        api.setRenderRegion({ enabled: false }); api.setLook(look);
        if (preset !== "off") api.setMotionPreset(preset);
        api.configureMotion({ duration: durationSeconds, loop: true, constraint: "strict" });
      }
      api.pause();
      api.seek(time);
    }, { mode: requestedMode, look: activeLook, preset: activeMotionPreset, durationSeconds: duration, time: heroTime });
    initialRuntime = await page.evaluate(() => window.__pleos27Axis.inspect());

    const requestedPreviews = [
      { id: "main", file: "preview-main.png", width: Number(initialRuntime.artboard?.width ?? 1080), height: Number(initialRuntime.artboard?.height ?? 1080) },
      { id: "4x5", file: "preview-4x5.png", width: 1080, height: 1350 },
      { id: "9x16", file: "preview-9x16.png", width: 1080, height: 1920 },
    ];
    const previews = [];
    for (const preview of requestedPreviews) {
      const dataUrl = await page.evaluate(async ({ width, height, time }) => {
        const api = window.__pleos27Axis;
        api.setArtboard({ id: "custom", width, height });
        api.pause();
        api.seek(time);
        return api.exportPng(false);
      }, { ...preview, time: heroTime });
      const buffer = decodePng(dataUrl);
      const decoded = PNG.sync.read(buffer);
      await writeFile(resolve(latestDirectory, preview.file), buffer);
      previews.push({
        id: preview.id,
        file: `artifacts/latest/${preview.file}`,
        width: decoded.width,
        height: decoded.height,
        heroTime,
        look: activeLook,
        motionPreset: activeMotionPreset,
        mode: requestedMode,
      });
    }

    await page.evaluate(({ width, height, time }) => {
      const api = window.__pleos27Axis;
      api.setArtboard({ id: "custom", width, height });
      api.pause();
      api.seek(time);
    }, { width: requestedPreviews[0].width, height: requestedPreviews[0].height, time: heroTime });
    const heroRuntime = await page.evaluate(() => window.__pleos27Axis.inspect());
    await page.waitForTimeout(150);
    return { initialRuntime, heroRuntime, previews, browserErrors, heroTime };
  } finally {
    await context.close();
    await browser.close();
    server?.kill("SIGTERM");
  }
}

function lookDescription(look, strategies) {
  const details = {
    clear: ["Neutral clear optical glass", "MeshPhysicalMaterial preset", "src/crystal/CrystalAssembly.ts"],
    prism: ["Primary optical prism expression", "MeshPhysicalMaterial with dispersion", "src/crystal/CrystalAssembly.ts"],
    "spectral-flow": ["Axis-driven moving spectral light field", "MeshPhysicalMaterial.onBeforeCompile custom GLSL", "src/crystal/materials/SpectralFlowMaterial.ts"],
    "soft-spectral": ["Soft center-led optical field with blue/cyan spectral response", "Independent MeshPhysicalMaterial.onBeforeCompile custom GLSL", "src/crystal/materials/SoftSpectralMaterial.ts"],
    smoked: ["Dark smoked optical glass", "MeshPhysicalMaterial preset", "src/crystal/CrystalAssembly.ts"],
  };
  const [role, implementation, file] = details[look] ?? ["Runtime Look", "Inspect active source", "src/crystal/CrystalAssembly.ts"];
  return { look, role, implementation, file, strategy: strategies?.[look] ?? "unknown", motion: true };
}

function makeHandoff({ runtimeState, task, filesChanged, visualChanges, knownIssues, nextWork }) {
  const runtime = runtimeState.runtime ?? {};
  const app = runtime.app ?? {};
  const assembly = runtime.assembly ?? {};
  const motion = runtime.motion ?? {};
  const isLightField = runtime.studioMode?.activeMode === "light-field";
  const isGlassPrism = runtime.studioMode?.activeMode === "glass-prism";
  const isKineticGlass = runtime.studioMode?.activeMode === "kinetic-glass";
  const isDimentionR3F = runtime.studioMode?.activeMode === "dimention-r3f";
  const looks = (assembly.supportedLooks ?? []).map((look) => lookDescription(look, assembly.renderStrategies));
  const validation = runtimeState.validation;
  const validationLines = [
    `npm run typecheck — ${validation.typecheck.toUpperCase()}`,
    `npm run verify — ${validation.verify.toUpperCase()}`,
    `npm run build — ${validation.build.toUpperCase()}`,
    `Browser console — ${validation.browserConsole.toUpperCase()}`,
  ];
  const previewTable = runtimeState.previews.map((preview) => `| \`${preview.file}\` | ${preview.width} × ${preview.height} | ${preview.look} | ${preview.heroTime}s |`).join("\n");
  const glassLookSections = looks.map((look) => `### ${look.look === "spectral-flow" ? "Spectral Flow" : look.look === "soft-spectral" ? "Soft Spectral" : look.look[0].toUpperCase() + look.look.slice(1)}

- Role: ${look.role}
- Implementation: ${look.implementation}
- Main file: \`${look.file}\`
- Render strategy: ${look.strategy}
- Motion support: ${look.motion ? "Yes, via the shared Motion system" : "No"}`).join("\n\n");
  const lightFieldSection = `### Light Field

- Role: Cables-inspired iridescent membrane mapped across the canonical three-cube Axis structure
- Implementation: independent WebGL2 rounded-cube ray intersection with a world-space warped void, white crest, spectral layers and deterministic periodic motion
- Main files: \`src/modes/light-field/LightFieldMode.ts\`, \`LightFieldRenderer.ts\`, \`shaders/field.frag.glsl\`
- Render strategy: realtime raster WebGL2; no Three.js and no path tracing
- Presets: Iridescent Pulse, Violet Membrane, Spectral White
- Motion support: Yes, absolute-time configurable 8–16 second loop`;
  const glassPrismSection = `### Glass Prism

- Role: three-solid optical refraction of editable background typography
- Implementation: independent Raw WebGL2 ray-box renderer using front/back thickness, RGB Snell refraction and Fresnel response
- Main files: \`src/modes/glass-prism/GlassPrismMode.ts\`, \`GlassPrismRenderer.ts\`, \`shaders/prism.frag.glsl\`
- Render strategy: realtime raster WebGL2 with deterministic exact-size PNG output
- Presets: Clear Glass, RGB Prism, Frosted Prism, Dark Crystal
- Motion support: Yes, rotation, shared-corner pulse and explode/rejoin`;
  const kineticGlassSection = `### Kinetic Glass

- Role: interactive optical-glass expression of the canonical PLEOS three-cube structure
- Implementation: Three.js MeshPhysicalMaterial with zero-gravity Rapier rigid bodies, bounded pointer repulsion and spring return
- Main files: \`src/modes/kinetic-glass/KineticGlassMode.ts\`, \`KineticGlassRenderer.ts\`, \`KineticGlassPanel.ts\`
- Render strategy: realtime Three.js raster, PMREM studio environment and restrained bloom
- Presets: Clear Attraction, PLEOS Prism, Dark Mass
- Motion support: Yes, live pointer interaction with stable return to the approved 30° rest positions`;
  const dimentionR3FSection = `### Dimention R3F

- Role: fast, noise-free optical-glass version of the canonical Glass 3D composition
- Implementation: React Three Fiber MeshTransmissionMaterial, Environment Lightformers, moving Pleos RGB RectAreaLights, N8AO, MSAA and restrained Bloom
- Main files: \`src/modes/dimention-r3f/DimentionR3FMode.ts\`, \`DimentionR3FScene.tsx\`, \`DimentionR3FRenderer.tsx\`
- Geometry: cloned from \`CrystalAssembly\`, including its shared-corner and bevel-aware screen-gap compensation
- Render strategy: realtime Three.js WebGL raster; no Monte Carlo accumulation and no path tracing
- Presets: PLEOS Prism, Clear Studio, Dark Glass
- Motion support: Yes, deterministic RGB/white light orbit with timeline playback and seek`;
  const lookSections = [glassLookSections, dimentionR3FSection, lightFieldSection, glassPrismSection, kineticGlassSection].filter(Boolean).join("\n\n");
  const formats = (runtime.artboardPresets ?? []).map((format) => `${format.label} (${format.width} × ${format.height})`);
  const formatSummary = formats.length ? formats.join("; ") : runtimeState.previews.map((preview) => `${preview.id} (${preview.width} × ${preview.height})`).join("; ");
  const motionPresets = (runtime.motionPresets ?? []).map((preset) => `${preset.id} — ${preset.duration}s, ${preset.constraint}`);
  const motionRuntime = isLightField ? "LightFieldMode absolute-time field clock" : isGlassPrism ? "GlassPrismMode absolute-time optical motion clock" : isKineticGlass ? "Rapier fixed-step rigid-body clock with spring attraction" : isDimentionR3F ? "R3F absolute-time Pleos light-orbit clock" : "`MotionEngine` + `MotionClock`";
  const motionPresetSummary = motionPresets.length ? motionPresets.join("; ") : isLightField ? "field-loop — 9s seamless loop" : isGlassPrism ? "rotate; shared-pulse; explode-rejoin" : isKineticGlass ? "pointer repulsion + spring attraction" : isDimentionR3F ? "Pleos RGB/white light orbit — 9s loop" : "None reported";

  return `# PLEOS 27 Axis — AI Handoff

## Project Intent

PLEOS 27 Axis is a corporate-promotion key-visual production tool.
The core brand asset is not an individual cube, but the Axis origin, approved angles, and intersection relationship.
Expression is not limited to conventional 3D rendering.
The same Axis identity can support prism 3D, realtime shaders, 2D graphics, motion, and future data-driven expressions.
The system must preserve the shared structural identity while allowing optical and material variation.
Export across square, portrait, landscape, social, and print-oriented formats is a primary requirement.
Production geometry and expression layers should remain separable so new Looks do not erode the Axis contract.

## Active Application

- Entry point: \`${app.entryPoint ?? "src/main.ts"}\`
- Default route: \`${app.defaultRoute ?? "/"}\`
- Active application: ${isLightField ? "LightFieldMode" : isGlassPrism ? "GlassPrismMode" : isKineticGlass ? "KineticGlassMode" : isDimentionR3F ? "DimentionR3FMode" : app.activeApplication ?? "MotionStudioApp"}
- Renderer: ${app.renderer ?? runtime.renderer}
- Preview: ${isLightField ? "custom WebGL2 continuous field" : isGlassPrism ? "custom Raw WebGL2 thickness-aware refraction" : isKineticGlass ? "Three.js physical-glass raster with Rapier interaction" : isDimentionR3F ? "R3F realtime transmission glass with Lightformers and N8AO" : app.previewRenderer ?? "Three.js raster preview"}
- Projection: ${isLightField || isGlassPrism || isKineticGlass ? runtime.projection : `${app.projection ?? "orthographic"} (${app.camera?.type ?? "unknown"})`}
- Main structure: ${isLightField ? "three canonical Axis lobes sharing one origin in normalized artboard space" : isGlassPrism ? "three ray-intersected optical cubes meeting at one shared corner" : isKineticGlass ? "three physical glass cubes attracted to canonical 90° / 210° / 330° rest positions" : isDimentionR3F ? "three CrystalAssembly-derived optical solids with the canonical bevel-aware visual gap" : app.sceneStructure ?? "3 optical solids at a shared vertex"}
- Studio mode: ${runtime.studioMode?.modeLabel ?? "Glass 3D"} (renderer lifecycle owned by the active Mode)
- Legacy routes: \`?renderer=raw\` and \`?renderer=legacy\` — Legacy / reference only

## Axis Identity

- Axis family: 30deg
- Shared origin valid: ${isLightField ? "Yes, sourced from src/axis" : isKineticGlass ? runtime.sharedOrigin === true ? "Yes" : "No" : runtime.sharedVertexValid === true ? "Yes" : "No"}
- Shared-origin contract: ${assembly.sharedCorner ? `[${assembly.sharedCorner.join(", ")}]` : "runtime-controlled"}
- Projected directions: ${isLightField ? "derived from axis-30-basic at runtime" : (assembly.projectedAxisAngles ?? []).map((angle) => `${angle}°`).join(", ") || "30° family, geometry-derived at runtime"}
- Geometry relationship: ${isLightField ? "three continuous field lobes share one origin; renderer-local angles are not hardcoded" : "three closed optical solids meet at one shared vertex."}
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

${lookSections}

## Motion System

- Runtime: ${motionRuntime}
- Current preset: \`${motion.preset ?? (isLightField ? "field-loop" : "off")}\`
- Available presets: ${motionPresetSummary}
- Determinism: absolute-time evaluation; fixed export time is \`frameIndex / fps\`.
- Current duration / FPS: ${motion.duration ?? "unknown"}s / ${motion.fps ?? (isLightField ? 30 : "unknown")} fps
- Playback: realtime raster preview.
- Sequence export: fixed-timestep raster PNG frames.
- Path-traced stills: ${isLightField ? "Not supported by this Mode." : "current absolute motion frame is synchronized before accumulation."}

## Artboard / Export

- Virtual artboard: Yes; framing is independent from viewport and Inspector width.
- Supported formats: ${formatSummary}
- Raster PNG: ${isLightField ? "exact artboard pixels with optional transparency." : "exact artboard or render-region pixels."}
- Path-traced still: Glass 3D Clear, Prism, and Smoked only; absent from Light Field workflow.
- High-resolution raster: ${isLightField ? "Light Field exact-size WebGL2 output." : "Spectral Flow and Soft Spectral."}
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- Top bar — Mode, Variation and the primary Export action.
- Active Inspector — ${isLightField ? "Preset, Flow Structure, Color/Light and Motion in task order, with advanced surface controls collapsed." : "Style, Material, Lighting and Motion essentials in one continuous panel."}
- Contextual details — ${isLightField ? "membrane scale, warped void, white rim, spectral layers, artboard, transparency, PPI and deterministic sequence output." : "material, lighting, geometry, camera, motion, output, render region and print metadata."}
- Output — format, size, background, transparency and Mode-adapted export.
- Technical values stay collapsed until explicitly requested.

## Important Files

| File | Responsibility |
| --- | --- |
| \`src/main.ts\` | Production route selection and browser inspection/export API |
| \`src/studio/StudioShell.ts\` | Common Mode lifecycle and active Mode state ownership |
| \`src/studio/ModeRegistry.ts\` | Registered production Mode definitions |
| \`src/studio/ModeTypes.ts\` | Mode instance, capability and export-adapter contracts |
| \`src/modes/glass-3d/Glass3DMode.ts\` | First production Mode; owns the current Three.js optical environment |
| \`src/modes/glass-3d/Glass3DExportAdapter.ts\` | Maps common output intent to Glass 3D render strategies |
| \`src/modes/dimention-r3f/DimentionR3FMode.ts\` | Independent realtime R3F mode lifecycle, state and export |
| \`src/modes/dimention-r3f/DimentionR3FScene.tsx\` | Transmission glass, Lightformer studio, RGB light motion, N8AO and Bloom |
| \`src/modes/dimention-r3f/DimentionR3FState.ts\` | Presets and isolated serializable realtime mode state |
| \`src/modes/light-field/LightFieldMode.ts\` | Independent Light Field lifecycle, state, motion and variations |
| \`src/modes/light-field/LightFieldRenderer.ts\` | Raw WebGL2 fullscreen renderer and exact-size raster output |
| \`src/modes/light-field/PngMetadata.ts\` | Print PPI metadata injection for Light Field PNG output |
| \`src/modes/light-field/shaders/field.frag.glsl\` | Continuous inward field, spectral response, seams and origin compression |
| \`src/modes/glass-prism/GlassPrismMode.ts\` | Glass Prism lifecycle, state, variations, camera interaction and export |
| \`src/modes/glass-prism/GlassPrismRenderer.ts\` | Raw WebGL2 thickness-aware RGB refraction renderer |
| \`src/modes/glass-prism/shaders/prism.frag.glsl\` | Ray-box intersections, Snell refraction, Fresnel and dispersion |
| \`src/crystal/MotionStudioApp.ts\` | Active scene, renderer lifecycle, UI binding, motion and export strategy |
| \`src/crystal/CrystalAssembly.ts\` | Three-solid Axis geometry, physical Looks and shared-origin contract |
| \`src/crystal/materials/SpectralFlowMaterial.ts\` | Independent Spectral Flow shader expression |
| \`src/crystal/PrismMotionAdapter.ts\` | Applies deterministic motion patches to the three solids |
| \`src/crystal/LightingSystem.ts\` | Dynamic studio lighting and Pleos lighting presets |
| \`src/crystal/StudioEnvironment.ts\` | Environment and studio reflection setup |
| \`src/crystal/ui/StudioPanel.ts\` | Active Inspector markup and controls |
| \`src/crystal/CrystalApp.css\` | Production application and Inspector styling |
| \`src/motion/MotionEngine.ts\` | Absolute-time motion evaluation |
| \`src/motion/MotionClock.ts\` | Realtime and fixed-frame time source |
| \`src/motion/MotionPresetRegistry.ts\` | Active motion preset registry |
| \`src/axis/angles.ts\` | Canonical Axis direction families |
| \`src/artboard/FormatPresetRegistry.ts\` | Supported output formats |
| \`src/artboard/CompositionAdapter.ts\` | Viewport-independent artboard framing |
| \`scripts/render-motion-sequence.mjs\` | Fixed-timestep PNG sequence exporter |
| \`scripts/update-ai-handoff.mjs\` | Generates this handoff, runtime state and latest previews |

## Latest Task

- User request: ${task.request}
- What changed: ${task.changed}
- Why: ${task.why}
- Main implementation decisions: ${task.decisions}

## Files Changed

${markdownList(filesChanged.map((file) => `\`${file.file}\` — ${file.description}`), "No source files reported for this refresh")}

## Visual Changes

${visualChanges.length ? markdownList(visualChanges) : "No intentional visual changes"}

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
${previewTable}

## Validation

${markdownList(validationLines)}

Validation values are generated from commands executed during this handoff. \`NOT-RUN\` is never treated as PASS.

## Known Issues

${markdownList(knownIssues)}

## Next Recommended Work

${markdownList(nextWork.slice(0, 5), "No immediate follow-up recommended")}

## ChatGPT Re-scan Notes

- Read \`artifacts/latest/runtime-state.json\` for machine-readable branch, runtime, Look, motion, artboard, preview and validation state.
- Inspect \`artifacts/latest/preview-main.png\`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with \`src/studio/StudioShell.ts\`, then compare \`src/modes/glass-3d/Glass3DMode.ts\` and \`src/modes/light-field/LightFieldMode.ts\` as independent production Modes.
- Compare \`src/crystal/materials/SpectralFlowMaterial.ts\` with physical Look handling in \`src/crystal/CrystalAssembly.ts\`.
- Check Git remote information before assuming this working tree is already connected to \`yubinparkwork/Pleos-27-Axis\`.
`;
}

const args = parseArguments(process.argv.slice(2));
const full = args.full === "true";
const validationRuns = full
  ? [runValidation("typecheck", "typecheck"), runValidation("verify", "verify"), runValidation("build", "build")]
  : [];
const validation = {
  typecheck: validationRuns.find((run) => run.name === "typecheck")?.status ?? "not-run",
  verify: validationRuns.find((run) => run.name === "verify")?.status ?? "not-run",
  build: validationRuns.find((run) => run.name === "build")?.status ?? "not-run",
  browserConsole: "not-run",
};

await mkdir(docsDirectory, { recursive: true });
await mkdir(latestDirectory, { recursive: true });

const statusBefore = runGitRaw(["status", "--porcelain=v1", "--untracked-files=all", "--", "."], "")
  .split("\n").filter(Boolean).map(normalizeStatusLine);
// This project can be embedded in a larger workshop repository. Explicit
// metadata keeps the handoff tied to the production Pleos repository rather
// than accidentally reporting the parent workspace remote.
const branch = process.env.PLEOS_GIT_BRANCH ?? runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
const sourceBaseCommit = process.env.PLEOS_GIT_BASE ?? runGit(["rev-parse", "HEAD"]);
const remote = process.env.PLEOS_GIT_REMOTE ?? detectedRemote;
let capture;
let captureFailure = null;
try {
  capture = await captureRuntime({ mode: args.mode, look: args.look, motion: args.motion, heroTime: args["hero-time"] });
  validation.browserConsole = capture.browserErrors.length ? "fail" : "pass";
} catch (error) {
  captureFailure = error instanceof Error ? error.message : String(error);
  validation.browserConsole = "fail";
  capture = { initialRuntime: null, heroRuntime: null, previews: [], browserErrors: [captureFailure], heroTime: null };
}

const generatedAt = new Date().toISOString();
const capturedRuntime = capture.heroRuntime ?? capture.initialRuntime;
const capturedMode = capturedRuntime?.studioMode?.activeMode ?? null;
const capturedIsLightField = capturedMode === "light-field";
const capturedIsGlassPrism = capturedMode === "glass-prism";
const capturedIsKineticGlass = capturedMode === "kinetic-glass";
const capturedIsDimentionR3F = capturedMode === "dimention-r3f";
const runtimeState = {
  project: "PLEOS 27 Axis",
  generatedAt,
  git: {
    root: ".",
    projectPath,
    branch,
    sourceBaseCommit,
    remote,
    dirtyBeforeHandoff: statusBefore.length > 0,
    changedBeforeHandoff: statusBefore,
  },
  app: capturedRuntime?.app ?? (capturedRuntime ? {
    entryPoint: "src/main.ts",
    defaultRoute: "/",
    activeApplication: capturedIsLightField ? "LightFieldMode" : capturedIsGlassPrism ? "GlassPrismMode" : capturedIsKineticGlass ? "KineticGlassMode" : capturedIsDimentionR3F ? "DimentionR3FMode" : "Glass3DMode",
    renderer: capturedRuntime.renderer,
    projection: capturedRuntime.projection,
  } : null),
  runtime: capturedRuntime,
  axis: capturedRuntime ? {
    family: "30deg",
    sharedOrigin: capturedIsLightField ? capturedRuntime.axis?.sharedOrigin === true : capturedIsKineticGlass ? capturedRuntime.sharedOrigin === true : capturedIsDimentionR3F ? capturedRuntime.axis?.sharedOrigin === true : capturedRuntime.sharedVertexValid === true,
    projectionAngles: capturedRuntime.assembly?.projectedAxisAngles ?? capturedRuntime.axis?.projectedAngles ?? [],
    source: capturedRuntime.axis?.source ?? "src/axis",
  } : null,
  artboard: capture.initialRuntime?.artboard ?? null,
  looks: capturedRuntime?.assembly?.supportedLooks ?? (capturedIsLightField ? ["iridescent-pulse", "violet-membrane", "spectral-white"] : capturedIsKineticGlass ? ["clear-attraction", "pleos-prism", "dark-mass"] : capturedIsDimentionR3F ? ["pleos-prism", "clear-studio", "dark-glass"] : []),
  motionPresets: capturedRuntime?.motionPresets ?? (capturedIsLightField ? ["field-loop"] : capturedIsKineticGlass ? ["pointer-attraction"] : capturedIsDimentionR3F ? ["pleos-light-orbit"] : []),
  activeExpression: capturedRuntime?.assembly?.look ?? capturedRuntime?.preset ?? null,
  motion: capturedRuntime?.motion ?? null,
  previews: capture.previews,
  validation,
  validationRuns,
  browser: { url: appUrl, consoleErrors: capture.browserErrors },
};

await writeFile(resolve(latestDirectory, "runtime-state.json"), `${JSON.stringify(runtimeState, null, 2)}\n`);

const explicitFiles = splitItems(args.files ?? process.env.PLEOS_HANDOFF_FILES).map((entry) => {
  const separator = entry.indexOf(":");
  return separator > 0 ? { file: entry.slice(0, separator).trim(), description: entry.slice(separator + 1).trim() } : { file: entry, description: "Changed in the latest task" };
});
const inferredFiles = statusBefore.map(({ status, file }) => ({ file, description: `Git status ${status}` }));
const requestedTask = {
  request: args.task ?? process.env.PLEOS_HANDOFF_TASK ?? "Refresh the AI handoff from the active production runtime.",
  changed: args.changed ?? process.env.PLEOS_HANDOFF_CHANGED ?? "Regenerated runtime inspection, latest previews, validation state, and the current-state handoff.",
  why: args.why ?? process.env.PLEOS_HANDOFF_WHY ?? "Keep ChatGPT and Codex synchronized without manually copying project context.",
  decisions: args.decisions ?? process.env.PLEOS_HANDOFF_DECISIONS ?? "Use the production inspect/export API and deterministic hero time; do not capture editor UI.",
};
const visualChanges = splitItems(args.visual ?? process.env.PLEOS_HANDOFF_VISUAL);
const knownIssues = splitItems(args.issues ?? process.env.PLEOS_HANDOFF_ISSUES);
if (captureFailure) knownIssues.unshift(`Latest preview/runtime capture failed: ${captureFailure}`);
if (capture.browserErrors.length) knownIssues.push(`Browser console reported: ${capture.browserErrors.join(" | ")}`);
const defaultNextWork = [
  "Review the three latest previews after meaningful visual work.",
  "Run handoff:full at the end of completed implementation work.",
];
const nextWork = splitItems(args.next ?? process.env.PLEOS_HANDOFF_NEXT, defaultNextWork);
const handoff = makeHandoff({
  runtimeState,
  task: requestedTask,
  filesChanged: explicitFiles.length ? explicitFiles : inferredFiles,
  visualChanges,
  knownIssues,
  nextWork,
});
await writeFile(resolve(docsDirectory, "AI_HANDOFF.md"), handoff);

const summary = {
  status: captureFailure || Object.values(validation).includes("fail") ? "fail" : "pass",
  mode: full ? "full" : "fast",
  handoff: "docs/AI_HANDOFF.md",
  runtime: "artifacts/latest/runtime-state.json",
  previews: capture.previews.map((preview) => preview.file),
  validation,
  branch,
  sourceBaseCommit,
  remote,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.status === "fail") process.exitCode = 1;
