import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "artifacts/mode-studio");
const url = process.env.PLEOS_CAPTURE_URL ?? "http://127.0.0.1:5173/";

async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function ensureServer() {
  if (await reachable()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore", shell: process.platform === "win32" });
  const deadline = Date.now() + 25_000;
  while (!(await reachable())) {
    if (child.exitCode !== null) throw new Error("Mode Studio capture server exited early.");
    if (Date.now() > deadline) throw new Error("Mode Studio capture server timeout.");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 125));
  }
  return child;
}

await mkdir(output, { recursive: true });
const server = await ensureServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

async function capture(name) { await page.screenshot({ path: resolve(output, name) }); }

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.waitForTimeout(300);
  await capture("01-workspace.png");
  await capture("02-glass3d-panel.png");

  await page.locator("[data-context-advanced='look-material']").evaluate((element) => { element.open = true; });
  await page.locator("[data-context-advanced='look-lighting']").evaluate((element) => { element.open = true; });
  await page.waitForTimeout(150);
  await capture("03-glass3d-details.png");

  await page.locator(".topbar-variation-actions > summary").click();
  await capture("04-variation-menu.png");
  await page.locator(".topbar-variation-actions > summary").click();

  await page.locator("[data-output-section]").scrollIntoViewIfNeeded();
  await capture("05-output.png");

  const motion = page.locator("[data-motion='enabled']");
  await motion.check();
  await page.locator(".inspector-view").evaluate((element) => { element.scrollTop = 0; });
  await capture("06-motion-enabled.png");

  await motion.uncheck();
  await capture("07-motion-disabled-state.png");
  await motion.check();

  await page.locator("[data-action='inspector-toggle']").click();
  await page.waitForTimeout(220);
  await capture("08-inspector-collapsed.png");
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}

process.stdout.write(`${output}\n`);
