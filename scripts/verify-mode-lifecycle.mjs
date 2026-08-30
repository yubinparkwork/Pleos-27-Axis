import { spawn } from "node:child_process";
import { chromium } from "playwright";

const url = process.env.PLEOS_VERIFY_URL ?? "http://127.0.0.1:5173/";

async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function server() {
  if (await reachable()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { stdio: "ignore", shell: process.platform === "win32" });
  const limit = Date.now() + 25_000;
  while (!(await reachable())) {
    if (child.exitCode !== null) throw new Error("Mode lifecycle server exited early.");
    if (Date.now() > limit) throw new Error("Mode lifecycle server timeout.");
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  return child;
}

const devServer = await server();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => {
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  const pending = new Set();
  window.__pleosRafDiagnostics = { pending };
  window.requestAnimationFrame = (callback) => {
    let id = 0;
    id = requestFrame((time) => { pending.delete(id); callback(time); });
    pending.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => { pending.delete(id); cancelFrame(id); };
});

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => window.__pleos27Axis.setArtboard({ id: "custom", width: 1333, height: 777, previewZoom: 1.15 }));
  const artboardBeforeVariations = await page.evaluate(() => window.__pleos27Axis.inspect().artboard);
  const variationIds = await page.evaluate(() => {
    const items = window.__pleos27Axis.listVariations();
    return [items[0]?.id, items[1]?.id, items[2]?.id].filter(Boolean);
  });
  for (const id of variationIds) await page.evaluate((variationId) => window.__pleos27Axis.applyVariation(variationId), id);
  const artboardAfterVariations = await page.evaluate(() => window.__pleos27Axis.inspect().artboard);
  const variationId = variationIds.at(-1);
  const before = await page.evaluate(() => window.__pleos27Axis.inspect());
  const pendingRafBefore = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  await page.evaluate(() => window.__pleos27Axis.remountMode());
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__pleos27Axis.inspect());
  const pendingRafAfter = await page.evaluate(() => window.__pleosRafDiagnostics.pending.size);
  const canvasCount = await page.locator(".motion-studio canvas").count();
  const modePanels = await page.locator("[data-mode-panel='glass-3d']").count();
  const checks = {
    activeMode: after.studioMode?.activeMode === "glass-3d",
    registeredModes: after.studioMode?.registeredModes?.length === 1,
    canvasCount: canvasCount === 2 && after.studioMode?.lifecycle?.canvasCount === 2,
    panelCount: modePanels === 1,
    variationRouted: before.variations?.selectedId === variationId && after.variations?.selectedId === variationId,
    variationArtboardStable: JSON.stringify(artboardAfterVariations) === JSON.stringify(artboardBeforeVariations),
    lookRestored: before.assembly?.look === after.assembly?.look,
    artboardRestored: before.artboard?.width === after.artboard?.width && before.artboard?.height === after.artboard?.height,
    rafNotDuplicated: pendingRafBefore > 0 && pendingRafAfter <= pendingRafBefore,
    console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Mode lifecycle verification failed: ${JSON.stringify({ checks, pendingRafBefore, pendingRafAfter, errors })}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", checks, pendingRaf: { before: pendingRafBefore, after: pendingRafAfter } }, null, 2)}\n`);
} finally {
  await browser.close();
  devServer?.kill("SIGTERM");
}
