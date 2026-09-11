// Isolated-origin integration QA. Never reads or writes the user's live studio state.
// PLEOS_OPTICAL_4K=1 enables an additional native 2160 x 3840 capture (1 sample).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "artifacts", "optical-rebuild");
const baseUrl = "http://127.0.0.1:51742/";
const capture4k = process.env.PLEOS_OPTICAL_4K === "1";
const report = { status: "running", baseUrl, browser: "Chrome with GPU enabled; Metal requested on macOS", errors: [], warnings: [], captures: {}, checks: {}, gpuResources: {}, note: "Capture durations are end-to-end wall time, not GPU execution timing or a realtime frame-rate claim." };
await mkdir(output, { recursive: true });

const server = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "51742", "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = "", spawnError, browser;
server.on("error", (error) => { spawnError = error; });
for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000); });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function imageMetrics(png) {
  let lit = 0, peak = 0;
  const total = [0, 0, 0];
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const maximum = Math.max(png.data[offset], png.data[offset + 1], png.data[offset + 2]);
    if (maximum > 20) lit++;
    peak = Math.max(peak, maximum);
    for (let channel = 0; channel < 3; channel++) total[channel] += png.data[offset + channel];
  }
  return { litFraction: lit / (png.width * png.height), peak, meanRGB: total.map((value) => value / (png.width * png.height)) };
}
function imageDifference(a, b) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let absolute = 0, changed = 0, maximum = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    let pixelDifference = 0;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(a.data[offset + channel] - b.data[offset + channel]);
      absolute += difference; pixelDifference = Math.max(pixelDifference, difference); maximum = Math.max(maximum, difference);
    }
    if (pixelDifference > 1) changed++;
  }
  return { meanAbsoluteChannelDifference: absolute / (a.width * a.height * 3), changedFraction: changed / (a.width * a.height), maximum };
}

