import type { AxisGeometryOptions, AxisGeometryPreset } from "./types";

export const APPROVED_RAW_AXIS_RAYS = Object.freeze({
  "30-basic": Object.freeze([-90, -30, 30, 90, 210]),
  "30-v1": Object.freeze([-90, -30, 30, 90, 150, 210]),
  "30-v2": Object.freeze([-30, 30, 90, 210]),
  "30-v3": Object.freeze([-30, 30, 90]),
  "45-basic": Object.freeze([-135, -45, 0, 45, 135, 180]),
  "45-v1": Object.freeze([-135, -90, -45, 45, 90, 135, 180]),
  "45-v2": Object.freeze([-135, 45, 180]),
  "45-v3": Object.freeze([-135, -90, 0, 45, 90]),
} as const);

export type ApprovedRawAxisPresetId = keyof typeof APPROVED_RAW_AXIS_RAYS;

export const APPROVED_RAW_AXIS_PRESET_IDS = Object.freeze(
  Object.keys(APPROVED_RAW_AXIS_RAYS) as ApprovedRawAxisPresetId[],
);

export function approvedRawAxisRays(id: ApprovedRawAxisPresetId): readonly number[] {
  return APPROVED_RAW_AXIS_RAYS[id];
}

/**
 * Pleos guideline 30 degree Variation 1. The second depth row is intentionally
 * the corrected convex presentation: it keeps the approved XY rays while
 * preventing the right solid from reading as an open/concave Necker cube.
 */
export const PLEOS_30_VARIATION_1: AxisGeometryPreset = Object.freeze({
  id: "axis-30-variation-1",
  family: "30deg",
  variant: "variation-1",
  rays: Object.freeze([
    { id: "30deg-m90", angleDeg: -90 },
    { id: "30deg-m30", angleDeg: -30 },
    { id: "30deg-p30", angleDeg: 30 },
    { id: "30deg-p90", angleDeg: 90 },
    { id: "30deg-p150", angleDeg: 150 },
    { id: "30deg-p210", angleDeg: 210 },
  ]),
  cubes: Object.freeze([
    {
      id: "cube-right" as const,
      directionsDeg: [90, 30, -30] as const,
      depthSigns: [1, -1, 1] as const,
    },
    {
      id: "cube-left" as const,
      directionsDeg: [-90, 150, 210] as const,
      depthSigns: [-1, -1, 1] as const,
    },
  ]),
});

export const DEFAULT_AXIS_GEOMETRY_OPTIONS: AxisGeometryOptions = Object.freeze({
  presetId: "30-v1",
  rayAnglesDeg: APPROVED_RAW_AXIS_RAYS["30-v1"],
  origin: [0, 0, 0] as const,
  frame: Object.freeze({ width: 2.8, height: 2.08 }),
  projectedEdge: 1.2,
  depthRatio: Math.SQRT1_2,
  foldDepth: 0.28,
  rayDepths: Object.freeze({
    [-90]: -0.72,
    [-30]: 0.42,
    [30]: 0.2,
    [90]: 0.78,
    [150]: -0.54,
    [210]: 0.3,
    [-135]: -0.38,
    [-45]: 0.36,
    [0]: 0.12,
    [45]: 0.52,
    [135]: -0.48,
    [180]: -0.16,
  }),
  bevel: Object.freeze({
    enabled: true,
    width: 0.045,
    segments: 3,
    curvature: 0.86,
    preserveCenterNode: true,
  }),
});

export function resolveAxisGeometryOptions(options: Partial<AxisGeometryOptions> = {}): AxisGeometryOptions {
  return {
    ...DEFAULT_AXIS_GEOMETRY_OPTIONS,
    ...options,
    presetId: options.presetId ?? DEFAULT_AXIS_GEOMETRY_OPTIONS.presetId,
    rayAnglesDeg: options.rayAnglesDeg ?? DEFAULT_AXIS_GEOMETRY_OPTIONS.rayAnglesDeg,
    origin: options.origin ?? DEFAULT_AXIS_GEOMETRY_OPTIONS.origin,
    frame: { ...DEFAULT_AXIS_GEOMETRY_OPTIONS.frame, ...options.frame },
    rayDepths: { ...DEFAULT_AXIS_GEOMETRY_OPTIONS.rayDepths, ...options.rayDepths },
    bevel: { ...DEFAULT_AXIS_GEOMETRY_OPTIONS.bevel, ...options.bevel },
  };
}
