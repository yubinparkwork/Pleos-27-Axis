export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export type GeometryMode = "folded-surface" | "closed-optical-solid";

export interface AxisVertex {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly uv: Vec2;
  readonly faceId: number;
}

export interface AxisRayDefinition {
  readonly id: string;
  readonly angleDeg: number;
}

export interface AxisCubeBasisDefinition {
  readonly id: "cube-left" | "cube-right";
  readonly directionsDeg: readonly [number, number, number];
  readonly depthSigns: readonly [number, number, number];
}

export interface AxisGeometryPreset {
  readonly id: string;
  readonly family: "30deg";
  readonly variant: "variation-1";
  readonly rays: readonly AxisRayDefinition[];
  readonly cubes: readonly AxisCubeBasisDefinition[];
}

export interface AxisFrameOptions {
  /** World-space width of the orthographic design frame. */
  width: number;
  /** World-space height of the orthographic design frame. */
  height: number;
}

export interface AxisBevelOptions {
  enabled: boolean;
  /** Fraction of a cube edge. Kept below 0.25 to preserve the Axis silhouette. */
  width: number;
  /** Subdivisions across each bevel strip and corner. */
  segments: number;
  /** 0 is a flat chamfer, 1 is a circular bevel. */
  curvature: number;
  /** Keep the two local (0,0,0) corners as one exact point. */
  preserveCenterNode: boolean;
}

export interface AxisGeometryOptions {
  /** Approved Axis preset identifier used by folded-surface geometry. */
  presetId: string;
  /** Active, approved screen-space rays in degrees. */
  rayAnglesDeg: readonly number[];
  origin: Vec3;
  frame: AxisFrameOptions;
  /** Projected XY length of every approved cube edge. */
  projectedEdge: number;
  /** Z magnitude divided by projectedEdge. sqrt(1/2) yields the isometric basis. */
  depthRatio: number;
  /** Signed fold amplitude used only by folded-surface geometry. */
  foldDepth: number;
  /** Optional normalized depth override by ray angle in degrees. */
  rayDepths: Readonly<Record<number, number>>;
  bevel: AxisBevelOptions;
}

export interface AxisVertexLayout {
  readonly strideFloats: 9;
  readonly positionOffset: 0;
  readonly normalOffset: 3;
  readonly uvOffset: 6;
  readonly faceIdOffset: 8;
}

export interface AxisMeshGroup {
  readonly id: string;
  readonly indexOffset: number;
  readonly indexCount: number;
  readonly solidId?: number;
}

export interface AxisMeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly center: Vec3;
  readonly radius: number;
}

export interface AxisSurfaceSemantics {
  readonly frontFaceIds: readonly number[];
  readonly backFaceIds: readonly number[];
  readonly sideFaceIds: readonly number[];
  readonly bevelFaceIds: readonly number[];
}

export interface AxisMeshMetadata {
  readonly presetId: string;
  readonly rayAnglesDeg: readonly number[];
  readonly rayEndpoints: readonly Vec3[];
  readonly sharedCenterNode: Vec3;
  readonly gridAnchor: readonly [10, 10];
  readonly componentCount: number;
  readonly projectedEdge: number;
  readonly bevelWidth: number;
  readonly semanticFaces: AxisSurfaceSemantics;
}

/**
 * CPU-side data uploaded directly to raw WebGL2 VAO/VBO/EBO objects.
 *
 * `faceIds` remains integer data for `vertexAttribIPointer`. `vertices` is a
 * convenience interleaved view for renderers that prefer one float VBO; its
 * face id occupies float slot 8 and is exact for the small ids used here.
 */
export interface AxisMeshData {
  readonly mode: GeometryMode;
  readonly layout: AxisVertexLayout;
  readonly vertices: Float32Array;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly faceIds: Uint32Array;
  readonly indices: Uint32Array;
  readonly groups: readonly AxisMeshGroup[];
  readonly bounds: AxisMeshBounds;
  readonly metadata: AxisMeshMetadata;
}

export const AXIS_VERTEX_LAYOUT: AxisVertexLayout = Object.freeze({
  strideFloats: 9,
  positionOffset: 0,
  normalOffset: 3,
  uvOffset: 6,
  faceIdOffset: 8,
});
