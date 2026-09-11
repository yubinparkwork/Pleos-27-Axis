import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const right = [1 / Math.sqrt(2), 0, -1 / Math.sqrt(2)];
const up = [-1 / Math.sqrt(6), 2 / Math.sqrt(6), -1 / Math.sqrt(6)];
const camera = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const project = (point) => [dot(point, right), dot(point, up)];

try {
  const [{ getAxisCubes, getRenderAxisCubes }, { CrystalAssembly }] = await Promise.all([
    server.ssrLoadModule("/src/optical-studio/AxisGeometry.ts"),
    server.ssrLoadModule("/src/crystal/CrystalAssembly.ts"),
  ]);
  const cubes = getAxisCubes(0, 1);
  const doubled = getAxisCubes(0);
  for (const bevel of [0, .001, .08, .24, .32, .6]) for (const gap of [0, .01, .12, .4]) {
    const rendered = getRenderAxisCubes(gap, bevel);
    const h = rendered.halfSize;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const innerSeparation = rendered.centers[i].map((v, axis) => Math.max(0, Math.abs(v - rendered.centers[j][axis]) - 2 * (h - bevel)));
      const clearance = Math.hypot(...innerSeparation) - 2 * bevel;
      near(clearance, Math.sqrt(3) * gap, 'Rounded pair contact remains independent of bevel');
      assert.ok(clearance >= -1e-9, 'Rounded cubes must not overlap');
    }
    rendered.centers.forEach((center, i) => near(dot(center, camera), dot(doubled.centers[i], camera), 'Compensation preserves camera depth'));
    for (let axis = 0; axis < 3; axis++) near(rendered.centers.reduce((sum, c) => sum + c[axis], 0), doubled.centers.reduce((sum, c) => sum + c[axis], 0), 'Compensation preserves centroid');
  }
  assert.deepEqual(getRenderAxisCubes(.12, 0), getAxisCubes(.12), 'Zero bevel preserves original placement');
  near(doubled.halfSize, cubes.halfSize * 2, "Default cubes have double edge length");
  doubled.centers.forEach((center, i) => center.forEach((value, axis) => {
    near(value, cubes.centers[i][axis] * 2, "Scale preserves shared corner");
    near(Math.abs(value), doubled.halfSize, "Each doubled cube still touches origin");
  }));
  for (const scale of [0, -1, NaN, Infinity]) assert.throws(() => getAxisCubes(0, scale), RangeError);
  assert.equal(cubes.centers.length, 3);
  assert.deepEqual(cubes.rotation, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  near(cubes.halfSize * 2, 1.35 * Math.sqrt(3 / 2), "Legacy physical edge length");

  const bounds = cubes.centers.map((center) => ({ min: center.map((value) => value - cubes.halfSize), max: center.map((value) => value + cubes.halfSize) }));
  for (let axis = 0; axis < 3; axis++) {
    near(Math.max(...bounds.map((bound) => bound.min[axis])), 0, "Common vertex lower bound");
    near(Math.min(...bounds.map((bound) => bound.max[axis])), 0, "Common vertex upper bound");
  }
  for (let first = 0; first < 3; first++) for (let second = first + 1; second < 3; second++) {
    const overlap = [0, 1, 2].map((axis) => Math.min(bounds[first].max[axis], bounds[second].max[axis]) - Math.max(bounds[first].min[axis], bounds[second].min[axis]));
    assert.equal(overlap.filter((length) => Math.abs(length) < 1e-9).length, 2, "Each pair shares exactly an edge");
    near(Math.max(...overlap), 2 * cubes.halfSize, "Shared edge length");
  }

  const expectedProjection = [[0, 1.35], [-1.35 * Math.sqrt(3) / 2, -.675], [1.35 * Math.sqrt(3) / 2, -.675]];
  cubes.centers.forEach((center, index) => project(center).forEach((value, axis) => near(value, expectedProjection[index][axis], "Approved projected center")));
  const axisAngles = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => {
    const [x, y] = project(axis);
    return (Math.atan2(y, x) * 180 / Math.PI + 180) % 180;
  }).sort((a, b) => a - b);
  axisAngles.forEach((value, index) => near(value, [30, 90, 150][index], "Approved edge projection"));

  // Compare all eight projected sharp corners to the actual legacy meshes.
  // Its camera looks from -Z, so screen X is -world X and lower cube order flips.
  const source = new CrystalAssembly();
  try {
    source.setBevelRadius(0);
    source.setGap(0);
    source.updateMatrixWorld(true);
    const legacy = [];
    source.traverse((object) => {
      if (!object.isMesh || object.name !== "ClosedOpticalSolid") return;
      const points = [];
      const matrix = object.matrixWorld.elements;
      const position = object.geometry.getAttribute("position");
      for (let index = 0; index < position.count; index++) {
        const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
        points.push([-(matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]), matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]]);
      }
      legacy.push(points);
    });
    assert.equal(legacy.length, 3);
    cubes.centers.forEach((center, cubeIndex) => {
      const corners = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        corners.push(project([center[0] + x * cubes.halfSize, center[1] + y * cubes.halfSize, center[2] + z * cubes.halfSize]));
      }
      const reference = legacy[[0, 2, 1][cubeIndex]];
      const matches = (point, candidates) => candidates.some((candidate) => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) < 1e-6);
      assert.ok(corners.every((point) => matches(point, reference)), "Canonical corners preserve the actual legacy silhouette");
      assert.ok(reference.every((point) => matches(point, corners)), "Legacy silhouette introduces no missing vertices");
    });
  } finally {
    source.dispose();
  }

  for (const gap of [.001, .12, .45, 1]) {
    const separated = getAxisCubes(gap, 1);
    separated.centers.forEach((center, index) => {
      const delta = center.map((value, axis) => value - cubes.centers[index][axis]);
      near(Math.hypot(...delta), gap, "Gap is radial image-plane travel");
      near(dot(delta, camera), 0, "Gap preserves camera depth");
      const [x, y] = project(delta);
      const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      near(angle, [90, 210, 330][index], "Gap follows the approved radial direction");
    });
    for (let axis = 0; axis < 3; axis++) near(separated.centers.reduce((sum, center) => sum + center[axis], 0), cubes.centers.reduce((sum, center) => sum + center[axis], 0), "Gap preserves centroid");
  }
  assert.deepEqual(getAxisCubes(-.1, 1), cubes, "Negative gaps clamp to shared contact");
  for (const gap of [NaN, Infinity, -Infinity]) assert.throws(() => getAxisCubes(gap), RangeError);
  const mutated = getAxisCubes(0, 1);
  mutated.centers[0][0] = 999;
  mutated.rotation[0] = 999;
  assert.deepEqual(getAxisCubes(0, 1), cubes, "Calls return independent geometry values");
  console.log(JSON.stringify({ status: "pass", cubes: 3, sharedOrigin: [0, 0, 0], camera, projectedEdgeAngles: axisAngles, legacySilhouette: "identical", halfSize: cubes.halfSize }, null, 2));
} finally {
  await server.close();
}
