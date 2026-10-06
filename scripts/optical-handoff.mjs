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
    // Capture may seek/pause/edit its isolated scene, but must never publish
    // those QA values back to the artist's cross-browser shared settings.
    await page.route('**/__pleos/optical-state**', route =>
      route.request().method()==='GET' ? route.continue() : route.fulfill({status:204}));
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
    page.on("pageerror", (error) => result.browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.browserErrors.push(message.text());
    });
    await page.goto(appUrl, { waitUntil: "load" });
    await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true, undefined, { timeout: 30_000 });
    if (args["camera-motion"] !== undefined) {
      const enabled = Number(args["camera-motion"]);
      if (![0, 1].includes(enabled)) throw new Error('--camera-motion must be 0 or 1');
      await page.evaluate(cameraMotion => window.__pleosOptical.set({ cameraMotion }), enabled);
    }
    result.initialRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
    if (args["axis-motion"] !== undefined) {
      const enabled = Number(args["axis-motion"]);
      if (![0,1].includes(enabled)) throw new Error('--axis-motion must be 0 or 1');
      await page.evaluate(axisMotion => window.__pleosOptical.set({axisMotion,cameraMotion:0}),enabled);
      result.initialRuntime = await page.evaluate(() => window.__pleosOptical.inspect());
    }
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
        look: result.heroRuntime.hybrid?.look ?? result.heroRuntime.rendering?.expression ?? result.heroRuntime.state?.preset ?? "not-captured",
        motionPreset: result.heroRuntime.motion?.kind ?? "not-captured",
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
- Captured look: ${runtime?.hybrid?.look ?? runtimeState.activeExpression ?? "not captured"}; the default B route remains \`/\`.
- Runtime capture: ${runtime ? "available" : "FAILED; implementation description below is not runtime verification"}
- Renderer: ${runtime?.renderer ?? "Raw WebGL2 dimension renderer (runtime not captured)"}
- Projection: ${runtime?.projection ?? "not captured"}
- Main structure: three analytically intersected rounded cubes in the approved Axis relationship.
- Browser API: \`window.__pleosOptical\` — inspect, set, seek, pause, capture, exportVideo, cancelVideo and reset.
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

- Role: editable virtual optical reflection layers on the approved three-cube Axis structure. The pre-emission reflection expression has been restored from saved-20260915085224893; saved settings and the later native MP4 workflow remain intact.
- Implementation: independent Raw WebGL2 analytic optical-image renderer. Active expression: ${runtime?.rendering?.expression ?? 'not captured'}; emission enabled: ${runtime?.rendering?.emission ?? 'not captured'}; physical-shell radiance: ${runtime?.rendering?.shellRadiance ?? 'not captured'}. Virtual image rays use a limited Snell-based deflection with RGB IOR differences and continuous grazing projection; reflected studio illumination, Fresnel and depth attenuation shape the contour light.
- Lighting: four smooth analytic studio emitters and fixed world-space negative-fill apertures. Manual HEX and the Pleos RGB palette are preserved. Optional red → green → blue circulation transfers base incident-light energy weights 80/10/10. This is not a surface-albedo fill or self-emitting object material.
- Radiance pipeline: linear FP16 render targets, linear subpixel averaging, bounded highlight bloom, tone mapping, sRGB conversion and spatial AA. Range-compressed RGBA8 is a lower-precision fallback, not equivalent HDR quality.
- Floating render targets active in this capture: ${runtime?.rendering?.hdr === true ? "Yes" : runtime?.rendering?.hdr === false ? "No; packed RGBA8 fallback" : "not captured"}.
- Reflection control model: ${runtime?.rendering?.surfaceFigure?.model ?? 'not captured'}. View-invariant radiance reported: ${runtime?.rendering?.viewInvariantRadiance ?? 'not captured'}. Optical projection, reflected direction, Fresnel, occlusion and layer overlap vary with the viewing angle; the RGB lead cycle remains time-based.
- Dimension layers: ${runtime?.rendering?.dimensions?.meaning ?? 'not captured'}. Captured counts: top ${runtime?.state?.dimensionTop ?? '?'}, left ${runtime?.state?.dimensionLeft ?? '?'}, right ${runtime?.state?.dimensionRight ?? '?'}. Per-cube spacing and common softness/falloff remain editable; no opaque nested solids are inserted.
- The layer model is art-directed, not a physical glass or full spectral path tracer. Physical ray budget active: ${runtime?.rendering?.physicalRayBudgetActive ?? 'not captured'}; physical IOR active: ${runtime?.rendering?.physicalIORActive ?? 'not captured'}. IOR controls are active again. Stored bounce limits remain retained but disabled because physical-shell ray tracing is not the active expression.
- Main files: \`src/optical-studio/OpticalRenderer.ts\`, \`src/optical-studio/optical.frag.glsl\` and \`src/optical-studio/OpticalResolve.ts\`.
- Settings: the complete captured settings object is preserved in \`artifacts/latest/runtime-state.json\` under \`runtime.state\`.
- The active optical renderer does not use React Three Fiber or the previous studio's material pipeline.
- RGB IOR differences are a three-channel optical approximation, not full spectral transport. Physical-shell tracing is inactive in default B, but active in cube0914 and Hybrid V2. The removed dimensionEmission.glsl experiment exists only in local archive saved-20260915090434072, not current source. No volumetric caustics or temporal random-noise accumulation are used.

### A/B Hybrid — opt-in expression

- Route: \`?look=hybrid-ab\`, also available as \`A/B 통합안 · 현재 조정\` in the version dropdown. This independent shader variant keeps B at the default \`/\` and preserves the 09.14 cube A expression at \`?look=cube0914\`.
- V2 contract: actual A finite-cube entry refraction, rounded internal reflection images and bounded multi-bounce \`traceGlass\`, plus B's single sharp Axis anchor and motion. Suppress exterior first reflection to .035 and direct unreflected transmission to .12, retaining deeper internal reflections. This is deterministic ray integration plus authored virtual images, not Monte Carlo path tracing. V1 is preserved in local snapshot \`saved-20260921073913986\`.
- Current V3: \`hybridOpening\` defaults to 1. Extend the A optical boundary domain AND each reflection-image domain away from the shared origin by the same amount; keep the three Axis-facing planes and local optical curvature fixed. At full opening remote caps cannot reflect internal rays. Smooth distant falloff is not a mask at the former cube boundary. Zero restores closed V2, preserved as \`saved-20260921082636619\`. B and original A are untouched. The domain is bounded, not an infinite physical medium.
- Controls: \`hybridDistortion\` changes inner optical-image curvature; \`hybridDensity\` relaxes attenuation; \`hybridColorMix\` adjusts RGB overlap. \`bounces\` controls actual internal ray depth (1–16); escaped open rays may terminate earlier. Layer-zero and canonical solid geometry remain unchanged, while the expression's optical carrier extends. Partial opening can retain distant closing silhouettes; view-dependent refraction remains.
- Colour: RGB circulation or four fixed compositions — balanced main, red dominant, green dominant and blue dominant. Fixed composition locks colour weights while the existing motion continues. These are incident-light weights, not promises of equal screen area.
- Optional depth study: \`hybridDepthFlow\` and \`hybridDepthCycles\` move virtual images inward over a deterministic loop. This is a concept test; Hall D screen shape, dimensions and viewing position have not been calibrated.
- Persistence: first use seeds from readable B settings, then saves independently under \`pleos-optical-studio-v1:hybrid-ab\`; A/B settings and immutable snapshots remain separate. Native long-edge 3840px PNG and deterministic MP4 reuse the existing guarded HDR export path and codec limitations.
- Current V4 adds broad optical shoulders on open images using the same RGB rig, a bounded face aperture and displaced optical normals, not opaque geometry or emission. Controls: \`hybridFaceReflection\` (0–2, default .7), \`hybridFaceWidth\` (0–1, .5), \`hybridRefractionOverlap\` (0–1, .55). Strength 0 restores V3 (\`saved-20260922034933369\`); opening 0 keeps V2. Additional shoulders are bounded to eight images. These are art-directed reflection images, not a full scattering simulation. Dedicated QA artifacts: \`artifacts/hybrid-face/\`.
- Captured hybrid metadata: ${runtime?.hybrid ? `\`${JSON.stringify(runtime.hybrid)}\`` : "not active in this capture; availability is not a verification result"}.
- V6 removes V5's broad pocket approximation and adds A's closed rounded-cube secondary optical transport, with Fresnel/TIR and neighbouring cube transmission. Exterior reflection and bounce-zero direct transmission are excluded. Open-surface-to-proxy mapping is art directed, not a physically open glass simulation. See \`hybridInternalReflection.glsl\` and \`scripts/verify-hybrid-internal.mjs\`.
- Hybrid transition revision 1 synchronizes image formation, optical reflection and gray-carrier release. Zero stagger no longer bypasses the fade-in. Existing loop envelopes blend in late. V6 retains the gray intro but intentionally changes completed V4 pixels. Boundary/30fps-frame/archived-V4/MP4 checks: \`scripts/verify-hybrid-transition.mjs\`, \`artifacts/hybrid-transition/\`.
- Direction and acceptance criteria: [HYBRID_AB_DIRECTION.md](HYBRID_AB_DIRECTION.md). Dedicated checks: [verify-hybrid-ab.mjs](../scripts/verify-hybrid-ab.mjs); the optional \`PLEOS_HYBRID_4K=1\` path checks native 4K PNG and a short MP4. A handoff pass alone does not assert that these dedicated checks ran.

### Axis face separation study

- Optional route: \`?look=hybrid-axis-split\`; selectable as “A/B 통합안 · 축 면 분리 시안”. Original \`?look=hybrid-ab\` remains unchanged and independently saved.
- \`axisFaceGap\` now separates nine finite-thickness rounded dielectric panels (three per original domain). The former hit-discard aperture implementation has been removed. Actual front/back/side/rim intersections and normals drive physical reflection/refraction; virtual dimension images are transported with each face and roll off toward its polished lip. 0 restores the original connected domain. The interior image family is still an art-directed optical proxy, not a fully physical multi-scattering simulation. Crossing exactly zero changes topology; panel separation is not designed as a continuous zero-crossing animation. More intersections cost additional GPU time.
- \`scripts/test-detached-panel-geometry.mjs\` runs the production GLSL in a float target and verifies front/back/side hits, rounded normals, an unobstructed gap ray and transported image coordinates.
- Primary camera hits now use \`splitFrontHit\`: only outward fronts and front rims carry visible images. Back/thickness walls remain internal transport boundaries but no longer appear directly as coloured surfaces through the joints. B anchor and hybrid image branches share the same primary hit. GPU tests verify camera back/side misses and a front hit; artist wide-gap comparison is in \`artifacts/axis-face-split/rear-before.png\` and \`rear-after.png\`.
- The split-study Axis anchor now uses a fixed planar normal and source sampling projected onto its nearest straight edge, returning to original shading across 0.01–0.04 times uHalf. A narrow world-space edge strip (0.005–0.035 times uHalf) gradually admits the original curved inner images; internal distortion is unchanged beyond that strip. This is a radiance-layer separation, not moving the Axis or painting an outline. See \`straight-before.png\` / \`straight-after.png\` in the same QA folder.
- Separate persistence: \`pleos-optical-studio-v1:hybrid-axis-split\`. Dedicated QA: \`npm run verify:axis-face-split\`; screenshots/report in \`artifacts/axis-face-split/\`.
- Layer Light Flow: \`layerLightContrast\` (default 0 preserves previous images), \`layerLightLength\`, and integer \`layerLightCycles\` drive object-space brightness toward the shared Axis origin, without moving contours/normals. All regions/images share the same flow clock (no per-layer/region phase offsets); existing appearance fades remain independent. Controls use existing persistence/history/variation and fixed-time output. QA: \`npm run verify:layer-light\`, including an actual GLSL inward-crest test.

### COEX D Hall dimension gate — separate extension

- Optional route: \`?look=coex-gate\`; version dropdown “코엑스 D홀 · 디멘션 게이트”. Original Axis routes/settings are preserved.
- Files: \`src/gate/GateStudio.ts\`, \`GateRenderer.ts\`, \`gate.frag.glsl\`, \`GateState.ts\`, \`GateExport.ts\`.
- 5248×2112 public unfolded mapping, top 576px, side legs 448px, physical central passage masked black. Confirm venue mapping before delivery.
- Art-directed open U-plane optical images reuse HybridAB shoulder/crest, attenuation and dispersion language plus production tone mapping; not the cube physical integrator or volumetric path tracing.
- First-use black-to-layered introduction then continuous inward Z projection and RGB temporal transport. Browser-local isolated gate settings.
- Gate cornerRadius 0–320px (default 120) and bloomDirection −1..1 (default +1) are editable/saved/undoable/exported. +1 releases light below/inward from a sharper top/outside core, −1 reverses, 0 is symmetric. Stable near-core normals avoid pixel-scale angular flips. Dedicated rounding/directional profile QA: artifacts/coex-gate/rounding-release-validation.json.
- Gate lighting shares active OpticalStudio environmentProfile emitters with gate-specific Snell/Fresnel virtual-image rays (not the entire cube transport engine). Its adapter alone omits cube-diagonal negative-fill flags. One open rounded U distance field and a continuous contour-local optical frame replace the diagonal top/side ownership seam. Independent frontWidth (8–320 design px on both top and sides) and widthTaper (0–3) controls migrate old gate saves with defaults 120 / 1.2 and preserve undo/export. Corner QA: artifacts/coex-gate/corner-validation.json.
- PNG/native MP4 export with shared OPFS encoder helpers. Seamless loop output quantizes only export-snapshot Z speed to integer cycles per RGB period.
- Dedicated test/report: \`scripts/verify-coex-gate.mjs\`, \`artifacts/coex-gate/validation.json\`. These previews are separate from default latest Axis captures; default handoff runtime does not inspect the gate route.

## Motion System

- Runtime: ${motion?.kind ?? 'not captured'}; absolute-time evaluation.
- Axis model motion: ${JSON.stringify(motion?.axis ?? null)}. OpticalAxisMotion.ts rigidly rotates the complete local geometry and light field about the shared origin, tracing inverse-transformed rays with the world camera fixed. Axis motion takes precedence over camera motion; old named saves remain disabled by default.
- Camera-only motion: ${JSON.stringify(motion?.camera ?? null)}. OpticalCameraMotion.ts evaluates an eased out-and-back orbit from saved camera angles; the 25Axis hold remains fixed. Base angles, geometry, pan and zoom are not animated or overwritten. Old saves default to disabled. Preview, PNG and MP4 share the same evaluated pose.
- Active 25엑시스 transition: ${motion?.identityTransition ? `\`${JSON.stringify(motion.identityTransition)}\`` : 'not captured'}.
- Axis accent: one eased key-light envelope per enabled transition loop, applied only to the existing nearest-Axis layer-zero contour. It reuses that contour's refraction, Fresnel and appearance masks; no screen-space line, new geometry or shifted layer timing. The 축 강조 강도 control is 0–2 in 0.05 steps (0 disables, default 1). Actual strength/timing are in the captured transition.axisAccent object.
- Optional RGB lead cycle uses a saved phase anchor, quintic transitions and one fixed red/green/blue sequence per duration, independent of custom palette edits. Fractions are base incident-light energy weights, not screen coverage. Default is disabled to preserve existing looks.
- Current duration: ${motion?.duration ?? "not captured"} seconds.
- Deterministic: ${motion?.deterministic === true ? "Yes, reported by the runtime" : "not confirmed by capture"}.
- Captured hero time: ${runtimeState.heroTime ?? "not captured"} seconds; playback is paused before each export.
- Playback state after capture: ${motion?.playing === false ? "paused" : motion?.playing === true ? "playing" : "not captured"}.
- \`seek(time)\` supports deterministic frame inspection. The default loop is 15 seconds.
- MP4: ${runtime?.videoExport?.deterministic ? 'fixed-time sequential frames through exportVideo; includes the active transition and layer stagger; no realtime recording.' : 'not confirmed by runtime inspection.'} Automatic PNG sequence UI is not implemented.
- Dimension amounts are continuous animation-ready state, but automatic layer-count modulation has not been added.
- Layer spacing is independently controlled per cube by dimensionSpacingTop / dimensionSpacingLeft / dimensionSpacingRight (0.06–0.3). Missing fields inherit the old shared spacing without resetting saved values. Softness and depth falloff remain shared.
- Spacing widens the existing contour lobe away from the shared world-space Axis. Straight contour geometry, world-axis distance and bounded width avoid bent bands and flat face fill. Layer fades, per-region timing and the 25엑시스 reveal stagger remain independent controls.

## Artboard / Export

- Available aspect presets from runtime: ${JSON.stringify(runtime?.artboard?.supportedFormats ?? null)}. A-series is portrait 1:√2, not a physical print-size/PPI selector. PNG uses nearest-pixel dimensions; MP4 rounds odd dimensions up by one pixel for encoder compatibility. UI and output use the same helpers.

- Captured artboard: ${runtimeState.artboard ? `${runtimeState.artboard.width} × ${runtimeState.artboard.height} (${runtimeState.artboard.preset ?? "custom"})` : "not captured"}.
- Raster export: exact-size PNG via \`capture(width, height, samples)\` with tiled high-resolution rendering.
- The interface exposes native long-edge 3840px PNG with 4×4 (16) spatial samples averaged in linear light before tone mapping. Canvas2D assembles final pixels only, without display-RGB supersample averaging. Latest handoff previews below use their recorded pixel dimensions and four samples.
- Both preview and export render off-artboard guard bands covering the scaled bloom footprint and spatial-AA reach, then crop. Outer image boundaries and internal tile seams use the same lighting support; output is not an enlarged preview screenshot.
- Main preview retains the active artboard aspect with a maximum long edge of 1080 pixels. Portrait previews default to 1080 × 1350 and 1080 × 1920.
- \`--preview-long-edge\` or \`PLEOS_HANDOFF_PREVIEW_LONG_EDGE\` can reduce preview dimensions; decoded PNG dimensions are recorded and checked.
- Captured renderer limits: ${runtime?.limits ? `\`${JSON.stringify(runtime.limits)}\`` : "not captured"}.
- Video capability reported by runtime: ${runtime?.videoExport ? `\`${JSON.stringify(runtime.videoExport)}\`` : 'not captured'}.
- MP4 controls: long edge 3840/1920px, 24/30/60fps, 4/16 spatial samples, same camera/aspect and full timeline. A reusable guarded-tile frame capture feeds the browser encoder sequentially; OPFS disk output or a bounded 256MiB memory fallback. Abort/error releases output resources and restores preview state. Actual codec support is checked before rendering, never silently downscaled.
- PNG and MP4 are opaque 8-bit sRGB; MP4 is lossy and silent. No transparent/PPI-aware print or HDR-video UI. The older print workflows remain in the preserved studio instead.

