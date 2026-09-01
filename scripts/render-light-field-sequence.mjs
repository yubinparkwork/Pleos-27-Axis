import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, entry, index, source) => entry.startsWith("--") ? [...items, [entry.slice(2), source[index + 1]]] : items, []));
const fps = Number(args.fps ?? 30); const duration = Number(args.duration ?? 10); const width = Number(args.width ?? 1080); const height = Number(args.height ?? 1080); const preset = args.preset ?? "iridescent-pulse"; const out = args.out ?? `artifacts/light-field/sequence/${preset}`;
await mkdir(out, { recursive: true }); const port = 41740; const url = `http://127.0.0.1:${port}/`;
const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
const limit = Date.now() + 25_000; while (true) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } if (child.exitCode !== null || Date.now() > limit) throw new Error("Sequence server failed."); await new Promise((resolve) => setTimeout(resolve, 125)); }
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
try {
  await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(({ presetId, w, h }) => { window.__pleos27Axis.switchMode("light-field"); window.__pleos27Axis.setLightFieldPreset(presetId); window.__pleos27Axis.pause(); window.__pleos27Axis.setArtboard({ id: "custom", width: w, height: h }); }, { presetId: preset, w: width, h: height });
  const total = Math.round(fps * duration);
  for (let frame = 0; frame < total; frame += 1) { const data = await page.evaluate(async ({ index, rate }) => window.__pleos27Axis.exportFrame(index, rate, false), { index: frame, rate: fps }); await writeFile(`${out}/frame-${String(frame).padStart(6, "0")}.png`, Buffer.from(data.split(",")[1], "base64")); }
  process.stdout.write(`${JSON.stringify({ status: "pass", frames: total, fps, duration, width, height, out }, null, 2)}\n`);
} finally { await browser.close(); child.kill("SIGTERM"); }
