import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.NEW_AXIS_URL ?? "http://127.0.0.1:5173/";
const outputDir = path.join(process.cwd(), "artifacts", "3d"); await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__newAxis && document.querySelector("[data-region='status-metrics']"));

const result = { runtimeError: await page.evaluate(() => document.documentElement.dataset.runtimeError ?? null) };
result.baselinePng = (await page.evaluate(() => window.__newAxis.captureDataURL(2800, 2080, "baseline"))).startsWith("data:image/png;base64,");
await page.getByRole("button", { name: "3D Studio", exact: true }).first().click();
result.actual3D = await page.evaluate(() => window.__newAxis.inspect3D());
await page.getByRole("button", { name: "Persp", exact: true }).click(); result.perspectiveCamera = (await page.evaluate(() => window.__newAxis.inspect3D())).camera === "PerspectiveCamera";

await page.locator('.left-panel [data-action="collapse-left"]').click(); result.leftCollapsed = (await page.locator(".studio-shell").getAttribute("class")).includes("left-closed"); await page.locator(".left-restore").click();
await page.locator('.right-panel [data-action="collapse-right"]').click(); result.rightCollapsed = (await page.locator(".studio-shell").getAttribute("class")).includes("right-closed"); await page.locator(".right-restore").click();
await page.getByRole("button", { name: "Tab", exact: true }).click(); result.uiHidden = (await page.locator(".studio-shell").getAttribute("class")).includes("ui-hidden"); await page.keyboard.press("Tab");
await page.getByRole("button", { name: "Split", exact: true }).click(); result.splitVisible = await page.locator("[data-role='split-divider']").isVisible();
await page.getByRole("button", { name: "3D Studio", exact: true }).first().click(); await page.locator(".render-canvas").click({ position: { x: 650, y: 260 } }); result.faceSelected = !(await page.locator("[data-region='status-metrics']").innerText()).includes("No face");

await page.evaluate(() => window.__newAxis.loadTextureFromUrl("/fixtures/upload-base-color.png", "baseColor")); await page.getByRole("button", { name: "Texture", exact: true }).click(); result.texturePreview = await page.locator(".texture-preview").isVisible(); await page.getByRole("button", { name: /Remove baseColor texture/ }).click(); result.textureRemoved = !(await page.locator(".texture-preview").isVisible());

const beforeSaved = await page.locator("[data-saved-preset]").count(); await page.getByRole("button", { name: "Save Preset", exact: true }).click(); const saved = await page.locator("[data-saved-preset]").last().innerText(); result.presetSaved = await page.locator("[data-saved-preset]").count() === beforeSaved + 1; await page.reload({ waitUntil: "networkidle" }); result.presetPersisted = await page.getByRole("button", { name: saved, exact: true }).isVisible();

result.exportPng = (await page.evaluate(() => window.__newAxis.captureDataURL(2800, 2080, "variant"))).startsWith("data:image/png;base64,");
result.consoleErrors = errors; result.runtimeError = await page.evaluate(() => document.documentElement.dataset.runtimeError ?? null);
await writeFile(path.join(outputDir, "browser-verification.json"), JSON.stringify(result, null, 2));
await browser.close();
console.log(JSON.stringify(result, null, 2));
