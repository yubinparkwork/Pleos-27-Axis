import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.NEW_AXIS_URL ?? "http://127.0.0.1:4173";
const output = resolve(process.argv[2] ?? "artifacts/new-axis-2800x2080.png");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1040 }, deviceScaleFactor: 2 });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__newAxis?.captureDataURL === "function");
  const dataUrl = await page.evaluate(() => window.__newAxis.captureDataURL(2800, 2080));
  await mkdir(resolve("artifacts"), { recursive: true });
  await writeFile(output, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(output);
} finally {
  await browser.close();
}
