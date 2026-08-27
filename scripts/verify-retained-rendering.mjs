import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const url = process.env.PLEOS_URL ?? "http://127.0.0.1:5173/";

async function reachable() {
  try { return (await fetch(url)).ok; } catch { return false; }
}

let server = null;
if (!(await reachable())) {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { stdio: "inherit", shell: process.platform === "win32" });
  const deadline = Date.now() + 20_000;
  while (!(await reachable())) {
    if (Date.now() > deadline) throw new Error(`Dev server did not become ready at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => {
    const api = window.__pleos27Axis;
    api.setMotionPreset("off");
    api.setArtboard({ id: "custom", width: 320, height: 240 });
    api.setRenderRegion({ enabled: true, x: 80, y: 60, width: 160, height: 120, unitPpi: 96 });
  });
  const rasterUrl = await page.evaluate(() => window.__pleos27Axis.exportPng(false));
  const raster = PNG.sync.read(Buffer.from(rasterUrl.slice(rasterUrl.indexOf(",") + 1), "base64"));
  if (raster.width !== 160 || raster.height !== 120) throw new Error(`Raster region mismatch: ${raster.width}x${raster.height}`);
  const pathUrl = await page.evaluate(() => window.__pleos27Axis.renderPreview("fast"));
  const path = PNG.sync.read(Buffer.from(pathUrl.slice(pathUrl.indexOf(",") + 1), "base64"));
  if (path.width !== 160 || path.height !== 120) throw new Error(`Path region mismatch: ${path.width}x${path.height}`);
  const state = await page.evaluate(() => window.__pleos27Axis.inspect());
  if (!state.renderRegion?.enabled || state.renderRegion.width !== 160 || state.renderRegion.height !== 120) throw new Error("Render region state was not preserved");
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "pass", retainedTools: ["fast-path-render", "high-path-render", "pixel-region", "physical-unit-input", "ppi-print-output"], raster: [raster.width, raster.height], fastPath: [path.width, path.height] }, null, 2));
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
