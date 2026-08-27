import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { chromium } from "playwright";

const url = process.env.PLEOS_CAPTURE_URL ?? "http://127.0.0.1:5173/";
const out = resolve(process.argv[2] ?? "artifacts/spectral-flow");
async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
let server = null;
if (!(await reachable())) {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { stdio: "inherit", shell: process.platform === "win32" });
  const deadline = Date.now() + 20_000;
  while (!(await reachable())) { if (Date.now() > deadline) throw new Error("Local server did not start"); await new Promise((done) => setTimeout(done, 100)); }
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const captures = [
  { file: "01-spectral-subtle.png", preset: "subtle", time: 3, width: 1080, height: 1080 },
  { file: "02-spectral-balanced.png", preset: "balanced", time: 3, width: 1080, height: 1080 },
  { file: "03-spectral-active.png", preset: "active", time: 3, width: 1080, height: 1080 },
  { file: "04-spectral-white-core.png", preset: "balanced", time: 3, width: 1080, height: 1080, patch: { coreIntensity: 4.2, coreWidth: .11, saturation: .72 } },
  { file: "05-spectral-edge-response.png", preset: "active", time: 4.5, width: 1080, height: 1080, patch: { edgeAttraction: 2.4, reflection: 2.2, flowDirection: "axis-150" } },
  { file: "06-spectral-dark-state.png", preset: "balanced", time: 0, width: 1080, height: 1080 },
  { file: "07-spectral-origin-crossing.png", preset: "balanced", time: 3, width: 1080, height: 1080, patch: { flowPosition: 0, flowDirection: "axis-30" } },
  { file: "08-spectral-4x5.png", preset: "balanced", time: 3, width: 1080, height: 1350 },
  { file: "09-spectral-9x16.png", preset: "balanced", time: 3, width: 1080, height: 1920 },
];

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => localStorage.removeItem("pleos-27-axis-settings-v2"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const records = [];
  for (const capture of captures) {
    const dataUrl = await page.evaluate(async (item) => {
      const api = window.__pleos27Axis;
      api.setLook("spectral-flow");
      api.setMotionPreset("spectral-axis-sweep");
      api.configureMotion({ duration: 6, fps: 30, loop: true, constraint: "strict" });
      api.setSpectralFlowPreset(item.preset);
      if (item.patch) api.setSpectralFlow(item.patch);
      api.setArtboard({ id: "custom", width: item.width, height: item.height });
      api.pause(); api.seek(item.time);
      return api.exportPng(false);
    }, capture);
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    await writeFile(resolve(out, capture.file), buffer);
    records.push({ ...capture, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
  }

  const loopFrames = [];
  const timeSamples = [];
  for (const time of [0, 1.5, 3, 4.5, 6]) {
    const dataUrl = await page.evaluate(async (value) => { const api = window.__pleos27Axis; api.seek(value); return api.exportPng(false); }, time);
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    timeSamples.push({ percent: Math.round(time / 6 * 100), time, sha256: createHash("sha256").update(buffer).digest("hex") });
    if (time === 0 || time === 6) loopFrames.push(PNG.sync.read(buffer));
  }
  let absolute = 0;
  for (let index = 0; index < loopFrames[0].data.length; index += 1) absolute += Math.abs(loopFrames[0].data[index] - loopFrames[1].data[index]);
  const meanAbsoluteDifference = absolute / loopFrames[0].data.length;
  const report = { status: "pass", captures: records, timeSamples, loop: { duration: 6, meanAbsoluteDifference, exact: meanAbsoluteDifference === 0 } };
  await writeFile(resolve(out, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
