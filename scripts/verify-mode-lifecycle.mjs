import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.PLEOS_VERIFY_PORT ?? 41737);
const url = process.env.PLEOS_VERIFY_URL ?? `http://127.0.0.1:${port}/`;
async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function server() {
  if (process.env.PLEOS_VERIFY_URL && await reachable()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  const limit = Date.now() + 25_000;
  while (!(await reachable())) { if (child.exitCode !== null) throw new Error("Mode lifecycle server exited early."); if (Date.now() > limit) throw new Error("Mode lifecycle server timeout."); await new Promise((resolve) => setTimeout(resolve, 125)); }
  return child;
}

const devServer = await server();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => {
  if (!sessionStorage.getItem("pleos-lifecycle-initialized")) {
    localStorage.removeItem("pleos-27-axis-studio-state-v2");
    localStorage.removeItem("pleos-27-axis-manual-save-v1");
    sessionStorage.setItem("pleos-lifecycle-initialized", "1");
  }
  const requestFrame = window.requestAnimationFrame.bind(window); const cancelFrame = window.cancelAnimationFrame.bind(window); const pending = new Set();
  window.__pleosRafDiagnostics = { pending };
  window.requestAnimationFrame = (callback) => { let id = 0; id = requestFrame((time) => { pending.delete(id); callback(time); }); pending.add(id); return id; };
  window.cancelAnimationFrame = (id) => { pending.delete(id); cancelFrame(id); };
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const modes = await page.evaluate(() => window.__pleos27Axis.listModes());
  await page.evaluate(() => window.__pleos27Axis.setArtboard({ id: "custom", width: 1333, height: 777, previewZoom: 1.15 }));
  const glassBefore = await page.evaluate(() => window.__pleos27Axis.inspect());
  const glassRaf = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  await page.evaluate(() => window.__pleos27Axis.switchMode("light-field"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "light-field");
  const light = await page.evaluate(() => window.__pleos27Axis.inspect());
  const lightCanvas = await page.locator("[data-mode-panel='light-field']").count();
  const lightRaf = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-prism"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-prism");
  const prism = await page.evaluate(() => window.__pleos27Axis.inspect());
  const prismCanvas = await page.locator("[data-mode-panel='glass-prism']").count();
  const prismRaf = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  await page.evaluate(() => window.__pleos27Axis.switchMode("light-field"));
  await page.evaluate(() => window.__pleos27Axis.applyVariation("light-field-violet-membrane"));
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-3d"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-3d");
  await page.evaluate(() => window.__pleos27Axis.applyVariation("builtin-prism-clean"));
  await page.evaluate(() => window.__pleos27Axis.applyVariation("light-field-spectral-white"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "light-field");
  const automaticVariation = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.evaluate(() => window.__pleos27Axis.setArtboard({ id: "custom", width: 1240, height: 930, previewZoom: 1 }));
  await page.waitForTimeout(250);
  await page.locator("[data-shell-save]").click();
  const manualSave = await page.evaluate(() => JSON.parse(localStorage.getItem("pleos-27-axis-manual-save-v1") ?? "null"));
  const manualSaveStatus = await page.locator("[data-shell-save-status]").textContent();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const afterReload = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-3d"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-3d");
  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(() => window.__pleos27Axis.switchMode("light-field"));
    await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "light-field");
    await page.evaluate(() => window.__pleos27Axis.switchMode("glass-prism"));
    await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-prism");
    await page.evaluate(() => window.__pleos27Axis.switchMode("glass-3d"));
    await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-3d");
  }
  await page.waitForTimeout(520);
  const glassAfter = await page.evaluate(() => window.__pleos27Axis.inspect());
  const glassCanvas = await page.locator(".motion-studio canvas").count();
  const glassPanels = await page.locator("[data-mode-panel='glass-3d']").count();
  const finalRaf = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  const checks = {
    registeredModes: ["glass-3d", "light-field", "glass-prism", "kinetic-glass", "axis-trails", "axis-habitat", "axis-megastructure"].every((id) => modes.some((item) => item.id === id)),
    lightIndependent: light.studioMode?.capabilities?.pathTracing === false && light.renderer === "custom WebGL2 fullscreen field",
    lightSingleCanvas: light.studioMode?.lifecycle?.canvasCount === 1 && lightCanvas === 1,
    prismIndependent: prism.studioMode?.capabilities?.pathTracing === false && prism.renderer === "custom Raw WebGL2 ray-box prism",
    prismSingleCanvas: prism.studioMode?.lifecycle?.canvasCount === 1 && prismCanvas === 1,
    variationAutoSwitch: automaticVariation.studioMode?.activeMode === "light-field" && automaticVariation.preset === "spectral-white" && automaticVariation.artboard?.width === 1333 && automaticVariation.artboard?.height === 777,
    persistenceReload: afterReload.studioMode?.activeMode === "light-field" && afterReload.preset === "spectral-white" && afterReload.artboard?.width === 1240 && afterReload.artboard?.height === 930,
    manualSave: manualSave?.version === 1 && manualSave?.state?.activeModeId === "light-field" && manualSave?.state?.shared?.artboard?.width === 1240 && /저장됨/.test(manualSaveStatus ?? ""),
    glassRestored: glassAfter.studioMode?.activeMode === "glass-3d" && glassAfter.assembly?.look === glassBefore.assembly?.look,
    artboardShared: light.artboard?.width === 1333 && light.artboard?.height === 777,
    canvasCount: glassCanvas === 2 && glassAfter.studioMode?.lifecycle?.canvasCount === 2,
    panelCount: glassPanels === 1,
    rafNotLeaking: glassRaf > 0 && lightRaf > 0 && prismRaf > 0 && finalRaf <= glassRaf + 1,
    console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Mode lifecycle verification failed: ${JSON.stringify({ checks, afterReload, glassRaf, lightRaf, finalRaf, errors })}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", checks, raf: { glassRaf, lightRaf, prismRaf, finalRaf } }, null, 2)}\n`);
} finally { await browser.close(); devServer?.kill("SIGTERM"); }
