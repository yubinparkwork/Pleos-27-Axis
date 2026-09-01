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
  samples: Number(args.samples ?? 512),
  bounces: Number(args.bounces ?? 14),
  renderScale: Number(args["render-scale"] ?? 1),
  bevel: Number(args.bevel ?? .018),
  gap: Number(args.gap ?? 0),
  cameraPanX: Number(args["camera-pan-x"] ?? 0),
  cameraPanY: Number(args["camera-pan-y"] ?? 0),
  artboardScale: Number(args["artboard-scale"] ?? .82),
  background: args.background ?? "#050607",
  lightingPreset: args["lighting-preset"] ?? "pleos-prism",
  masterIntensity: Number(args["master-intensity"] ?? .8),
  environmentIntensity: Number(args["environment-intensity"] ?? .62),
  exposure: Number(args.exposure ?? 1),
  bloom: Number(args.bloom ?? .1),
  saturation: Number(args.saturation ?? .78),
  firstLightColor: args["first-light-color"] ?? "",
  headed: args.headed === "true",
  startFrame: Number(args["start-frame"] ?? 0),
  endFrame: args["end-frame"] === undefined ? null : Number(args["end-frame"]),
  video: args.video ? resolve(args.video) : "",
  url: args.url ?? "http://127.0.0.1:5173/",
};

if (!["clear", "prism", "smoked", "spectral-flow"].includes(config.look)) throw new Error("look must be clear, prism, smoked, or spectral-flow");

if (!Number.isFinite(config.width) || !Number.isFinite(config.height) || config.width < 16 || config.height < 16) throw new Error("width/height must be valid pixel dimensions");
if (!Number.isFinite(config.fps) || !Number.isFinite(config.duration) || config.fps <= 0 || config.duration <= 0) throw new Error("fps/duration must be positive");
if (config.quality !== "raster" && config.quality !== "path") throw new Error("quality must be raster or path");
if (!Number.isFinite(config.samples) || config.samples < 1 || config.samples > 4096) throw new Error("samples must be between 1 and 4096");

async function run(command, commandArgs) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited with ${code}`)));
  });
}

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
const browser = await chromium.launch({ headless: !config.headed });
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
    api.setArtboard({ id: "custom", width: value.width, height: value.height, scale: value.artboardScale, background: value.background });
    const commit = (name, next) => {
      const input = document.querySelector(`[data-number='${name}']`);
      if (!input) return;
      input.value = String(next);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    commit("gap", value.gap);
    commit("bevel-radius", value.bevel);
    commit("camera-pan-x", value.cameraPanX);
    commit("camera-pan-y", value.cameraPanY);
    commit("target-samples", value.samples);
    commit("bounces", value.bounces);
    commit("scale", value.renderScale);
    document.querySelector(`[data-lighting-preset='${value.lightingPreset}']`)?.click();
    const commitLight = (name, next) => {
      const input = document.querySelector(`[data-light-number='global-${name}']`);
      if (!input) return;
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    commitLight("masterIntensity", value.masterIntensity);
    commitLight("environmentIntensity", value.environmentIntensity);
    commitLight("exposure", value.exposure);
    commitLight("bloomIntensity", value.bloom);
    commitLight("colorSaturation", value.saturation);
    if (value.firstLightColor) {
      document.querySelector("[data-light-select]")?.click();
      const color = document.querySelector("[data-light-color-hex]");
      if (color) {
        color.value = value.firstLightColor;
        color.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    api.pause();
  }, config);
  const frameCount = Math.round(config.duration * config.fps);
  const startFrame = Math.max(0, Math.floor(config.startFrame));
  const endFrame = Math.min(frameCount, config.endFrame === null ? frameCount : Math.floor(config.endFrame));
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const dataUrl = await page.evaluate(async ({ time, quality }) => {
      const api = window.__pleos27Axis;
      api.seek(time);
      return quality === "path" ? api.renderCurrentFrame(false) : api.exportPng(false);
    }, { time: frame / config.fps, quality: config.quality });
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    await writeFile(resolve(config.out, `frame-${String(frame).padStart(6, "0")}.png`), png);
    if ((frame - startFrame) % Math.max(1, Math.round(config.fps)) === 0) process.stdout.write(`Rendered frame ${frame + 1}/${frameCount} · worker ${startFrame}-${endFrame - 1}\n`);
  }
  process.stdout.write(`Complete worker: frames ${startFrame}-${endFrame - 1} at ${config.width}x${config.height} -> ${config.out}\n`);
  if (config.video) {
    await mkdir(resolve(config.video, ".."), { recursive: true });
    await run("ffmpeg", ["-y", "-framerate", String(config.fps), "-i", resolve(config.out, "frame-%06d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", config.video]);
    process.stdout.write(`Video: ${config.video}\n`);
  }
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