## Inspector / UI

- Structure Lighting UI is simplified to two faces per region in the standard Axis view: Top X/Z, Left X/Y, Right Y/Z. Hidden inputs and stored gains remain intact. No renderer changes or camera-dependent panel switching.

- Hybrid “구조 라이팅” adjusts parent cube wall/floor orientation, not internal image normals: structureTop/Left/Right X/Y/Z gain 0–3, default 1; structureContrast 0–1, default 0. Entry geometry normal is evaluated before image transport. The same achromatic gain multiplies base dimension bands, traced reflection/refraction and broad reflected faces; 25 Axis carrier remains untouched. Continuous bevel weights, no camera-selected face switching. Existing image-face controls remain independent. Validation: npm run verify:structure-light; artifacts/structure-light/validation.json.

- Hybrid current adjustment includes “면별 디멘션 라이팅”: per-region X/Y/Z optical image gain (0–3, default 1), smoothly weighted by object-space image normals across bevels. Paired ± faces share each directional gain. faceDimensionContrast defaults 0; raises vertical and reduces horizontal reflection energy. Applied to dimension bands and their broad image shoulders, not outer surface paint or Axis geometry. Settings, undo, full variations, PNG and MP4 use the same state. Validation: npm run verify:face-dimensions; artifacts/face-dimension-light/validation.json.

