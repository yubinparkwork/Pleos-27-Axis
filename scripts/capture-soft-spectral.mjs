import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { chromium } from "playwright";

const url = process.env.PLEOS_CAPTURE_URL ?? "http://127.0.0.1:5173/";
const out = resolve(process.argv[2] ?? "artifacts/soft-spectral");
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
  { file: "soft-subtle.png", preset: "subtle", time: 4, width: 1080, height: 1080 },
  { file: "soft-balanced.png", preset: "balanced", time: 4, width: 1080, height: 1080 },
  { file: "soft-active.png", preset: "active", time: 4, width: 1080, height: 1080 },
  { file: "soft-center-glow.png", preset: "balanced", time: 4, width: 1080, height: 1080, patch: { glow: 1.8, centerRadius: .72, centerSoftness: .9, spectrum: .52 } },
  { file: "soft-edge-response.png", preset: "active", time: 6, width: 1080, height: 1080, patch: { edge: 1.25, edgeAttraction: 1.45, edgeSoftness: .9, glow: .82 } },
  { file: "soft-dark-rest.png", preset: "subtle", time: 0, width: 1080, height: 1080, patch: { darkness: .92, glow: .42, spectrum: .3 } },
  { file: "soft-4x5.png", preset: "balanced", time: 4, width: 1080, height: 1350 },
  { file: "soft-9x16.png", preset: "balanced", time: 4, width: 1080, height: 1920 },
  { file: "soft-motion-25.png", preset: "balanced", time: 2, width: 1080, height: 1080 },
  { file: "soft-motion-50.png", preset: "balanced", time: 4, width: 1080, height: 1080 },
  { file: "soft-motion-75.png", preset: "balanced", time: 6, width: 1080, height: 1080 },
];

try {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.evaluate(() => localStorage.removeItem("pleos-27-axis-settings-v2"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const records = [];
  for (const capture of captures) {
    const dataUrl = await page.evaluate(async (item) => {
      const api = window.__pleos27Axis;
      api.setLook("soft-spectral"); api.setMotionPreset("spectral-axis-sweep");
      api.configureMotion({ duration: 8, fps: 30, loop: true, constraint: "strict" });
      api.setSoftSpectralPreset(item.preset); if (item.patch) api.setSoftSpectral(item.patch);
      api.setArtboard({ id: "custom", width: item.width, height: item.height });
      api.pause(); api.seek(item.time); return api.exportPng(false);
    }, capture);
    const buffer = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    await writeFile(resolve(out, capture.file), buffer);
    const png = PNG.sync.read(buffer);
    records.push({ ...capture, actual: [png.width, png.height], bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
  }
  await page.evaluate(() => { window.__pleos27Axis.applyVariation("builtin-soft-spectral-balanced"); });
  await page.getByRole("button", { name: "LOOK" }).click();
  await page.screenshot({ path: resolve(out, "ui-soft-spectral.png"), fullPage: true });
  const loopHashes = [];
  for (const time of [0, 8]) {
    const dataUrl = await page.evaluate(async (value) => { const api = window.__pleos27Axis; api.seek(value); return api.exportPng(false); }, time);
    loopHashes.push(createHash("sha256").update(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")).digest("hex"));
  }
  const report = { status: errors.length ? "fail" : "pass", renderer: "high-resolution-raster", captures: records, loop: { duration: 8, exact: loopHashes[0] === loopHashes[1], hashes: loopHashes }, consoleErrors: errors };
  await writeFile(resolve(out, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close(); server?.kill("SIGTERM");
}
