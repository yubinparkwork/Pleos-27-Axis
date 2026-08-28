import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.PLEOS_URL ?? "http://127.0.0.1:5173/";
const output = "artifacts/ui-redesign";

async function reachable() {
  try { return (await fetch(url)).ok; } catch { return false; }
}

let server = null;
if (!(await reachable())) {
  server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], { stdio: "inherit", shell: process.platform === "win32" });
  const deadline = Date.now() + 20_000;
  while (!(await reachable())) {
    if (Date.now() > deadline) throw new Error(`Dev server did not become ready at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => localStorage.removeItem("pleos-27-axis-settings-v2"));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.waitForTimeout(400);

  const shot = (name) => page.screenshot({ path: `${output}/${name}.png`, animations: "disabled" });
  await shot("workspace");

  await page.getByRole("tab", { name: "표현" }).click();
  await shot("look-panel");
  await page.getByText("고급 Material", { exact: true }).click();
  await shot("look-advanced");
  await page.getByText("고급 Lighting", { exact: true }).click();
  await shot("lighting-advanced");

  await page.getByRole("tab", { name: "모션" }).click();
  await shot("motion-panel");
  await page.getByRole("tab", { name: "판형" }).click();
  await shot("format-panel");
  await page.getByRole("tab", { name: "내보내기" }).click();
  await shot("export-panel");
  await page.getByText("Custom Render", { exact: true }).click();
  await shot("export-custom-render");

  await page.getByLabel("Variation 작업").click();
  await shot("variation-menu");
  await page.getByLabel("Inspector 표시 또는 숨기기").click();
  await shot("inspector-collapsed");

  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ status: "pass", output, captures: 10 }, null, 2));
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
