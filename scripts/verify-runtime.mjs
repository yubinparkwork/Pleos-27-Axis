import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const baseUrl = process.env.NEW_AXIS_URL ?? "http://127.0.0.1:5173/";
const outputDirectory = path.join(root, "artifacts", "verification");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__pleosAxis?.inspect === "function");

  const initial = await page.evaluate(() => window.__pleosAxis.inspect());
  assert.ok(initial.renderer.geometry.sectors >= 3, "No folded sectors were rendered");
  assert.equal(initial.renderer.geometry.hasDepth, true, "Fold geometry has no Z depth");
  assert.equal(initial.renderer.geometry.hasNormals, true, "Fold geometry has no normals");
  assert.ok(["pass", "warning"].includes(initial.compliance.status), "Initial compliance state is invalid");

  const presetIds = [
    "quiet-precision", "material-accuracy", "data-connection", "layered-ecosystem",
    "pace-motion", "flywheel-orbit", "material-shift", "spatial-circuit",
  ];
  const presets = {};
  for (const id of presetIds) {
    presets[id] = await page.evaluate((presetId) => {
      window.__pleosAxis.setPreset(presetId);
      return window.__pleosAxis.inspect();
    }, id);
    assert.ok(presets[id].renderer.geometry.sectors >= 3, `${id} did not render sectors`);
  }

  await page.evaluate(() => window.__pleosAxis.setTime(1.25));
  const timeline = await page.evaluate(() => window.__pleosAxis.inspect());
  assert.equal(timeline.state.motion.time, 1.25, "Deterministic timeline setter failed");

  await page.locator('[data-mode="split-compare"]').click();
  const split = await page.evaluate(() => window.__pleosAxis.inspect());
  assert.equal(split.state.rendererMode, "split-compare", "Split comparison mode failed");

  await page.screenshot({ path: path.join(outputDirectory, "studio-runtime-1440x900.png"), fullPage: false });
  assert.deepEqual(browserErrors, [], `Browser errors: ${browserErrors.join(" | ")}`);

  const report = {
    status: "pass",
    baseUrl,
    canvas: initial.renderer.canvas,
    initialGeometry: initial.renderer.geometry,
    presetCount: Object.keys(presets).length,
    finalMode: split.state.rendererMode,
    browserErrors,
  };
  await writeFile(path.join(outputDirectory, "runtime.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
