import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const port = Number(process.env.PLEOS_VERIFY_PORT ?? 41746);
const url = process.env.PLEOS_VERIFY_URL ?? `http://127.0.0.1:${port}/`;
async function reachable() { try { return (await fetch(url)).ok; } catch { return false; } }
async function server() {
  if (process.env.PLEOS_VERIFY_URL && await reachable()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  const limit = Date.now() + 25_000;
  while (!(await reachable())) { if (child.exitCode !== null) throw new Error("Dimention R3F server exited early."); if (Date.now() > limit) throw new Error("Dimention R3F server timeout."); await new Promise((resolve) => setTimeout(resolve, 125)); }
  return child;
}

async function canvasPng(page) {
  const box = await page.locator(".dimention-r3f-canvas").boundingBox();
  if (!box) throw new Error("Dimention R3F canvas bounds unavailable.");
  return PNG.sync.read(await page.screenshot({ clip: box }));
}

async function canvasContrast(page) {
  const png = await canvasPng(page);
  let sum = 0;
  let squared = 0;
  const count = png.width * png.height;
  for (let index = 0; index < png.data.length; index += 4) {
    const luminance = png.data[index] * .2126 + png.data[index + 1] * .7152 + png.data[index + 2] * .0722;
    sum += luminance;
    squared += luminance * luminance;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, squared / count - mean * mean));
}

async function canvasDifference(page, action) {
  const before = await canvasPng(page);
  await action();
  await page.waitForTimeout(350);
  const after = await canvasPng(page);
  let difference = 0;
  for (let index = 0; index < before.data.length; index += 4) difference += Math.abs(before.data[index] - after.data[index]) + Math.abs(before.data[index + 1] - after.data[index + 1]) + Math.abs(before.data[index + 2] - after.data[index + 2]);
  return difference / (before.width * before.height * 3);
}

