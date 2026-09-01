import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.PLEOS_HABITAT_PORT ?? 41739);
const url = process.env.PLEOS_HABITAT_URL ?? `http://127.0.0.1:${port}/`;
const artifactDir = new URL("../artifacts/axis-habitat/", import.meta.url);

async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function server() {
  if (process.env.PLEOS_HABITAT_URL && await reachable()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  const limit = Date.now() + 25_000;
  while (!(await reachable())) {
    if (child.exitCode !== null) throw new Error("Formation Loop verification server exited early.");
    if (Date.now() > limit) throw new Error("Formation Loop verification server timeout.");
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  return child;
}

const decode = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const hash = (dataUrl) => createHash("sha256").update(decode(dataUrl)).digest("hex");
const pngDimensions = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

const devServer = await server();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.addInitScript(() => localStorage.removeItem("pleos-27-axis-studio-state-v2"));

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis));
  await page.evaluate(() => window.__pleos27Axis.switchMode("axis-habitat"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "axis-habitat" && window.__pleos27Axis.inspect().ready === true);
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__pleos27Axis.pause());
  const initial = await page.evaluate(() => window.__pleos27Axis.inspect());

  const stages = {};
  const frames = {};
  for (const [label, time] of [["drawing", .6], ["material", 4.2], ["suspended", 6.3], ["return", 9.4]]) {
    await page.evaluate((nextTime) => window.__pleos27Axis.seek(nextTime), time);
    await page.waitForTimeout(120);
    stages[label] = await page.evaluate(() => window.__pleos27Axis.inspect().formation?.stage);
    frames[label] = await page.evaluate((frame) => window.__pleos27Axis.exportFrame(frame, 30, false), Math.round(time * 30));
  }

  // A fresh Vite server can reload once after optimizing Three.js example chunks.
  // Restore the requested production mode before interaction checks when that happens.
  if (await page.locator(".axis-habitat-canvas").count() === 0) {
    await page.waitForFunction(() => Boolean(window.__pleos27Axis));
    await page.evaluate(() => window.__pleos27Axis.switchMode("axis-habitat"));
    await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "axis-habitat" && window.__pleos27Axis.inspect().ready === true);
    await page.evaluate(() => window.__pleos27Axis.pause());
  }
  const canvas = page.locator(".axis-habitat-canvas");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  const keyboardFocus = await canvas.evaluate((element) => document.activeElement === element);

  const panel = page.locator("[data-mode-panel='axis-habitat']");
  const detailedMotionControls = await panel.locator("input[type='range']:visible").count();
  await page.getByRole("combobox", { name: "조각 모션 순서" }).selectOption("solid-cascade");
  await page.getByRole("combobox", { name: "모션 이징 성격" }).selectOption("elastic");
  await page.getByRole("slider", { name: "복귀 오버슈트" }).fill("0.24");
  await page.waitForTimeout(180);
  const tunedMotion = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.getByRole("button", { name: "모션값 초기화" }).click();
  await page.waitForTimeout(120);
  const resetMotion = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.getByRole("button", { name: "비주얼" }).click();
  const lookTab = await page.getByRole("heading", { name: "프리셋과 구조" }).isVisible();
  const luminousHeading = await page.getByRole("heading", { name: "발광 공간 구조" }).isVisible();
  const luminousVisualControls = await panel.locator("input[type='range']:visible").count();
  await page.getByRole("button", { name: "출력" }).click();
  const outputTab = await page.getByRole("button", { name: "PNG 내보내기" }).isVisible();
  const ultraQuality = await page.locator("select[aria-label='실시간 품질'] option[value='ultra']").count();
  await page.getByRole("button", { name: "모션" }).click();

  await page.evaluate(() => window.__pleos27Axis.setAxisHabitatPreset("blue-archive"));
  await page.waitForTimeout(420);
  const blue = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.evaluate(() => window.__pleos27Axis.setAxisHabitatPreset("obsidian-signal"));
  await page.waitForTimeout(420);
  const obsidian = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.evaluate(() => window.__pleos27Axis.setAxisHabitatPreset("frosted-formation"));
  await page.waitForTimeout(420);
  await page.evaluate(() => { window.__pleos27Axis.pause(); window.__pleos27Axis.seek(4.2); });
  const frosted = await page.evaluate(() => window.__pleos27Axis.inspect());

  const png = decode(frames.material);
  const pngSize = pngDimensions(png);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(new URL("pleos-formation-material-hold.png", artifactDir), png);
  fs.writeFileSync(new URL("pleos-formation-wire.png", artifactDir), decode(frames.drawing));
  fs.writeFileSync(new URL("pleos-formation-suspended.png", artifactDir), decode(frames.suspended));

  await page.setViewportSize({ width: 720, height: 860 });
  await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: document.querySelector(".axis-habitat-canvas")?.getBoundingClientRect().width ?? 0,
    panel: document.querySelector("[data-mode-panel='axis-habitat']")?.getBoundingClientRect().width ?? 0,
  }));
  await page.getByRole("button", { name: "Inspector 표시 또는 숨기기" }).click();
  await page.waitForTimeout(220);
  const collapsed = await page.evaluate(() => ({
    shell: document.querySelector(".studio-shell")?.classList.contains("studio-inspector-collapsed"),
    canvas: document.querySelector(".axis-habitat-canvas")?.getBoundingClientRect().width ?? 0,
  }));

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-prism"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-prism");
  await page.evaluate(() => window.__pleos27Axis.switchMode("axis-habitat"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "axis-habitat" && window.__pleos27Axis.inspect().ready === true);
  await page.waitForTimeout(420);
  const restored = await page.evaluate(() => window.__pleos27Axis.inspect());
  const counts = {
    canvas: await page.locator(".axis-habitat-canvas").count(),
    panel: await page.locator("[data-mode-panel='axis-habitat']").count(),
    svelteInspector: await page.getByText("SVELTE · THREE.JS · WEBGL2", { exact: true }).count(),
  };

  const stageHashes = Object.fromEntries(Object.entries(frames).map(([label, data]) => [label, hash(data)]));
  const checks = {
    independentMode: initial.studioMode?.activeMode === "axis-habitat" && initial.studioMode?.capabilities?.pathTracing === false,
    fullTechnologyStack: initial.technologies?.svelte === true && initial.technologies?.three === true && initial.technologies?.webgl2 === true && Boolean(initial.technologies?.gsap) && initial.technologies?.threeMeshBvh === true,
    axisContract: initial.sharedOrigin === true && initial.solids === 3 && initial.axisFamily === "30deg",
    luminousSpatialArchitecture: initial.formation?.luminousSegments >= 120 && initial.formation?.luminousHotspots >= 10 && initial.formation?.filamentLayers === 3 && initial.appearance?.renderingDirection === "HDR luminous spatial architecture" && initial.appearance?.postPipeline?.includes("selective bloom"),
    glass3dCamera: initial.camera?.projection === "orthographic" && initial.camera?.glass3dMatch === true && initial.camera?.position?.[2] === -12 && initial.camera?.target?.[1] === .02,
    fragmentedStructure: initial.formation?.fragments >= 192 && initial.formation?.instancedDraws === 6 && initial.formation?.scaffold === true,
    bvhInteraction: initial.bvh?.solidProxies === 3 && initial.bvh?.firstHitOnly === true,
    stageSequence: stages.drawing === "DRAWING" && stages.material === "MATERIAL HOLD" && stages.suspended === "SUSPENDED" && stages.return === "REASSEMBLING",
    frameDistinct: new Set(Object.values(stageHashes)).size === 4,
    performanceBudget: initial.performance?.drawCalls > 0 && initial.performance?.drawCalls <= 40 && initial.performance?.dpr <= 1.8,
    darkHighContrastAppearance: initial.appearance?.background?.toLowerCase() === "#000000" && initial.appearance?.lineColor?.toLowerCase() === "#ffffff" && initial.appearance?.exportMsaa === 4,
    detailedMotionPanel: detailedMotionControls >= 28 && tunedMotion.formation?.order === "solid-cascade" && tunedMotion.formation?.ease === "elastic" && resetMotion.formation?.order === "clustered" && resetMotion.formation?.ease === "cinematic" && lookTab && outputTab,
    detailedLuminousPanel: luminousHeading && luminousVisualControls >= 25 && ultraQuality === 1,
    variationDistinct: blue.preset === "blue-archive" && obsidian.preset === "obsidian-signal" && frosted.preset === "frosted-formation" && blue.formation?.fragments > obsidian.formation?.fragments,
    exactPng: pngSize.width === 1080 && pngSize.height === 1080 && png.subarray(1, 4).toString("ascii") === "PNG",
    keyboardFocus,
    narrowLayout: narrow.scrollWidth <= narrow.viewport && narrow.canvas >= 120 && narrow.panel >= 280,
    inspectorCollapse: collapsed.shell === true && collapsed.canvas > narrow.canvas,
    lifecycle: counts.canvas === 1 && counts.panel === 1 && counts.svelteInspector === 1 && restored.preset === "frosted-formation",
    console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Formation Loop runtime verification failed: ${JSON.stringify({ checks, initial, stages, stageHashes, narrow, collapsed, counts, errors })}`);
  process.stdout.write(`${JSON.stringify({
    status: "pass",
    checks,
    technologies: initial.technologies,
    stages,
    performance: initial.performance,
    pngSize,
    artifacts: [
      "artifacts/axis-habitat/pleos-formation-wire.png",
      "artifacts/axis-habitat/pleos-formation-material-hold.png",
      "artifacts/axis-habitat/pleos-formation-suspended.png",
    ],
  }, null, 2)}\n`);
} finally {
  await browser.close();
  devServer?.kill("SIGTERM");
}
