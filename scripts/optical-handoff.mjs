import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const PROJECT_INTENT = `PLEOS 27 Axis is a corporate-promotion key-visual production tool.
The core brand asset is not an individual cube, but the Axis origin, approved angles, and intersection relationship.
Expression is not limited to conventional 3D rendering.
The same Axis identity can support prism 3D, realtime shaders, 2D graphics, motion, and future data-driven expressions.
The system must preserve the shared structural identity while allowing optical and material variation.
Export across square, portrait, landscape, social, and print-oriented formats is a primary requirement.
Production geometry and expression layers should remain separable so new Looks do not erode the Axis contract.`;

function splitItems(value, fallback = []) {
  return value ? String(value).split("|").map((item) => item.trim()).filter(Boolean) : fallback;
}

function markdownList(items, empty = "None known") {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function runGit(projectRoot, args, fallback = "unknown", raw = false) {
  try {
    const output = execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return (raw ? output.replace(/\r?\n$/, "") : output.trim()) || fallback;
  } catch {
    return fallback;
  }
}

function runValidation(projectRoot, name) {
  const startedAt = Date.now();
  const result = spawnSync("npm", ["run", name], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, CI: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`.trim();
  return {
    name,
    command: `npm run ${name}`,
    status: result.status === 0 ? "pass" : "fail",
    durationMs: Date.now() - startedAt,
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    outputTail: output.split("\n").slice(-35).join("\n"),
  };
}

async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function ensureServer(projectRoot, appUrl) {
  if (await reachable(appUrl)) return null;
  const url = new URL(appUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`The configured handoff URL is not reachable: ${appUrl}`);
  }
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", url.port || "41741", "--strictPort"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let output = "";
  let spawnError = null;
  server.on("error", (error) => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => { output = `${output}${chunk}`.slice(-4000); });
  }
  const deadline = Date.now() + 25_000;
  try {
    while (!(await reachable(appUrl))) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error(`Vite exited before becoming ready: ${output}`);
      if (Date.now() > deadline) throw new Error(`Vite did not become ready at ${appUrl}: ${output}`);
      await new Promise((done) => setTimeout(done, 125));
    }
    return server;
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }
}

function fitDimensions(width, height, maxLongEdge) {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error(`Invalid runtime artboard dimensions: ${width} × ${height}`);
  }
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function captureRuntime({ projectRoot, latestDirectory, appUrl, args }) {
  let server;
  let browser;
  let context;
  const result = {
    initialRuntime: null,
    heroRuntime: null,
    previews: [],
    browserErrors: [],
    browserWarnings: [],
    heroTime: null,
    failure: null,
    browserEngine: null,
  };
  try {
    server = await ensureServer(projectRoot, appUrl);
    const hardware = process.env.PLEOS_QA_HARDWARE === "1" || (process.platform === "darwin" && process.env.PLEOS_QA_HARDWARE !== "0");
    const gpuArgs = hardware ? ["--enable-gpu", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] : [];
    try {
      browser = await chromium.launch({ headless: true, ...(hardware ? { channel: "chrome", args: gpuArgs } : {}) });
      result.browserEngine = hardware ? "Chrome with GPU enabled" : "Playwright Chromium";
    } catch (error) {
      if (!hardware) throw error;
      result.browserWarnings.push(`Chrome launch failed; used Playwright Chromium with the same GPU flags: ${error.message}`);
      browser = await chromium.launch({ headless: true, args: gpuArgs });
      result.browserEngine = "Playwright Chromium with GPU enabled";
    }
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
    page.on("pageerror", (error) => result.browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.browserErrors.push(message.text());
    });
    await page.goto(appUrl, { waitUntil: "load" });
    await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true, undefined, { timeout: 30_000 });
    result.initialRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
    if (result.initialRuntime.axis?.cubeCount !== 3) throw new Error("OpticalStudio did not report the required three-cube structure.");
    const duration = Number(result.initialRuntime.motion?.duration);
    const requestedTime = args["hero-time"] === undefined ? NaN : Number(args["hero-time"]);
    result.heroTime = Number.isFinite(requestedTime)
      ? Math.max(0, Math.min(Number.isFinite(duration) ? duration : requestedTime, requestedTime))
      : Number.isFinite(duration) ? duration / 2 : 0;
    await page.evaluate((time) => {
      const api = window.__pleosOptical;
      api.pause();
      api.seek(time);
    }, result.heroTime);
    result.heroRuntime = await page.evaluate(() => window.__pleosOptical.inspect());

    const requestedLimit = Number(args["preview-long-edge"] ?? process.env.PLEOS_HANDOFF_PREVIEW_LONG_EDGE);
    const previewLimit = Number.isFinite(requestedLimit) && requestedLimit >= 128 ? requestedLimit : Infinity;
    const artboard = result.initialRuntime.artboard;
    const previews = [
      { id: "main", file: "preview-main.png", ...fitDimensions(Number(artboard?.width), Number(artboard?.height), Math.min(1080, previewLimit)) },
      { id: "4x5", file: "preview-4x5.png", ...fitDimensions(1080, 1350, previewLimit) },
      { id: "9x16", file: "preview-9x16.png", ...fitDimensions(1080, 1920, previewLimit) },
    ];
    for (const preview of previews) {
      const dataUrl = await page.evaluate(async ({ width, height, time }) => {
        const api = window.__pleosOptical;
        api.pause();
        api.seek(time);
        return api.capture(width, height, 4);
      }, { ...preview, time: result.heroTime });
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
        throw new Error(`OpticalStudio capture did not return a PNG for ${preview.id}.`);
      }
      const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
      const decoded = PNG.sync.read(buffer);
      if (decoded.width !== preview.width || decoded.height !== preview.height) {
        throw new Error(`Capture size mismatch for ${preview.id}: requested ${preview.width} × ${preview.height}, received ${decoded.width} × ${decoded.height}.`);
      }
      await writeFile(resolve(latestDirectory, preview.file), buffer);
      result.previews.push({
        id: preview.id,
        file: `artifacts/latest/${preview.file}`,
        width: decoded.width,
        height: decoded.height,
        heroTime: result.heroTime,
        samples: 4,
        mode: "optical-studio",
        look: result.heroRuntime.state?.preset ?? "optical-glass",
        motionPreset: "light-orbit",
      });
    }
    result.heroRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
  } catch (error) {
    result.failure = error instanceof Error ? error.message : String(error);
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    server?.kill("SIGTERM");
  }
  return result;
}

function makeHandoff({ runtimeState, task, filesChanged, visualChanges, knownIssues, nextWork }) {
  const runtime = runtimeState.runtime;
  const axis = runtime?.axis;
  const motion = runtime?.motion;
  const previews = runtimeState.previews;
  const previewTable = previews.map((preview) => `| \`${preview.file}\` | ${preview.width} × ${preview.height} | ${preview.look} | ${preview.heroTime}s |`).join("\n");
  const validationLines = [
    `npm run typecheck — ${runtimeState.validation.typecheck.toUpperCase()}`,
    `npm run verify — ${runtimeState.validation.verify.toUpperCase()}`,
    `npm run build — ${runtimeState.validation.build.toUpperCase()}`,
    `Browser console — ${runtimeState.validation.browserConsole.toUpperCase()}`,
    `Runtime inspection and three PNG captures — ${runtimeState.validation.runtimeCapture.toUpperCase()}`,
  ];
  const failedRuns = runtimeState.validationRuns.filter((run) => run.status === "fail");
  const failureDetails = failedRuns.map((run) => `### Failed command: ${run.command}\n\nExit code: ${run.exitCode}${run.signal ? `; signal: ${run.signal}` : ""}\n\n\`\`\`text\n${run.outputTail.replaceAll("```", "~~~")}\n\`\`\``).join("\n\n");
  const sharedOrigin = axis?.sharedOrigin === true ? "Yes" : axis?.sharedOrigin === false ? "No; inspect the current gap setting" : "Not confirmed by runtime capture";
  return `# PLEOS 27 Axis — AI Handoff

## Project Intent

${PROJECT_INTENT}

## Active Application

- Entry point: \`src/main.ts\`
- Default route: \`/\`
- Active application: OpticalStudio
- Runtime capture: ${runtime ? "available" : "FAILED; implementation description below is not runtime verification"}
- Renderer: ${runtime?.renderer ?? "Raw WebGL2 optical renderer (runtime not captured)"}
- Projection: ${runtime?.projection ?? "not captured"}
- Main structure: three analytically intersected rounded cubes in the approved Axis relationship.
- Browser API: \`window.__pleosOptical\` — inspect, set, seek, pause, capture and reset.
- Preserved previous application: \`?renderer=studio\`; prior Dimention R3F and the other studio modes are available there.
- Other reference routes: \`?renderer=raw\` and \`?renderer=legacy\`.
- Named draft: \`../pleos-snapshots/pleos-dimension-draft-20260910-155444/\` is immutable and separate from this active application.

## Axis Identity

- Axis family: ${axis?.family ?? "not captured"}
- Cube count: ${axis?.cubeCount ?? "not captured"}
- Shared origin valid: ${sharedOrigin}
- Projected directions: ${(axis?.projectionAngles ?? []).map((angle) => `${angle}°`).join(", ") || "not captured"}
- Geometry source: \`src/optical-studio/AxisGeometry.ts\`; the geometry module preserves the approved unrounded legacy silhouette and common vertex at zero gap.
- Render geometry uses bevel-aware inward radial compensation: at zero gap all three rounded-cube pairs touch without volume overlap. Positive pair clearance is sqrt(3) times gap regardless of bevel. Orientation, canonical depth and assembly centroid are preserved. Pairwise tangency is not a common rounded triple vertex; inspect runtime renderedCenters and surfacesTouch.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Optical Studio

- Role: editable optical glass with colored light reflecting and refracting through the canonical three cubes.
- Implementation: independent Raw WebGL2 renderer, analytic rounded-cube intersections, iterative Snell refraction and Fresnel reflection, and wavelength-dependent RGB dispersion.
- Lighting: four smooth studio emitters share one user-selected HEX colour in manual mode. Optional RGB cycle evaluates three spatially separate colour ribbons per emitter, with 80/10/10 power handover and Pleos secondary colours. Existing negative-fill apertures remain. No surface albedo tint or object emission. Legacy RGB weights are converted once with an original-state backup before overwrite.
- Radiance pipeline: linear FP16 render targets, linear subpixel averaging, bounded highlight bloom, tone mapping, sRGB conversion and spatial AA. Range-compressed RGBA8 is a lower-precision fallback, not equivalent HDR quality.
- Floating render targets active in this capture: ${runtime?.rendering?.hdr === true ? "Yes" : runtime?.rendering?.hdr === false ? "No; packed RGBA8 fallback" : "not captured"}.
- \`surfaceCurvature\` changes an optical shading normal to approximate a polished lens face. It does not deform the actual cube silhouette, intersection geometry or Axis structure; zero preserves flat-face normals.
- Per-cube dimension layers: continuous 0–12 virtual cubical reflection-image layers sampled along rays refracted through the real shell. They are light-only contour fields, not opaque nested solids or new physical interfaces. Fractional last-layer activation fades smoothly; layer positions do not change with count. Spacing, softness and depth falloff are separately adjustable. Some layers can be hidden by angle, occlusion or absorption.
- Real split-ray depth is independent of dimension count. The layer model and its radiance balance are art-directed approximations, not an energy-conserving full spectral path tracer. Secondary transmitted paths through neighbouring cubes stop after at most eight interfaces.
- Main files: \`src/optical-studio/OpticalRenderer.ts\`, \`src/optical-studio/optical.frag.glsl\` and \`src/optical-studio/OpticalResolve.ts\`.
- Settings: the complete captured settings object is preserved in \`artifacts/latest/runtime-state.json\` under \`runtime.state\`.
- The active optical renderer does not use React Three Fiber or the previous studio's material pipeline.
- Optical transport uses finite bounce counts and RGB wavelength sampling; it is not an offline/full spectral path tracer and does not calculate volumetric caustics. No temporal random-noise accumulation is used.

## Motion System

- Runtime: absolute-time optical light loop.
- Optional RGB lead cycle uses a saved phase anchor, quintic transitions and one full green/red/blue sequence per duration. Fractions are incident-light weights, not screen coverage. Default is disabled to preserve existing looks.
- Current duration: ${motion?.duration ?? "not captured"} seconds.
- Deterministic: ${motion?.deterministic === true ? "Yes, reported by the runtime" : "not confirmed by capture"}.
- Captured hero time: ${runtimeState.heroTime ?? "not captured"} seconds; playback is paused before each export.
- Playback state after capture: ${motion?.playing === false ? "paused" : motion?.playing === true ? "playing" : "not captured"}.
- \`seek(time)\` supports deterministic frame inspection. The default loop is 15 seconds.
- OpticalStudio MP4/video and automatic PNG sequence export are not implemented.
- Dimension amounts are continuous animation-ready state, but automatic layer-count modulation has not been added.
- Layer spacing is independently controlled per cube by dimensionSpacingTop / dimensionSpacingLeft / dimensionSpacingRight (0.06–0.3). Missing fields inherit the old shared spacing without a visual reset. Softness and depth falloff remain shared.
- Increasing spacing also widens the gradient tail away from the shared world-space Axis origin. Smooth face-tangent directions avoid medial-axis seams; peak radiance and maximum width are bounded to avoid flat face fill. No new motion or UI control is added.

## Artboard / Export

- Captured artboard: ${runtimeState.artboard ? `${runtimeState.artboard.width} × ${runtimeState.artboard.height} (${runtimeState.artboard.preset ?? "custom"})` : "not captured"}.
- Raster export: exact-size PNG via \`capture(width, height, samples)\` with tiled high-resolution rendering.
- The interface exposes native long-edge 3840px PNG with 4×4 (16) spatial samples averaged in linear light before tone mapping. Canvas2D assembles final pixels only, without display-RGB supersample averaging. Latest handoff previews below use their recorded pixel dimensions and four samples.
- Both preview and export render off-artboard guard bands covering the scaled bloom footprint and spatial-AA reach, then crop. Outer image boundaries and internal tile seams use the same lighting support; output is not an enlarged preview screenshot.
- Main preview retains the active artboard aspect with a maximum long edge of 1080 pixels. Portrait previews default to 1080 × 1350 and 1080 × 1920.
- \`--preview-long-edge\` or \`PLEOS_HANDOFF_PREVIEW_LONG_EDGE\` can reduce preview dimensions; decoded PNG dimensions are recorded and checked.
- Captured renderer limits: ${runtime?.limits ? `\`${JSON.stringify(runtime.limits)}\`` : "not captured"}.
- MP4 is unsupported in this application; no video export is claimed by this handoff.
- PNG is opaque 8-bit sRGB; the new optical engine has no transparent/PPI-aware print or video export UI. Those existing workflows remain in the preserved studio instead.

## Inspector / UI

- OpticalStudio owns a fresh Korean interface with monochrome application controls.
- Collapsible sections: 형태, 디멘션 레이어, 광학, 조명, 카메라, 출력. The bottom transport controls time, loop length, motion extent and artboard aspect.
- 디멘션 레이어 owns three independent fractional slider/number controls and a collapsed spacing/softness/falloff group. 조명 owns a colour picker/HEX/Pleos swatch, optional RGB-cycle checkbox and live power fractions, plus intensity, width, exposure and highlight bloom. 광학 distinguishes lens-normal curvature from geometric bevel and ray budget.
- 레퍼런스 무드 적용 changes optical appearance while retaining the current camera, gap and artboard; the first pre-application local setting is preserved in \`pleos-optical-before-luminous-v1\` rather than replacing the named draft.
- Material, light, motion and output controls edit the independent optical state in \`pleos-optical-studio-v1\`. Browser origins do not share localStorage automatically.
- The artboard and export controls belong to OpticalStudio; prior mode selectors and legacy settings remain in the preserved studio route.
- Main files: \`OpticalStudio.ts\`, \`OpticalPanel.ts\` and \`OpticalStudio.css\` inside \`src/optical-studio/\`.

## Important Files

| File | Responsibility |
| --- | --- |
| \`src/main.ts\` | Default OpticalStudio and preserved reference route selection |
| \`src/optical-studio/OpticalStudio.ts\` | Active application lifecycle and browser inspection/export API |
| \`src/optical-studio/OpticalRenderer.ts\` | Independent WebGL2 renderer and tiled PNG capture |
| \`src/optical-studio/optical.frag.glsl\` | Rounded-cube intersection, optical transport and colored illumination |
| \`src/optical-studio/OpticalResolve.ts\` | Linear HDR targets, supersample averaging, highlight bloom and display resolve |
| \`src/optical-studio/OpticalState.ts\` | Independent optical settings and defaults |
| \`src/optical-studio/OpticalLighting.ts\` | Deterministic RGB lead weights and linear emitter palette |
| \`src/optical-studio/LuminousReference.ts\` | Appearance-only reference mood and pre-application backup key |
| \`src/optical-studio/AxisGeometry.ts\` | Canonical three-cube coordinates and separation |
| \`src/optical-studio/OpticalPanel.ts\` | Korean editing and export controls |
| \`src/optical-studio/OpticalStudio.css\` | Monochrome application layout and appearance |
| \`scripts/verify-optical-geometry.mjs\` | Geometry, common vertex and original silhouette checks |
| \`scripts/verify-optical-dimensions.mjs\` | Continuous layers, unified colour, curvature, persistence and guarded HDR tile verification |
| \`scripts/verify-optical-light-cycle.mjs\` | RGB power continuity, loop, manual roundtrip, UI persistence and captures |
| \`scripts/update-ai-handoff.mjs\` | Dispatches production or explicitly requested legacy handoff |
| \`scripts/optical-handoff.mjs\` | Production runtime capture, validation and current handoff |
| \`src/studio/StudioShell.ts\` | Previous multi-mode studio preserved at ?renderer=studio |

## Latest Task

- User request: ${task.request}
- What changed: ${task.changed}
- Why: ${task.why}
- Main implementation decisions: ${task.decisions}

## Files Changed

${markdownList(filesChanged.map((file) => `\`${file.file}\` — ${file.description}`), "No source files reported for this refresh")}

