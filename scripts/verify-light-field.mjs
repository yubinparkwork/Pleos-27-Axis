import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const port = Number(process.env.PLEOS_LIGHT_FIELD_PORT ?? 41738); const url = `http://127.0.0.1:${port}/`;
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
const limit = Date.now() + 25_000;
while (true) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } if (child.exitCode !== null || Date.now() > limit) throw new Error("Light Field verification server failed."); await new Promise((resolve) => setTimeout(resolve, 125)); }
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); const errors = [];
page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => localStorage.removeItem("pleos-27-axis-studio-state-v2"));
const decode = (data) => Buffer.from(data.split(",")[1], "base64"); const hash = (data) => createHash("sha256").update(decode(data)).digest("hex");
try {
  await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => window.__pleos27Axis.switchMode("light-field")); await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "light-field");
  await page.evaluate(() => { window.__pleos27Axis.pause(); window.__pleos27Axis.setArtboard({ id: "custom", width: 320, height: 400, transparent: true, axisAnchor: { gridX: .5, gridY: .5 } }); });
  const frame0 = await page.evaluate(() => window.__pleos27Axis.exportFrame(0, 30, false));
  const frameLoop = await page.evaluate(() => window.__pleos27Axis.exportFrame(300, 30, false));
  await page.evaluate(() => { for (const [path, value] of [["geometry.cubeGap", ".18"], ["geometry.bevel", ".16"]]) { const input = document.querySelector(`input[data-field-bind="${path}"][type="number"]`); input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); } });
  const geometryAdjusted = await page.evaluate(() => window.__pleos27Axis.exportFrame(0, 30, false));
  const png = PNG.sync.read(decode(frame0));
  let transparentPixels = 0; let visiblePixels = 0;
  for (let index = 3; index < png.data.length; index += 4) { if (png.data[index] < 8) transparentPixels += 1; if (png.data[index] > 200) visiblePixels += 1; }
  const pixelCount = png.width * png.height;
  const printPng = decode(await page.evaluate(() => window.__pleos27Axis.export({ renderer: "raster", quality: "custom", download: false })));
  const hasPpiMetadata = printPng.includes(Buffer.from("pHYs"));
  const presetHashes = [];
  for (const preset of ["iridescent-pulse", "violet-membrane", "spectral-white"]) { const data = await page.evaluate(async (id) => { window.__pleos27Axis.setLightFieldPreset(id); window.__pleos27Axis.pause(); return window.__pleos27Axis.exportFrame(150, 30, false); }, preset); presetHashes.push(hash(data)); }
  let pathRejected = false; try { await page.evaluate(() => window.__pleos27Axis.export({ renderer: "path", quality: "high", download: false })); } catch { pathRejected = true; }
  const inspect = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.setViewportSize({ width: 900, height: 760 });
  await page.waitForTimeout(100);
  const compactUi = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    visiblePanel: Boolean(document.querySelector(".light-field-panel")),
    numericInputsUsable: [...document.querySelectorAll(".light-field-panel input[type=number]")].every((input) => input.getBoundingClientRect().width >= 48),
  }));
  await page.keyboard.press("Tab");
  const keyboardFocus = await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body);
  const checks = {
    webgl2: inspect.renderer === "custom WebGL2 fullscreen field", axisCanonical: inspect.axis?.source === "src/axis" && inspect.axis?.hardcodedAngles === false && inspect.axis?.projectedAngles?.length === 3,
    capability: inspect.studioMode?.capabilities?.pathTracing === false && inspect.studioMode?.capabilities?.transparency === true,
    exactSize: png.width === 320 && png.height === 400, transparent: transparentPixels / pixelCount > .01 && visiblePixels / pixelCount > .55, ppiMetadata: hasPpiMetadata, deterministicLoop: hash(frame0) === hash(frameLoop),
    geometryControls: hash(frame0) !== hash(geometryAdjusted) && inspect.state?.geometry?.cubeGap >= 0 && inspect.state?.geometry?.bevel >= 0,
    distinctPresets: new Set(presetHashes).size === 3, pathRejected, singleCanvas: inspect.studioMode?.lifecycle?.canvasCount === 1,
    narrowLayout: !compactUi.horizontalOverflow && compactUi.visiblePanel && compactUi.numericInputsUsable, keyboardFocus, console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Light Field verification failed: ${JSON.stringify({ checks, errors })}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", checks, hashes: presetHashes }, null, 2)}\n`);
} finally { await browser.close(); child.kill("SIGTERM"); }