try {
  const deadline = Date.now() + 30_000;
  while (true) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Isolated Vite exited: ${serverOutput}`);
    try {
      if (serverOutput.includes("51742") && (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch { /* Wait for the isolated server. */ }
    if (Date.now() > deadline) throw new Error(`Isolated Vite did not start: ${serverOutput}`);
    await wait(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") report.warnings.push(message.text());
  });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    const key = "pleos-optical-studio-v1";
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ playing: false, time: 0 }));
    const contexts = [];
    const seen = new WeakSet();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const result = original.apply(this, args);
      if (!result || args[0] !== "webgl2" || seen.has(result)) return result;
      seen.add(result);
      const resources = {};
      for (const kind of ["Program", "Shader", "VertexArray", "Buffer", "Texture", "Framebuffer", "Renderbuffer"]) {
        const createName = `create${kind}`, deleteName = `delete${kind}`;
        if (typeof result[createName] !== "function") continue;
        const alive = new Set(), create = result[createName].bind(result), remove = result[deleteName].bind(result);
        resources[kind] = alive;
        result[createName] = (...values) => { const resource = create(...values); if (resource) alive.add(resource); return resource; };
        result[deleteName] = (resource) => { const returned = remove(resource); alive.delete(resource); return returned; };
      }
      contexts.push({ gl: result, resources });
      return result;
    };
    window.__opticalQaResources = () => ({
      contextsCreated: contexts.length,
      activeContexts: contexts.filter(({ gl }) => !gl.isContextLost()).length,
      resources: Object.fromEntries(["Program", "Shader", "VertexArray", "Buffer", "Texture", "Framebuffer", "Renderbuffer"].map((kind) => [kind, contexts.reduce((count, item) => count + (item.resources[kind]?.size ?? 0), 0)])),
      activeErrors: contexts.filter(({ gl }) => !gl.isContextLost()).map(({ gl }) => gl.getError()),
    });
  });
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  report.initial = await page.evaluate(() => window.__pleosOptical.inspect());
  assert.equal(report.initial.axis.cubeCount, 3, "Default scene must have three cubes");
  assert.equal(report.initial.projection, "orthographic");
  assert.equal(report.initial.state.playing, false);
  assert.equal(report.initial.state.duration, 15);
  assert.equal(report.initial.rendering.emission, false);
  report.gpu = await page.evaluate(() => {
    const gl = document.querySelector("#optical-canvas").getContext("webgl2");
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) };
  });
  assert.ok(!/SwiftShader|llvmpipe|software rasterizer/i.test(report.gpu.renderer), "QA requires a hardware renderer");
  report.gpuResources.initial = await page.evaluate(() => window.__opticalQaResources());

  async function capture(name, patch = {}, width = 360, height = 360) {
    const started = performance.now();
    const url = await page.evaluate(async ({ patch, width, height }) => {
      window.__pleosOptical.set({ ...patch, playing: false });
      return window.__pleosOptical.capture(width, height, 1);
    }, { patch, width, height });
    assert.ok(url.startsWith("data:image/png;base64,"));
    const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    const png = PNG.sync.read(bytes);
    assert.equal(png.width, width); assert.equal(png.height, height);
    await writeFile(path.join(output, `${name}.png`), bytes);
    report.captures[name] = { width, height, samples: 1, bytes: bytes.length, sha256: hash(png.data), wallMs: Math.round(performance.now() - started), ...imageMetrics(png) };
    return png;
  }
  const baselineState = { ...report.initial.state, playing: false, time: 0 };
  for (const bevel of [0, .08, .32, .6]) {
    await page.evaluate(async (bevel) => {
      window.__pleosOptical.set({ gap: 0, bevel, playing: false });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, bevel);
    const live = await page.evaluate(async () => {
      const runtime = window.__pleosOptical.inspect();
      const canvas = document.querySelector('#optical-canvas');
      const { OpticalRenderer } = await import('/src/optical-studio/OpticalRenderer.ts');
      const temporary = document.createElement('canvas');
      const renderer = new OpticalRenderer(temporary);
      try {
        renderer.draw(runtime.state, canvas.width, canvas.height);
        return { live: canvas.toDataURL(), expected: temporary.toDataURL(), axis: runtime.axis };
      } finally { renderer.dispose(); }
    });
    const decode = url => PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
    assert.equal(live.axis.surfacesTouch, true);
    assert.equal(live.axis.bevelContactCompensation, true);
    const match = imageDifference(decode(live.live), decode(live.expected));
    assert.ok(match.maximum <= 1, 'Changing bevel at unchanged gap must update live geometry, not only exported geometry');
    report.checks[`bevelContact-${bevel}`] = match;
  }
  await capture('qa-zero-gap-rounded-contact', { ...baselineState, gap: 0, bevel: .6 }, 720, 720);
  const baseline = await capture("qa-baseline", baselineState);
  assert.ok(report.captures["qa-baseline"].litFraction > .02, "Default optical capture is blank");
  assert.ok(report.captures["qa-baseline"].litFraction < .85, "Expected black surround around the three cubes");
  const repeated = await capture("qa-repeat", baselineState);
  assert.deepEqual(repeated.data, baseline.data, "Same state must produce exactly the same pixels");
  report.checks.deterministicCapture = "pixel-identical";
  const loopEnd = await capture("qa-loop-end", { ...baselineState, time: baselineState.duration });
  report.checks.loopDifference = imageDifference(baseline, loopEnd);
  assert.ok(report.checks.loopDifference.meanAbsoluteChannelDifference < .02 && report.checks.loopDifference.changedFraction < .001, "Loop endpoints differ visibly");

  for (const [key, value] of [["gap", .3], ["bevel", 0], ["ior", 1.95], ["dispersion", .14], ["roughness", 0], ["bounces", 1]]) {
    const changed = await capture(`qa-change-${key}`, { ...baselineState, [key]: value });
    const difference = imageDifference(baseline, changed);
    assert.ok(difference.meanAbsoluteChannelDifference > .05 && difference.changedFraction > .001, `${key} does not change the rendered image`);
    report.checks[key] = difference;
  }
  await capture("qa-wide-bevel", { ...baselineState, bevel: .6 });
  assert.ok(report.captures["qa-wide-bevel"].litFraction > .02, "Wide-bevel dimension scene is blank");
  const animated = await capture("qa-motion-midpoint", { ...baselineState, time: 7.5 });
  report.checks.motion = imageDifference(baseline, animated);
  assert.ok(report.checks.motion.changedFraction > .001, "Light motion has no visible effect");
  await capture("qa-lights-off", { ...baselineState, lightIntensity: 0 });
  assert.equal(report.captures["qa-lights-off"].peak, 0, "With all incident radiance disabled, non-emissive glass must be black");
  report.checks.noEmission = "all pixels black when lightIntensity is zero";
  await page.evaluate((state) => window.__pleosOptical.set(state), baselineState);

  // Exercise controls rather than relying on the API for persistence.
  const geometrySection = page.locator('[data-optical-section="geometry"]');
  if (await geometrySection.getAttribute("open") === null) await geometrySection.locator("summary").click();
  await page.locator('[data-optical-number="gap"]').fill("0.12");
  await page.locator('[data-optical-number="gap"]').press("Tab");
  await page.getByLabel("화면 비율", { exact: true }).selectOption("9x16");
  const persistedBefore = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.equal(persistedBefore.gap, .12); assert.equal(persistedBefore.aspect, "9x16");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__pleosOptical?.inspect().ready === true);
  const persistedAfter = await page.evaluate(() => window.__pleosOptical.inspect().state);
  assert.deepEqual(persistedAfter, persistedBefore, "Optical settings must survive reload");
  report.checks.persistence = "UI changes survived reload";
  await page.evaluate((state) => window.__pleosOptical.set(state), baselineState);
  await page.waitForFunction(() => document.querySelector("#optical-canvas").width > 32);
  await page.screenshot({ path: path.join(output, "qa-ui-wide.png"), fullPage: false });
  const wide = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, canvas: document.querySelector("#optical-canvas").getBoundingClientRect().toJSON() }));
  assert.ok(wide.content <= wide.viewport + 1, "Wide layout overflows horizontally");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => innerWidth === 390);
  const panelButton = page.locator('[data-optical-action="inspector"]');
  if (await panelButton.getAttribute("aria-expanded") === "true") await panelButton.click();
  await page.screenshot({ path: path.join(output, "qa-ui-narrow.png"), fullPage: false });
  const narrow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, canvas: document.querySelector("#optical-canvas").getBoundingClientRect().toJSON() }));
  assert.ok(narrow.content <= narrow.viewport + 1, "Narrow layout overflows horizontally");
  assert.ok(narrow.canvas.width > 150 && narrow.canvas.right <= narrow.viewport + 1, "Narrow canvas does not fit the viewport");
  await panelButton.click();
  assert.equal(await panelButton.getAttribute("aria-expanded"), "true");
  await page.screenshot({ path: path.join(output, "qa-ui-narrow-inspector.png"), fullPage: false });
  await page.keyboard.press("Escape");
  assert.equal(await panelButton.getAttribute("aria-expanded"), "false");
  report.checks.layout = { wide, narrow, inspectorToggle: "pass", escape: "pass" };

  // Repeated temporary renderers must release their explicit GL handles and contexts.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let index = 0; index < 3; index++) await page.evaluate(() => window.__pleosOptical.capture(48, 48, 1));
  await page.waitForFunction(() => window.__opticalQaResources().activeContexts === 1);
  report.gpuResources.afterRepeatedCaptures = await page.evaluate(() => window.__opticalQaResources());
  assert.deepEqual(report.gpuResources.afterRepeatedCaptures.resources, report.gpuResources.initial.resources, "Capture leaked explicit GL objects");
  assert.deepEqual(report.gpuResources.afterRepeatedCaptures.activeErrors, [0], "Live preview has a WebGL error");
  assert.equal(await page.evaluate(() => window.__pleosOptical.inspect().exporting), false);
  assert.equal(await page.locator('[data-optical-action="export"]').isEnabled(), true);
  report.checks.resourceLifecycle = "Only preview context and handles remain after repeated captures";

  if (capture4k) {
    await capture("qa-native-4k", { ...baselineState, aspect: "9x16" }, 2160, 3840);
    assert.ok(report.captures["qa-native-4k"].litFraction > .01, "4K output is blank");
    report.checks.native4k = "2160 x 3840 pixels rendered directly, 1 sample";
  } else report.checks.native4k = "not run; enable with PLEOS_OPTICAL_4K=1";
  assert.deepEqual(report.errors, [], "Browser emitted errors");
  assert.ok(!report.warnings.some((warning) => /too many active WebGL contexts|unexpected context lost/i.test(warning)), "GPU resource warning detected");
  report.status = "pass";
  console.log(JSON.stringify({ status: report.status, gpu: report.gpu, checks: report.checks, captureCount: Object.keys(report.captures).length, errors: report.errors }, null, 2));
} catch (error) {
  report.status = "fail";
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(path.join(output, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  server.kill("SIGTERM");
}
