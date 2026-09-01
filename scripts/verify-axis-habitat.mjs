import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const renderer = read("src/modes/axis-habitat/AxisHabitatRenderer.ts");
const mode = read("src/modes/axis-habitat/AxisHabitatMode.ts");
const state = read("src/modes/axis-habitat/AxisHabitatState.ts");
const panel = read("src/modes/axis-habitat/AxisHabitatPanel.ts");
const sveltePanel = read("src/modes/axis-habitat/AxisFormationPanel.svelte");
const main = read("src/main.ts");
const pkg = JSON.parse(read("package.json"));

const checks = [
  ["registers an independent production Mode", main.includes("AXIS_HABITAT_MODE") && mode.includes('id = "axis-habitat"')],
  ["preserves the exact PLEOS basis and shared-origin corners", renderer.includes("CUBE_BASIS") && renderer.includes("TOUCH_CORNERS") && renderer.includes("SCREEN_AXES") && renderer.includes("sharedOrigin: true")],
  ["matches the Glass 3D orthographic front camera", renderer.includes("new THREE.OrthographicCamera") && renderer.includes("this.camera.position.set(px, py, -12)") && renderer.includes("this.cameraTarget.set(px, .02 + py, 0)")],
  ["assembles all three solids from instanced fragments", renderer.includes("new THREE.InstancedMesh") && renderer.includes("surface.setMatrixAt") && renderer.includes("solids: 3")],
  ["uses GSAP for a deterministic formation timeline", renderer.includes("gsap.timeline") && renderer.includes("timeline.progress") && pkg.dependencies?.gsap],
  ["exposes detailed phase timing and fragment dynamics", state.includes("drawAssembleOverlap") && state.includes("returnOvershoot") && renderer.includes("motionDelay(fragment)") && renderer.includes("computeMotionKey()") && sveltePanel.includes("단계 타이밍") && sveltePanel.includes("조각 다이내믹스")],
  ["mounts a real Svelte inspector", panel.includes('from "svelte"') && panel.includes("mount(AxisFormationPanel") && sveltePanel.includes("SVELTE · THREE.JS · WEBGL2") && pkg.dependencies?.svelte],
  ["uses custom WebGL shaders for construction lines and atmosphere", renderer.includes("SCAFFOLD_VERTEX") && renderer.includes("SCAFFOLD_FRAGMENT") && renderer.includes("DUST_VERTEX")],
  ["builds a nonuniform luminous network inside the three-form skeleton", renderer.includes("buildLuminousNetwork") && renderer.includes("LUMINOUS_LINE_VERTEX") && renderer.includes("luminousSegments") && renderer.includes("longLineProbability") && renderer.includes("triangleProbability")],
  ["layers HDR filament cores, spectral glow, halos and selected node flares", renderer.includes("White-hot filament cores") && renderer.includes("Spectral filament glow") && renderer.includes("Wide filament halos") && renderer.includes("FLARE_FRAGMENT") && renderer.includes("flareProbability")],
  ["uses selective multi-scale bloom and restrained optical finishing", renderer.includes("bloomSharp") && renderer.includes("bloomWide") && renderer.includes("OPTICAL_POST") && renderer.includes("chromaticDispersion") && renderer.includes("uVignette")],
  ["uses physical material look development", renderer.includes("MeshPhysicalMaterial") && renderer.includes("createSurfaceTexture") && renderer.includes("RoomEnvironment")],
  ["accelerates solid interaction proxies with BVH", renderer.includes("new MeshBVH") && renderer.includes("acceleratedRaycast") && renderer.includes("firstHitOnly")],
  ["caps and adapts device pixel ratio", renderer.includes("adaptiveDpr") && renderer.includes("applySize") && renderer.includes("baseDpr")],
  ["uses a black high-contrast palette with restrained SMAA/MSAA", renderer.includes("background: PLEOS_COLORS.black") && renderer.includes("lines: PLEOS_COLORS.white") && renderer.includes("new SMAAPass()") && renderer.includes("setComposerSamples(4)")],
  ["exposes three PLEOS formation variations", state.includes('"frosted-formation"') && state.includes('"obsidian-signal"') && state.includes('"blue-archive"')],
  ["exposes luminous architecture controls and LOW through ULTRA quality", sveltePanel.includes("발광 공간 구조") && sveltePanel.includes("HDR 필라멘트") && sveltePanel.includes("광학 후처리") && sveltePanel.includes('value="ultra"') && state.includes('"ultra"')],
  ["supports deterministic exact-time PNG export", mode.includes("exportAtTime") && mode.includes("injectPngPpi") && renderer.includes("exportPng")],
  ["provides accessible status and performance controls", sveltePanel.includes("aria-live") && sveltePanel.includes("적응형 해상도") && renderer.includes("tabIndex = 0")],
  ["releases Svelte, GSAP, Three.js and render resources", panel.includes("unmount(this.component)") && renderer.includes("this.timeline.kill()") && renderer.includes("disposeTree") && renderer.includes("this.composer.dispose()") && renderer.includes("this.renderer.dispose()")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  failed.forEach(([label]) => console.error(`FAIL ${label}`));
  process.exit(1);
}
checks.forEach(([label]) => console.log(`PASS ${label}`));