## Visual Changes

${markdownList(visualChanges, "No intentional visual changes reported")}

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
${previewTable}

${previews.length === 3 ? "All previews were captured in this handoff run." : "Capture is incomplete. Only files listed above were regenerated; other existing preview files must not be treated as current."}

## Validation

${markdownList(validationLines)}

Validation values are generated from commands executed during this handoff. \`NOT-RUN\` is never treated as PASS. A failed command remains failed even if runtime capture succeeds; \`npm run verify\` may stop at its first failing subcommand.

${failureDetails}

## Known Issues

${markdownList(knownIssues)}

## Next Recommended Work

${markdownList(nextWork.slice(0, 5), "No immediate follow-up recommended")}

## ChatGPT Re-scan Notes

- Read \`artifacts/latest/runtime-state.json\` for branch, complete optical settings, Axis, motion, artboard, preview dimensions and validation evidence.
- Inspect \`artifacts/latest/preview-main.png\`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with \`src/optical-studio/OpticalStudio.ts\`, \`OpticalRenderer.ts\` and \`optical.frag.glsl\` for the active application.
- Inspect \`OpticalResolve.ts\` before evaluating output quality; FP16 averaging and bloom occur before display encoding. Dimension sliders bound reflected ray orders, not physical cube count.
- Compare \`surfaceCurvature\` with geometric bevel: the former is an explicit lens-normal approximation and must not be described as physical geometry deformation.
- Use \`window.__pleosOptical\` on the default route. The older \`window.__pleos27Axis\` API belongs to \`?renderer=studio\`.
- Refresh production handoff without \`--mode\`, or with \`--mode optical\`. Pass an explicit prior mode only when intentionally documenting the preserved studio.
- Check Git remote information before assuming this working tree is already connected to \`yubinparkwork/Pleos-27-Axis\`.
`;
}

