import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const port = 41739; const url = `http://127.0.0.1:${port}/`; const root = new URL("../artifacts/light-field/", import.meta.url);
for (const name of ["presets", "motion", "formats", "ui", "lifecycle"]) await mkdir(new URL(`${name}/`, root), { recursive: true });
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
const limit = Date.now() + 25_000;
while (true) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } if (child.exitCode !== null || Date.now() > limit) throw new Error("Light Field capture server failed."); await new Promise((resolve) => setTimeout(resolve, 125)); }
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.removeItem("pleos-27-axis-studio-state-v2"));
const saveData = async (relative, data) => writeFile(new URL(relative, root), Buffer.from(data.split(",")[1], "base64"));
const outputPath = (relative) => fileURLToPath(new URL(relative, root));
try {
  await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.screenshot({ path: outputPath("lifecycle/glass-before.png") });
  await page.evaluate(() => window.__pleos27Axis.switchMode("light-field")); await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "light-field"); await page.evaluate(() => window.__pleos27Axis.pause());
  const presets = [["iridescent-pulse", "iridescent-pulse.png"], ["violet-membrane", "violet-membrane.png"], ["spectral-white", "spectral-white.png"]];
  for (const [preset, filename] of presets) {
    const data = await page.evaluate(async (id) => { window.__pleos27Axis.setLightFieldPreset(id); window.__pleos27Axis.setArtboard({ id: "square", width: 1080, height: 1080, transparent: false, previewZoom: 1 }); return window.__pleos27Axis.exportFrame(150, 30, false); }, preset);
    await saveData(`presets/${filename}`, data);
  }
  const frames = [[0, "000"], [75, "025"], [150, "050"], [225, "075"], [300, "100"]];
  await page.evaluate(() => window.__pleos27Axis.setLightFieldPreset("iridescent-pulse"));
  for (const [frame, suffix] of frames) await saveData(`motion/frame-${suffix}.png`, await page.evaluate(async (value) => window.__pleos27Axis.exportFrame(value, 30, false), frame));
  const formats = [
    [{ id: "square", width: 1080, height: 1080 }, "square.png"],
    [{ id: "instagram-portrait", width: 1080, height: 1350 }, "portrait-4x5.png"],
    [{ id: "vertical-9-16", width: 1080, height: 1920 }, "vertical-9x16.png"],
  ];
  for (const [format, filename] of formats) { await page.evaluate((value) => window.__pleos27Axis.setArtboard(value), format); await saveData(`formats/${filename}`, await page.evaluate(() => window.__pleos27Axis.exportFrame(150, 30, false))); }
  await page.evaluate(() => window.__pleos27Axis.setArtboard({ id: "instagram-portrait", width: 1080, height: 1350, previewZoom: 1 })); await page.waitForTimeout(100);
  await page.screenshot({ path: outputPath("lifecycle/light-field.png") });
  await page.screenshot({ path: outputPath("ui/light-field-default.png") });
  await page.locator(".field-details summary").first().click(); await page.screenshot({ path: outputPath("ui/field-details.png") });
  await page.locator("[data-shell-variation]").click(); await page.screenshot({ path: outputPath("ui/variation-menu.png") }); await page.keyboard.press("Escape");
  await page.locator("[data-shell-export]").click(); await page.waitForTimeout(200); await page.screenshot({ path: outputPath("ui/output.png") });
  await page.locator("[data-shell-inspector]").click(); await page.waitForTimeout(180); await page.screenshot({ path: outputPath("ui/inspector-collapsed.png") }); await page.locator("[data-shell-inspector]").click();
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-3d")); await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-3d"); await page.waitForTimeout(500); await page.screenshot({ path: outputPath("lifecycle/glass-restored.png") });
  process.stdout.write(`${JSON.stringify({ status: "pass", output: fileURLToPath(root) }, null, 2)}\n`);
} finally { await browser.close(); child.kill("SIGTERM"); }
