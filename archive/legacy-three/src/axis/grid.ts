import type { GridAnchor, GridIndex, Point2, ReferenceFrame } from "./types";

export const GRID_COLUMNS = 20;
export const GRID_ROWS = 20;
export const GRID_INDEX_VALUES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
] as const satisfies readonly GridIndex[];

export type GridAnchorPresetId = "center" | "center-right" | "left" | "up" | "down";

/** Quarter-position presets are implementation conveniences; the 20x20 intersections are the invariant. */
export const GRID_ANCHOR_PRESETS = {
  center: { gridX: 10, gridY: 10 },
  "center-right": { gridX: 15, gridY: 10 },
  left: { gridX: 5, gridY: 10 },
  up: { gridX: 10, gridY: 5 },
  down: { gridX: 10, gridY: 15 },
} as const satisfies Record<GridAnchorPresetId, GridAnchor>;

export function isGridIndex(value: number): value is GridIndex {
  return Number.isInteger(value) && value >= 0 && value <= 20;
}

export function quantizeGridIndex(value: number): GridIndex {
  if (!Number.isFinite(value)) {
    throw new TypeError("Grid coordinate must be a finite number.");
  }
  return Math.min(20, Math.max(0, Math.round(value))) as GridIndex;
}

export function createGridAnchor(gridX: number, gridY: number): GridAnchor {
  if (!isGridIndex(gridX) || !isGridIndex(gridY)) {
    throw new RangeError("Grid anchor coordinates must be integer intersections from 0 through 20.");
  }
  return { gridX, gridY };
}

export function quantizeGridAnchor(gridX: number, gridY: number): GridAnchor {
  return { gridX: quantizeGridIndex(gridX), gridY: quantizeGridIndex(gridY) };
}

export function gridAnchorToNormalized(anchor: GridAnchor): Point2 {
  return { x: anchor.gridX / GRID_COLUMNS, y: anchor.gridY / GRID_ROWS };
}

/** Converts top-left grid coordinates into the centered Cartesian frame used by AxisGraph. */
export function gridAnchorToFramePoint(anchor: GridAnchor, frame: ReferenceFrame): Point2 {
  return {
    x: (anchor.gridX / GRID_COLUMNS - 0.5) * frame.width,
    y: (0.5 - anchor.gridY / GRID_ROWS) * frame.height,
  };
}

export function normalizedToGridAnchor(x: number, y: number): GridAnchor {
  return quantizeGridAnchor(x * GRID_COLUMNS, y * GRID_ROWS);
}