const devServer = await server();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.addInitScript(() => { localStorage.removeItem("pleos-27-axis-studio-state-v3"); localStorage.removeItem("pleos-27-axis-studio-state-v2"); });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__pleos27Axis));
  await page.evaluate(() => window.__pleos27Axis.switchMode("dimention-r3f"));
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "일시 정지" }).click();
  const initialContrast = await canvasContrast(page);
  const mirrorDifference = await canvasDifference(page, () => page.getByLabel("내부 반사").uncheck());
  await page.getByLabel("내부 반사").check();
  await page.getByLabel("모션 타임라인").fill("2.4");
  await page.getByLabel("거칠기 값").fill("0.18");
  await page.getByLabel("IOR 값").fill("1.62");
  await page.getByLabel("RGB 조명 값").fill("1.8");
  await page.getByText("레드 광원", { exact: true }).click();
  await page.getByLabel("레드 광원 모양").selectOption("ring");
  await page.getByLabel("레드 광원 중심 X 값").fill("0.75");
  const detailedLightDifference = await canvasDifference(page, () => page.getByLabel("레드 광원 너비 값").fill("4.2"));
  await page.waitForTimeout(500);
  const automaticSave = await page.evaluate(() => JSON.parse(localStorage.getItem("pleos-27-axis-studio-state-v3") ?? "null"));
  const variationHidden = await page.locator("[data-shell-variation-field]").evaluate((element) => element.hidden);
  const adjustedContrast = await canvasContrast(page);
  await page.getByLabel("동영상 FPS").selectOption("24");
  await page.getByLabel("동영상 해상도").selectOption("custom");
  await page.getByLabel("동영상 너비").fill("320");
  await page.getByLabel("동영상 높이").fill("240");
  await page.getByRole("button", { name: "MP4 내보내기" }).click();
  await page.getByRole("button", { name: "취소" }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "취소" }).click();
  await page.getByText("동영상 렌더링을 취소했습니다.").waitFor({ timeout: 10_000 });
  await page.getByLabel("동영상 해상도").selectOption("4k");
  const encodedVideo = await page.evaluate(() => window.__pleos27Axis.modeApi("dimention-r3f").command("exportVideo", { download: false, duration: .1, fps: 24, width: 320, height: 240 }));
  await page.getByLabel("자유 시점 회전").check();
  const canvasBox = await page.locator(".dimention-r3f-canvas").boundingBox();
  if (!canvasBox) throw new Error("Dimention R3F canvas bounds unavailable.");
  await page.mouse.move(canvasBox.x + canvasBox.width * .5, canvasBox.y + canvasBox.height * .5);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * .68, canvasBox.y + canvasBox.height * .42, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const orbitState = await page.evaluate(() => window.__pleos27Axis.inspect());
  const orbitContrast = await canvasContrast(page);
  await page.mouse.move(canvasBox.x + canvasBox.width * .5, canvasBox.y + canvasBox.height * .5);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(350);
  const zoomState = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.getByLabel("수평 이동 값").fill("0.65");
  await page.getByLabel("수직 이동 값").fill("-0.35");
  const before = await page.evaluate(() => window.__pleos27Axis.inspect());
  await page.getByRole("button", { name: "카메라 패널 접기" }).click();
  const cameraRailVisible = await page.getByRole("button", { name: "카메라 패널 펼치기" }).isVisible();
  await page.getByRole("button", { name: "카메라 패널 펼치기" }).click();
  await page.evaluate(() => window.__pleos27Axis.seek(2.25));
  const png = await page.evaluate(() => window.__pleos27Axis.export({ renderer: "raster", quality: "custom", download: false }));
  await page.evaluate(() => window.__pleos27Axis.switchMode("glass-3d"));
  await page.waitForFunction(() => window.__pleos27Axis?.getActiveMode() === "glass-3d");
  await page.evaluate(() => window.__pleos27Axis.switchMode("dimention-r3f"));
  await page.waitForFunction(() => Boolean(window.__pleos27Axis?.inspect().ready));
  const after = await page.evaluate(() => window.__pleos27Axis.inspect());
  const checks = {
    renderer: before.renderer === "React Three Fiber realtime transmission + recursive FBO glass reflection + Lightformer + N8AO" && before.pipeline === "Three.js WebGL raster" && before.materialPipeline === "deterministic MeshPhysicalMaterial transmission + dispersion" && before.recursionCapture === "ping-pong half-float FBO" && before.lightingRig === "soft white spotlight + animated Gaussian spectral disc IBL",
    independent: before.pathTracing === false && before.studioMode?.capabilities?.pathTracing === false,
    axis: before.solids === 3 && before.axis?.family === "30deg" && before.axis?.source === "CrystalAssembly",
    material: before.material?.transmission === 1 && before.material?.chromaticAberration > 0,
    lighting: before.lighting?.rgb > 0 && before.lighting?.speed > 0 && before.lighting?.rig?.red?.shape === "ring" && before.lighting?.rig?.red?.positionX === .75 && before.lighting?.rig?.red?.width === 4.2 && detailedLightDifference > .0001,
    livePersistence: variationHidden === true && automaticSave?.version === 1 && automaticSave?.state?.modeStates?.["dimention-r3f"]?.material?.roughness === .18 && automaticSave?.state?.modeStates?.["dimention-r3f"]?.material?.ior === 1.62 && automaticSave?.state?.modeStates?.["dimention-r3f"]?.lighting?.rig?.red?.width === 4.2,
    interactiveCanvas: initialContrast > 3 && adjustedContrast > 4,
    mirrorDimension: before.mirror?.enabled === true && before.mirror?.bounces >= 1 && before.mirror?.recursionScale > .49 && before.mirror?.reflectivity > 0 && mirrorDifference > .0001,
    video4k: before.export?.rasterMp4 === true && before.export?.video4k === true && before.export?.videoFps === 24 && before.export?.videoDimensions?.includes(3840) && before.export?.streaming === "OPFS with memory fallback" && typeof encodedVideo === "string" && encodedVideo.startsWith("blob:"),
    cameraPanel: before.camera?.type === "OrthographicCamera" && before.camera?.pan?.[0] === .65 && before.camera?.pan?.[1] === -.35 && cameraRailVisible,
    freeOrbit: orbitState.camera?.freeOrbit === true && Math.abs(orbitState.camera?.orbit?.[0] ?? 0) > 1 && orbitContrast > 4,
    wheelZoom: (zoomState.camera?.zoom ?? 1) > (orbitState.camera?.zoom ?? 1),
    export: typeof png === "string" && png.startsWith("data:image/png;base64,") && png.length > 10_000,
    lifecycle: after.canvasCount === 1 && await page.locator("[data-mode-panel='dimention-r3f']").count() === 1,
    console: errors.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`Dimention R3F verification failed: ${JSON.stringify({ checks, before, after, orbitState, zoomState, initialContrast, adjustedContrast, mirrorDifference, detailedLightDifference, orbitContrast, pngLength: png?.length, errors })}`);
  process.stdout.write(`${JSON.stringify({ status: "pass", checks, initialContrast, adjustedContrast, mirrorDifference, detailedLightDifference, orbitContrast, pngLength: png.length }, null, 2)}\n`);
} finally { await browser.close(); devServer?.kill("SIGTERM"); }
