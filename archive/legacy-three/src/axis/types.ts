export type AxisFamily = "30deg" | "45deg";
export type Axis30Angle = -90 | -30 | 30 | 90 | 150 | 210;
export type Axis45Angle = -135 | -90 | -45 | 0 | 45 | 90 | 135 | 180;
export type AxisAngle = Axis30Angle | Axis45Angle;

export type GridIndex =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export interface GridAnchor {
  readonly gridX: GridIndex;
  readonly gridY: GridIndex;
}

export interface AxisRay {
  readonly id: string;
  readonly angleDeg: number;
  readonly enabled: boolean;
}

export interface AxisDefinition {
  readonly id: string;
  readonly name: string;
  readonly family: AxisFamily;
  readonly rays: readonly AxisRay[];
  readonly anchor: GridAnchor;
  readonly referenceLineWidthPx: number;
}

export interface AxisDefinitionInput extends Omit<AxisDefinition, "anchor" | "rays"> {
  readonly rays: readonly AxisRay[];
  readonly anchor: {
    readonly gridX: number;
    readonly gridY: number;
  };
}

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface ReferenceFrame {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
}

export interface FrameBounds {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export type FrameSide = "left" | "right" | "bottom" | "top";
export type FrameCornerId = "bottom-left" | "bottom-right" | "top-right" | "top-left";

export interface FrameIntersection {
  readonly point: Point2;
  readonly distance: number;
  readonly sides: readonly FrameSide[];
}

export interface AxisGraphRay extends AxisRay {
  readonly angleDeg: AxisAngle;
  readonly direction: Point2;
  readonly endpoint: Point2;
  readonly frameIntersection: FrameIntersection;
}

export interface AxisSector {
  readonly id: string;
  readonly startRayId: string;
  readonly endRayId: string;
  readonly cornerIds: readonly FrameCornerId[];
  readonly polygon: readonly Point2[];
  readonly signedArea: number;
}

export interface AxisGraph {
  readonly definition: AxisDefinition;
  readonly frame: ReferenceFrame;
  readonly bounds: FrameBounds;
  readonly origin: Point2;
  /** Enabled rays, sorted counter-clockwise in mathematical coordinates. */
  readonly rays: readonly AxisGraphRay[];
  readonly sectors: readonly AxisSector[];
}

export type AxisValidationCode =
  | "invalid-id"
  | "invalid-line-width"
  | "invalid-anchor"
  | "invalid-angle"
  | "duplicate-ray-id"
  | "duplicate-ray-direction"
  | "too-few-active-rays"
  | "unapproved-ray-combination";

export interface AxisValidationIssue {
  readonly code: AxisValidationCode;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly message: string;
}

export interface AxisValidationResult {
  readonly valid: boolean;
  readonly approved: boolean;
  readonly issues: readonly AxisValidationIssue[];
}