export async function runOpticalHandoff({ args, projectRoot, detectedRemote, projectPath }) {
  const full = args.full === "true";
  const docsDirectory = resolve(projectRoot, "docs");
  const latestDirectory = resolve(projectRoot, "artifacts/latest");
  const url = new URL(process.env.PLEOS_HANDOFF_URL ?? "http://127.0.0.1:41741/");
  url.searchParams.delete("renderer");
  const appUrl = url.toString();
  const statusBefore = runGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--", "."], "", true)
    .split("\n").filter(Boolean).map((line) => ({ status: line.slice(0, 2).trim() || "??", file: line.slice(3).trim() }));
  const branch = process.env.PLEOS_GIT_BRANCH ?? runGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const sourceBaseCommit = process.env.PLEOS_GIT_BASE ?? runGit(projectRoot, ["rev-parse", "HEAD"]);
  const remote = process.env.PLEOS_GIT_REMOTE ?? detectedRemote;
  const validationRuns = full ? ["typecheck", "verify", "build"].map((name) => runValidation(projectRoot, name)) : [];
  const validation = Object.fromEntries(["typecheck", "verify", "build"].map((name) => [name, validationRuns.find((run) => run.name === name)?.status ?? "not-run"]));
  await mkdir(docsDirectory, { recursive: true });
  await mkdir(latestDirectory, { recursive: true });
  const capture = await captureRuntime({ projectRoot, latestDirectory, appUrl, args });
  validation.browserConsole = capture.browserErrors.length ? "fail" : capture.initialRuntime ? "pass" : "not-run";
  validation.runtimeCapture = capture.failure || capture.previews.length !== 3 ? "fail" : "pass";
  const runtime = capture.heroRuntime ?? capture.initialRuntime;
  const runtimeState = {
    project: "PLEOS 27 Axis",
    generatedAt: new Date().toISOString(),
    git: { root: ".", projectPath, branch, sourceBaseCommit, remote, dirtyBeforeHandoff: statusBefore.length > 0, changedBeforeHandoff: statusBefore },
    app: { entryPoint: "src/main.ts", defaultRoute: "/", activeApplication: "OpticalStudio", renderer: runtime?.renderer ?? null, projection: runtime?.projection ?? null, referenceRoutes: ["?renderer=studio", "?renderer=raw", "?renderer=legacy"] },
    runtime,
    axis: runtime?.axis ?? null,
    artboard: capture.initialRuntime?.artboard ?? null,
    activeExpression: runtime?.state?.preset ?? "optical-glass",
    motion: runtime?.motion ?? null,
    heroTime: capture.heroTime,
    previews: capture.previews,
    validation,
    validationRuns,
    browser: { url: appUrl, engine: capture.browserEngine, consoleErrors: capture.browserErrors, warnings: capture.browserWarnings, captureFailure: capture.failure },
  };
  const explicitFiles = splitItems(args.files ?? process.env.PLEOS_HANDOFF_FILES).map((entry) => {
    const separator = entry.indexOf(":");
    return separator > 0 ? { file: entry.slice(0, separator).trim(), description: entry.slice(separator + 1).trim() } : { file: entry, description: "Changed in the latest task" };
  });
  const task = {
    request: args.task ?? process.env.PLEOS_HANDOFF_TASK ?? "Refresh the AI handoff from the active OpticalStudio runtime.",
    changed: args.changed ?? process.env.PLEOS_HANDOFF_CHANGED ?? "Regenerated optical runtime inspection, latest previews and validation state.",
    why: args.why ?? process.env.PLEOS_HANDOFF_WHY ?? "Keep the handoff synchronized with the application at the default route.",
    decisions: args.decisions ?? process.env.PLEOS_HANDOFF_DECISIONS ?? "Use the independent optical inspection/capture API and deterministic hero time.",
  };
  const knownIssues = splitItems(args.issues ?? process.env.PLEOS_HANDOFF_ISSUES);
  if (capture.failure) knownIssues.unshift(`Latest preview/runtime capture failed: ${capture.failure}`);
  if (capture.browserErrors.length) knownIssues.push(`Browser console reported: ${capture.browserErrors.join(" | ")}`);
  knownIssues.push(...capture.browserWarnings);
  for (const run of validationRuns.filter((run) => run.status === "fail")) {
    knownIssues.push(`${run.command} failed with exit code ${run.exitCode}; see Validation and runtime-state.json for the command output. This failure is not waived.`);
  }
  knownIssues.push("OpticalStudio currently exports PNG stills only; MP4/video and an automatic motion-sequence exporter are unsupported.");
  knownIssues.push("Optical transport is bounded and art-directed: surface curvature uses a shading-normal approximation, secondary paths stop after eight interfaces, and no volumetric caustic/offline path-tracer equivalence is claimed.");
  if (runtime?.rendering?.hdr === false) knownIssues.push("This capture used range-compressed RGBA8 fallback instead of floating render targets; highlight precision is lower than FP16 HDR.");
  const handoff = makeHandoff({
    runtimeState,
    task,
    filesChanged: explicitFiles.length ? explicitFiles : statusBefore.map(({ status, file }) => ({ file, description: `Git status ${status}` })),
    visualChanges: splitItems(args.visual ?? process.env.PLEOS_HANDOFF_VISUAL),
    knownIssues,
    nextWork: splitItems(args.next ?? process.env.PLEOS_HANDOFF_NEXT, ["Review the three latest previews after meaningful visual work.", "Resolve any failed validation commands before treating the full suite as passing."]),
  });
  await writeFile(resolve(latestDirectory, "runtime-state.json"), `${JSON.stringify(runtimeState, null, 2)}\n`);
  await writeFile(resolve(docsDirectory, "AI_HANDOFF.md"), handoff);
  const summary = {
    status: Object.values(validation).includes("fail") ? "fail" : "pass",
    mode: full ? "full" : "fast",
    activeApplication: "OpticalStudio",
    handoff: "docs/AI_HANDOFF.md",
    runtime: "artifacts/latest/runtime-state.json",
    previews: capture.previews.map((preview) => ({ file: preview.file, width: preview.width, height: preview.height })),
    validation,
    branch,
    sourceBaseCommit,
    remote,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status === "fail") process.exitCode = 1;
  return summary;
}
