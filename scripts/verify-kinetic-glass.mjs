import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const port = Number(process.env.PLEOS_KINETIC_VERIFY_PORT ?? 41749);
const url = `http://127.0.0.1:${port}/`;
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
const deadline = Date.now() + 25_000;
while (true) {
  try { if ((await fetch(url)).ok) break; } catch { /* retry */ }
  if (child.exitCode !== null || Date.now() > deadline) throw new Error("Kinetic Glass verification server failed.");
  await new Promise((resolve) => setTimeout(resolve, 125));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => localStorage.removeItem("pleos-27-axis-studio-state-v2"));
const decode = (data) => Buffer.from(data.split(",")[1], "base64");
const hash = (data) => createHash("sha256").update(decode(data)).digest("hex");
async function exportFrameWithRetry() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const frame = await page.evaluate(() => window.__pleos27Axis.exportFrame(0, 30, false));
    if (typeof frame === "string" && frame.includes(",")) return frame;
    await page.waitForTimeout(200);
  }
  throw new Error("Kinetic Glass export did not return PNG data.");
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => {
    window.__pleos27Axis.switchMode("kinetic-glass");
    window.__pleos27Axis.setArtboard({ id: "custom", width: 320, height: 400, transparent: true });
  });
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "kinetic-glass" && window.__pleos27Axis.inspect().ready === true);
  await page.waitForTimeout(800);

  const inspect = await page.evaluate(() => window.__pleos27Axis.inspect());
  const frame = await exportFrameWithRetry();
  const png = PNG.sync.read(decode(frame));
  let transparent = 0;
  let visible = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] < 8) transparent += 1;
    if (png.data[index] > 24) visible += 1;
  }

  const presetHashes = [];
  for (const preset of ["clear-attraction", "pleos-prism", "dark-mass"]) {
    presetHashes.push(hash(await page.evaluate(async (id) => {
      window.__pleos27Axis.setKineticGlassPreset(id);
      await new Promise((resolve) => setTimeout(resolve, 180));
      return window.__pleos27Axis.exportFrame(0, 30, false);
    }, preset)));
  }

  await page.setViewportSize({ width: 820, height: 720 });
  const ui = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    panel: Boolean(document.querySelector("[data-mode-panel='kinetic-glass']")),
    controls: document.querySelectorAll("[data-kinetic-bind]").length,
    singleCanvas: document.querySelectorAll(".kinetic-glass-stage canvas").length,
  }));

  const checks = {
    registered: await page.evaluate(() => window.__pleos27Axis.listModes().some((mode) => mode.id === "kinetic-glass")),
    renderer: String(inspect.renderer).includes("MeshPhysicalMaterial") && String(inspect.physics).includes("Rapier"),
    pleosStructure: inspect.solids === 3 && inspect.sharedOrigin === true && inspect.axisFamily === "30deg",
    pointerInteraction: inspect.pointerInteraction === true,
    exactSize: png.width === 320 && png.height === 400,
    transparentOutput: transparent > png.width * png.height * .08 && visible > png.width * png.height * .04,
    presets: new Set(presetHashes).size === 3,
    responsiveUi: !ui.overflow && ui.panel && ui.controls >= 16,
    singleCanvas: ui.singleCanvas === 1 && inspect.studioMode?.lifecycle?.canvasCount === 1,
    console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Kinetic Glass verification failed: ${JSON.stringify({ checks, inspect, ui, errors })}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", checks, presetHashes }, null, 2)}\n`);
} finally {
  await browser.close();
  child.kill("SIGTERM");
}
