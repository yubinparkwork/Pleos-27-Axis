import { axisDirection } from "./angles";
import type {
  FrameBounds,
  FrameIntersection,
  FrameSide,
  Point2,
  ReferenceFrame,
} from "./types";

const EPSILON = 1e-9;

export function createReferenceFrame(width: number, height: number): ReferenceFrame {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Reference frame width and height must be finite values greater than zero.");
  }
  return { width, height, aspect: width / height };
}

export function getFrameBounds(frame: ReferenceFrame): FrameBounds {
  return {
    left: -frame.width / 2,
    right: frame.width / 2,
    bottom: -frame.height / 2,
    top: frame.height / 2,
  };
}

export function isPointInsideFrame(
  point: Point2,
  frame: ReferenceFrame,
  epsilon = EPSILON,
): boolean {
  const bounds = getFrameBounds(frame);
  return point.x >= bounds.left - epsilon
    && point.x <= bounds.right + epsilon
    && point.y >= bounds.bottom - epsilon
    && point.y <= bounds.top + epsilon;
}

export function intersectRayWithFrame(
  origin: Point2,
  angleDeg: number,
  frame: ReferenceFrame,
): FrameIntersection {
  if (!isPointInsideFrame(origin, frame)) {
    throw new RangeError("Ray origin must be inside the reference frame.");
  }

  const bounds = getFrameBounds(frame);
  const direction = axisDirection(angleDeg);
  const candidates: number[] = [];
  collectVerticalIntersection(bounds.left, origin, direction, bounds, candidates);
  collectVerticalIntersection(bounds.right, origin, direction, bounds, candidates);
  collectHorizontalIntersection(bounds.bottom, origin, direction, bounds, candidates);
  collectHorizontalIntersection(bounds.top, origin, direction, bounds, candidates);

  const positive = candidates.filter((distance) => distance > EPSILON);
  const distance = positive.length > 0
    ? Math.min(...positive)
    : Math.max(0, Math.min(...candidates.map((value) => Math.max(0, value))));
  if (!Number.isFinite(distance)) {
    throw new Error("Ray does not intersect the reference frame.");
  }

  const point = {
    x: clamp(origin.x + direction.x * distance, bounds.left, bounds.right),
    y: clamp(origin.y + direction.y * distance, bounds.bottom, bounds.top),
  };
  return { point, distance, sides: getIntersectionSides(point, bounds) };
}

function collectVerticalIntersection(
  x: number,
  origin: Point2,
  direction: Point2,
  bounds: FrameBounds,
  output: number[],
): void {
  if (Math.abs(direction.x) <= EPSILON) return;
  const distance = (x - origin.x) / direction.x;
  const y = origin.y + distance * direction.y;
  if (distance >= -EPSILON && y >= bounds.bottom - EPSILON && y <= bounds.top + EPSILON) {
    output.push(Math.max(0, distance));
  }
}

function collectHorizontalIntersection(
  y: number,
  origin: Point2,
  direction: Point2,
  bounds: FrameBounds,
  output: number[],
): void {
  if (Math.abs(direction.y) <= EPSILON) return;
  const distance = (y - origin.y) / direction.y;
  const x = origin.x + distance * direction.x;
  if (distance >= -EPSILON && x >= bounds.left - EPSILON && x <= bounds.right + EPSILON) {
    output.push(Math.max(0, distance));
  }
}

function getIntersectionSides(point: Point2, bounds: FrameBounds): FrameSide[] {
  const scale = Math.max(bounds.right - bounds.left, bounds.top - bounds.bottom);
  const tolerance = Math.max(EPSILON, scale * 1e-9);
  const sides: FrameSide[] = [];
  if (Math.abs(point.x - bounds.left) <= tolerance) sides.push("left");
  if (Math.abs(point.x - bounds.right) <= tolerance) sides.push("right");
  if (Math.abs(point.y - bounds.bottom) <= tolerance) sides.push("bottom");
  if (Math.abs(point.y - bounds.top) <= tolerance) sides.push("top");
  return sides;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
