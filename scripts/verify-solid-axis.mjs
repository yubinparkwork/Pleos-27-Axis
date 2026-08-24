import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const [{ createAxisGraph }, { APPROVED_AXIS_DEFINITIONS }, { buildFoldSectors, disposeSectors }, { DEFAULT_STATE }] = await Promise.all([
    server.ssrLoadModule("/src/axis/AxisGraph.ts"),
    server.ssrLoadModule("/src/axis/presets.ts"),
    server.ssrLoadModule("/src/geometry/FoldSurfaceBuilder.ts"),
    server.ssrLoadModule("/src/state/studioState.ts"),
  ]);

  const frame = { width: 3.5, height: 2.6, aspect: 35 / 26 };
  const report = [];
  const crystalReport = [];
  let cubeAssembly = null;
  for (const definition of APPROVED_AXIS_DEFINITIONS) {
    const graph = createAxisGraph(definition, frame, { requireApprovedCombination: true });
    const adapted = {
      origin: graph.origin,
      rays: graph.rays.map((ray) => ({ id: ray.id, angleDeg: ray.angleDeg, direction: ray.direction, endpoint: ray.endpoint })),
      frame: { minX: graph.bounds.left, maxX: graph.bounds.right, minY: graph.bounds.bottom, maxY: graph.bounds.top },
    };
    const cells = buildFoldSectors(adapted, DEFAULT_STATE.fold, DEFAULT_STATE.spectral, { mode: "joined-hexahedra", depth: 0.42, cubeScale: 0.36 });
    if (cells.length !== graph.rays.length) throw new Error(`${definition.id}: cell/ray count mismatch`);
    let triangles = 0;
    for (const cell of cells) {
      const position = cell.geometry.getAttribute("position");
      if (!position || position.count < 24 || position.count % 3 !== 0) throw new Error(`${definition.id}/${cell.id}: invalid closed-cell triangles`);
      for (let index = 0; index < position.count; index += 1) {
        if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) throw new Error(`${definition.id}/${cell.id}: non-finite vertex`);
      }
      const z = Array.from({ length: position.count }, (_, index) => position.getZ(index));
      if (Math.max(...z) - Math.min(...z) < 0.2) throw new Error(`${definition.id}/${cell.id}: body depth missing`);
      if (!cell.geometry.getAttribute("normal")) throw new Error(`${definition.id}/${cell.id}: normals missing`);
      triangles += position.count / 3;
    }
    for (const ray of graph.rays) {
      const owners = cells.filter((cell) => cell.rayA === ray.id || cell.rayB === ray.id);
      if (owners.length !== 2) throw new Error(`${definition.id}/${ray.id}: shared edge must have two solid owners`);
    }
    report.push({ id: definition.id, cells: cells.length, rays: graph.rays.length, triangles });
    disposeSectors(cells);

    const crystals = buildFoldSectors(adapted, DEFAULT_STATE.fold, { ...DEFAULT_STATE.spectral, enabled: true }, { mode: "crystal-cluster", depth: 0.42, cubeScale: 0.42 });
    const expectedCrystals = graph.rays.length + 1;
    if (crystals.length !== expectedCrystals) throw new Error(`${definition.id}: crystal cluster count mismatch`);
    for (const crystal of crystals) {
      const position = crystal.geometry.getAttribute("position");
      if (!position || position.count < 12 || position.count % 3 !== 0) throw new Error(`${definition.id}/${crystal.id}: invalid crystal hull`);
      if (!crystal.geometry.getAttribute("normal") || !crystal.geometry.getAttribute("aAxisDistance")) throw new Error(`${definition.id}/${crystal.id}: optical attributes missing`);
      for (let index = 0; index < position.count; index += 1) {
        if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) throw new Error(`${definition.id}/${crystal.id}: non-finite crystal vertex`);
      }
    }
    for (const ray of graph.rays) if (!crystals.some((crystal) => crystal.rayA === ray.id)) throw new Error(`${definition.id}/${ray.id}: crystal blade missing`);
    crystalReport.push({ id: definition.id, crystals: crystals.length, rays: graph.rays.length });
    disposeSectors(crystals);

    if (definition.id === "axis-30-variation-1") {
      const cubes = buildFoldSectors(adapted, DEFAULT_STATE.fold, DEFAULT_STATE.spectral, { mode: "corner-cubes", depth: 0.42, cubeScale: 0.36 });
      if (cubes.length !== 2) throw new Error("corner-cubes: expected two cubes");
      const projectedAngles = [];
      for (const cube of cubes) {
        const attribute = cube.geometry.getAttribute("position");
        if (attribute.count < 36 || attribute.count % 3 !== 0) throw new Error(`${cube.id}: invalid tessellated cube triangles`);
        if (!cube.geometry.getAttribute("aFaceEdge")) throw new Error(`${cube.id}: physical edge field missing`);
        const corners = cube.geometry.userData.cubeCorners;
        if (!Array.isArray(corners) || corners.length !== 8) throw new Error(`${cube.id}: cube must retain eight analytic corners`);
        const origin = corners.find((point) => Math.hypot(point[0] - graph.origin.x, point[1] - graph.origin.y, point[2] - DEFAULT_STATE.fold.centerZ) < 1e-5);
        if (!origin) throw new Error(`${cube.id}: shared origin corner missing`);
        const neighbours = corners
          .map((point) => ({ point, delta: point.map((value, index) => value - origin[index]), distance: Math.hypot(...point.map((value, index) => value - origin[index])) }))
          .filter((item) => item.distance > 1e-5)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        const edgeLength = neighbours[0].distance;
        if (neighbours.some((edge) => Math.abs(edge.distance - edgeLength) > 1e-4)) throw new Error(`${cube.id}: unequal cube edges`);
        for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) {
          const dot = neighbours[a].delta.reduce((sum, value, index) => sum + value * neighbours[b].delta[index], 0);
          if (Math.abs(dot) > 1e-4) throw new Error(`${cube.id}: cube edges are not orthogonal`);
        }
        neighbours.forEach(({ delta }) => projectedAngles.push((Math.round(Math.atan2(delta[1], delta[0]) * 180 / Math.PI) + 360) % 360));
      }
      const expected = [30, 90, 150, 210, 270, 330];
      if (expected.some((angle) => !projectedAngles.includes(angle))) throw new Error(`corner-cubes: projected Axis mismatch ${projectedAngles}`);
      cubeAssembly = { cubes: 2, sharedCorner: [graph.origin.x, graph.origin.y, DEFAULT_STATE.fold.centerZ], projectedAngles: projectedAngles.sort((a, b) => a - b) };
      disposeSectors(cubes);
    }
  }
  console.log(JSON.stringify({ status: "pass", constructions: report, crystalClusters: crystalReport, cubeAssembly }, null, 2));
} finally {
  await server.close();
}