- OpticalStudio owns a fresh Korean interface with monochrome application controls.
- Collapsible sections: 25엑시스 → 디멘션, 빛 모션, 영역별 타이밍, 형태, 디멘션 레이어, 광학, 조명, 카메라, 출력. Existing section IDs and handlers remain compatible. The bottom transport controls time, loop length, light travel amount and artboard aspect.
- 디멘션 레이어 has three independent 0–50 layer sliders and a collapsed spacing/softness/falloff group. 조명 has the preserved colour picker/HEX/Pleos palette, RGB-cycle toggle, live base energy fractions, light intensity, source width, exposure and bloom. 광학 controls active IOR, dispersion, diffusion, reflection concentration/gain and absorption; only the preserved physical-ray bounce limit is disabled.
- 레퍼런스 무드 적용 changes optical appearance while retaining the current camera, gap and artboard; the first pre-application local setting is preserved in \`pleos-optical-before-luminous-v1\` rather than replacing the named draft.
- Layer, lighting, motion and output controls edit the independent optical state in \`pleos-optical-studio-v1\`. Browser origins do not share localStorage automatically.
- The artboard and export controls belong to OpticalStudio; prior mode selectors and legacy settings remain in the preserved studio route.
- Main files: \`OpticalStudio.ts\`, \`OpticalPanel.ts\` and \`OpticalStudio.css\` inside \`src/optical-studio/\`.
- Hybrid-only additions: A/B 통합 재질, 정지 컬러 / 순환 and the collapsed 공간 깊이 테스트 (Hall D 도면 미반영). Its colour selector replaces the visible legacy RGB-cycle toggle; ordinary B and cube0914 panels retain their own controls.

## Important Files

| File | Responsibility |
| --- | --- |
| \`src/main.ts\` | Default OpticalStudio and preserved reference route selection |
| \`src/optical-studio/OpticalStudio.ts\` | Active application lifecycle and browser inspection/export API |
| \`src/optical-studio/OpticalRenderer.ts\` | Independent WebGL2 renderer and reusable guarded-tile PNG/video frame capture |
| \`src/optical-studio/OpticalVideoExporter.ts\` | Deterministic native-resolution MP4 encoding, bounded storage and cancellation |
| \`scripts/verify-optical-video.mjs\` | Real 4K MP4 decode comparison, timing, cancellation and UI verification |
| \`src/optical-studio/optical.frag.glsl\` | Axis intersections, virtual refracted contour layers and transition-only first-layer key-light accent |
| \`src/optical-studio/IdentityAxisAccent.ts\` | Single eased Axis-light envelope within the unchanged 25엑시스 transition timing |
| \`src/optical-studio/OpticalResolve.ts\` | Linear HDR targets, supersample averaging, highlight bloom and display resolve |
| \`src/optical-studio/OpticalState.ts\` | Independent optical settings and defaults |
| \`src/optical-studio/OpticalLighting.ts\` | Deterministic RGB base incident-light weights and linear palette |
| \`src/optical-studio/HybridAB.ts\` | Opt-in hybrid route, independent seed/defaults, RGB compositions and inspection metadata |
| \`src/optical-studio/hybridOptics.glsl\` | V2 fully refracted finite reflection-image family with B temporal gates |
| [docs/HYBRID_AB_DIRECTION.md](HYBRID_AB_DIRECTION.md) | A/B design contract, KV/crop/POP directions, print checks and uncalibrated Hall D scope |
| [scripts/verify-hybrid-ab.mjs](../scripts/verify-hybrid-ab.mjs) | Hybrid controls, colour captures, loop, independent persistence, unchanged A/B and optional 4K PNG/short MP4 checks |
| \`src/optical-studio/LuminousReference.ts\` | Appearance-only reference mood and pre-application backup key |
| \`src/optical-studio/AxisGeometry.ts\` | Canonical three-cube coordinates and separation |
| \`src/optical-studio/OpticalPanel.ts\` | Korean editing and export controls |
| \`src/optical-studio/OpticalStudio.css\` | Monochrome application layout and appearance |
| \`scripts/verify-optical-geometry.mjs\` | Geometry, common vertex and original silhouette checks |
| \`scripts/verify-optical-dimensions.mjs\` | Continuous layers, optical colour/core, persistence and guarded HDR tile verification |
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
- Inspect \`OpticalResolve.ts\` before evaluating output quality; FP16 averaging and bloom occur before display encoding. Dimension sliders bound authored optical-image layer count, not physical cubes or physical reflection bounces.
- Compare \`surfaceCurvature\` with geometric bevel: the former changes the reflected-light filter's normal concentration, not refracted projection or geometric structure. Inspect \`IdentityAxisAccent.ts\` and the layer-zero accent in \`optical.frag.glsl\`; strength 0 disables the new transition emphasis without changing layer timing.
- Use \`window.__pleosOptical\` on the default route. The older \`window.__pleos27Axis\` API belongs to \`?renderer=studio\`.
- Refresh production handoff without \`--mode\`, or with \`--mode optical\`. Pass an explicit prior mode only when intentionally documenting the preserved studio.
- To capture the hybrid expression, set \`PLEOS_HANDOFF_URL\` to the running site's \`?look=hybrid-ab\` URL. Inspect \`runtime.hybrid\` and the captured look; this does not change the default route.
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
    app: { entryPoint: "src/main.ts", defaultRoute: "/", activeApplication: "OpticalStudio", look: runtime?.hybrid?.look ?? runtime?.rendering?.expression ?? runtime?.state?.preset ?? null, renderer: runtime?.renderer ?? null, projection: runtime?.projection ?? null, referenceRoutes: ["?renderer=studio", "?renderer=raw", "?renderer=legacy"] },
    runtime,
    axis: runtime?.axis ?? null,
    artboard: capture.initialRuntime?.artboard ?? null,
    activeExpression: runtime?.hybrid?.look ?? runtime?.rendering?.expression ?? runtime?.state?.preset ?? null,
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
  knownIssues.push(runtime?.videoExport ? "MP4 depends on the browser supporting the requested dimensions/fps; lossy 8-bit output has no alpha/audio/HDR. Long exports must keep the tab open; automatic PNG sequence UI is not implemented." : "MP4 capability was not confirmed by runtime inspection.");
  knownIssues.push("Dimension contours are bounded, art-directed virtual optical images; reflected direction, Fresnel, projection/overlap/occlusion vary with view. They are not a volumetric caustic or full spectral path tracer.");
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
    look: runtimeState.activeExpression,
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
