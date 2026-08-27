import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "artifacts/design-polish");
const url = process.env.PLEOS_CAPTURE_URL ?? "http://127.0.0.1:5173/";

async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function ensureServer() {
  if (await reachable()) return null;
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const deadline = Date.now() + 25_000;
  while (!(await reachable())) { if (Date.now() > deadline) throw new Error("Vite server timeout"); await new Promise((resolveWait) => setTimeout(resolveWait, 150)); }
  return server;
}
const decode = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

await mkdir(output, { recursive: true });
const server = await ensureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const variations = [
    ["builtin-prism-clean", "prism-clean.png"], ["builtin-prism-rgb-edge", "prism-rgb-edge.png"], ["builtin-prism-immersive", "prism-immersive.png"],
    ["builtin-spectral-dark", "spectral-subtle.png"], ["builtin-spectral-balanced", "spectral-balanced.png"], ["builtin-spectral-active", "spectral-active.png"],
  ];
  for (const [id, file] of variations) {
    const data = await page.evaluate(async (variationId) => { const api = window.__pleos27Axis; api.applyVariation(variationId); api.pause(); return api.exportPng(false); }, id);
    await writeFile(resolve(output, file), decode(data));
  }
  const motions = [
    ["spectral-axis-sweep", 3.5, "motion-sweep.png"], ["shared-vertex-pulse", 2.7, "motion-pulse.png"], ["explode-rejoin", 3.2, "motion-explode.png"],
  ];
  for (const [preset, time, file] of motions) {
    const data = await page.evaluate(async ({ presetId, heroTime }) => { const api = window.__pleos27Axis; api.applyVariation("builtin-spectral-balanced"); api.setMotionPreset(presetId); api.pause(); api.seek(heroTime); return api.exportPng(false); }, { presetId: preset, heroTime: time });
    await writeFile(resolve(output, file), decode(data));
  }
  for (const tab of ["look", "motion", "format"]) {
    await page.locator(`[data-inspector-tab='${tab}']`).click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: resolve(output, `ui-${tab}.png`) });
  }
  await page.locator("[data-inspector-tab='look']").click();
  await page.screenshot({ path: resolve(output, "ui-variations.png") });
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", files: 13, output: "artifacts/design-polish" }, null, 2)}\n`);
} finally {
  await context.close(); await browser.close(); server?.kill("SIGTERM");
}
