import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    values[token.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const config = {
  look: args.look ?? "prism",
  preset: args.preset ?? "spectral-axis-sweep",
  width: Number(args.width ?? 1080),
  height: Number(args.height ?? 1080),
  fps: Number(args.fps ?? 30),
  duration: Number(args.duration ?? 6),
  quality: args.quality ?? "raster",
  out: resolve(args.out ?? `artifacts/motion/${args.preset ?? "spectral-axis-sweep"}`),
  seed: Number(args.seed ?? 27),
  strength: Number(args.strength ?? .65),
  url: args.url ?? "http://127.0.0.1:5173/",
};

if (!["clear", "prism", "smoked", "spectral-flow"].includes(config.look)) throw new Error("look must be clear, prism, smoked, or spectral-flow");

if (!Number.isFinite(config.width) || !Number.isFinite(config.height) || config.width < 16 || config.height < 16) throw new Error("width/height must be valid pixel dimensions");
if (!Number.isFinite(config.fps) || !Number.isFinite(config.duration) || config.fps <= 0 || config.duration <= 0) throw new Error("fps/duration must be positive");
if (config.quality !== "raster") throw new Error("Motion Studio V1 sequence supports --quality raster. Use the UI for path-traced current-frame stills.");

async function reachable(url) {
  try { const response = await fetch(url); return response.ok; } catch { return false; }
}

let server = null;
if (!(await reachable(config.url))) {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { stdio: "inherit", shell: process.platform === "win32" });
  const deadline = Date.now() + 20_000;
  while (!(await reachable(config.url))) {
    if (Date.now() > deadline) throw new Error(`Dev server did not become ready at ${config.url}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}

await mkdir(config.out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(config.url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate((value) => {
    const api = window.__pleos27Axis;
    api.setLook(value.look);
    api.setMotionPreset(value.preset);
    api.setMotionStrength(value.strength);
    api.configureMotion({ fps: value.fps, duration: value.duration, seed: value.seed, loop: true });
    api.setArtboard({ id: "custom", width: value.width, height: value.height });
    api.pause();
  }, config);
  const frameCount = Math.round(config.duration * config.fps);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const dataUrl = await page.evaluate(async ({ time }) => {
      const api = window.__pleos27Axis;
      api.seek(time);
      return api.exportPng(false);
    }, { time: frame / config.fps });
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    await writeFile(resolve(config.out, `frame-${String(frame).padStart(6, "0")}.png`), png);
    if (frame % Math.max(1, Math.round(config.fps)) === 0) process.stdout.write(`Rendered ${frame + 1}/${frameCount}\n`);
  }
  process.stdout.write(`Complete: ${frameCount} frames at ${config.width}x${config.height} -> ${config.out}\n`);
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
