import { axisDirection, normalizeAngle360 } from "./angles";
import { getFrameBounds, intersectRayWithFrame } from "./frame";
import { gridAnchorToFramePoint } from "./grid";
import { normalizeAxisDefinition, validateAxisDefinition } from "./validation";
import type {
  AxisDefinitionInput,
  AxisGraph,
  AxisGraphRay,
  AxisSector,
  FrameBounds,
  FrameCornerId,
  Point2,
  ReferenceFrame,
} from "./types";

const EPSILON = 1e-9;

export interface CreateAxisGraphOptions {
  readonly requireApprovedCombination?: boolean;
  readonly snapAnchor?: boolean;
}

export function createAxisGraph(
  input: AxisDefinitionInput,
  frame: ReferenceFrame,
  options: CreateAxisGraphOptions = {},
): AxisGraph {
  if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height)
    || frame.width <= 0 || frame.height <= 0) {
    throw new RangeError("AxisGraph frame dimensions must be finite values greater than zero.");
  }

  const definition = normalizeAxisDefinition(input, options);
  const validation = validateAxisDefinition(definition, options);
  if (!validation.valid) {
    throw new Error(validation.issues
      .filter((item) => item.severity === "error")
      .map((item) => `${item.path}: ${item.message}`)
      .join("\n"));
  }

  const normalizedFrame: ReferenceFrame = {
    width: frame.width,
    height: frame.height,
    aspect: frame.width / frame.height,
  };
  const bounds = getFrameBounds(normalizedFrame);
  const origin = gridAnchorToFramePoint(definition.anchor, normalizedFrame);
  const rays = definition.rays
    .filter((ray) => ray.enabled)
    .map((ray): AxisGraphRay => {
      const frameIntersection = intersectRayWithFrame(origin, ray.angleDeg, normalizedFrame);
      return {
        ...ray,
        angleDeg: ray.angleDeg as AxisGraphRay["angleDeg"],
        direction: axisDirection(ray.angleDeg),
        endpoint: frameIntersection.point,
        frameIntersection,
      };
    })
    .sort((a, b) => normalizeAngle360(a.angleDeg) - normalizeAngle360(b.angleDeg));

  return {
    definition,
    frame: normalizedFrame,
    bounds,
    origin,
    rays,
    sectors: createSectors(origin, rays, bounds),
  };
}

export function getReferenceLineWidth(outputWidth: number): number {
  if (!Number.isFinite(outputWidth) || outputWidth <= 0) {
    throw new RangeError("Output width must be a finite value greater than zero.");
  }
  return outputWidth / 1920;
}

function createSectors(
  origin: Point2,
  rays: readonly AxisGraphRay[],
  bounds: FrameBounds,
): AxisSector[] {
  const corners = frameCorners(bounds).map((corner) => ({
    ...corner,
    angle: normalizeAngle360(Math.atan2(corner.point.y - origin.y, corner.point.x - origin.x) * 180 / Math.PI),
  }));

  return rays.map((startRay, index) => {
    const endRay = rays[(index + 1) % rays.length];
    const startAngle = normalizeAngle360(startRay.angleDeg);
    const interval = positiveDelta(startAngle, normalizeAngle360(endRay.angleDeg));
    const includedCorners = corners
      .map((corner) => ({ ...corner, delta: positiveDelta(startAngle, corner.angle) }))
      .filter((corner) => corner.delta > EPSILON && corner.delta < interval - EPSILON)
      .sort((a, b) => a.delta - b.delta);
    const polygon = deduplicatePoints([
      origin,
      startRay.endpoint,
      ...includedCorners.map((corner) => corner.point),
      endRay.endpoint,
    ]);
    return {
      id: `sector-${startRay.id}--${endRay.id}`,
      startRayId: startRay.id,
      endRayId: endRay.id,
      cornerIds: includedCorners.map((corner) => corner.id),
      polygon,
      signedArea: polygonSignedArea(polygon),
    };
  });
}

function frameCorners(bounds: FrameBounds): Array<{ id: FrameCornerId; point: Point2 }> {
  return [
    { id: "bottom-left", point: { x: bounds.left, y: bounds.bottom } },
    { id: "bottom-right", point: { x: bounds.right, y: bounds.bottom } },
    { id: "top-right", point: { x: bounds.right, y: bounds.top } },
    { id: "top-left", point: { x: bounds.left, y: bounds.top } },
  ];
}

function positiveDelta(fromAngle: number, toAngle: number): number {
  const delta = normalizeAngle360(toAngle - fromAngle);
  return delta <= EPSILON ? 360 : delta;
}

function deduplicatePoints(points: readonly Point2[]): Point2[] {
  const output: Point2[] = [];
  points.forEach((point) => {
    const previous = output[output.length - 1];
    if (previous === undefined
      || Math.abs(previous.x - point.x) > EPSILON
      || Math.abs(previous.y - point.y) > EPSILON) {
      output.push(point);
    }
  });
  return output;
}

function polygonSignedArea(polygon: readonly Point2[]): number {
  let doubledArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    doubledArea += current.x * next.y - next.x * current.y;
  }
  return doubledArea / 2;
}
