import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const renderer = read("src/modes/axis-trails/AxisTrailsRenderer.ts");
const mode = read("src/modes/axis-trails/AxisTrailsMode.ts");
const state = read("src/modes/axis-trails/AxisTrailsState.ts");
const main = read("src/main.ts");

const checks = [
  ["uses approved axis core", renderer.includes("quantizeAxisAngle") && renderer.includes("AXIS_DIRECTION_FAMILIES")],
  ["preserves shared origin", renderer.includes("sharedOrigin: true") && renderer.includes("pointerTarget")],
  ["supports cursor and autonomous motion", renderer.includes("pointermove") && renderer.includes("autonomousTarget")],
  ["registers independent mode", main.includes("AXIS_TRAILS_MODE") && mode.includes('id = "axis-trails"')],
  ["has three presets", state.includes('"pleos-blue"') && state.includes('"spectral-signal"') && state.includes('"white-axis"')],
  ["supports raster export", mode.includes("exportStill") && mode.includes("injectPngPpi")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  failed.forEach(([label]) => console.error(`FAIL ${label}`));
  process.exit(1);
}
checks.forEach(([label]) => console.log(`PASS ${label}`));
