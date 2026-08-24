import { buildClosedOpticalSolidMesh } from "./closedOpticalSolid";
import { buildFoldedSurfaceMesh } from "./foldedSurface";
import type { AxisGeometryOptions, AxisMeshData, GeometryMode } from "./types";

export { buildClosedOpticalSolidMesh, CLOSED_OPTICAL_FACE_LAYOUT } from "./closedOpticalSolid";
export { buildFoldedSurfaceMesh } from "./foldedSurface";
export {
  APPROVED_RAW_AXIS_PRESET_IDS,
  APPROVED_RAW_AXIS_RAYS,
  DEFAULT_AXIS_GEOMETRY_OPTIONS,
  PLEOS_30_VARIATION_1,
  approvedRawAxisRays,
  resolveAxisGeometryOptions,
} from "./preset";
export type { ApprovedRawAxisPresetId } from "./preset";
export {
  assertValidAxisMesh,
  runAxisGeometrySelfTest,
  validateApprovedFoldedVariants,
  validateAxisMesh,
} from "./validation";
export type {
  AxisGeometryOptions,
  AxisVertex,
  AxisMeshBounds,
  AxisMeshData,
  AxisMeshGroup,
  AxisMeshMetadata,
  AxisSurfaceSemantics,
  AxisVertexLayout,
  GeometryMode,
  Vec2,
  Vec3,
} from "./types";
export type { AxisGeometrySelfTestResult, AxisMeshValidationOptions, AxisMeshValidationReport } from "./validation";

export function buildAxisGeometry(
  mode: GeometryMode,
  options: Partial<AxisGeometryOptions> = {},
): AxisMeshData {
  return mode === "folded-surface"
    ? buildFoldedSurfaceMesh(options)
    : buildClosedOpticalSolidMesh(options);
}
