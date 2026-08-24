import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.NEW_AXIS_URL ?? "http://127.0.0.1:5173/";
const outputDir = path.join(root, "artifacts", "3d", "automated");
const materialDir = path.join(outputDir, "materials");
await mkdir(materialDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__newAxis && document.querySelector("[data-region='status-metrics']"));

await page.getByRole("button", { name: "Output", exact: true }).click();
await page.getByRole("button", { name: "Reset Studio", exact: true }).click();
await page.getByRole("button", { name: "3D Studio", exact: true }).first().click();

for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(outputDir, `studio-ui-${width}x${height}.png`) });
}
await page.setViewportSize({ width: 1440, height: 900 });

async function saveRender(name, mode = "variant") {
  const dataUrl = await page.evaluate(({ mode }) => window.__newAxis.captureDataURL(2800, 2080, mode), { mode });
  const target = path.join(outputDir, `${name}-2800x2080.png`); await writeFile(target, Buffer.from(dataUrl.split(",")[1], "base64")); return target;
}

await saveRender("baseline-locked", "baseline");
await page.evaluate(() => window.__newAxis.applyCameraPreset("reference-front")); await saveRender("orthographic-reference");
for (const [id, file] of [["front-perspective", "perspective-front"], ["three-quarter-left", "perspective-three-quarter-left"]]) {
  await page.evaluate((preset) => window.__newAxis.applyCameraPreset(preset), id); await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, `${file}.png`) });
}

await page.evaluate(() => window.__newAxis.setDebug("wireframe", true)); await page.screenshot({ path: path.join(outputDir, "wireframe.png") });
await page.evaluate(() => { window.__newAxis.setDebug("wireframe", false); window.__newAxis.setDebug("normals", true); }); await page.screenshot({ path: path.join(outputDir, "face-normals.png") });
await page.evaluate(() => { window.__newAxis.setDebug("normals", false); window.__newAxis.applyGeometryPreset("exploded-planes"); }); await page.screenshot({ path: path.join(outputDir, "exploded-planes.png") });
await page.evaluate(() => window.__newAxis.applyGeometryPreset("reference-fold"));

const materials = ["reference-matte", "matte-graphite", "black-chrome", "brushed-aluminum", "smoked-glass", "frosted-acrylic", "paper-fiber", "iridescent-film"];
await page.evaluate(() => window.__newAxis.applyCameraPreset("three-quarter-left"));
for (const id of materials) { await page.evaluate((preset) => window.__newAxis.applyMaterialPreset(preset), id); await page.waitForTimeout(100); const dataUrl = await page.evaluate(() => window.__newAxis.captureDataURL(2800, 2080, "variant")); await writeFile(path.join(materialDir, `${id}-2800x2080.png`), Buffer.from(dataUrl.split(",")[1], "base64")); }

await page.evaluate(() => window.__newAxis.applyMaterialPreset("reference-matte"));
await page.getByRole("button", { name: "Texture", exact: true }).click();
await page.evaluate(() => window.__newAxis.loadTextureFromUrl("/fixtures/upload-base-color.png", "baseColor")); await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, "texture-user-base-color.png") });
await page.getByRole("combobox", { name: "Projection", exact: true }).selectOption("face-local"); await page.screenshot({ path: path.join(outputDir, "texture-face-local.png") });
await page.getByRole("combobox", { name: "Projection", exact: true }).selectOption("screen"); await page.screenshot({ path: path.join(outputDir, "texture-screen-continuous.png") });
await page.evaluate(() => window.__newAxis.loadTextureFromUrl("/fixtures/upload-normal-wave.png", "normal")); await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, "texture-user-normal.png") });

const report = { baseUrl, outputDir, materialPresets: materials.length, actual3D: await page.evaluate(() => window.__newAxis.inspect3D()), consoleErrors: errors };
await writeFile(path.join(outputDir, "capture-report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
